/**
 * Create Ticket Page - Multi-Form Wizard
 * 
 * Scenarios handled:
 * 1. No forms (direct approval) - Simple confirmation → Submit
 * 2. Single form → approval - Form fields → Review → Submit  
 * 3. Multiple forms → approval → task - Form 1 → Form 2 → ... → Review → Submit
 * 4. Complex workflows - Only initial consecutive forms captured at creation
 * 
 * NO artificial Title/Description - everything comes from workflow design!
 */
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkflow, useInitialFormChain } from "@/hooks/use-workflows";
import { useCreateTicket } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/loading-skeleton";
import { ErrorState, NotFoundError } from "@/components/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Send, X, CheckCircle, FileText, Plus, Trash2, Crown, Users, Loader2, Table2 } from "lucide-react";
import { FileUpload } from "@/components/file-upload";
import Link from "next/link";
import { toast } from "sonner";
import type { FormField, FormSection, LookupUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useResolveLookupUsers } from "@/hooks/use-lookups";

// Validate a single field value against its validation rules
function validateFieldValue(field: FormField, value: any): string | null {
  // Skip validation if field is empty and not required (empty check handled separately)
  if (value === undefined || value === null || value === "") {
    return null;
  }
  
  const validation = field.validation;
  if (!validation) return null;
  
  // Text length validation (for TEXT and TEXTAREA)
  if (field.field_type === "TEXT" || field.field_type === "TEXTAREA") {
    const textValue = String(value);
    const charCount = textValue.length;
    
    if (validation.min_length && charCount < validation.min_length) {
      return `${field.field_label} must be at least ${validation.min_length} characters (currently ${charCount})`;
    }
    
    if (validation.max_length && charCount > validation.max_length) {
      return `${field.field_label} must not exceed ${validation.max_length} characters (currently ${charCount})`;
    }
    
    // Regex pattern validation
    if (validation.regex_pattern) {
      try {
        const regex = new RegExp(validation.regex_pattern);
        if (!regex.test(textValue)) {
          return `${field.field_label} format is invalid`;
        }
      } catch (e) {
        // Invalid regex pattern - skip validation
        console.warn(`Invalid regex pattern for field ${field.field_key}:`, validation.regex_pattern);
      }
    }
  }
  
  // Number validation
  if (field.field_type === "NUMBER") {
    const numValue = typeof value === "number" ? value : parseFloat(value);
    
    if (!isNaN(numValue)) {
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

// Get the value of a source field for conditional evaluation
function getSourceValue(
  fieldKey: string, 
  allFormValues: Record<string, any>, 
  rowContext?: Record<string, any>
): any {
  if (rowContext && fieldKey in rowContext) {
    return rowContext[fieldKey];
  }
  return allFormValues[fieldKey];
}

// Evaluate a single condition
function evaluateSingleCondition(
  condition: { field_key: string; operator: string; value?: string | string[] },
  allFormValues: Record<string, any>,
  rowContext?: Record<string, any>
): boolean {
  const actualValue = getSourceValue(condition.field_key, allFormValues, rowContext);
  return evaluateConditionOperator(condition.operator, condition.value, actualValue);
}

// Evaluate if a conditional rule matches (supports AND/OR compound conditions)
function evaluateConditionalRule(
  rule: any, // ConditionalRequirement
  allFormValues: Record<string, any>,
  rowContext?: Record<string, any>
): boolean {
  // Evaluate the primary condition
  const primaryResult = evaluateSingleCondition(rule.when, allFormValues, rowContext);
  
  // Check for compound conditions
  const additionalConditions = rule.when.conditions || [];
  if (additionalConditions.length === 0) {
    return primaryResult;
  }
  
  // Get logic (default: AND)
  const logic = rule.when.logic || "AND";
  
  // Evaluate all conditions including primary
  const allResults = [primaryResult];
  for (const condition of additionalConditions) {
    allResults.push(evaluateSingleCondition(condition, allFormValues, rowContext));
  }
  
  // Apply AND or OR logic
  if (logic === "AND") {
    return allResults.every(r => r);
  } else {
    return allResults.some(r => r);
  }
}

// Evaluate if a field is required based on its static requirement and conditional rules
// rowContext: For fields in repeating sections, this contains the current row's values
function isFieldRequired(field: FormField, allFormValues: Record<string, any>, rowContext?: Record<string, any>): boolean {
  // If the field has conditional requirements, evaluate them
  if (field.conditional_requirements && field.conditional_requirements.length > 0) {
    for (const rule of field.conditional_requirements) {
      if (evaluateConditionalRule(rule, allFormValues, rowContext)) {
        return rule.then.required;
      }
    }
  }
  
  // Default: use static required flag
  return field.required;
}

// Evaluate a condition operator against a value
function evaluateConditionOperator(
  operator: string,
  expectedValue: string | string[] | undefined,
  actualValue: any
): boolean {
  switch (operator) {
    case "equals":
      return actualValue === expectedValue;
    case "not_equals":
      return actualValue !== expectedValue;
    case "in":
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
    case "not_in":
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
    case "is_empty":
      // Handle null, undefined, empty string, and empty arrays
      return actualValue === null || actualValue === undefined || actualValue === "" || 
        (Array.isArray(actualValue) && actualValue.length === 0);
    case "is_not_empty":
      // Value must exist and not be empty string or empty array
      return actualValue !== null && actualValue !== undefined && actualValue !== "" && 
        !(Array.isArray(actualValue) && actualValue.length === 0);
    default:
      return false;
  }
}

// Get date validation settings (combining static and conditional)
interface DateValidationSettings {
  allowPastDates: boolean;
  allowToday: boolean;
  allowFutureDates: boolean;
}

function getDateValidation(
  field: FormField, 
  allFormValues: Record<string, any>, 
  rowContext?: Record<string, any>
): DateValidationSettings {
  // Default: all dates allowed
  let settings: DateValidationSettings = {
    allowPastDates: true,
    allowToday: true,
    allowFutureDates: true,
  };
  
  // First, apply static date validation from field.validation.date_validation
  if (field.validation?.date_validation) {
    const dv = field.validation.date_validation;
    settings = {
      allowPastDates: dv.allow_past_dates !== false,
      allowToday: dv.allow_today !== false,
      allowFutureDates: dv.allow_future_dates !== false,
    };
  }
  
  // Then, check conditional requirements for date-specific validation
  if (field.conditional_requirements && field.conditional_requirements.length > 0) {
    for (const rule of field.conditional_requirements) {
      // Use the compound condition evaluator
      if (evaluateConditionalRule(rule, allFormValues, rowContext)) {
        // If this rule has date_validation, apply it
        if (rule.then.date_validation) {
          const dv = rule.then.date_validation;
          settings = {
            allowPastDates: dv.allow_past_dates !== false,
            allowToday: dv.allow_today !== false,
            allowFutureDates: dv.allow_future_dates !== false,
          };
        }
        break; // First matching rule wins
      }
    }
  }
  
  return settings;
}

// Get min/max date attributes based on validation settings
function getDateInputConstraints(settings: DateValidationSettings): { min?: string; max?: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Calculate yesterday and tomorrow
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  let min: string | undefined;
  let max: string | undefined;
  
  // If past dates not allowed
  if (!settings.allowPastDates) {
    if (settings.allowToday) {
      min = todayStr;
    } else {
      min = tomorrowStr;
    }
  }
  
  // If future dates not allowed
  if (!settings.allowFutureDates) {
    if (settings.allowToday) {
      max = todayStr;
    } else {
      max = yesterdayStr;
    }
  }
  
  // Special case: only today allowed
  if (!settings.allowPastDates && !settings.allowFutureDates && settings.allowToday) {
    min = todayStr;
    max = todayStr;
  }
  
  return { min, max };
}

// Validate date value against validation settings
function validateDateValue(value: string, settings: DateValidationSettings): string | null {
  if (!value) return null;
  
  const selectedDate = new Date(value);
  selectedDate.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const isPast = selectedDate < today;
  const isToday = selectedDate.getTime() === today.getTime();
  const isFuture = selectedDate > today;
  
  if (isPast && !settings.allowPastDates) {
    return "Past dates are not allowed";
  }
  
  if (isToday && !settings.allowToday) {
    return "Today's date is not allowed";
  }
  
  if (isFuture && !settings.allowFutureDates) {
    return "Future dates are not allowed";
  }
  
  return null;
}

import { UserSearchCombobox } from "@/components/workflow-studio/user-search-combobox";

export default function CreateTicketPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.workflowId as string;
  const { user } = useAuth();
  
  const { data: workflow, isLoading: workflowLoading, error: workflowError, refetch } = useWorkflow(workflowId);
  const { data: formChain, isLoading: formChainLoading, isFetching: formChainFetching } = useInitialFormChain(workflowId);
  const createTicket = useCreateTicket();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [lastInitializedFormChain, setLastInitializedFormChain] = useState<string | null>(null);

  // Reset state when workflow changes
  useEffect(() => {
    setFormValues({});
    setFormErrors({});
    setLastInitializedFormChain(null);
    setCurrentStep(0);
  }, [workflowId]);

  // Initialize repeating sections based on min_rows setting
  // Use a fingerprint to detect when formChain data actually changes
  useEffect(() => {
    // Wait until data is loaded and not currently fetching
    if (!formChain?.initial_forms || formChainLoading || formChainFetching) {
      return;
    }
    
    // Create a fingerprint of the current formChain config (sections + fields for default values)
    const sectionsFingerprint = JSON.stringify(
      formChain.initial_forms.map((form: any) => ({
        sections: (form.sections || []).map((s: any) => ({ 
          id: s.section_id, 
          repeating: s.is_repeating, 
          min: s.min_rows 
        })),
        // Include field keys and default values in fingerprint
        fields: (form.fields || []).map((f: any) => ({
          key: f.field_key,
          default: f.default_value
        }))
      }))
    );
    
    // Only initialize if this is new data
    if (lastInitializedFormChain === sectionsFingerprint) {
      return;
    }
    
    const initialValues: Record<string, any> = {};
    
    // Helper function to get proper default value based on field type
    const getDefaultValueForField = (field: any): any => {
      const defaultVal = field.default_value;
      
      // Skip if no default value is set
      if (defaultVal === undefined || defaultVal === null) {
        return undefined;
      }
      
      // Handle different field types
      switch (field.field_type) {
        case "CHECKBOX":
          // Convert to boolean
          return defaultVal === true || defaultVal === "true";
        
        case "SELECT":
          // Only use default if it's a valid option
          if (field.options && Array.isArray(field.options)) {
            if (field.options.includes(defaultVal)) {
              return defaultVal;
            }
          }
          return undefined;
        
        case "NUMBER":
          // Convert to number if string
          if (typeof defaultVal === "string") {
            const num = parseFloat(defaultVal);
            return isNaN(num) ? undefined : num;
          }
          return typeof defaultVal === "number" ? defaultVal : undefined;
        
        case "TEXT":
        case "TEXTAREA":
        case "DATE":
          // Use as string
          return typeof defaultVal === "string" ? defaultVal : String(defaultVal);
        
        case "FILE":
        case "LOOKUP_USER":
          // No defaults for complex types
          return undefined;
        
        default:
          // For any other type, use as-is if it's a primitive
          if (typeof defaultVal === "string" || typeof defaultVal === "number" || typeof defaultVal === "boolean") {
            return defaultVal;
          }
          return undefined;
      }
    };
    
    formChain.initial_forms.forEach((form: any) => {
      const sections = form.sections || [];
      const fields = form.fields || [];
      
      // Group fields by section
      const fieldsBySection: Record<string, any[]> = {};
      const ungroupedFields: any[] = [];
      
      fields.forEach((field: any) => {
        if (field.section_id) {
          if (!fieldsBySection[field.section_id]) {
            fieldsBySection[field.section_id] = [];
          }
          fieldsBySection[field.section_id].push(field);
        } else {
          ungroupedFields.push(field);
        }
      });
      
      // Initialize repeating sections with default values in rows
      sections.forEach((section: any) => {
        if (section.is_repeating) {
          const sectionDataKey = `__section_${section.section_id}`;
          const minRows = section.min_rows || 0;
          const sectionFields = fieldsBySection[section.section_id] || [];
          
          // Build default row with field defaults
          const defaultRow: Record<string, any> = {};
          sectionFields.forEach((field: any) => {
            const defaultVal = getDefaultValueForField(field);
            if (defaultVal !== undefined) {
              defaultRow[field.field_key] = defaultVal;
            }
          });
          
          // Initialize with min_rows, each row having default values
          const initialRows = minRows > 0 
            ? Array.from({ length: minRows }, () => ({ ...defaultRow }))
            : [];
          initialValues[sectionDataKey] = initialRows;
        }
      });
      
      // Initialize default values for non-repeating section fields
      sections.forEach((section: any) => {
        if (!section.is_repeating) {
          const sectionFields = fieldsBySection[section.section_id] || [];
          sectionFields.forEach((field: any) => {
            const defaultVal = getDefaultValueForField(field);
            if (defaultVal !== undefined) {
              initialValues[field.field_key] = defaultVal;
            }
          });
        }
      });
      
      // Initialize default values for ungrouped fields
      ungroupedFields.forEach((field: any) => {
        const defaultVal = getDefaultValueForField(field);
        if (defaultVal !== undefined) {
          initialValues[field.field_key] = defaultVal;
        }
      });
    });
    
    if (Object.keys(initialValues).length > 0) {
      setFormValues(prev => ({ ...prev, ...initialValues }));
    }
    setLastInitializedFormChain(sectionsFingerprint);
  }, [formChain, formChainLoading, formChainFetching, lastInitializedFormChain]);

  // Calculate steps based on form count
  // 0 forms: 1 step (Confirm & Submit)
  // 1 form: 2 steps (Form, Review)
  // N forms: N + 1 steps (Form1, Form2, ..., Review)
  const totalFormSteps = formChain?.total_form_count || 0;
  const hasNoForms = totalFormSteps === 0;
  
  // Total steps: forms + review (or just confirm if no forms)
  const totalSteps = hasNoForms ? 1 : totalFormSteps + 1;
  
  // Current form (null if on review step or no forms)
  const currentFormStep = useMemo(() => {
    if (hasNoForms) return null;
    if (currentStep >= totalFormSteps) return null; // Review step
    return formChain?.initial_forms?.[currentStep] || null;
  }, [currentStep, totalFormSteps, formChain, hasNoForms]);

  const isReviewStep = hasNoForms ? currentStep === 0 : currentStep === totalFormSteps;
  const isFormStep = !hasNoForms && currentStep < totalFormSteps;

  // Step labels for progress indicator
  const stepLabels = useMemo(() => {
    if (hasNoForms) {
      return ["Confirm & Submit"];
    }
    const labels: string[] = [];
    formChain?.initial_forms?.forEach(form => {
      labels.push(form.step_name);
    });
    labels.push("Review & Submit");
    return labels;
  }, [formChain, hasNoForms]);

  // Auto-generate ticket title from workflow name and first form field or user name
  const generateTicketTitle = (): string => {
    // Try to get first text field value as title
    const firstForm = formChain?.initial_forms?.[0];
    if (firstForm?.fields) {
      for (const field of firstForm.fields) {
        if (field.field_type === 'TEXT' && formValues[field.field_key]) {
          return `${workflow?.name} - ${formValues[field.field_key]}`;
        }
      }
    }
    // Fallback: workflow name + user name
    return `${workflow?.name} - ${user?.display_name || 'Request'}`;
  };

  // Validate current step
  const validateCurrentStep = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (isFormStep && currentFormStep) {
      const fields = (currentFormStep.fields || []) as FormField[];
      const sections = ((currentFormStep as any).sections || []) as FormSection[];
      
      // Group fields by section and sort by order
      const fieldsBySection = sections.reduce((acc: Record<string, FormField[]>, section: FormSection) => {
        acc[section.section_id] = fields
          .filter((f: FormField) => f.section_id === section.section_id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return acc;
      }, {} as Record<string, FormField[]>);
      
      const ungroupedFields = fields
        .filter((f: FormField) => !f.section_id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      // Helper to validate a field
      // rowContext: For repeating sections, contains the current row's values for conditional requirement checks
      const validateField = (field: FormField, value: any, errorKey: string, rowLabel?: string, rowContext?: Record<string, any>) => {
        const isEmpty = value === undefined || value === null || value === "" || 
          (Array.isArray(value) && value.length === 0);
        
        // Check if field is required (static or conditional)
        // Pass rowContext so conditional requirements can check values in the same repeating section row
        const fieldIsRequired = isFieldRequired(field, formValues, rowContext);
        
        // Required check
        if (fieldIsRequired && isEmpty) {
          errors[errorKey] = rowLabel 
            ? `${field.field_label} is required in ${rowLabel}`
            : `${field.field_label} is required`;
          return;
        }
        
        // Skip further validation if empty
        if (isEmpty) return;
        
        // Field-specific validation (min/max length, regex, etc.)
        const validationError = validateFieldValue(field, value);
        if (validationError) {
          errors[errorKey] = rowLabel 
            ? `${validationError} (${rowLabel})`
            : validationError;
        }
      };
      
      // Validate repeating sections
      sections.forEach((section: FormSection) => {
        if (section.is_repeating) {
          const sectionFields = fieldsBySection[section.section_id] || [];
          const sectionDataKey = `__section_${section.section_id}`;
          const rows = Array.isArray(formValues[sectionDataKey]) ? formValues[sectionDataKey] : [];
          
          // Check minimum rows requirement
          const minRows = section.min_rows || 0;
          if (minRows > 0 && rows.length < minRows) {
            errors[`${sectionDataKey}_min_rows`] = `${section.section_title} requires at least ${minRows} row${minRows > 1 ? 's' : ''}`;
          }
          
          // Validate each row
          rows.forEach((row: Record<string, any>, rowIndex: number) => {
            sectionFields.forEach((field: FormField) => {
              const value = row[field.field_key];
              const errorKey = `${sectionDataKey}_${rowIndex}_${field.field_key}`;
              // Pass the row as rowContext so conditional requirements can check values in the same row
              validateField(field, value, errorKey, `row ${rowIndex + 1}`, row);
            });
          });
        } else {
          // Validate non-repeating section fields
          const sectionFields = fieldsBySection[section.section_id] || [];
          sectionFields.forEach((field: FormField) => {
            const value = formValues[field.field_key];
            validateField(field, value, field.field_key);
          });
        }
      });
      
      // Validate ungrouped fields
      ungroupedFields.forEach((field: FormField) => {
        const value = formValues[field.field_key];
        validateField(field, value, field.field_key);
      });
    }
    
    setFormErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      toast.error(firstError || "Please fix the validation errors");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    setFormErrors({});
  };

  const handleSubmit = async () => {
    // Prevent duplicate submissions
    if (createTicket.isPending) {
      return;
    }
    
    if (!validateCurrentStep()) return;
    
    try {
      const initialFormStepIds = formChain?.initial_forms?.map(f => f.step_id) || [];
      const ticketTitle = generateTicketTitle();
      
      // Extract attachment IDs from form values (FILE fields store arrays of ATT-* IDs)
      // Also check inside repeating sections (stored as __section_* arrays of objects)
      const attachmentIds: string[] = [];
      
      const extractAttachmentIds = (obj: any) => {
        if (Array.isArray(obj)) {
          obj.forEach((item) => {
            if (typeof item === "string" && item.startsWith("ATT-")) {
              attachmentIds.push(item);
            } else if (typeof item === "object" && item !== null) {
              // Repeating section row - check each field value
              extractAttachmentIds(item);
            }
          });
        } else if (typeof obj === "object" && obj !== null) {
          Object.values(obj).forEach((value) => {
            extractAttachmentIds(value);
          });
        }
      };
      
      extractAttachmentIds(formValues);
      
      const result = await createTicket.mutateAsync({
        workflow_id: workflowId,
        title: ticketTitle,
        description: workflow?.description || "",
        initial_form_values: formValues,
        initial_form_step_ids: initialFormStepIds,
        attachment_ids: attachmentIds,
      });
      
      toast.success("Request submitted successfully!");
      router.push(`/tickets/${result.ticket_id}`);
    } catch (error: any) {
      console.error("Failed to create ticket:", error);
      toast.error(error?.response?.data?.detail?.message || "Failed to submit request");
    }
  };

  const updateFormValue = useCallback((fieldKey: string, value: any) => {
    setFormValues(prev => {
      // Support functional updates for nested values
      if (typeof value === 'function') {
        const newValue = value(prev[fieldKey]);
        return { ...prev, [fieldKey]: newValue };
      }
      return { ...prev, [fieldKey]: value };
    });
    if (formErrors[fieldKey]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
  }, [formErrors]);

  const isLoading = workflowLoading || formChainLoading;

  if (isLoading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    );
  }

  if (workflowError || !workflow) {
    return (
      <PageContainer>
        {workflowError ? (
          <ErrorState message="Failed to load workflow" onRetry={() => refetch()} />
        ) : (
          <NotFoundError onGoBack={() => router.push("/catalog")} />
        )}
      </PageContainer>
    );
  }

  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <PageContainer className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header with breadcrumb */}
      <div className="mb-6 sm:mb-8">
        <div className="text-xs sm:text-sm text-muted-foreground mb-2">
          Workflow for {workflow.name}
        </div>
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 hover:bg-muted/50">
          <Link href="/catalog" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Link>
        </Button>
      </div>

      {/* Premium Progress Indicator */}
      {totalSteps > 1 && (
        <div className="mb-8 sm:mb-10">
          {/* Desktop: Horizontal steps */}
          <div className="hidden sm:flex items-start justify-between gap-2 mb-4 relative">
            {/* Progress line behind steps */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted -z-10" />
            <div 
              className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-primary to-primary/80 -z-10 transition-all duration-500"
              style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
            />
            
            {stepLabels.map((label, index) => (
              <div 
                key={index} 
                className={cn(
                  "flex flex-col items-center flex-1 max-w-[180px]",
                  "transition-all duration-300"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-3",
                  "border-2 transition-all duration-300 shadow-sm",
                  index < currentStep 
                    ? "bg-primary text-primary-foreground border-primary shadow-primary/25" 
                    : index === currentStep 
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30 scale-110" 
                      : "bg-background text-muted-foreground border-muted"
                )}>
                  {index < currentStep ? <CheckCircle className="h-5 w-5" /> : index + 1}
                </div>
                <span 
                  className={cn(
                    "text-xs font-medium text-center leading-tight px-1",
                    index === currentStep 
                      ? "text-foreground font-semibold" 
                      : index < currentStep 
                        ? "text-primary" 
                        : "text-muted-foreground"
                  )}
                  style={{ 
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          
          {/* Mobile: Compact progress */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Step {currentStep + 1} of {totalSteps}
              </span>
              <span className="text-sm text-muted-foreground">
                {stepLabels[currentStep]}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
          
          {/* Desktop progress bar */}
          <div className="hidden sm:block">
            <Progress value={progressPercentage} className="h-2.5 mt-2" />
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        {/* Form Steps - Show form fields from workflow */}
        {isFormStep && currentFormStep && (
          <Card className="border-border/50 shadow-lg shadow-background/50 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10 border-b border-border/50 pb-4">
              <CardTitle className="text-lg sm:text-xl font-semibold text-foreground">
                {currentFormStep.step_name}
              </CardTitle>
              {(currentFormStep as any).description && (
                <CardDescription className="text-sm mt-1">
                  {(currentFormStep as any).description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-5">
              {renderFormFieldsWithSections(
                (currentFormStep.fields || []) as FormField[],
                ((currentFormStep as any).sections || []) as FormSection[],
                formValues,
                formErrors,
                updateFormValue,
                workflowId
              )}
              {(!currentFormStep.fields || currentFormStep.fields.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No fields required for this step.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review Step OR Confirm Step (for no-form workflows) */}
        {isReviewStep && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {hasNoForms ? "Confirm Your Request" : "Review Your Request"}
                </CardTitle>
                <CardDescription>
                  {hasNoForms 
                    ? "Click submit to create your request"
                    : "Please review the information below before submitting"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Workflow Info */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Request Type</h4>
                  <div className="rounded-lg bg-muted p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{workflow.name}</p>
                        {workflow.description && (
                          <p className="text-sm text-muted-foreground">{workflow.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Values Summary - only if there are forms */}
                {!hasNoForms && formChain?.initial_forms?.map((form, formIndex) => {
                  const formFields = (form.fields || []) as any[];
                  const formSections = ((form as any).sections || []) as FormSection[];
                  
                  // Identify repeating section field keys
                  const repeatingSectionFieldKeys = new Set<string>();
                  formSections.forEach((section: FormSection) => {
                    if (section.is_repeating) {
                      formFields
                        .filter((f: any) => f.section_id === section.section_id)
                        .forEach((f: any) => repeatingSectionFieldKeys.add(f.field_key));
                    }
                  });
                  
                  // Regular fields (not in repeating sections)
                  const regularFields = formFields.filter((f: any) => !repeatingSectionFieldKeys.has(f.field_key));
                  
                  return (
                    <div key={form.step_id}>
                      <h4 className="text-sm font-medium mb-2">{form.step_name}</h4>
                      <div className="rounded-lg bg-muted p-4 space-y-3">
                        {/* Regular fields */}
                        {regularFields.map((field: any) => (
                          <div key={field.field_key} className="flex justify-between">
                            <span className="text-muted-foreground">{field.field_label}:</span>
                            <span className="font-medium text-right max-w-[60%] truncate">
                              {formatFieldValue(formValues[field.field_key], field.field_type)}
                            </span>
                          </div>
                        ))}
                        
                        {/* Repeating sections */}
                        {formSections
                          .filter((section: FormSection) => section.is_repeating)
                          .map((section: FormSection) => {
                            const sectionDataKey = `__section_${section.section_id}`;
                            const rows = Array.isArray(formValues[sectionDataKey]) ? formValues[sectionDataKey] : [];
                            const sectionFields = formFields.filter((f: any) => f.section_id === section.section_id);
                            
                            if (rows.length === 0 || sectionFields.length === 0) {
                              return (
                                <div key={section.section_id} className="pt-2 border-t border-border/50">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{section.section_title}</p>
                                  <p className="text-sm text-muted-foreground">No data entered</p>
                                </div>
                              );
                            }
                            
                            return (
                              <div key={section.section_id} className="pt-2 border-t border-border/50">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  {section.section_title} ({rows.length} row{rows.length !== 1 ? 's' : ''})
                                </p>
                                <div className="space-y-2">
                                  {rows.map((row: Record<string, any>, rowIndex: number) => (
                                    <div key={rowIndex} className="bg-background/50 rounded p-2 text-sm">
                                      <span className="text-xs text-muted-foreground font-medium">Row {rowIndex + 1}</span>
                                      <div className="mt-1 space-y-1">
                                        {sectionFields.map(field => (
                                          <div key={field.field_key} className="flex justify-between">
                                            <span className="text-muted-foreground text-xs">{field.field_label}:</span>
                                            <span className="font-medium text-right max-w-[50%] truncate text-xs">
                                              {formatFieldValue(row[field.field_key], field.field_type)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        
                        {formFields.length === 0 && (
                          <p className="text-sm text-muted-foreground">No data entered</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

          </>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8 sm:mt-10 pb-6">
        {currentStep > 0 ? (
          <Button 
            variant="outline" 
            onClick={handleBack}
            className="order-2 sm:order-1 h-11 px-5 font-medium border-border/50 hover:bg-muted/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        ) : (
          <Button 
            variant="outline" 
            asChild
            className="order-2 sm:order-1 h-11 px-5 font-medium border-border/50 hover:bg-muted/50"
          >
            <Link href="/catalog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Link>
          </Button>
        )}

        {isReviewStep ? (
          <Button 
            type="button"
            onClick={handleSubmit} 
            disabled={createTicket.isPending}
            className="order-1 sm:order-2 h-11 px-6 min-w-[160px] font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all duration-200"
          >
            {createTicket.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            className="order-1 sm:order-2 h-11 px-6 font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all duration-200"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </PageContainer>
  );
}

// Helper function to format field values for display
function formatFieldValue(value: any, fieldType: string): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  
  if (fieldType === "FILE") {
    // Value is now an array of attachment IDs
    if (Array.isArray(value) && value.length > 0) {
      return `${value.length} file(s) attached`;
    }
    if (typeof value === "string" && value) {
      return "1 file attached";
    }
    return "-";
  }
  
  // Handle LOOKUP_USER_SELECT - value is a LookupUser object
  if (fieldType === "LOOKUP_USER_SELECT" && typeof value === "object" && value !== null) {
    const user = value as { display_name?: string; email?: string; is_primary?: boolean };
    if (user.display_name) {
      return user.is_primary ? `${user.display_name} (Primary)` : user.display_name;
    }
    return user.email || "-";
  }
  
  // Handle USER_SELECT - value is a user object
  if (fieldType === "USER_SELECT" && typeof value === "object" && value !== null) {
    const user = value as { display_name?: string; email?: string };
    return user.display_name || user.email || "-";
  }
  
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  
  if (Array.isArray(value)) {
    return value.join(", ") || "-";
  }
  
  if (fieldType === "DATE" && value) {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  
  return String(value);
}

// Component to render form fields grouped by sections
function FormFieldsWithSections({
  fields,
  sections,
  formValues,
  formErrors,
  updateFormValue,
  workflowId,
}: {
  fields: FormField[];
  sections: FormSection[];
  formValues: Record<string, any>;
  formErrors: Record<string, string>;
  updateFormValue: (key: string, value: any) => void;
  workflowId?: string;
}) {
  // Group fields by section and sort by order
  const fieldsBySection = useMemo(() => {
    return sections.reduce((acc, section) => {
      acc[section.section_id] = fields
        .filter(f => f.section_id === section.section_id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return acc;
    }, {} as Record<string, FormField[]>);
  }, [fields, sections]);
  
  const ungroupedFields = useMemo(() => {
    return fields
      .filter(f => !f.section_id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [fields]);
  
  // Sort sections by order
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);
  
  // Helper to update repeating section row value - memoized with useCallback
  // Using functional update to avoid dependency on formValues
  const updateRepeatingSectionValue = useCallback((sectionId: string, rowIndex: number, fieldKey: string, value: any) => {
    const sectionDataKey = `__section_${sectionId}`;
    updateFormValue(sectionDataKey, (prevRows: any[]) => {
      const currentRows = prevRows || [];
      const updatedRows = [...currentRows];
      
      if (!updatedRows[rowIndex]) {
        updatedRows[rowIndex] = {};
      }
      
      updatedRows[rowIndex] = {
        ...updatedRows[rowIndex],
        [fieldKey]: value
      };
      
      return updatedRows;
    });
  }, [updateFormValue]);
  
  // Helper to add a new row to repeating section - memoized with useCallback
  const addRepeatingSectionRow = useCallback((sectionId: string) => {
    const sectionDataKey = `__section_${sectionId}`;
    updateFormValue(sectionDataKey, (prevRows: any[]) => {
      const currentRows = prevRows || [];
      return [...currentRows, {}];
    });
  }, [updateFormValue]);
  
  // Helper to remove a row from repeating section - memoized with useCallback
  const removeRepeatingSectionRow = useCallback((sectionId: string, rowIndex: number) => {
    const sectionDataKey = `__section_${sectionId}`;
    updateFormValue(sectionDataKey, (prevRows: any[]) => {
      const currentRows = prevRows || [];
      return currentRows.filter((_: any, idx: number) => idx !== rowIndex);
    });
  }, [updateFormValue]);
  
  return (
    <>
      {/* Render sections with their fields */}
      {sortedSections.map((section) => {
        const sectionFields = fieldsBySection[section.section_id] || [];
        if (sectionFields.length === 0) return null;
        
        // Check if this is a repeating section
        if (section.is_repeating) {
          const sectionDataKey = `__section_${section.section_id}`;
          const rows = Array.isArray(formValues[sectionDataKey]) ? formValues[sectionDataKey] : [];
          
          return (
            <div key={section.section_id} className="space-y-4 pb-6 border-b border-border/40 last:border-0 last:pb-0">
              {/* Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 rounded-lg">
                <div>
                  <h4 className="text-base font-semibold text-foreground">{section.section_title}</h4>
                  {section.section_description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{section.section_description}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addRepeatingSectionRow(section.section_id)}
                  className="gap-2 self-start sm:self-auto bg-background hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Row
                </Button>
              </div>
              
              {/* Show minimum rows error */}
              {formErrors[`${sectionDataKey}_min_rows`] && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
                  <span className="text-red-500">⚠️</span>
                  <p className="text-sm text-red-600 dark:text-red-400">{formErrors[`${sectionDataKey}_min_rows`]}</p>
                </div>
              )}
              
              {rows.length === 0 ? (
                <div className={cn(
                  "text-center py-8 border-2 border-dashed rounded-xl",
                  formErrors[`${sectionDataKey}_min_rows`] 
                    ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                    : "border-border/50 bg-muted/20"
                )}>
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center mx-auto mb-3",
                    formErrors[`${sectionDataKey}_min_rows`] 
                      ? "bg-red-100 dark:bg-red-900/50"
                      : "bg-muted/50"
                  )}>
                    <Plus className={cn(
                      "h-5 w-5",
                      formErrors[`${sectionDataKey}_min_rows`] 
                        ? "text-red-500"
                        : "text-muted-foreground"
                    )} />
                  </div>
                  <p className={cn(
                    "text-sm font-medium",
                    formErrors[`${sectionDataKey}_min_rows`]
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}>
                    {section.min_rows && section.min_rows > 0 
                      ? `At least ${section.min_rows} row${section.min_rows > 1 ? 's' : ''} required`
                      : "No rows added yet"
                    }
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Click "Add Row" to add a line item</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rows.map((row: Record<string, any>, rowIndex: number) => (
                    <Card key={`${section.section_id}_row_${rowIndex}`} className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Row {rowIndex + 1}
                          </h5>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRepeatingSectionRow(section.section_id, rowIndex)}
                            className="h-7 px-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                          {sectionFields.map((field) => (
                            <DynamicField
                              key={`${section.section_id}_${rowIndex}_${field.field_key}`}
                              field={field}
                              value={row[field.field_key]}
                              onChange={(value) => updateRepeatingSectionValue(section.section_id, rowIndex, field.field_key, value)}
                              error={formErrors[`${sectionDataKey}_${rowIndex}_${field.field_key}`]}
                              allFormValues={formValues}
                              rowContext={row}
                              workflowId={workflowId}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        }
        
        // Non-repeating section (original behavior)
        return (
          <div key={section.section_id} className="space-y-4 pb-6 border-b border-border/40 last:border-0 last:pb-0">
            {/* Section Header */}
            <div className="bg-muted/30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 rounded-lg">
              <h4 className="text-base font-semibold text-foreground">{section.section_title}</h4>
              {section.section_description && (
                <p className="text-xs text-muted-foreground mt-0.5">{section.section_description}</p>
              )}
            </div>
            <div className="space-y-5">
              {sectionFields.map((field) => (
                <DynamicField
                  key={field.field_key}
                  field={field}
                  value={formValues[field.field_key]}
                  onChange={(value) => updateFormValue(field.field_key, value)}
                  error={formErrors[field.field_key]}
                  allFormValues={formValues}
                  workflowId={workflowId}
                />
              ))}
            </div>
          </div>
        );
      })}
      
      {/* Render ungrouped fields */}
      {ungroupedFields.length > 0 && (
        <div className={cn(
          "space-y-5",
          sortedSections.length > 0 && "pt-4"
        )}>
          {ungroupedFields.map((field) => (
            <DynamicField
              key={field.field_key}
              field={field}
              value={formValues[field.field_key]}
              onChange={(value) => updateFormValue(field.field_key, value)}
              error={formErrors[field.field_key]}
              allFormValues={formValues}
              workflowId={workflowId}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Wrapper function for backward compatibility
function renderFormFieldsWithSections(
  fields: FormField[],
  sections: FormSection[],
  formValues: Record<string, any>,
  formErrors: Record<string, string>,
  updateFormValue: (key: string, value: any) => void,
  workflowId?: string
) {
  return (
    <FormFieldsWithSections
      fields={fields}
      sections={sections}
      formValues={formValues}
      formErrors={formErrors}
      updateFormValue={updateFormValue}
      workflowId={workflowId}
    />
  );
}

// ============================================================================
// Lookup Display Field Component
// Shows users from a lookup table based on a linked form field value
// ============================================================================

interface LookupUserSelectFieldProps {
  workflowId: string;
  field: FormField;
  formValues: Record<string, any>;
  value: LookupUser | null;  // Selected user
  onChange: (user: LookupUser | null) => void;  // Callback when user selects
  error?: string;
}

function LookupUserSelectField({ workflowId, field, formValues, value, onChange, error }: LookupUserSelectFieldProps) {
  // Get the source field configuration from the field's validation settings
  const lookupStepId = field.validation?.lookup_step_id as string | undefined;
  const lookupFieldKey = field.validation?.lookup_field_key as string | undefined;
  
  // Get the value from the source field
  const sourceValue = lookupFieldKey ? formValues[lookupFieldKey] : null;
  
  const { data, isLoading } = useResolveLookupUsers(
    workflowId,
    lookupStepId || "",
    lookupFieldKey || "",
    sourceValue as string,
    !!lookupStepId && !!lookupFieldKey && !!sourceValue
  );
  
  const users = data?.users || [];
  
  // Auto-select: if no selection, auto-select primary user (or first user if no primary)
  useEffect(() => {
    // Auto-select if we have users and no current selection
    if (users.length > 0 && !value) {
      // Find primary user, or fall back to first user
      const primaryUser = users.find(u => u.is_primary) || users[0];
      onChange(primaryUser);
    }
    // Clear selection if source value changes and current selection isn't in new users list
    if (value && users.length > 0) {
      const stillValid = users.some(u => u.email === value.email);
      if (!stillValid) {
        // Source changed, find new primary
        const primaryUser = users.find(u => u.is_primary) || users[0];
        onChange(primaryUser);
      }
    }
    // Clear selection if no users
    if (users.length === 0 && value) {
      onChange(null);
    }
  }, [users, value, onChange]);
  
  if (!lookupStepId || !lookupFieldKey) {
    return (
      <div className="text-sm text-muted-foreground italic border border-dashed rounded-lg p-4 bg-muted/30">
        Lookup configuration missing. Configure this field in the workflow designer.
      </div>
    );
  }
  
  if (!sourceValue) {
    return (
      <div className="text-sm text-muted-foreground italic border border-dashed rounded-lg p-4 bg-muted/30 flex items-center gap-2">
        <Users className="h-4 w-4" />
        Select a value in the linked field to see assigned users
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 border rounded-lg bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading users...
      </div>
    );
  }
  
  if (users.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic border border-dashed rounded-lg p-4 bg-muted/30">
        No users assigned for "{sourceValue}"
      </div>
    );
  }
  
  // Single user - display only (auto-selected)
  if (users.length === 1) {
    const user = users[0];
    return (
      <div className="p-3 border rounded-lg bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Users className="h-3.5 w-3.5" />
          <span>Assigned user for "{sourceValue}"</span>
        </div>
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-violet-100/80 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs font-medium text-white shadow-sm">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{user.display_name}</span>
              {user.is_primary && <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        </div>
      </div>
    );
  }
  
  // Multiple users - show selection dropdown
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>Select a user for "{sourceValue}" ({users.length} available)</span>
      </div>
      <Select
        value={value?.email || ""}
        onValueChange={(email) => {
          const selectedUser = users.find(u => u.email === email);
          onChange(selectedUser || null);
        }}
      >
        <SelectTrigger className={cn(
          "h-11 rounded-lg",
          error && "border-red-500 ring-red-500"
        )}>
          <SelectValue placeholder="Select a user...">
            {value && (
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs font-medium text-white">
                  {value.display_name.charAt(0).toUpperCase()}
                </div>
                <span>{value.display_name}</span>
                {value.is_primary && <Crown className="h-3.5 w-3.5 text-amber-500" />}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {users.map((user: LookupUser) => (
            <SelectItem key={user.email} value={user.email}>
              <div className="flex items-center gap-2 py-1">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs font-medium text-white">
                  {user.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{user.display_name}</span>
                    {user.is_primary && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                {user.is_primary && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Primary
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-red-500">{error}</p>}
      
      {/* Show all users for reference */}
      <div className="mt-3 p-3 border rounded-lg bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">All assigned users (will be notified on ticket creation):</p>
        <div className="flex flex-wrap gap-2">
          {users.map((user: LookupUser) => (
            <div
              key={user.email}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
                user.email === value?.email
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span>{user.display_name}</span>
              {user.is_primary && <Crown className="h-3 w-3 text-amber-500" />}
              {user.email === value?.email && <CheckCircle className="h-3 w-3" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DynamicFieldProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  allFormValues?: Record<string, any>;  // All form values for conditional requirements
  rowContext?: Record<string, any>;     // For repeating sections: current row values
  workflowId?: string;                  // Needed for LOOKUP_USER_SELECT fields
}

function DynamicField({ field, value, onChange, error, allFormValues = {}, rowContext, workflowId }: DynamicFieldProps) {
  // Calculate if field is required (static or conditional)
  // Pass rowContext for repeating sections to correctly evaluate conditional requirements
  const fieldIsRequired = isFieldRequired(field, allFormValues, rowContext);
  const fieldId = `field-${field.field_key}`;
  
  const baseInputStyles = cn(
    "h-11 rounded-lg border-border/60 bg-background/50 transition-all duration-200",
    "focus:ring-2 focus:ring-primary/20 focus:border-primary",
    "placeholder:text-muted-foreground/60",
    error && "border-red-500 focus:ring-red-500/20 focus:border-red-500"
  );
  
  const renderField = () => {
    switch (field.field_type) {
      case "TEXT":
        return (
          <Input
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputStyles}
          />
        );
        
      case "TEXTAREA":
        return (
          <Textarea
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={cn(
              "rounded-lg border-border/60 bg-background/50 transition-all duration-200 resize-y min-h-[100px]",
              "focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "placeholder:text-muted-foreground/60",
              error && "border-red-500 focus:ring-red-500/20 focus:border-red-500"
            )}
          />
        );
        
      case "NUMBER":
        return (
          <Input
            id={fieldId}
            type="number"
            placeholder={field.placeholder || "Enter number"}
            value={value || ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
            className={baseInputStyles}
          />
        );
        
      case "DATE": {
        // Get date validation settings (static + conditional)
        const dateSettings = getDateValidation(field, allFormValues, rowContext);
        const dateConstraints = getDateInputConstraints(dateSettings);
        
        // Build description of allowed dates for tooltip
        const allowedDates: string[] = [];
        if (dateSettings.allowPastDates) allowedDates.push("past");
        if (dateSettings.allowToday) allowedDates.push("today");
        if (dateSettings.allowFutureDates) allowedDates.push("future");
        const hasRestrictions = allowedDates.length < 3;
        
        return (
          <div className="space-y-1">
            <Input
              id={fieldId}
              type="date"
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              min={dateConstraints.min}
              max={dateConstraints.max}
              className={baseInputStyles}
            />
            {hasRestrictions && (
              <p className="text-xs text-muted-foreground">
                Allowed: {allowedDates.join(", ")} dates
              </p>
            )}
          </div>
        );
      }
        
      case "SELECT":
        return (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className={cn(
              "h-11 rounded-lg border-border/60 bg-background/50",
              "focus:ring-2 focus:ring-primary/20 focus:border-primary",
              error && "border-red-500"
            )}>
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
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
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
          <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border/40">
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
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selectedValues, option]);
                    } else {
                      onChange(selectedValues.filter((v: string) => v !== option));
                    }
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor={`${fieldId}-${option}`} className="text-sm cursor-pointer flex-1">
                  {option}
                </label>
              </div>
            ))}
          </div>
        );
        
      case "USER_SELECT":
        return (
          <UserSearchCombobox
            value={value}
            onChange={onChange}
            placeholder={field.placeholder || "Search for user by name or email..."}
            className={cn(baseInputStyles, error && "border-red-500")}
          />
        );
      
      case "LOOKUP_USER_SELECT":
        // LOOKUP_USER_SELECT allows selecting a user from a lookup table
        // If single user: auto-selected and displayed
        // If multiple users: dropdown for selection
        // Selected user is stored in form data
        return (
          <LookupUserSelectField
            workflowId={workflowId || ""}
            field={field}
            formValues={allFormValues}
            value={value as LookupUser | null}
            onChange={onChange}
            error={error}
          />
        );
      
      case "FILE":
        // File uploads - store attachment IDs in form values
        // value will be an array of attachment IDs
        // Pass existing value to FileUpload to restore state on re-renders
        const existingAttachments: Array<{ attachment_id: string; original_filename: string; mime_type: string; size_bytes: number }> = 
          Array.isArray(value) 
            ? value.map((id: string) => ({ attachment_id: id, original_filename: '', mime_type: '', size_bytes: 0 }))
            : [];
        return (
          <FileUpload
            context="form_field"
            fieldLabel={field.field_label}
            multiple={true}
            compact={true}
            existingAttachments={existingAttachments}
            onFilesChange={(attachmentIds) => {
              // Store the attachment ID(s) in form values
              onChange(attachmentIds.length > 0 ? attachmentIds : null);
            }}
            className={cn(error && "border-red-500 rounded-lg")}
          />
        );
        
      default:
        return (
          <Input
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={error ? "border-red-500" : ""}
          />
        );
    }
  };

  return (
    <div className="space-y-2.5 group">
      {field.field_type !== "CHECKBOX" && (
        <Label 
          htmlFor={fieldId} 
          className="text-sm font-medium text-foreground/90 flex items-center gap-1"
        >
          {field.field_label}
          {fieldIsRequired && (
            <span className="text-red-500 text-xs font-bold">*</span>
          )}
        </Label>
      )}
      {renderField()}
      {field.help_text && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          {field.help_text}
        </p>
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
