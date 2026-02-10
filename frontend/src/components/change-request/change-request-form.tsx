"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileEdit,
  AlertCircle,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  Send,
  Paperclip,
  File,
  X,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { useCreateChangeRequest } from "@/hooks/use-change-requests";
import { apiClient } from "@/lib/api-client";
import type { Ticket, TicketStep, FormField, StepTemplate, TicketDetail } from "@/lib/types";

// ============================================================================
// Types
// ============================================================================

interface ChangeRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  steps: TicketStep[];
  workflowSteps: StepTemplate[];
  attachments: Array<{ attachment_id: string; original_filename: string }>;
  onSuccess?: () => void;
}

interface FormSection {
  section_id: string;
  section_title: string;
  section_description?: string;
  is_repeating: boolean;
  min_rows?: number;
  order: number;
}

interface RepeatingSectionData {
  sectionId: string;
  sectionTitle: string;
  sectionDescription?: string;
  minRows?: number;
  maxRows?: number;
  fields: FormField[];
  originalRows: Array<Record<string, unknown>>;
}

interface FormStepData {
  stepId: string;
  stepName: string;
  stepDescription?: string;
  fields: FormField[]; // Regular fields (not in repeating sections)
  sections: FormSection[]; // All sections for this step
  originalValues: Record<string, unknown>; // Regular field values
  repeatingSections: RepeatingSectionData[]; // Repeating sections with their data
}

// ============================================================================
// Validation Functions (from original form)
// ============================================================================

// Evaluate a condition operator against a value
function evaluateConditionOperator(
  operator: string,
  expectedValue: string | string[] | undefined,
  actualValue: unknown
): boolean {
  switch (operator) {
    case "equals":
      return actualValue === expectedValue;
    case "not_equals":
      return actualValue !== expectedValue;
    case "in":
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue as string);
    case "not_in":
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue as string);
    case "is_empty":
      return actualValue === null || actualValue === undefined || actualValue === "" || 
        (Array.isArray(actualValue) && actualValue.length === 0);
    case "is_not_empty":
      return actualValue !== null && actualValue !== undefined && actualValue !== "" && 
        !(Array.isArray(actualValue) && actualValue.length === 0);
    default:
      return false;
  }
}

// Get the value of a source field for conditional evaluation
function getSourceValue(
  fieldKey: string, 
  allFormValues: Record<string, unknown>
): unknown {
  return allFormValues[fieldKey];
}

// Evaluate a single condition
function evaluateSingleCondition(
  condition: { field_key: string; operator: string; value?: string | string[] },
  allFormValues: Record<string, unknown>
): boolean {
  const actualValue = getSourceValue(condition.field_key, allFormValues);
  return evaluateConditionOperator(condition.operator, condition.value, actualValue);
}

// Evaluate if a conditional rule matches
function evaluateConditionalRule(
  rule: { when: { field_key: string; operator: string; value?: string | string[]; conditions?: Array<{ field_key: string; operator: string; value?: string | string[] }>; logic?: string }; then: { required: boolean } },
  allFormValues: Record<string, unknown>
): boolean {
  const primaryResult = evaluateSingleCondition(rule.when, allFormValues);
  
  const additionalConditions = rule.when.conditions || [];
  if (additionalConditions.length === 0) {
    return primaryResult;
  }
  
  const logic = rule.when.logic || "AND";
  const allResults = [primaryResult];
  for (const condition of additionalConditions) {
    allResults.push(evaluateSingleCondition(condition, allFormValues));
  }
  
  if (logic === "AND") {
    return allResults.every(r => r);
  } else {
    return allResults.some(r => r);
  }
}

// Check if a field is required (static or conditional)
function isFieldRequired(field: FormField, allFormValues: Record<string, unknown>): boolean {
  if (field.conditional_requirements && field.conditional_requirements.length > 0) {
    for (const rule of field.conditional_requirements) {
      if (evaluateConditionalRule(rule as any, allFormValues)) {
        return (rule as any).then.required;
      }
    }
  }
  return field.required;
}

// Validate a single field value
function validateFieldValue(field: FormField, value: unknown, allFormValues: Record<string, unknown>): string | null {
  // Check if required
  const required = isFieldRequired(field, allFormValues);
  const isEmpty = value === undefined || value === null || value === "" || 
    (Array.isArray(value) && value.length === 0);
  
  if (required && isEmpty) {
    return `${field.field_label} is required`;
  }
  
  // Skip further validation if empty and not required
  if (isEmpty) return null;
  
  const validation = (field as any).validation;
  if (!validation) return null;
  
  // Text length validation
  if (field.field_type === "TEXT" || field.field_type === "TEXTAREA") {
    const textValue = String(value);
    const charCount = textValue.length;
    
    if (validation.min_length && charCount < validation.min_length) {
      return `${field.field_label} must be at least ${validation.min_length} characters`;
    }
    
    if (validation.max_length && charCount > validation.max_length) {
      return `${field.field_label} must not exceed ${validation.max_length} characters`;
    }
    
    if (validation.regex_pattern) {
      try {
        const regex = new RegExp(validation.regex_pattern);
        if (!regex.test(textValue)) {
          return `${field.field_label} format is invalid`;
        }
      } catch (e) {
        // Invalid regex - skip
      }
    }
  }
  
  // Number validation
  if (field.field_type === "NUMBER") {
    // Check for empty/invalid number values when required
    const strValue = String(value ?? "").trim();
    if (required && strValue === "") {
      return `${field.field_label} is required`;
    }
    
    if (strValue !== "") {
      const numValue = typeof value === "number" ? value : parseFloat(strValue);
      
      if (isNaN(numValue)) {
        return `${field.field_label} must be a valid number`;
      }
      
      if (validation.min_value !== undefined && numValue < validation.min_value) {
        return `${field.field_label} must be at least ${validation.min_value}`;
      }
      
      if (validation.max_value !== undefined && numValue > validation.max_value) {
        return `${field.field_label} must not exceed ${validation.max_value}`;
      }
    }
  }
  
  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getFieldDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "Not provided";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    if ("display_name" in (value as Record<string, unknown>)) {
      return (value as { display_name: string }).display_name;
    }
    if ("email" in (value as Record<string, unknown>)) {
      return (value as { email: string }).email;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function hasValueChanged(original: unknown, proposed: unknown): boolean {
  if (original === proposed) return false;
  if (original === null && proposed === undefined) return false;
  if (original === undefined && proposed === null) return false;
  if (original === "" && (proposed === null || proposed === undefined)) return false;
  if (proposed === "" && (original === null || original === undefined)) return false;
  return JSON.stringify(original) !== JSON.stringify(proposed);
}

// ============================================================================
// Dynamic Field Component - Matching Original Form UX exactly
// ============================================================================

interface DynamicFieldProps {
  field: FormField;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  attachmentMap?: Record<string, string>; // Map of attachment_id to filename
  allFormValues?: Record<string, unknown>; // All values for conditional validation
}

function DynamicField({ field, value, originalValue, onChange, error, attachmentMap = {}, allFormValues = {} }: DynamicFieldProps) {
  // Calculate if field is required (static or conditional)
  const fieldIsRequired = isFieldRequired(field, allFormValues);
  
  const fieldId = `cr-field-${field.field_key}`;
  const isChanged = hasValueChanged(originalValue, value);

  const baseInputStyles = cn(
    "h-11 rounded-lg border-border/60 bg-background/50 transition-all duration-200",
    "focus:ring-2 focus:ring-primary/20 focus:border-primary",
    "placeholder:text-muted-foreground/60",
    error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
    isChanged && !error && "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20"
  );

  const renderField = () => {
    switch (field.field_type) {
      case "TEXT":
        return (
          <Input
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputStyles}
          />
        );

      case "TEXTAREA":
        return (
          <Textarea
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={cn(
              "rounded-lg border-border/60 bg-background/50 transition-all duration-200 resize-y min-h-[100px]",
              "focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "placeholder:text-muted-foreground/60",
              error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
              isChanged && !error && "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20"
            )}
          />
        );

      case "NUMBER":
        return (
          <Input
            id={fieldId}
            type="number"
            placeholder={field.placeholder || "Enter number"}
            value={value !== undefined && value !== null && value !== "" ? String(value) : ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
            className={baseInputStyles}
          />
        );

      case "DATE":
        return (
          <Input
            id={fieldId}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputStyles}
          />
        );

      case "SELECT":
        return (
          <Select value={(value as string) ?? ""} onValueChange={onChange}>
            <SelectTrigger
              className={cn(
                "h-11 rounded-lg border-border/60 bg-background/50",
                "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                error && "border-red-500",
                isChanged && !error && "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20"
              )}
            >
              <SelectValue placeholder={field.placeholder || "Select an option"} />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-border/60">
              {(field.options || []).map((option) => (
                <SelectItem key={option} value={option} className="rounded-md">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "CHECKBOX":
        return (
          <div
            className={cn(
              "flex items-center space-x-3 p-3 rounded-lg border border-border/40 hover:bg-muted/50 transition-colors",
              isChanged ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20" : "bg-muted/30"
            )}
          >
            <Checkbox
              id={fieldId}
              checked={!!value}
              onCheckedChange={onChange}
              className="h-5 w-5"
            />
            <label htmlFor={fieldId} className="text-sm font-medium cursor-pointer flex-1">
              {field.placeholder || field.field_label}
            </label>
          </div>
        );

      case "MULTISELECT":
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div
            className={cn(
              "space-y-2 p-3 rounded-lg border border-border/40",
              isChanged ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20" : "bg-muted/20"
            )}
          >
            {(field.options || []).map((option) => (
              <div
                key={option}
                className={cn(
                  "flex items-center space-x-3 p-2.5 rounded-md cursor-pointer transition-colors",
                  selectedValues.includes(option)
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50"
                )}
                onClick={() => {
                  if (selectedValues.includes(option)) {
                    onChange(selectedValues.filter((v: string) => v !== option));
                  } else {
                    onChange([...selectedValues, option]);
                  }
                }}
              >
                <Checkbox
                  id={`${fieldId}-${option}`}
                  checked={selectedValues.includes(option)}
                  className="h-4 w-4"
                />
                <label className="text-sm cursor-pointer flex-1">{option}</label>
              </div>
            ))}
          </div>
        );

      case "FILE":
        // Show existing attachments - for CR we show read-only view with info
        const attachmentIds = Array.isArray(value) ? value : (value ? [value] : []);
        const originalAttachmentIds = Array.isArray(originalValue) ? originalValue : (originalValue ? [originalValue] : []);
        
        return (
          <div
            className={cn(
              "rounded-lg border border-border/40 p-4",
              isChanged ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20" : "bg-muted/20"
            )}
          >
            {attachmentIds.length > 0 ? (
              <div className="space-y-2">
                {attachmentIds.map((attachmentId: string) => {
                  const filename = attachmentMap[attachmentId] || `Attachment (${attachmentId.slice(0, 8)}...)`;
                  return (
                    <div
                      key={attachmentId}
                      className="flex items-center gap-3 p-3 rounded-md bg-background/50 border border-border/30"
                    >
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <File className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{filename}</p>
                        <p className="text-xs text-muted-foreground">Uploaded attachment</p>
                      </div>
                      <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : originalAttachmentIds.length > 0 ? (
              <div className="space-y-2">
                {originalAttachmentIds.map((attachmentId: string) => {
                  const filename = attachmentMap[attachmentId] || `Attachment (${attachmentId.slice(0, 8)}...)`;
                  return (
                    <div
                      key={attachmentId}
                      className="flex items-center gap-3 p-3 rounded-md bg-background/50 border border-border/30"
                    >
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <File className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{filename}</p>
                        <p className="text-xs text-muted-foreground">Uploaded attachment</p>
                      </div>
                      <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground py-2">
                <Paperclip className="h-5 w-5" />
                <span className="text-sm">No attachments for this field</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">
              Note: Attachments cannot be modified through change requests.
            </p>
          </div>
        );

      default:
        return (
          <Input
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputStyles}
          />
        );
    }
  };

  return (
    <div className="space-y-2.5">
      {field.field_type !== "CHECKBOX" && (
        <Label
          htmlFor={fieldId}
          className="text-sm font-medium text-foreground/90 flex items-center gap-1"
        >
          {field.field_label}
          {fieldIsRequired && <span className="text-red-500 text-xs font-bold">*</span>}
          {isChanged && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] px-1.5 py-0 h-4 bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400"
            >
              Modified
            </Badge>
          )}
        </Label>
      )}
      {renderField()}
      {field.help_text && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed">{field.help_text}</p>
      )}
      {error && (
        <p className="text-xs text-red-500 font-medium flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <span className="h-1 w-1 rounded-full bg-red-500" />
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Step Indicator Component - Matches Original Form
// ============================================================================

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

function StepIndicator({ currentStep, totalSteps, stepLabels }: StepIndicatorProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full">
      {/* Step Numbers */}
      <div className="flex items-center justify-center gap-8">
        {stepLabels.map((label, idx) => (
          <div key={idx} className="flex flex-col items-center min-w-0">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all flex-shrink-0",
                idx < currentStep
                  ? "bg-primary text-primary-foreground"
                  : idx === currentStep
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {idx < currentStep ? <Check className="h-5 w-5" /> : idx + 1}
            </div>
            <span
              className={cn(
                "text-xs mt-1.5 text-center whitespace-nowrap",
                idx === currentStep ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-4">
        <div
          className="h-full bg-gradient-to-r from-primary to-orange-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Change Request Form Component
// ============================================================================

export function ChangeRequestForm({
  open,
  onOpenChange,
  ticket,
  steps: propSteps,
  workflowSteps,
  attachments: propAttachments,
  onSuccess,
}: ChangeRequestFormProps) {
  // State
  const [proposedValues, setProposedValues] = useState<Record<string, Record<string, unknown>>>({});
  const [proposedSectionRows, setProposedSectionRows] = useState<Record<string, Record<string, Array<Record<string, unknown>>>>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [lastTicketId, setLastTicketId] = useState<string>("");

  const createMutation = useCreateChangeRequest();

  // Fetch ticket details
  const needsFetch = !propSteps || propSteps.length === 0;
  const { data: ticketDetailData, isLoading: isLoadingTicketDetail } = useQuery({
    queryKey: ["ticket-detail-for-cr", ticket.ticket_id],
    queryFn: async (): Promise<TicketDetail> => {
      return await apiClient.get<TicketDetail>(`/tickets/${ticket.ticket_id}`);
    },
    enabled: open && needsFetch,
    staleTime: 30000,
  });

  // Fetch attachments for the ticket
  const { data: attachmentsData } = useQuery({
    queryKey: ["ticket-attachments-for-cr", ticket.ticket_id],
    queryFn: async () => {
      return await apiClient.get<{ 
        total_count: number; 
        attachments: Array<{ attachment_id: string; original_filename: string; mime_type: string; size_bytes: number }> 
      }>(`/attachments/ticket/${ticket.ticket_id}`);
    },
    enabled: open,
    staleTime: 30000,
  });

  // Create a map of attachment ID to filename for quick lookup
  const attachmentMap = useMemo(() => {
    const map: Record<string, string> = {};
    attachmentsData?.attachments?.forEach((att) => {
      map[att.attachment_id] = att.original_filename;
    });
    return map;
  }, [attachmentsData]);

  // Use fetched steps if prop steps are empty
  const steps = useMemo(() => {
    if (propSteps && propSteps.length > 0) return propSteps;
    return ticketDetailData?.steps || [];
  }, [propSteps, ticketDetailData]);

  // Get the actual ticket data
  const actualTicket = useMemo(() => {
    if (ticketDetailData?.ticket) {
      return ticketDetailData.ticket;
    }
    return ticket;
  }, [ticketDetailData, ticket]);

  // Build form steps with field definitions and original values
  const formStepsData = useMemo((): FormStepData[] => {
    const result: FormStepData[] = [];
    // Main ticket form_values - flat object: { field_key: value }
    const ticketFormValues = (actualTicket.form_values as Record<string, unknown>) || {};

    // Helper to get values for a step - checks both main form_values and step-specific data
    const getStepValues = (stepId: string, fields: FormField[]): Record<string, unknown> => {
      const stepValues: Record<string, unknown> = {};
      
      // Find the corresponding ticket step to check for step-specific form_values
      const ticketStep = steps.find((s) => s.step_id === stepId);
      const stepFormValues = (ticketStep?.data as any)?.form_values as Record<string, unknown> | undefined;
      
      fields.forEach((field) => {
        // First check step-specific form_values (for forms filled during workflow)
        if (stepFormValues && field.field_key in stepFormValues) {
          stepValues[field.field_key] = stepFormValues[field.field_key];
        }
        // Then check main ticket form_values (for initial forms)
        else if (field.field_key in ticketFormValues) {
          stepValues[field.field_key] = ticketFormValues[field.field_key];
        }
      });
      
      return stepValues;
    };

    // Helper to build step data with sections support
    const buildStepData = (
      stepId: string,
      stepName: string,
      stepDescription: string | undefined,
      allFields: FormField[],
      allSections: FormSection[],
      allFormValues: Record<string, unknown>
    ): FormStepData | null => {
      // Sort sections by order
      const sortedSections = [...allSections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      // Identify repeating section fields
      const repeatingSectionFieldKeys = new Set<string>();
      const repeatingSectionIds = new Set<string>();
      
      sortedSections.forEach((section) => {
        if (section.is_repeating) {
          repeatingSectionIds.add(section.section_id);
          allFields
            .filter((f) => (f as any).section_id === section.section_id)
            .forEach((f) => repeatingSectionFieldKeys.add(f.field_key));
        }
      });
      
      // Also detect from __section_ keys
      Object.keys(allFormValues).forEach((key) => {
        if (key.startsWith('__section_')) {
          const sectionId = key.replace('__section_', '');
          repeatingSectionIds.add(sectionId);
          allFields
            .filter((f) => (f as any).section_id === sectionId)
            .forEach((f) => repeatingSectionFieldKeys.add(f.field_key));
        }
      });
      
      // Regular fields (not in repeating sections), sorted by order
      const regularFields = allFields
        .filter((f) => !repeatingSectionFieldKeys.has(f.field_key))
        .sort((a, b) => ((a as any).order ?? 999) - ((b as any).order ?? 999));
      
      // Get values for regular fields
      const regularValues: Record<string, unknown> = {};
      regularFields.forEach((field) => {
        if (field.field_key in allFormValues) {
          regularValues[field.field_key] = allFormValues[field.field_key];
        }
      });
      
      // Build repeating sections data
      const repeatingSectionsData: RepeatingSectionData[] = [];
      repeatingSectionIds.forEach((sectionId) => {
        const sectionDataKey = `__section_${sectionId}`;
        const rows = allFormValues[sectionDataKey];
        const section = sortedSections.find((s) => s.section_id === sectionId);
        const sectionFields = allFields
          .filter((f) => (f as any).section_id === sectionId)
          .sort((a, b) => ((a as any).order ?? 999) - ((b as any).order ?? 999));
        
        if (sectionFields.length > 0) {
          repeatingSectionsData.push({
            sectionId,
            sectionTitle: section?.section_title || `Section`,
            sectionDescription: section?.section_description,
            minRows: section?.min_rows,
            fields: sectionFields,
            originalRows: Array.isArray(rows) ? rows : [],
          });
        }
      });
      
      // Check if we have any data
      const hasRegularValues = Object.values(regularValues).some(
        (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
      );
      const hasRepeatingSectionData = repeatingSectionsData.some((s) => s.originalRows.length > 0);
      
      if (!hasRegularValues && !hasRepeatingSectionData) {
        return null;
      }
      
      return {
        stepId,
        stepName,
        stepDescription,
        fields: regularFields,
        sections: sortedSections,
        originalValues: regularValues,
        repeatingSections: repeatingSectionsData,
      };
    };

    // First try workflow steps
    if (workflowSteps && workflowSteps.length > 0) {
      for (const wfStep of workflowSteps) {
        if (wfStep.step_type === "FORM_STEP" && wfStep.fields && wfStep.fields.length > 0) {
          const stepData = buildStepData(
            wfStep.step_id,
            wfStep.step_name,
            (wfStep as any).description,
            wfStep.fields,
            (wfStep as any).sections || [],
            getStepValues(wfStep.step_id, wfStep.fields)
          );
          if (stepData) {
            result.push(stepData);
          }
        }
      }
    }

    // Fall back to ticket steps (use this when workflow steps aren't provided)
    if (result.length === 0 && steps && steps.length > 0) {
      // Filter to COMPLETED form steps (only completed forms can have change requests)
      const completedFormSteps = steps.filter((s) => {
        if (s.step_type !== "FORM_STEP") return false;
        return s.state === "COMPLETED";
      });
      
      // Sort by step order to maintain workflow sequence
      const sortedFormSteps = [...completedFormSteps].sort((a, b) => {
        const orderA = (a as any).step_order ?? (a as any).order ?? 0;
        const orderB = (b as any).step_order ?? (b as any).order ?? 0;
        return orderA - orderB;
      });
      
      for (const ticketStep of sortedFormSteps) {
        const fields = (ticketStep.data?.fields as FormField[]) || [];
        const sections = ((ticketStep.data as any)?.sections || []) as FormSection[];
        const stepFormValues = (ticketStep.data as any)?.form_values as Record<string, unknown> | undefined;
        const mergedValues = { ...ticketFormValues, ...(stepFormValues || {}) };
        
        if (fields.length === 0) {
          continue;
        }
        
        const stepData = buildStepData(
          ticketStep.step_id,
          ticketStep.step_name,
          (ticketStep.data as any)?.description,
          fields,
          sections,
          mergedValues
        );
        
        if (stepData) {
          result.push(stepData);
        }
      }
    }

    return result;
  }, [workflowSteps, steps, actualTicket]);

  // Total steps: form steps + review step
  const totalSteps = formStepsData.length + 1;
  const isReviewStep = currentStep === formStepsData.length;
  const currentFormData = !isReviewStep ? formStepsData[currentStep] : null;

  // Step labels for indicator
  const stepLabels = useMemo(() => {
    const labels = formStepsData.map((s) => s.stepName);
    labels.push("Review & Submit");
    return labels;
  }, [formStepsData]);

  // Initialize form when data is ready (only once per ticket)
  useEffect(() => {
    if (open && formStepsData.length > 0 && ticket.ticket_id !== lastTicketId) {
      // Initialize regular field values
      const initialValues: Record<string, Record<string, unknown>> = {};
      // Initialize repeating section rows
      const initialSectionRows: Record<string, Record<string, Array<Record<string, unknown>>>> = {};
      
      formStepsData.forEach((step) => {
        initialValues[step.stepId] = { ...step.originalValues };
        
        // Initialize repeating sections
        if (step.repeatingSections && step.repeatingSections.length > 0) {
          initialSectionRows[step.stepId] = {};
          step.repeatingSections.forEach((section) => {
            // Deep clone the rows to avoid mutating original data
            initialSectionRows[step.stepId][section.sectionId] = section.originalRows.map((row) => ({ ...row }));
          });
        }
      });
      
      setProposedValues(initialValues);
      setProposedSectionRows(initialSectionRows);
      setCurrentStep(0);
      setReason("");
      setFormErrors({});
      setLastTicketId(ticket.ticket_id);
    }
  }, [open, formStepsData, ticket.ticket_id, lastTicketId]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setLastTicketId("");
      setCurrentStep(0);
      setReason("");
      setFormErrors({});
      setProposedSectionRows({});
    }
  }, [open]);

  // Get all proposed values as a flat object for conditional validation
  // Includes both regular fields and repeating section values
  const allFlatValues = useMemo(() => {
    const flat: Record<string, unknown> = {};
    
    // Add regular field values
    Object.values(proposedValues).forEach((stepValues) => {
      Object.entries(stepValues).forEach(([key, value]) => {
        flat[key] = value;
      });
    });
    
    // Add repeating section values with special keys (__section_{sectionId})
    // This allows conditional validation to reference section data
    Object.entries(proposedSectionRows).forEach(([stepId, sections]) => {
      Object.entries(sections).forEach(([sectionId, rows]) => {
        // Store the full section data for reference
        flat[`__section_${sectionId}`] = rows;
        
        // Also flatten individual field values from all rows for simple conditionals
        rows.forEach((row, rowIndex) => {
          Object.entries(row).forEach(([fieldKey, value]) => {
            // Store with unique key per row
            flat[`${sectionId}_${rowIndex}_${fieldKey}`] = value;
          });
        });
      });
    });
    
    return flat;
  }, [proposedValues, proposedSectionRows]);

  // Update field value and clear its error
  const updateFieldValue = useCallback((stepId: string, fieldKey: string, value: unknown) => {
    setProposedValues((prev) => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] || {}),
        [fieldKey]: value,
      },
    }));
    // Clear error for this field when value changes
    setFormErrors((prev) => {
      if (prev[fieldKey]) {
        const { [fieldKey]: _, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  // Update repeating section row field value
  const updateSectionRowValue = useCallback((stepId: string, sectionId: string, rowIndex: number, fieldKey: string, value: unknown) => {
    setProposedSectionRows((prev) => {
      const stepSections = prev[stepId] || {};
      const sectionRows = stepSections[sectionId] || [];
      const updatedRows = [...sectionRows];
      
      if (!updatedRows[rowIndex]) {
        updatedRows[rowIndex] = {};
      }
      
      updatedRows[rowIndex] = {
        ...updatedRows[rowIndex],
        [fieldKey]: value,
      };
      
      return {
        ...prev,
        [stepId]: {
          ...stepSections,
          [sectionId]: updatedRows,
        },
      };
    });
    // Clear error for this field
    const errorKey = `${sectionId}_${rowIndex}_${fieldKey}`;
    setFormErrors((prev) => {
      if (prev[errorKey]) {
        const { [errorKey]: _, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  // Add row to repeating section
  const addSectionRow = useCallback((stepId: string, sectionId: string) => {
    setProposedSectionRows((prev) => {
      const stepSections = prev[stepId] || {};
      const sectionRows = stepSections[sectionId] || [];
      
      return {
        ...prev,
        [stepId]: {
          ...stepSections,
          [sectionId]: [...sectionRows, {}],
        },
      };
    });
  }, []);

  // Remove row from repeating section
  const removeSectionRow = useCallback((stepId: string, sectionId: string, rowIndex: number) => {
    setProposedSectionRows((prev) => {
      const stepSections = prev[stepId] || {};
      const sectionRows = stepSections[sectionId] || [];
      
      return {
        ...prev,
        [stepId]: {
          ...stepSections,
          [sectionId]: sectionRows.filter((_, idx) => idx !== rowIndex),
        },
      };
    });
  }, []);

  // Get current section rows for a step
  const getSectionRows = useCallback((stepId: string, sectionId: string): Array<Record<string, unknown>> => {
    return proposedSectionRows[stepId]?.[sectionId] || [];
  }, [proposedSectionRows]);

  // Validate current step (including repeating sections and minRows)
  const validateCurrentStep = useCallback((): boolean => {
    if (!currentFormData) return true;
    
    const errors: Record<string, string> = {};
    const stepValues = proposedValues[currentFormData.stepId] || {};
    
    // Validate regular fields
    currentFormData.fields.forEach((field) => {
      // Skip FILE fields (they're read-only in CR)
      if (field.field_type === "FILE") return;
      
      const value = stepValues[field.field_key];
      const error = validateFieldValue(field, value, allFlatValues);
      if (error) {
        errors[field.field_key] = error;
      }
    });
    
    // Validate repeating sections
    if (currentFormData.repeatingSections) {
      currentFormData.repeatingSections.forEach((section) => {
        const rows = proposedSectionRows[currentFormData.stepId]?.[section.sectionId] || [];
        
        // Check minRows requirement
        if (section.minRows && rows.length < section.minRows) {
          errors[`${section.sectionId}_minRows`] = 
            `${section.sectionTitle} requires at least ${section.minRows} row${section.minRows > 1 ? "s" : ""}`;
        }
        
        // Check maxRows requirement
        if (section.maxRows && rows.length > section.maxRows) {
          errors[`${section.sectionId}_maxRows`] = 
            `${section.sectionTitle} cannot exceed ${section.maxRows} row${section.maxRows > 1 ? "s" : ""}`;
        }
        
        // Validate each field in each row
        rows.forEach((row, rowIndex) => {
          section.fields.forEach((field) => {
            // Skip FILE fields
            if (field.field_type === "FILE") return;
            
            const value = row[field.field_key];
            const error = validateFieldValue(field, value, allFlatValues);
            if (error) {
              const errorKey = `${section.sectionId}_${rowIndex}_${field.field_key}`;
              errors[errorKey] = error;
            }
          });
        });
      });
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [currentFormData, proposedValues, proposedSectionRows, allFlatValues]);

  // Calculate changes (including repeating sections)
  const { hasChanges, changeCount, changedFields, sectionChanges } = useMemo(() => {
    const changes: Array<{
      stepName: string;
      fieldLabel: string;
      originalValue: string;
      newValue: string;
    }> = [];
    
    const sectionChangeSummary: Array<{
      stepName: string;
      sectionTitle: string;
      changeType: "added" | "removed" | "modified";
      details: string;
    }> = [];

    formStepsData.forEach((step) => {
      // Regular field changes
      const stepProposed = proposedValues[step.stepId] || {};
      step.fields.forEach((field) => {
        const originalVal = step.originalValues[field.field_key];
        const proposedVal = stepProposed[field.field_key];

        if (hasValueChanged(originalVal, proposedVal)) {
          changes.push({
            stepName: step.stepName,
            fieldLabel: field.field_label,
            originalValue: getFieldDisplayValue(originalVal),
            newValue: getFieldDisplayValue(proposedVal),
          });
        }
      });
      
      // Repeating section changes
      if (step.repeatingSections) {
        step.repeatingSections.forEach((section) => {
          const currentRows = proposedSectionRows[step.stepId]?.[section.sectionId] || [];
          const originalRows = section.originalRows;
          
          // Check row count changes
          if (currentRows.length !== originalRows.length) {
            const diff = currentRows.length - originalRows.length;
            sectionChangeSummary.push({
              stepName: step.stepName,
              sectionTitle: section.sectionTitle,
              changeType: diff > 0 ? "added" : "removed",
              details: `${Math.abs(diff)} row${Math.abs(diff) !== 1 ? "s" : ""} ${diff > 0 ? "added" : "removed"}`,
            });
          }
          
          // Check for field value changes in existing rows
          const minLength = Math.min(currentRows.length, originalRows.length);
          for (let i = 0; i < minLength; i++) {
            section.fields.forEach((field) => {
              const originalVal = originalRows[i]?.[field.field_key];
              const proposedVal = currentRows[i]?.[field.field_key];
              
              if (hasValueChanged(originalVal, proposedVal)) {
                changes.push({
                  stepName: `${step.stepName} > ${section.sectionTitle} (Row ${i + 1})`,
                  fieldLabel: field.field_label,
                  originalValue: getFieldDisplayValue(originalVal),
                  newValue: getFieldDisplayValue(proposedVal),
                });
              }
            });
          }
        });
      }
    });

    const totalChanges = changes.length + sectionChangeSummary.length;
    
    return {
      hasChanges: totalChanges > 0,
      changeCount: totalChanges,
      changedFields: changes,
      sectionChanges: sectionChangeSummary,
    };
  }, [formStepsData, proposedValues, proposedSectionRows]);

  // Navigation
  const handleNext = () => {
    // Validate current step before proceeding
    if (!isReviewStep && !validateCurrentStep()) {
      toast.error("Please fix the validation errors before proceeding");
      return;
    }
    
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setFormErrors({}); // Clear errors when going back
    }
  };

  // Submit handler
  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the change request");
      return;
    }

    if (!hasChanges) {
      toast.error("No changes detected. Please modify at least one field.");
      return;
    }

    try {
      // Flatten proposed values from { stepId: { field_key: value } } to { field_key: value }
      const flatProposedValues: Record<string, unknown> = {};
      
      // Add regular field values
      Object.values(proposedValues).forEach((stepValues) => {
        Object.entries(stepValues).forEach(([key, value]) => {
          flatProposedValues[key] = value;
        });
      });
      
      // Add repeating section data with __section_ keys
      Object.entries(proposedSectionRows).forEach(([stepId, sections]) => {
        Object.entries(sections).forEach(([sectionId, rows]) => {
          const sectionDataKey = `__section_${sectionId}`;
          flatProposedValues[sectionDataKey] = rows;
        });
      });

      await createMutation.mutateAsync({
        ticket_id: ticket.ticket_id,
        proposed_form_values: flatProposedValues,
        proposed_attachment_ids: actualTicket.attachment_ids || [],
        reason: reason.trim(),
      });

      toast.success("Change request submitted successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to submit change request";
      toast.error(message);
    }
  };

  // Loading state
  const isLoading = needsFetch && isLoadingTicketDetail;
  // Data is ready when we have steps and either regular values or section rows are initialized
  const hasRegularValues = Object.keys(proposedValues).length > 0;
  const hasSectionRows = Object.keys(proposedSectionRows).length > 0;
  const isDataReady = formStepsData.length > 0 && (hasRegularValues || hasSectionRows);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Accessible Header */}
        <DialogHeader className="sr-only">
          <DialogTitle>Change Request for {ticket.ticket_id}</DialogTitle>
          <DialogDescription>Modify ticket form fields and submit for approval</DialogDescription>
        </DialogHeader>

        {/* Visual Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-muted/30 to-muted/10 flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileEdit className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">Change Request</h2>
              <p className="text-sm text-muted-foreground break-words">{ticket.ticket_id} • {ticket.title}</p>
            </div>
          </div>

          {/* Step Indicator */}
          {isDataReady && (
            <StepIndicator
              currentStep={currentStep}
              totalSteps={totalSteps}
              stepLabels={stepLabels}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Loading ticket data...</p>
            </div>
          ) : formStepsData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">No Editable Forms</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                There are no submitted forms available to modify. Change requests can only be made for forms that have already been filled and submitted.
              </p>
            </div>
          ) : !isDataReady ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Preparing form...</p>
            </div>
          ) : !isReviewStep && currentFormData ? (
            /* Form Step */
            <div className="animate-in fade-in-0 slide-in-from-right-4 duration-300">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{currentFormData.stepName}</CardTitle>
                  {currentFormData.stepDescription && (
                    <CardDescription className="text-sm mt-1">
                      {currentFormData.stepDescription}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p>Edit any fields you want to change. Modified fields will be highlighted.</p>
                    </div>
                  </div>

                  {/* Fields - Responsive Grid Layout */}
                  {currentFormData.fields.length > 0 && (
                    <div className="grid gap-5 sm:grid-cols-1 md:grid-cols-2">
                      {currentFormData.fields.map((field) => (
                        <div 
                          key={field.field_key}
                          className={cn(
                            field.field_type === "TEXTAREA" && "md:col-span-2",
                            field.field_type === "MULTISELECT" && "md:col-span-2",
                            field.field_type === "FILE" && "md:col-span-2"
                          )}
                        >
                          <DynamicField
                            field={field}
                            value={proposedValues[currentFormData.stepId]?.[field.field_key]}
                            originalValue={currentFormData.originalValues[field.field_key]}
                            onChange={(value) =>
                              updateFieldValue(currentFormData.stepId, field.field_key, value)
                            }
                            error={formErrors[field.field_key]}
                            attachmentMap={attachmentMap}
                            allFormValues={allFlatValues}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Repeating Sections - Editable */}
                  {currentFormData.repeatingSections && currentFormData.repeatingSections.length > 0 && (
                    <div className="space-y-6 pt-4 border-t border-border/40">
                      {currentFormData.repeatingSections.map((section) => {
                        const currentRows = getSectionRows(currentFormData.stepId, section.sectionId);
                        const originalRowCount = section.originalRows.length;
                        const currentRowCount = currentRows.length;
                        const rowCountChanged = currentRowCount !== originalRowCount;
                        
                        return (
                          <div key={section.sectionId} className="space-y-4">
                            {/* Section Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 rounded-lg">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-muted-foreground" />
                                  <h4 className="text-base font-semibold text-foreground">{section.sectionTitle}</h4>
                                  {rowCountChanged && (
                                    <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400">
                                      {originalRowCount} → {currentRowCount} rows
                                    </Badge>
                                  )}
                                </div>
                                {section.sectionDescription && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{section.sectionDescription}</p>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addSectionRow(currentFormData.stepId, section.sectionId)}
                                className="gap-2 self-start sm:self-auto bg-background hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add Row
                              </Button>
                            </div>
                            
                            {/* Minimum rows warning */}
                            {section.minRows && currentRows.length < section.minRows && (
                              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                  At least {section.minRows} row{section.minRows > 1 ? "s" : ""} required
                                </p>
                              </div>
                            )}
                            
                            {/* Rows */}
                            {currentRows.length === 0 ? (
                              <div className="text-center py-8 border-2 border-dashed rounded-xl border-border/50 bg-muted/20">
                                <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                                  <Plus className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  {section.minRows && section.minRows > 0 
                                    ? `At least ${section.minRows} row${section.minRows > 1 ? "s" : ""} required`
                                    : "No rows added yet"
                                  }
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">Click "Add Row" to add data</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {currentRows.map((row, rowIndex) => {
                                  const originalRow = section.originalRows[rowIndex];
                                  const isNewRow = rowIndex >= section.originalRows.length;
                                  
                                  return (
                                    <Card 
                                      key={`${section.sectionId}_row_${rowIndex}`} 
                                      className={cn(
                                        "border shadow-sm hover:shadow-md transition-shadow",
                                        isNewRow && "border-blue-300 bg-blue-50/20 dark:border-blue-800 dark:bg-blue-950/10"
                                      )}
                                    >
                                      <CardHeader className="pb-3 bg-muted/20">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                              Row {rowIndex + 1}
                                            </h5>
                                            {isNewRow && (
                                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400">
                                                New
                                              </Badge>
                                            )}
                                          </div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeSectionRow(currentFormData.stepId, section.sectionId, rowIndex)}
                                            className="h-7 px-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </CardHeader>
                                      <CardContent className="p-4 sm:p-5 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                                          {section.fields.map((field) => {
                                            const value = row[field.field_key];
                                            const originalValue = originalRow?.[field.field_key];
                                            const isChanged = !isNewRow && hasValueChanged(originalValue, value);
                                            
                                            // Skip FILE fields in repeating sections (read-only)
                                            if (field.field_type === "FILE") {
                                              return (
                                                <div key={field.field_key} className="md:col-span-2">
                                                  <Label className="text-sm font-medium text-muted-foreground">
                                                    {field.field_label}
                                                  </Label>
                                                  <div className="mt-1.5 p-3 rounded-lg bg-muted/30 border border-border/40">
                                                    {Array.isArray(value) && value.length > 0 ? (
                                                      <div className="flex items-center gap-2 text-sm">
                                                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                                                        <span>{value.length} attachment{value.length !== 1 ? "s" : ""}</span>
                                                      </div>
                                                    ) : (
                                                      <span className="text-sm text-muted-foreground">No attachments</span>
                                                    )}
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                      Attachments cannot be modified through change requests.
                                                    </p>
                                                  </div>
                                                </div>
                                              );
                                            }
                                            
                                            return (
                                              <DynamicField
                                                key={`${section.sectionId}_${rowIndex}_${field.field_key}`}
                                                field={field}
                                                value={value}
                                                originalValue={originalValue}
                                                onChange={(newValue) => updateSectionRowValue(currentFormData.stepId, section.sectionId, rowIndex, field.field_key, newValue)}
                                                error={formErrors[`${section.sectionId}_${rowIndex}_${field.field_key}`]}
                                                attachmentMap={attachmentMap}
                                                allFormValues={allFlatValues}
                                              />
                                            );
                                          })}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Review Step */
            <div className="space-y-5 animate-in fade-in-0 slide-in-from-right-4 duration-300">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Review Your Changes</CardTitle>
                  <CardDescription>
                    Please review the changes below before submitting your request
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Changes Summary */}
                  {hasChanges ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {changeCount} change{changeCount !== 1 ? "s" : ""} detected
                        </Badge>
                      </div>

                      <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                        {/* Section row changes (add/remove) */}
                        {sectionChanges.map((change, idx) => (
                          <div key={`section-${idx}`} className="p-4 bg-blue-50/30 dark:bg-blue-950/20">
                            <div className="text-xs text-muted-foreground mb-1">{change.stepName}</div>
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{change.sectionTitle}</span>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs",
                                  change.changeType === "added" 
                                    ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950 dark:border-green-700 dark:text-green-400"
                                    : "bg-red-50 border-red-300 text-red-700 dark:bg-red-950 dark:border-red-700 dark:text-red-400"
                                )}
                              >
                                {change.details}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        
                        {/* Field value changes */}
                        {changedFields.map((change, idx) => (
                          <div key={idx} className="p-4">
                            <div className="text-xs text-muted-foreground mb-1">{change.stepName}</div>
                            <div className="text-sm font-medium mb-2">{change.fieldLabel}</div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="min-w-0 overflow-hidden">
                                <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Before</div>
                                <div className="text-muted-foreground line-through break-all">{change.originalValue}</div>
                              </div>
                              <div className="min-w-0 overflow-hidden">
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">After</div>
                                <div className="font-medium break-all">{change.newValue}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No changes have been made yet.</p>
                      <p className="text-sm">Go back and modify some fields to create a change request.</p>
                    </div>
                  )}

                  {/* Reason */}
                  {hasChanges && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Reason for Change <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        placeholder="Please explain why these changes are needed..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={4}
                        className={cn(
                          "rounded-lg border-border/60 bg-background/50 transition-all duration-200 resize-y min-h-[100px]",
                          "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                          "placeholder:text-muted-foreground/60"
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        This helps the approver understand the context of your request.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer Navigation - Matches Original Form */}
        <div className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between flex-shrink-0">
          {currentStep > 0 ? (
            <Button variant="outline" onClick={handleBack} className="h-11 px-5 font-medium">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 px-5 font-medium">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}

          {isReviewStep ? (
            <Button
              onClick={handleSubmit}
              disabled={!hasChanges || !reason.trim() || createMutation.isPending}
              className="h-11 px-6 min-w-[160px] font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
            >
              {createMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </span>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="h-11 px-6 font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
