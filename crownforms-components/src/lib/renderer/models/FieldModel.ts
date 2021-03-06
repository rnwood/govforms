import { computed, observable } from "mobx";
import { Expression } from "./expressions";
import { FFConditionParser } from "./conditions";
import {
  ExpressionFieldValidationRuleModel,
  RegexFieldValidationRuleModel,
  FieldValidationRuleModel,
  IFieldValidationRuleModelOptions,
} from "./validation";
import {
  StringValue,
  TypedValue,
  BooleanValue,
  ITypedValueConverter,
  SectionModel,
  ValidationErrorModel,
  FormComponent,
  IFormComponentOptions,
  FieldValueReplacer,
  FormComponentConstructor,
  IFieldModelControl,
  IFormComponentState,
  IOptions,
} from ".";
import { ValidationErrorModelSeverity } from "./ValidationErrorModel";

export interface IFieldModelOptions extends IFormComponentOptions {
  readonly type: string;
  defaultValueExpression?: string | null;
  defaultValueFromTextExpression?: string | null;
  defaultValueComputeOnce?: boolean | null;
  name: string;
  displayName: string;
  hideLabel?: boolean;
  hide?: boolean;
  alwaysRequired?: boolean;
  requiredErrorMessage?: string | null;
  hintText?: string | null;
  requiredCondition?: string | null;
  displayCondition?: string | null;
  metadata?: IOptions;
  valueType: string;
  controlType: string;
  validationRules?: IFieldValidationRuleModelOptions[];
  readOnly?: boolean | null;
  readOnlyCondition?: string | null;
}

export interface IFieldModelState extends IFormComponentState {
  internalValue:
    | string
    | number
    | boolean
    | null
    | (string | null)[]
    | (number | null)[];
  valueIsDefault: boolean;
}

export abstract class FieldModel<
  T extends TypedValue = TypedValue,
  TOptions extends IFieldModelOptions = IFieldModelOptions,
  TState extends IFieldModelState = IFieldModelState
> extends FormComponent<TOptions, TState> {
  protected abstract getDefaultValueFromText(text: StringValue): T;

  protected getDesignerLabel(): string {
    return `${this.options.displayName} (${this.qualifiedName})`;
  }

  @computed get displayNameWithOptionalSuffix(): string {
    return (
      (this.parentForm
        ? FieldValueReplacer.replace(this.options.displayName, this.parentForm)
        : undefined ?? this.options.name) +
      (!this.isCurrentlyRequired ? " (optional)" : "")
    );
  }

  @observable
  protected valueIsDefault = true;

  getFormattedValue(formatString: string): TypedValue {
    throw new Error("Formatted value not available");
  }

  private static getNewFieldName(
    section: SectionModel | undefined
  ): [string, string] {
    const prefix = "newField";
    let suffix = 1;

    while (section?.parentForm?.getField(`${prefix}${suffix}`)) {
      suffix += 1;
    }

    return [`${prefix}${suffix}`, `New field ${suffix}`];
  }

  protected static getNewFieldOptionsBase<
    TField extends string,
    T extends TypedValue,
    TControl extends string
  >(
    type: TField,
    valueType: ITypedValueConverter<T>,
    controlType: TControl,
    parent: FormComponent<IFormComponentOptions, IFormComponentState>
  ): IFieldModelOptions & { type: TField; controlType: TControl } {
    const section = parent.parentSection;
    const [name, displayName] = FieldModel.getNewFieldName(section);

    return {
      type,
      controlType,
      name,
      displayName,
      valueType: valueType.key,
    };
  }

  readonly valueType: ITypedValueConverter<T>;

  constructor(
    valueType: ITypedValueConverter<T>,
    parent: FormComponent<IFormComponentOptions, IFormComponentState>,
    options: TOptions,
    state?: TState | undefined
  ) {
    super(parent, options, state);
    this.valueType = valueType;
  }

  @computed private get defaultValueExpression():
    | Expression<unknown>
    | undefined {
    return this.options.defaultValueExpression
      ? FFConditionParser.parseExpression(this.options.defaultValueExpression)
      : undefined;
  }

  @computed private get defaultValueFromTextExpression():
    | Expression<StringValue>
    | undefined {
    return this.options.defaultValueFromTextExpression
      ? FFConditionParser.parseStringExpression(
          this.options.defaultValueFromTextExpression
        )
      : undefined;
  }

  protected async initComponentAsync(): Promise<void> {
    this.internalValue = await this.getDefaultValueAsync();

    if (this.options.defaultValueComputeOnce) {
      if (this.options.defaultValueExpression) {
        const computedDefaultValue = this.parentForm
          ? this.defaultValueExpression?.getResult(this.parentForm)
          : undefined;
        const convertedComputedDefaultValue = this.valueType.convertFrom(
          computedDefaultValue
        );
        this.internalValue = convertedComputedDefaultValue;
      } else if (this.options.defaultValueFromTextExpression) {
        const computedDefaultValue = this.parentForm
          ? this.defaultValueFromTextExpression?.getResult(this.parentForm) ??
            new StringValue(null)
          : new StringValue(null);
        this.internalValue = this.getDefaultValueFromText(computedDefaultValue);
      }
    }
  }

  focus(): void {
    this.parent?.focus();
    this.controls[0]?.focus();
  }

  @computed
  get qualifiedName(): string {
    return `${this.parentFieldNamePrefix}${this.options.name}`;
  }

  canInsert<
    T extends FormComponent<IFormComponentOptions, IFormComponentState>
  >(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type: FormComponentConstructor<T, IFieldModelOptions>
  ): boolean {
    return false;
  }

  async insertAsync<
    T extends FormComponent<IFormComponentOptions, IFormComponentState>
  >(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type: FormComponentConstructor<T, IFieldModelOptions>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    index?: number
  ): Promise<T> {
    throw new Error("Cannot insert here");
  }

  @computed private get displayCondition():
    | Expression<BooleanValue>
    | undefined {
    return this.options.displayCondition
      ? FFConditionParser.parseBooleanExpression(this.options.displayCondition)
      : undefined;
  }

  @computed private get readOnlyCondition():
    | Expression<BooleanValue>
    | undefined {
    return this.options.readOnlyCondition
      ? FFConditionParser.parseBooleanExpression(this.options.readOnlyCondition)
      : undefined;
  }

  protected abstract async getDefaultValueAsync(): Promise<T>;

  @computed get readOnly(): boolean {
    if (this.parentSection?.readOnly) {
      return true;
    }

    if (this.options.readOnly) {
      return true;
    }

    if (this.options.readOnlyCondition) {
      return (
        (this.parentForm
          ? this.readOnlyCondition?.getResult(this.parentForm).value
          : false) === true
      );
    }

    return false;
  }

  @computed get visible(): boolean {
    if (this.options.hide) {
      return false;
    }

    if (this.options.displayCondition) {
      return (
        (this.parentForm
          ? this.displayCondition?.getResult(this.parentForm).value
          : false) === true
      );
    }

    return true;
  }

  @observable
  protected internalValue!: T;

  @computed get value(): T {
    if (!this.options.defaultValueComputeOnce) {
      if (this.valueIsDefault && this.defaultValueExpression) {
        const computedDefaultValue = this.parentForm
          ? this.defaultValueExpression.getResult(this.parentForm)
          : undefined;
        const convertedComputedDefaultValue = this.valueType.convertFrom(
          computedDefaultValue
        );

        return convertedComputedDefaultValue;
      }

      if (this.valueIsDefault && this.defaultValueFromTextExpression) {
        const computedDefaultValue = this.parentForm
          ? this.defaultValueFromTextExpression.getResult(this.parentForm)
          : new StringValue(null);

        return this.getDefaultValueFromText(computedDefaultValue);
      }
    }

    return this.internalValue;
  }

  set value(value: T) {
    const convertedValue = this.valueType.convertFrom(value?.value);

    this.valueIsDefault = false;
    this.internalValue = convertedValue;
    this.onValueChanged();
  }

  protected onValueChanged() {}

  @observable
  controls: IFieldModelControl[] = [];

  @computed
  protected get validateField(): ValidationErrorModel[] {
    return [];
  }

  @computed
  protected get validateFieldAlways(): ValidationErrorModel[] {
    return [];
  }

  @computed private get requiredCondition():
    | Expression<BooleanValue>
    | undefined {
    return this.options.requiredCondition
      ? FFConditionParser.parseBooleanExpression(this.options.requiredCondition)
      : undefined;
  }

  @computed
  get isCurrentlyRequired(): boolean {
    return (
      this.options.alwaysRequired ||
      (this.parentForm &&
        this.requiredCondition?.getResult(this.parentForm).value) ||
      false
    );
  }

  @computed
  get validationErrors(): readonly ValidationErrorModel[] {
    const results1 = this.validateFieldAlways;
    if (results1.length) {
      return results1;
    }

    if (!this.visible) {
      return [];
    }

    const results2 = this.controls
      .map((c: IFieldModelControl) => c.controlValueError)
      .filter((e) => e !== null)
      .map<ValidationErrorModel>((e) => <ValidationErrorModel>e);
    if (results2.length > 0) {
      return results2;
    }

    if (!this.parentSection?.validationEnabled) {
      return [];
    }

    if (!this.value.hasValue && this.isCurrentlyRequired) {
      return [
        new ValidationErrorModel(
          this,
          this.options.requiredErrorMessage ??
            `${this.options.displayName} is required`,
          ValidationErrorModelSeverity.Correctable
        ),
      ];
    }

    const results3 = this.validateField;
    if (results3.length > 0) {
      console.log(`Validate ${this.value.value}: ${results3.length}`);
      return results3;
    }

    for (const v of this.validationRules ?? []) {
      const errorMessage = this.parentForm
        ? v.validate(this, this.parentForm)
        : undefined;
      if (errorMessage) {
        return [
          new ValidationErrorModel(
            this,
            errorMessage,
            ValidationErrorModelSeverity.Correctable
          ),
        ];
      }
    }

    return [];
  }

  @computed private get validationRules(): FieldValidationRuleModel<
    IFieldValidationRuleModelOptions
  >[] {
    return (this.options.validationRules ?? []).map((r) =>
      FieldValidationRuleModel.create(r)
    );
  }
}
