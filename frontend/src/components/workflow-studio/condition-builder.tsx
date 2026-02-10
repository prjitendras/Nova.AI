/**
 * Condition Builder Component
 * Visual UI for building conditional branching rules
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  GitBranch,
  Brackets,
  X,
  ChevronDown,
  Zap,
  Equal,
  ChevronsLeftRight,
  MoreHorizontal,
} from "lucide-react";
import type { Condition, TransitionTemplate, StepTemplate, ConditionGroup } from "@/lib/types";

import type { ConditionOperator } from "@/lib/types";

export type { ConditionOperator, ConditionGroup } from "@/lib/types";

const operatorConfig: Record<ConditionOperator, { label: string; icon: any; description: string }> = {
  EQUALS: { label: "Equals", icon: Equal, description: "Exact match" },
  NOT_EQUALS: { label: "Not Equals", icon: ChevronsLeftRight, description: "Does not match" },
  GREATER_THAN: { label: ">", icon: null, description: "Greater than" },
  LESS_THAN: { label: "<", icon: null, description: "Less than" },
  GREATER_THAN_OR_EQUALS: { label: "≥", icon: null, description: "Greater or equal" },
  LESS_THAN_OR_EQUALS: { label: "≤", icon: null, description: "Less or equal" },
  CONTAINS: { label: "Contains", icon: null, description: "Text contains value" },
  NOT_CONTAINS: { label: "Not Contains", icon: null, description: "Text does not contain" },
  IN: { label: "In List", icon: null, description: "Value is in list" },
  NOT_IN: { label: "Not In List", icon: null, description: "Value not in list" },
  IS_EMPTY: { label: "Is Empty", icon: null, description: "Field is empty" },
  IS_NOT_EMPTY: { label: "Has Value", icon: null, description: "Field has value" },
};

interface ConditionBuilderProps {
  condition?: ConditionGroup;
  onChange: (condition: ConditionGroup | undefined) => void;
  availableFields: Array<{ key: string; label: string; type: string }>;
}

export function ConditionBuilder({ condition, onChange, availableFields }: ConditionBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasCondition = condition && condition.conditions.length > 0;

  const initCondition = () => {
    onChange({
      logic: "AND",
      conditions: [{ field: "", operator: "EQUALS", value: "" }],
    });
    setIsOpen(true);
  };

  const addCondition = () => {
    if (!condition) return;
    onChange({
      ...condition,
      conditions: [...condition.conditions, { field: "", operator: "EQUALS", value: "" }],
    });
  };

  const updateCondition = (index: number, updates: Partial<Condition>) => {
    if (!condition) return;
    const newConditions = [...condition.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange({ ...condition, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    if (!condition) return;
    const newConditions = condition.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0) {
      onChange(undefined);
    } else {
      onChange({ ...condition, conditions: newConditions });
    }
  };

  const clearConditions = () => {
    onChange(undefined);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-violet-400" />
          Condition
        </Label>
        {hasCondition && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={clearConditions}>
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {!hasCondition ? (
        <button
          onClick={initCondition}
          className="w-full p-3 rounded-xl border border-dashed hover:border-violet-500/50 bg-muted/30 hover:bg-violet-500/5 transition-all flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-violet-400"
        >
          <Plus className="h-4 w-4" />
          Add Condition
        </button>
      ) : (
        <Card className="p-4 bg-gradient-to-br from-violet-500/5 to-purple-500/5 border-violet-500/20">
          <div className="space-y-3">
            {/* Logic toggle */}
            <div className="flex items-center justify-center gap-2">
              <Badge 
                variant={condition.logic === "AND" ? "default" : "outline"} 
                className="cursor-pointer hover:opacity-80"
                onClick={() => onChange({ ...condition, logic: "AND" })}
              >
                AND
              </Badge>
              <span className="text-xs text-muted-foreground">/</span>
              <Badge 
                variant={condition.logic === "OR" ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onChange({ ...condition, logic: "OR" })}
              >
                OR
              </Badge>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              {condition.conditions.map((cond, index) => (
                <div key={index} className="flex items-center gap-2">
                  {/* Field selector */}
                  <Select
                    value={cond.field}
                    onValueChange={(v) => updateCondition(index, { field: v })}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs rounded-lg">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          <div className="flex items-center gap-2">
                            <Brackets className="h-3 w-3 text-muted-foreground" />
                            {f.label}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="form_values.amount">Amount</SelectItem>
                      <SelectItem value="form_values.priority">Priority</SelectItem>
                      <SelectItem value="form_values.department">Department</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Operator */}
                  <Select
                    value={cond.operator}
                    onValueChange={(v) => updateCondition(index, { operator: v })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(operatorConfig).map(([op, cfg]) => (
                        <SelectItem key={op} value={op}>
                          {cfg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Value */}
                  {!["IS_EMPTY", "IS_NOT_EMPTY"].includes(cond.operator) && (
                    <Input
                      value={String(cond.value || "")}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="Value..."
                      className="flex-1 h-8 text-xs rounded-lg"
                    />
                  )}

                  {/* Remove */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeCondition(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add more */}
            <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Condition
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

interface TransitionEditorProps {
  transition: TransitionTemplate;
  fromStep: StepTemplate;
  toStep: StepTemplate;
  allSteps: StepTemplate[];
  availableFields: Array<{ key: string; label: string; type: string }>;
  onUpdate: (updates: Partial<TransitionTemplate>) => void;
  onDelete: () => void;
  onChangeTarget: (newTargetId: string) => void;
}

export function TransitionEditor({
  transition,
  fromStep,
  toStep,
  allSteps,
  availableFields,
  onUpdate,
  onDelete,
  onChangeTarget,
}: TransitionEditorProps) {
  const hasCondition = transition.condition && transition.condition.conditions.length > 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {fromStep.step_name} → {toStep.step_name}
            </p>
            <p className="text-xs text-muted-foreground">
              On {transition.on_event?.replace(/_/g, " ").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasCondition && (
            <Badge variant="secondary" className="text-[10px] bg-violet-500/20 text-violet-400">
              <GitBranch className="h-2.5 w-2.5 mr-1" />
              Conditional
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Target step selector */}
      <div className="space-y-2">
        <Label className="text-xs">Go To Step</Label>
        <Select value={transition.to_step_id} onValueChange={onChangeTarget}>
          <SelectTrigger className="h-9 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allSteps
              .filter((s) => s.step_id !== fromStep.step_id)
              .map((s) => (
                <SelectItem key={s.step_id} value={s.step_id}>
                  {s.step_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority for multiple transitions */}
      <div className="space-y-2">
        <Label className="text-xs">Priority (higher = checked first)</Label>
        <Input
          type="number"
          value={transition.priority || 0}
          onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 0 })}
          className="h-8 rounded-lg"
        />
      </div>

      {/* Condition builder */}
      <ConditionBuilder
        condition={transition.condition}
        onChange={(cond) => onUpdate({ condition: cond })}
        availableFields={availableFields}
      />
    </Card>
  );
}

export default ConditionBuilder;

