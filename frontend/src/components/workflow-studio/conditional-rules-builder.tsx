/**
 * ConditionalRulesBuilder Component
 * 
 * Allows designers to configure conditional requirements for form fields.
 * A field can become required/optional based on another field's value.
 */
"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Plus, 
  Trash2, 
  Zap,
  ArrowRight,
  AlertCircle,
  PlusCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConditionalRequirement, FormField, DateValidation, ConditionalWhenCondition } from "@/lib/types";
import { Switch } from "@/components/ui/switch";

// Type for a single condition in the builder
interface ConditionState {
  id: string;
  field_key: string;
  step_id?: string;
  operator: ConditionalWhenCondition["operator"];
  value?: string;
}

interface ConditionalRulesBuilderProps {
  field: FormField;
  allFields: FormField[];  // All fields in current form (for source field selection)
  allFormsFields?: { stepId: string; stepName: string; fields: FormField[] }[];  // Fields from other forms
  value: ConditionalRequirement[];
  onChange: (rules: ConditionalRequirement[]) => void;
}

// Generate unique rule ID
function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Get display label for operator
function getOperatorLabel(operator: string): string {
  switch (operator) {
    case "equals": return "equals";
    case "not_equals": return "does not equal";
    case "in": return "is one of";
    case "not_in": return "is not one of";
    case "is_empty": return "is empty";
    case "is_not_empty": return "is not empty";
    default: return operator;
  }
}

export function ConditionalRulesBuilder({
  field,
  allFields,
  allFormsFields = [],
  value,
  onChange
}: ConditionalRulesBuilderProps) {
  const [isAdding, setIsAdding] = useState(false);
  
  // Get dropdown/select fields that can be used as source
  const sourceFields = allFields.filter(f => 
    f.field_key !== field.field_key && 
    (f.field_type === "SELECT" || f.field_type === "MULTISELECT" || f.field_type === "CHECKBOX")
  );
  
  // Include fields from other forms
  const otherFormsSourceFields = allFormsFields.flatMap(form => 
    form.fields
      .filter(f => f.field_type === "SELECT" || f.field_type === "MULTISELECT" || f.field_type === "CHECKBOX")
      .map(f => ({
        ...f,
        stepId: form.stepId,
        stepName: form.stepName,
        displayLabel: `${form.stepName} → ${f.field_label}`
      }))
  );
  
  const hasSourceFields = sourceFields.length > 0 || otherFormsSourceFields.length > 0;
  
  const addRule = useCallback((newRule: ConditionalRequirement) => {
    onChange([...value, newRule]);
    setIsAdding(false);
  }, [value, onChange]);
  
  const removeRule = useCallback((ruleId: string) => {
    onChange(value.filter(r => r.rule_id !== ruleId));
  }, [value, onChange]);
  
  const updateRule = useCallback((ruleId: string, updates: Partial<ConditionalRequirement>) => {
    onChange(value.map(r => r.rule_id === ruleId ? { ...r, ...updates } : r));
  }, [value, onChange]);
  
  if (!hasSourceFields) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
        <AlertCircle className="h-4 w-4" />
        No dropdown fields available to create conditions. Add a dropdown field first.
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {/* Existing Rules */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((rule) => (
            <RuleCard
              key={rule.rule_id}
              rule={rule}
              sourceFields={sourceFields}
              otherFormsSourceFields={otherFormsSourceFields}
              onUpdate={(updates) => updateRule(rule.rule_id, updates)}
              onRemove={() => removeRule(rule.rule_id)}
              isDateField={field.field_type === "DATE"}
            />
          ))}
        </div>
      )}
      
      {/* Add New Rule */}
      {isAdding ? (
        <NewRuleForm
          sourceFields={sourceFields}
          otherFormsSourceFields={otherFormsSourceFields}
          onAdd={addRule}
          onCancel={() => setIsAdding(false)}
          isDateField={field.field_type === "DATE"}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full gap-2 border-dashed"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Conditional Rule
        </Button>
      )}
      
      {/* Info text */}
      {value.length === 0 && !isAdding && (
        <p className="text-xs text-muted-foreground">
          Add rules to make this field required or optional based on other field values.
        </p>
      )}
    </div>
  );
}

// Individual rule card
interface RuleCardProps {
  rule: ConditionalRequirement;
  sourceFields: FormField[];
  otherFormsSourceFields: Array<FormField & { stepId: string; stepName: string; displayLabel: string }>;
  onUpdate: (updates: Partial<ConditionalRequirement>) => void;
  onRemove: () => void;
  isDateField?: boolean;  // Whether the target field is a DATE field
}

function RuleCard({ rule, sourceFields, otherFormsSourceFields, onUpdate, onRemove, isDateField }: RuleCardProps) {
  // Helper to get field label
  const getFieldLabel = (fieldKey: string, stepId?: string): string => {
    const sourceField = sourceFields.find(f => f.field_key === fieldKey) ||
      otherFormsSourceFields.find(f => f.field_key === fieldKey && f.stepId === stepId);
    return sourceField 
      ? String('displayLabel' in sourceField ? sourceField.displayLabel : sourceField.field_label)
      : fieldKey;
  };
  
  // Check if this is a compound rule (has multiple conditions)
  const isCompound = rule.when.conditions && rule.when.conditions.length > 0;
  const logic = rule.when.logic || "AND";
  
  // All conditions to display (primary + additional)
  const allConditions: ConditionalWhenCondition[] = [
    { field_key: rule.when.field_key, step_id: rule.when.step_id, operator: rule.when.operator, value: rule.when.value },
    ...(rule.when.conditions || [])
  ];
  
  // Check if date validation is configured
  const hasDateValidation = rule.then.date_validation && (
    rule.then.date_validation.allow_past_dates === false ||
    rule.then.date_validation.allow_today === false ||
    rule.then.date_validation.allow_future_dates === false
  );
  
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            {/* Conditions */}
            {allConditions.map((condition, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap text-sm">
                {idx === 0 ? (
                  <Badge variant="outline" className="bg-background">
                    <Zap className="h-3 w-3 mr-1 text-amber-500" />
                    IF
                  </Badge>
                ) : (
                  <Badge variant="outline" className={cn(
                    "bg-background ml-4",
                    logic === "AND" ? "text-blue-600 border-blue-300" : "text-purple-600 border-purple-300"
                  )}>
                    {logic}
                  </Badge>
                )}
                <span className="font-medium text-primary">{getFieldLabel(condition.field_key, condition.step_id)}</span>
                <span className="text-muted-foreground">{getOperatorLabel(condition.operator)}</span>
                {condition.value && (
                  <Badge variant="secondary">
                    {Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)}
                  </Badge>
                )}
              </div>
            ))}
            
            {/* THEN result */}
            <div className="flex items-center gap-2 text-sm">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">THEN this field is</span>
              <Badge className={cn(
                rule.then.required 
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              )}>
                {rule.then.required ? "Required" : "Optional"}
              </Badge>
            </div>
            
            {/* Show date validation if configured */}
            {isDateField && hasDateValidation && (
              <div className="flex items-center gap-2 text-sm mt-1">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">Date restrictions:</span>
                {rule.then.date_validation?.allow_past_dates === false && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">No Past</Badge>
                )}
                {rule.then.date_validation?.allow_today === false && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">No Today</Badge>
                )}
                {rule.then.date_validation?.allow_future_dates === false && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">No Future</Badge>
                )}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Form to add new rule
interface NewRuleFormProps {
  sourceFields: FormField[];
  otherFormsSourceFields: Array<FormField & { stepId: string; stepName: string; displayLabel: string }>;
  onAdd: (rule: ConditionalRequirement) => void;
  onCancel: () => void;
  isDateField?: boolean;  // Whether the target field is a DATE field
}

function NewRuleForm({ sourceFields, otherFormsSourceFields, onAdd, onCancel, isDateField }: NewRuleFormProps) {
  // Multiple conditions support
  const [conditions, setConditions] = useState<ConditionState[]>([
    { id: generateRuleId(), field_key: "", operator: "equals", value: "" }
  ]);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [resultRequired, setResultRequired] = useState(true);
  
  // Date validation states (only for DATE fields)
  const [allowPastDates, setAllowPastDates] = useState(true);
  const [allowToday, setAllowToday] = useState(true);
  const [allowFutureDates, setAllowFutureDates] = useState(true);
  
  // Check if any date restriction is set
  const hasDateRestrictions = !allowPastDates || !allowToday || !allowFutureDates;
  
  // Helper to get source field for a condition
  const getSourceField = (fieldKey: string, stepId?: string) => {
    return sourceFields.find(f => f.field_key === fieldKey) ||
      otherFormsSourceFields.find(f => f.field_key === fieldKey && f.stepId === stepId);
  };
  
  // Update a specific condition
  const updateCondition = (id: string, updates: Partial<ConditionState>) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };
  
  // Add a new condition
  const addCondition = () => {
    setConditions(prev => [...prev, { id: generateRuleId(), field_key: "", operator: "equals", value: "" }]);
  };
  
  // Remove a condition
  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(prev => prev.filter(c => c.id !== id));
    }
  };
  
  // Check if all conditions are valid
  const allConditionsValid = conditions.every(c => {
    if (!c.field_key) return false;
    const needsValue = !["is_empty", "is_not_empty"].includes(c.operator);
    if (needsValue && !c.value) return false;
    return true;
  });
  
  const handleAdd = () => {
    if (!allConditionsValid) return;
    
    const primaryCondition = conditions[0];
    const additionalConditions = conditions.slice(1);
    
    const newRule: ConditionalRequirement = {
      rule_id: generateRuleId(),
      when: {
        field_key: primaryCondition.field_key,
        step_id: primaryCondition.step_id,
        operator: primaryCondition.operator,
        value: !["is_empty", "is_not_empty"].includes(primaryCondition.operator) ? primaryCondition.value : undefined,
        // Add compound conditions if more than one condition
        ...(additionalConditions.length > 0 ? {
          logic,
          conditions: additionalConditions.map(c => ({
            field_key: c.field_key,
            step_id: c.step_id,
            operator: c.operator,
            value: !["is_empty", "is_not_empty"].includes(c.operator) ? c.value : undefined
          }))
        } : {})
      },
      then: {
        required: resultRequired,
        // Include date validation only if this is a DATE field and restrictions are set
        ...(isDateField && hasDateRestrictions ? {
          date_validation: {
            allow_past_dates: allowPastDates,
            allow_today: allowToday,
            allow_future_dates: allowFutureDates,
          }
        } : {})
      }
    };
    
    onAdd(newRule);
  };
  
  const handleSourceFieldChange = (conditionId: string, value: string) => {
    // Check if it's from another form (format: stepId::fieldKey)
    if (value.includes("::")) {
      const [stepId, fieldKey] = value.split("::");
      updateCondition(conditionId, { step_id: stepId, field_key: fieldKey, value: "" });
    } else {
      updateCondition(conditionId, { step_id: undefined, field_key: value, value: "" });
    }
  };
  
  // Render a single condition row
  const renderConditionRow = (condition: ConditionState, index: number) => {
    const selectedSourceField = getSourceField(condition.field_key, condition.step_id);
    const availableOptions = selectedSourceField?.options || [];
    const needsValue = !["is_empty", "is_not_empty"].includes(condition.operator);
    
    return (
      <div key={condition.id} className="space-y-2">
        {/* Show AND/OR toggle before second condition onwards */}
        {index > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-dashed" />
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted">
              <Button
                type="button"
                variant={logic === "AND" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLogic("AND")}
                className={cn("h-6 px-2 text-xs", logic === "AND" && "bg-blue-600 hover:bg-blue-700")}
              >
                AND
              </Button>
              <Button
                type="button"
                variant={logic === "OR" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLogic("OR")}
                className={cn("h-6 px-2 text-xs", logic === "OR" && "bg-purple-600 hover:bg-purple-700")}
              >
                OR
              </Button>
            </div>
            <div className="flex-1 border-t border-dashed" />
          </div>
        )}
        
        <div className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-1 gap-2">
            {/* Source Field */}
            <Select 
              value={condition.step_id ? `${condition.step_id}::${condition.field_key}` : condition.field_key} 
              onValueChange={(v) => handleSourceFieldChange(condition.id, v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {sourceFields.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Current Form
                    </div>
                    {sourceFields.map(f => (
                      <SelectItem key={f.field_key} value={f.field_key}>
                        {f.field_label}
                      </SelectItem>
                    ))}
                  </>
                )}
                {otherFormsSourceFields.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-2">
                      Other Forms
                    </div>
                    {otherFormsSourceFields.map(f => (
                      <SelectItem key={`${f.stepId}::${f.field_key}`} value={`${f.stepId}::${f.field_key}`}>
                        {f.displayLabel}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            
            {/* Operator */}
            <Select 
              value={condition.operator} 
              onValueChange={(v) => updateCondition(condition.id, { operator: v as ConditionState["operator"] })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">equals</SelectItem>
                <SelectItem value="not_equals">does not equal</SelectItem>
                <SelectItem value="in">is one of</SelectItem>
                <SelectItem value="not_in">is not one of</SelectItem>
                <SelectItem value="is_empty">is empty</SelectItem>
                <SelectItem value="is_not_empty">is not empty</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Value (if needed) */}
            {needsValue && availableOptions.length > 0 && (
              <Select 
                value={condition.value || ""} 
                onValueChange={(v) => updateCondition(condition.id, { value: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select value" />
                </SelectTrigger>
                <SelectContent>
                  {availableOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {/* Remove condition button (only if more than one) */}
          {conditions.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeCondition(condition.id)}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          <Zap className="h-4 w-4" />
          New Conditional Rule
        </div>
        
        {/* IF section - Multiple conditions */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">IF this field...</Label>
          
          {conditions.map((condition, index) => renderConditionRow(condition, index))}
          
          {/* Add another condition button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCondition}
            className="w-full gap-2 border-dashed text-muted-foreground hover:text-foreground"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add {conditions.length > 0 ? (logic === "AND" ? "AND" : "OR") : ""} Condition
          </Button>
        </div>
        
        {/* THEN section */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">THEN this field is...</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={resultRequired ? "default" : "outline"}
              size="sm"
              onClick={() => setResultRequired(true)}
              className={cn(
                "flex-1",
                resultRequired && "bg-red-600 hover:bg-red-700"
              )}
            >
              Required
            </Button>
            <Button
              type="button"
              variant={!resultRequired ? "default" : "outline"}
              size="sm"
              onClick={() => setResultRequired(false)}
              className={cn(
                "flex-1",
                !resultRequired && "bg-green-600 hover:bg-green-700"
              )}
            >
              Optional
            </Button>
          </div>
        </div>
        
        {/* Date validation options - only for DATE fields */}
        {isDateField && (
          <div className="space-y-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <Label className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
              📅 Date Restrictions (Optional)
            </Label>
            <p className="text-xs text-muted-foreground">
              When the condition above is met, which dates can the user select?
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div 
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer transition-all text-center",
                  allowPastDates
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                    : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                )}
                onClick={() => setAllowPastDates(!allowPastDates)}
              >
                <span className="text-lg">←</span>
                <span className="text-[10px] font-medium">Past</span>
                <Badge 
                  variant={allowPastDates ? "default" : "destructive"}
                  className="text-[9px] px-1"
                >
                  {allowPastDates ? "✓" : "✕"}
                </Badge>
              </div>
              
              <div 
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer transition-all text-center",
                  allowToday
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                    : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                )}
                onClick={() => setAllowToday(!allowToday)}
              >
                <span className="text-lg">●</span>
                <span className="text-[10px] font-medium">Today</span>
                <Badge 
                  variant={allowToday ? "default" : "destructive"}
                  className="text-[9px] px-1"
                >
                  {allowToday ? "✓" : "✕"}
                </Badge>
              </div>
              
              <div 
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer transition-all text-center",
                  allowFutureDates
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                    : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                )}
                onClick={() => setAllowFutureDates(!allowFutureDates)}
              >
                <span className="text-lg">→</span>
                <span className="text-[10px] font-medium">Future</span>
                <Badge 
                  variant={allowFutureDates ? "default" : "destructive"}
                  className="text-[9px] px-1"
                >
                  {allowFutureDates ? "✓" : "✕"}
                </Badge>
              </div>
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!allConditionsValid}
            className="flex-1"
          >
            Add Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConditionalRulesBuilder;
