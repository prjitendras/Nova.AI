/**
 * Agent Tasks Page
 * Assigned tasks for agent role with full operational capabilities
 */
"use client";

import { useRouter } from "next/navigation";
import { 
  useAssignedTasks, 
  useCompleteTask, 
  useHoldTask, 
  useResumeTask,
  useRequestHandover,
  useCancelHandover,
  useRequestInfo,
  useAcknowledgeSla,
  useAddNote,
  usePreviousAgents,
  useSaveTaskDraft
} from "@/hooks/use-tickets";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge, StepStateBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { SlaIndicator } from "@/components/sla-indicator";
import { NoTasksEmpty } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ActivityLog } from "@/components/activity-log";
import { StepAttachments } from "@/components/step-attachments";
import { TicketCardSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  ExternalLink, 
  Clock, 
  AlertTriangle, 
  MoreVertical,
  PauseCircle,
  PlayCircle,
  ArrowRightLeft,
  MessageSquare,
  Bell,
  History
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { parseUTCDate } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { UserSearchCombobox } from "@/components/workflow-studio/user-search-combobox";
import type { FormField, FormSection } from "@/lib/types";
import { Plus, Trash2, Users, User, UserCheck, Paperclip, HelpCircle, Send, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileUpload } from "@/components/file-upload";

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
      return actualValue === null || actualValue === undefined || actualValue === "" || 
        (Array.isArray(actualValue) && actualValue.length === 0);
    case "is_not_empty":
      return actualValue !== null && actualValue !== undefined && actualValue !== "" && 
        !(Array.isArray(actualValue) && actualValue.length === 0);
    default:
      return false;
  }
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
  rule: any,
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

// Validate a single field value against its validation rules (min/max length, regex, etc.)
function validateFieldValue(field: FormField, value: any): string | null {
  // Skip validation if field is empty (required check is separate)
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
      } catch {
        // Invalid regex pattern - skip validation
      }
    }
  }
  
  // Number validation
  if (field.field_type === "NUMBER") {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return `${field.field_label} must be a valid number`;
    }
    
    if (validation.min_length !== undefined && numValue < validation.min_length) {
      return `${field.field_label} must be at least ${validation.min_length}`;
    }
    
    if (validation.max_length !== undefined && numValue > validation.max_length) {
      return `${field.field_label} must not exceed ${validation.max_length}`;
    }
  }
  
  return null;
}

type DialogType = "complete" | "hold" | "handover" | "info" | "sla" | "note" | null;

// Linked row context from source repeating section
interface LinkedRowContext {
  __source_row_index: number;
  __context: Record<string, { value: any; label: string }>;
  [key: string]: any;
}

interface DialogState {
  open: boolean;
  type: DialogType;
  ticketId: string;
  stepId: string;
  ticketTitle: string;
  stepName: string;
  stepState?: string;
  stepFields?: FormField[];
  stepSections?: FormSection[];
  executionNotesRequired?: boolean;
  // Linked repeating source data
  linkedRows?: LinkedRowContext[];
  linkedSourceInfo?: {
    source_step_id: string;
    source_section_id: string;
    total_rows: number;
  };
}

const initialDialogState: DialogState = {
  open: false,
  type: null,
  ticketId: "",
  stepId: "",
  ticketTitle: "",
  stepName: "",
  executionNotesRequired: false,
};

export default function AgentTasksPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useAssignedTasks(user?.email || "", user?.aad_id || "");
  
  const completeTask = useCompleteTask();
  const holdTask = useHoldTask();
  const resumeTask = useResumeTask();
  const requestHandover = useRequestHandover();
  const cancelHandover = useCancelHandover();
  const requestInfo = useRequestInfo();
  const acknowledgeSla = useAcknowledgeSla();
  const addNote = useAddNote();
  const saveTaskDraft = useSaveTaskDraft();
  
  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [formData, setFormData] = useState({
    executionNotes: "",
    reason: "",
    suggestedEmail: "",
    suggestedAgent: null as { email: string; display_name: string; aad_id?: string } | null,
    question: "",
    slaNotes: "",
    note: "",
  });
  // Per-task form values and execution notes (keyed by stepId)
  const [taskFormValues, setTaskFormValues] = useState<Record<string, Record<string, any>>>({});
  const [taskExecutionNotes, setTaskExecutionNotes] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [taskFormErrors, setTaskFormErrors] = useState<Record<string, any>>({});
  // State for request info dialog
  const [requestedFromEmail, setRequestedFromEmail] = useState<string | undefined>(undefined);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>(""); // Tracks which specific card was clicked
  const [infoSubject, setInfoSubject] = useState("");
  const [infoAttachmentIds, setInfoAttachmentIds] = useState<string[]>([]);
  const [selectedRecipientType, setSelectedRecipientType] = useState<"requester" | "agent" | "custom">("requester");
  
  // Fetch previous agents when dialog is open for info request
  const { data: previousAgents } = usePreviousAgents(
    dialog.open && dialog.type === "info" ? dialog.ticketId : ""
  );

  // Initialize linked rows form values for tasks with linked repeating sections
  // Initialize linked form values and load saved drafts when tasks load
  useEffect(() => {
    if (!data?.items) return;
    
    const tasks = data.items as any[];
    const initialLinkedFormValues: Record<string, Record<string, any>> = {};
    const draftExecutionNotes: Record<string, string> = {};
    
    tasks.forEach((task: any) => {
      const linkedRows = task.step?.data?.linked_rows;
      const stepId = task.step?.ticket_step_id;
      const draftValues = task.step?.data?.draft_values;
      const draftExecNotes = task.step?.data?.draft_execution_notes;
      
      // Only initialize if we haven't initialized yet for this step
      if (stepId && !taskFormValues[stepId]) {
        // If there are saved draft values, use them
        if (draftValues && Object.keys(draftValues).length > 0) {
          initialLinkedFormValues[stepId] = draftValues;
        }
        // Otherwise, initialize linked rows if present
        else if (linkedRows && linkedRows.length > 0) {
          const rowValues: Record<string, any> = {};
          linkedRows.forEach((_: any, idx: number) => {
            rowValues[`__linked_row_${idx}`] = {};
          });
          initialLinkedFormValues[stepId] = rowValues;
        }
      }
      
      // Load draft execution notes if present
      if (stepId && draftExecNotes && !taskExecutionNotes[stepId]) {
        draftExecutionNotes[stepId] = draftExecNotes;
      }
    });
    
    // Only update if we have new initializations
    if (Object.keys(initialLinkedFormValues).length > 0) {
      setTaskFormValues(prev => ({ ...prev, ...initialLinkedFormValues }));
    }
    if (Object.keys(draftExecutionNotes).length > 0) {
      setTaskExecutionNotes(prev => ({ ...prev, ...draftExecutionNotes }));
    }
  }, [data?.items]);

  const openDialog = (
    type: DialogType,
    ticketId: string,
    stepId: string,
    ticketTitle: string,
    stepName: string,
    stepState?: string,
    stepFields?: FormField[],
    stepSections?: FormSection[],
    executionNotesRequired?: boolean,
    linkedRows?: LinkedRowContext[],
    linkedSourceInfo?: { source_step_id: string; source_section_id: string; total_rows: number }
  ) => {
    setDialog({
      open: true,
      type,
      ticketId,
      stepId,
      ticketTitle,
      stepName,
      stepState,
      stepFields,
      stepSections,
      executionNotesRequired,
      linkedRows,
      linkedSourceInfo,
    });
    setFormData({
      executionNotes: "",
      reason: "",
      suggestedEmail: "",
      suggestedAgent: null,
      question: "",
      slaNotes: "",
      note: "",
    });
    // Reset form values and errors
    // For linked tasks, initialize with empty rows structure
    if (linkedRows && linkedRows.length > 0) {
      const initialLinkedValues: Record<string, any> = {};
      linkedRows.forEach((row, idx) => {
        initialLinkedValues[`__linked_row_${idx}`] = {};
      });
      setTaskFormValues({ [stepId]: initialLinkedValues });
    } else {
      setTaskFormValues({});
    }
    setTaskFormErrors({});
  };

  const closeDialog = () => {
    setDialog(initialDialogState);
    setRequestedFromEmail(undefined);
    setSelectedAgentKey("");
    setInfoSubject("");
    setInfoAttachmentIds([]);
    setSelectedRecipientType("requester");
    setFormData(prev => ({ ...prev, suggestedAgent: null, suggestedEmail: "", reason: "" }));
  };

  // Update form value helper for a specific task
  const updateTaskFormValue = useCallback((stepId: string, key: string, value: any) => {
    setTaskFormValues((prev) => {
      const taskValues = prev[stepId] || {};
      if (typeof value === "function") {
        // Handle functional updates (for repeating sections)
        return { ...prev, [stepId]: { ...taskValues, [key]: value(taskValues[key]) } };
      }
      return { ...prev, [stepId]: { ...taskValues, [key]: value } };
    });
  }, []);

  // Update execution notes for a specific task
  const updateTaskExecutionNotes = useCallback((stepId: string, notes: string) => {
    setTaskExecutionNotes((prev) => ({ ...prev, [stepId]: notes }));
  }, []);

  // Validate task form fields for a specific task
  const validateTaskForm = (stepId: string, fields: FormField[], sections: FormSection[]): boolean => {
    const errors: Record<string, string> = {};
    const taskValues = taskFormValues[stepId] || {};
    
    // Helper to validate a single field
    const validateSingleField = (field: FormField, value: any, errorKey: string, rowLabel?: string, rowContext?: Record<string, any>) => {
      const isEmpty = !value || (Array.isArray(value) && value.length === 0) || (typeof value === "string" && value.trim() === "");
      const fieldIsRequired = isFieldRequired(field, taskValues, rowContext);
      
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
      const fieldError = validateFieldValue(field, value);
      if (fieldError) {
        errors[errorKey] = rowLabel ? `${fieldError} (${rowLabel})` : fieldError;
      }
    };
    
    // Group fields by section for proper validation
    const fieldsBySection: Record<string, FormField[]> = {};
    const ungroupedFields: FormField[] = [];
    
    fields.forEach((field) => {
      if (field.section_id) {
        if (!fieldsBySection[field.section_id]) {
          fieldsBySection[field.section_id] = [];
        }
        fieldsBySection[field.section_id].push(field);
      } else {
        ungroupedFields.push(field);
      }
    });
    
    // Validate ungrouped fields
    ungroupedFields.forEach((field) => {
      validateSingleField(field, taskValues[field.field_key], field.field_key);
    });
    
    // Validate sections
    sections.forEach((section) => {
      const sectionFields = fieldsBySection[section.section_id] || [];
      
      if (section.is_repeating) {
        const sectionDataKey = `__section_${section.section_id}`;
        const rows = Array.isArray(taskValues[sectionDataKey]) ? taskValues[sectionDataKey] : [];
        
        // Check minimum rows requirement
        const minRows = section.min_rows || 0;
        if (minRows > 0 && rows.length < minRows) {
          errors[`${sectionDataKey}_min_rows`] = `${section.section_title} requires at least ${minRows} row${minRows > 1 ? 's' : ''}`;
        }
        
        rows.forEach((row: any, rowIndex: number) => {
          sectionFields.forEach((field) => {
            const errorKey = `${sectionDataKey}_${rowIndex}_${field.field_key}`;
            validateSingleField(field, row[field.field_key], errorKey, `row ${rowIndex + 1}`, row);
          });
        });
      } else {
        // Non-repeating section
        sectionFields.forEach((field) => {
          validateSingleField(field, taskValues[field.field_key], field.field_key);
        });
      }
    });
    
    setTaskFormErrors((prev) => ({ ...prev, [stepId]: errors }));
    return Object.keys(errors).length === 0;
  };

  // Handle save draft
  const handleSaveDraft = async (ticketId: string, stepId: string) => {
    const draftValues = taskFormValues[stepId] || {};
    const executionNotes = taskExecutionNotes[stepId] || "";
    
    saveTaskDraft.mutate({
      ticketId,
      stepId,
      draftValues,
      executionNotes: executionNotes || undefined,
    });
  };

  // Handle complete directly from task card
  const handleCompleteDirect = async (
    ticketId: string,
    stepId: string,
    fields?: FormField[],
    sections?: FormSection[],
    executionNotesRequired?: boolean,
    linkedRows?: LinkedRowContext[],
    linkedSourceInfo?: { source_step_id: string; source_section_id: string; total_rows: number }
  ) => {
    // Handle linked task validation and completion
    if (linkedRows && linkedRows.length > 0) {
      const taskValues = taskFormValues[stepId] || {};
      
      // Validate linked task form fields
      if (fields && fields.length > 0) {
        let hasErrors = false;
        const allErrors: Record<string, any> = {};
        
        linkedRows.forEach((linkedRow, rowIndex) => {
          const rowKey = `__linked_row_${rowIndex}`;
          const rowValues = taskValues[rowKey] || {};
          const rowErrors: Record<string, string> = {};
          
          fields.forEach((field) => {
            const value = rowValues[field.field_key];
            const isEmpty = !value || (Array.isArray(value) && value.length === 0) || (typeof value === "string" && value.trim() === "");
            
            // Pass rowValues as rowContext for conditional requirements
            const fieldIsRequired = isFieldRequired(field, taskValues, rowValues);
            if (fieldIsRequired && isEmpty) {
              rowErrors[field.field_key] = `${field.field_label} is required`;
              hasErrors = true;
            } else if (!isEmpty) {
              // Field-specific validation (min/max length, regex)
              const fieldError = validateFieldValue(field, value);
              if (fieldError) {
                rowErrors[field.field_key] = fieldError;
                hasErrors = true;
              }
            }
          });
          
          if (Object.keys(rowErrors).length > 0) {
            allErrors[rowKey] = rowErrors;
          }
        });
        
        if (hasErrors) {
          setTaskFormErrors((prev) => ({ ...prev, [stepId]: allErrors }));
          toast.error("Please fill in all required fields for each item");
          return;
        }
      }
      
      // Validate execution notes if required
      const executionNotes = taskExecutionNotes[stepId] || "";
      if (executionNotesRequired && !executionNotes.trim()) {
        toast.error("Execution notes are required");
        return;
      }
      
      // Build linked task output values
      const linkedRowsOutput = linkedRows.map((row, rowIndex) => {
        const rowKey = `__linked_row_${rowIndex}`;
        return {
          __source_row_index: row.__source_row_index,
          __context: row.__context,
          ...taskValues[rowKey]
        };
      });
      
      const outputValues = {
        __is_linked_task: true,
        __linked_source_info: linkedSourceInfo,
        linked_rows: linkedRowsOutput
      };
      
      // Extract attachment IDs from linked task output values
      const linkedAttachmentIds: string[] = [];
      linkedRowsOutput.forEach((row: any) => {
        Object.values(row).forEach((val) => {
          if (Array.isArray(val)) {
            val.forEach((item) => {
              if (typeof item === "string" && item.startsWith("ATT-")) {
                linkedAttachmentIds.push(item);
              }
            });
          } else if (typeof val === "string" && val.startsWith("ATT-")) {
            linkedAttachmentIds.push(val);
          }
        });
      });
      
      await completeTask.mutateAsync({
        ticketId,
        stepId,
        executionNotes: executionNotes || undefined,
        outputValues,
        attachmentIds: linkedAttachmentIds.length > 0 ? linkedAttachmentIds : undefined,
      });
      
      // Clear form data for this task
      setTaskFormValues((prev) => {
        const updated = { ...prev };
        delete updated[stepId];
        return updated;
      });
      setTaskExecutionNotes((prev) => {
        const updated = { ...prev };
        delete updated[stepId];
        return updated;
      });
      setTaskFormErrors((prev) => {
        const updated = { ...prev };
        delete updated[stepId];
        return updated;
      });
      
      refetch();
      return;
    }
    
    // Regular (non-linked) task validation
    if (fields && fields.length > 0) {
      if (!validateTaskForm(stepId, fields, sections || [])) {
        toast.error("Please fill in all required fields");
        return;
      }
    }
    
    // Validate execution notes if required
    const executionNotes = taskExecutionNotes[stepId] || "";
    if (executionNotesRequired && !executionNotes.trim()) {
      toast.error("Execution notes are required");
      return;
    }
    
    // Extract attachment IDs from task form values
    const regularAttachmentIds: string[] = [];
    const formVals = taskFormValues[stepId] || {};
    Object.values(formVals).forEach((val) => {
      if (Array.isArray(val)) {
        val.forEach((item) => {
          if (typeof item === "string" && item.startsWith("ATT-")) {
            regularAttachmentIds.push(item);
          }
        });
      } else if (typeof val === "string" && val.startsWith("ATT-")) {
        regularAttachmentIds.push(val);
      }
    });
    
    await completeTask.mutateAsync({
      ticketId,
      stepId,
      executionNotes: executionNotes || undefined,
      outputValues: Object.keys(formVals).length > 0 ? formVals : undefined,
      attachmentIds: regularAttachmentIds.length > 0 ? regularAttachmentIds : undefined,
    });
    
    // Clear form data for this task
    setTaskFormValues((prev) => {
      const updated = { ...prev };
      delete updated[stepId];
      return updated;
    });
    setTaskExecutionNotes((prev) => {
      const updated = { ...prev };
      delete updated[stepId];
      return updated;
    });
    setTaskFormErrors((prev) => {
      const updated = { ...prev };
      delete updated[stepId];
      return updated;
    });
    
    refetch();
  };

  const handleComplete = async () => {
    const isLinkedTask = dialog.linkedRows && dialog.linkedRows.length > 0;
    
    // Validate linked task form fields
    if (isLinkedTask && dialog.stepFields && dialog.stepFields.length > 0) {
      const taskValues = taskFormValues[dialog.stepId] || {};
      let hasErrors = false;
      const allErrors: Record<string, Record<string, string>> = {};
      
      dialog.linkedRows!.forEach((linkedRow, rowIndex) => {
        const rowKey = `__linked_row_${rowIndex}`;
        const rowValues = taskValues[rowKey] || {};
        const rowErrors: Record<string, string> = {};
        
        dialog.stepFields!.forEach((field) => {
          const value = rowValues[field.field_key];
          const isEmpty = !value || (Array.isArray(value) && value.length === 0) || (typeof value === "string" && value.trim() === "");
          
          // Pass rowValues as rowContext for conditional requirements
          const fieldIsRequired = isFieldRequired(field, taskValues, rowValues);
          if (fieldIsRequired && isEmpty) {
            rowErrors[field.field_key] = `${field.field_label} is required`;
            hasErrors = true;
          } else if (!isEmpty) {
            // Field-specific validation (min/max length, regex)
            const fieldError = validateFieldValue(field, value);
            if (fieldError) {
              rowErrors[field.field_key] = fieldError;
              hasErrors = true;
            }
          }
        });
        
        if (Object.keys(rowErrors).length > 0) {
          allErrors[rowKey] = rowErrors;
        }
      });
      
      if (hasErrors) {
        setTaskFormErrors((prev) => ({ ...prev, [dialog.stepId]: allErrors as any }));
        toast.error("Please fill in all required fields for each item");
        return;
      }
    }
    
    // Validate regular form fields if they exist (non-linked task)
    if (!isLinkedTask && dialog.stepFields && dialog.stepFields.length > 0) {
      if (!validateTaskForm(dialog.stepId, dialog.stepFields, dialog.stepSections || [])) {
        toast.error("Please fill in all required fields");
        return;
      }
    }
    
    // Validate execution notes if required
    if (dialog.executionNotesRequired && !formData.executionNotes.trim()) {
      toast.error("Execution notes are required");
      return;
    }
    
    // Build output values
    let outputValues: Record<string, any> | undefined;
    
    if (isLinkedTask) {
      // For linked tasks, structure as linked_rows array
      const taskValues = taskFormValues[dialog.stepId] || {};
      const linkedRowsOutput = dialog.linkedRows!.map((row, rowIndex) => {
        const rowKey = `__linked_row_${rowIndex}`;
        return {
          __source_row_index: row.__source_row_index,
          __context: row.__context,
          ...taskValues[rowKey]
        };
      });
      
      outputValues = {
        __is_linked_task: true,
        __linked_source_info: dialog.linkedSourceInfo,
        linked_rows: linkedRowsOutput
      };
    } else if (Object.keys(taskFormValues[dialog.stepId] || {}).length > 0) {
      outputValues = taskFormValues[dialog.stepId];
    }
    
    // Extract attachment IDs from output values (FILE fields store ATT-* IDs)
    const attachmentIds: string[] = [];
    if (outputValues) {
      const extractAttachments = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach((item) => {
            if (typeof item === "string" && item.startsWith("ATT-")) {
              attachmentIds.push(item);
            } else if (typeof item === "object") {
              extractAttachments(item);
            }
          });
        } else if (typeof obj === "object") {
          Object.values(obj).forEach(extractAttachments);
        }
      };
      extractAttachments(outputValues);
    }
    
    await completeTask.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      executionNotes: formData.executionNotes || undefined,
      outputValues,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });
    closeDialog();
    refetch();
  };

  const handleAddNote = async () => {
    await addNote.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      content: formData.note,
    });
    closeDialog();
    refetch();
  };

  const handleHold = async () => {
    await holdTask.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      reason: formData.reason,
    });
    closeDialog();
    refetch();
  };

  const handleResume = async (ticketId: string, stepId: string) => {
    await resumeTask.mutateAsync({ ticketId, stepId });
    refetch();
  };

  const handleHandover = async () => {
    await requestHandover.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      reason: formData.reason,
      suggestedAgentEmail: formData.suggestedAgent?.email || formData.suggestedEmail || undefined,
    });
    closeDialog();
    refetch();
  };

  const handleRequestInfo = async () => {
    await requestInfo.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      questionText: formData.question,
      requestedFromEmail: requestedFromEmail,
      subject: infoSubject.trim() || undefined,
      attachmentIds: infoAttachmentIds.length > 0 ? infoAttachmentIds : undefined,
    });
    closeDialog();
    refetch();
  };

  const handleAcknowledgeSla = async () => {
    await acknowledgeSla.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      notes: formData.slaNotes || undefined,
    });
    closeDialog();
    refetch();
  };

  // Separate tasks by status
  const tasks = data?.items || [];
  // Include ACTIVE, WAITING_FOR states, and WAITING_FOR_CR in Active Tasks (with appropriate indicators)
  const activeTasks = tasks.filter((t: any) => 
    t.step.state === "ACTIVE" || 
    t.step.state === "WAITING_FOR_REQUESTER" || 
    t.step.state === "WAITING_FOR_AGENT" ||
    t.step.state === "WAITING_FOR_CR"  // Include CR-paused tasks
  );
  const onHoldTasks = tasks.filter((t: any) => t.step.state === "ON_HOLD");
  const urgentTasks = tasks.filter((t: any) => {
    if (!t.step.due_at) return false;
    const dueDate = new Date(t.step.due_at);
    const now = new Date();
    return dueDate <= now; // Overdue
  });

  return (
    <PageContainer>
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you for completion"
        actions={
          <div className="flex items-center gap-3">
            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/30">
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin text-primary' : ''}`} />
              <span>
                {isFetching ? 'Updating...' : dataUpdatedAt ? `Updated ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}` : 'Auto-refresh'}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1.5 text-xs"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                Refresh
              </Button>
            </div>
            <Button variant="outline" asChild>
              <Link href="/agent/history">
                <History className="h-4 w-4 mr-2" />
                View History
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Active Tasks
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="onhold">
            <PauseCircle className="h-3 w-3 mr-1 text-amber-500" />
            On Hold
            {onHoldTasks.length > 0 && (
              <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                {onHoldTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue">
            <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
            Overdue
            {urgentTasks.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {urgentTasks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <TicketCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              message="Failed to load tasks"
              onRetry={() => refetch()}
            />
          ) : !activeTasks.length ? (
            <NoTasksEmpty />
          ) : (
            <TaskList
              tasks={activeTasks}
              onComplete={handleCompleteDirect}
              onHold={(t, s, title, name) => openDialog("hold", t, s, title, name)}
              onHandover={(t, s, title, name) => openDialog("handover", t, s, title, name)}
              onCancelHandover={(t, s, hrId) => cancelHandover.mutate({ ticketId: t, stepId: s, handoverRequestId: hrId })}
              isCancellingHandover={cancelHandover.isPending}
              onRequestInfo={(t, s, title, name) => openDialog("info", t, s, title, name)}
              onAcknowledgeSla={(t, s, title, name) => openDialog("sla", t, s, title, name)}
              onSaveDraft={handleSaveDraft}
              isSavingDraft={saveTaskDraft.isPending}
              taskFormValues={taskFormValues}
              taskExecutionNotes={taskExecutionNotes}
              taskFormErrors={taskFormErrors}
              updateTaskFormValue={updateTaskFormValue}
              updateTaskExecutionNotes={updateTaskExecutionNotes}
            />
          )}
        </TabsContent>

        <TabsContent value="onhold" className="space-y-4">
          {onHoldTasks.length === 0 ? (
            <div className="text-center py-12">
              <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No tasks on hold</p>
            </div>
          ) : (
            <OnHoldTaskList
              tasks={onHoldTasks}
              onResume={handleResume}
            />
          )}
        </TabsContent>

        <TabsContent value="overdue" className="space-y-4">
          {urgentTasks.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-muted-foreground">No overdue tasks - Great job!</p>
            </div>
          ) : (
            <TaskList
              tasks={urgentTasks}
              onComplete={handleCompleteDirect}
              onHold={(t, s, title, name) => openDialog("hold", t, s, title, name)}
              onHandover={(t, s, title, name) => openDialog("handover", t, s, title, name)}
              onCancelHandover={(t, s, hrId) => cancelHandover.mutate({ ticketId: t, stepId: s, handoverRequestId: hrId })}
              isCancellingHandover={cancelHandover.isPending}
              onRequestInfo={(t, s, title, name) => openDialog("info", t, s, title, name)}
              onAcknowledgeSla={(t, s, title, name) => openDialog("sla", t, s, title, name)}
              onSaveDraft={handleSaveDraft}
              isSavingDraft={saveTaskDraft.isPending}
              showOverdue
              taskFormValues={taskFormValues}
              taskExecutionNotes={taskExecutionNotes}
              taskFormErrors={taskFormErrors}
              updateTaskFormValue={updateTaskFormValue}
              updateTaskExecutionNotes={updateTaskExecutionNotes}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Complete Task Dialog */}
      <Dialog open={dialog.open && dialog.type === "complete"} onOpenChange={closeDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              {dialog.linkedRows && dialog.linkedRows.length > 0 
                ? `Fill out the form for each of the ${dialog.linkedRows.length} items and add execution notes to complete this task.`
                : dialog.stepFields && dialog.stepFields.length > 0 
                  ? "Fill out the form and add execution notes to complete this task."
                  : "Mark this task as completed. You can add execution notes if needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm"><strong>Ticket:</strong> {dialog.ticketTitle}</p>
              <p className="text-sm text-muted-foreground"><strong>Task:</strong> {dialog.stepName}</p>
            </div>

            {/* Linked Task Form Fields (for tasks linked to repeating sections) */}
            {dialog.linkedRows && dialog.linkedRows.length > 0 && dialog.stepFields && dialog.stepFields.length > 0 && (
              <div className="space-y-4">
                <Separator />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Task Form</h3>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                    {dialog.linkedRows.length} {dialog.linkedRows.length === 1 ? 'item' : 'items'} to complete
                  </Badge>
                </div>
                <LinkedTaskFormFields
                  fields={dialog.stepFields}
                  linkedRows={dialog.linkedRows}
                  formValues={taskFormValues[dialog.stepId] || {}}
                  formErrors={taskFormErrors[dialog.stepId] || {}}
                  updateFormValue={(rowIndex, key, value) => {
                    const rowKey = `__linked_row_${rowIndex}`;
                    updateTaskFormValue(dialog.stepId, rowKey, (prev: Record<string, any>) => ({
                      ...prev,
                      [key]: value
                    }));
                  }}
                />
                <Separator />
              </div>
            )}

            {/* Regular Task Form Fields (for non-linked tasks) */}
            {(!dialog.linkedRows || dialog.linkedRows.length === 0) && dialog.stepFields && dialog.stepFields.length > 0 && (
              <div className="space-y-4">
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">Task Form</h3>
                  <TaskFormFields
                    fields={dialog.stepFields}
                    sections={dialog.stepSections || []}
                    formValues={taskFormValues[dialog.stepId] || {}}
                    formErrors={taskFormErrors[dialog.stepId] || {}}
                    updateFormValue={(key, value) => updateTaskFormValue(dialog.stepId, key, value)}
                  />
                </div>
                <Separator />
              </div>
            )}

            {/* Execution Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                Execution Notes
                {dialog.executionNotesRequired && <span className="text-red-500 ml-1">*</span>}
                {!dialog.executionNotesRequired && <span className="text-muted-foreground ml-1">(optional)</span>}
              </Label>
              <Textarea
                id="notes"
                placeholder="Add notes about what was done..."
                value={formData.executionNotes}
                onChange={(e) => setFormData({ ...formData, executionNotes: e.target.value })}
                rows={4}
                className={dialog.executionNotesRequired && !formData.executionNotes.trim() ? "border-red-500" : ""}
              />
              {dialog.executionNotesRequired && !formData.executionNotes.trim() && (
                <p className="text-xs text-red-500">Execution notes are required</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleComplete}
              disabled={completeTask.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold Task Dialog */}
      <Dialog open={dialog.open && dialog.type === "hold"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put Task on Hold</DialogTitle>
            <DialogDescription>
              This will pause the task. Provide a reason for putting it on hold.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm"><strong>Ticket:</strong> {dialog.ticketTitle}</p>
              <p className="text-sm text-muted-foreground"><strong>Task:</strong> {dialog.stepName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdReason">Reason for hold *</Label>
              <Textarea
                id="holdReason"
                placeholder="Why is this task being put on hold?"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleHold}
              disabled={holdTask.isPending || !formData.reason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Put on Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Handover Request Dialog */}
      <Dialog open={dialog.open && dialog.type === "handover"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Handover</DialogTitle>
            <DialogDescription>
              Request to transfer this task to another agent. Your manager will review and approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm"><strong>Ticket:</strong> {dialog.ticketTitle}</p>
              <p className="text-sm text-muted-foreground"><strong>Task:</strong> {dialog.stepName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="handoverReason">Reason for handover *</Label>
              <Textarea
                id="handoverReason"
                placeholder="Why do you need to hand over this task?"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Suggested Agent (optional)</Label>
              <UserSearchCombobox
                value={formData.suggestedAgent ? {
                  email: formData.suggestedAgent.email,
                  aad_id: formData.suggestedAgent.aad_id,
                  display_name: formData.suggestedAgent.display_name
                } : null}
                onChange={(user: { email: string; aad_id?: string; display_name?: string } | null) => setFormData({ 
                  ...formData, 
                  suggestedAgent: user ? {
                    email: user.email,
                    display_name: user.display_name || user.email,
                    aad_id: user.aad_id
                  } : null,
                  suggestedEmail: user?.email || ""
                })}
                placeholder="Search for a colleague..."
              />
              <p className="text-xs text-muted-foreground">
                Optionally suggest who should take over
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleHandover}
              disabled={requestHandover.isPending || !formData.reason.trim()}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Request Handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Info Dialog - Premium Design */}
      <Dialog open={dialog.open && dialog.type === "info"} onOpenChange={closeDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden border-0 shadow-2xl">
          {/* Visually Hidden Title for Accessibility */}
          <DialogTitle className="sr-only">Request Additional Information</DialogTitle>
          
          {/* Gradient Header */}
          <div className="shrink-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold" aria-hidden="true">Request Information</h2>
                <p className="text-blue-100 text-sm mt-0.5">
                  Get clarification to complete your task
                </p>
              </div>
            </div>
            {/* Ticket Context Badge */}
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium">
                <span className="opacity-70">Ticket:</span>
                <span className="truncate max-w-[200px]">{dialog.ticketTitle}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium">
                <span className="opacity-70">Task:</span>
                <span className="truncate max-w-[150px]">{dialog.stepName}</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              
              {/* Recipient Selection - Redesigned */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <Label className="text-sm font-semibold">
                    Who should respond? <span className="text-destructive">*</span>
                  </Label>
                </div>
                
                <div className="grid gap-3">
                  {/* Requester Option - Card Style */}
                  <div 
                    className={`group relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                      selectedRecipientType === "requester" 
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-md shadow-blue-500/10" 
                        : "border-transparent bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/20"
                    }`}
                    onClick={() => {
                      setSelectedRecipientType("requester");
                      setRequestedFromEmail(undefined);
                      setSelectedAgentKey("");
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all ${
                        selectedRecipientType === "requester" 
                          ? "bg-blue-500 text-white" 
                          : "bg-muted text-muted-foreground group-hover:bg-blue-100 group-hover:text-blue-600"
                      }`}>
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">Ticket Requester</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          The person who originally submitted this request
                        </p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedRecipientType === "requester" 
                          ? "border-blue-500 bg-blue-500" 
                          : "border-muted-foreground/40"
                      }`}>
                        {selectedRecipientType === "requester" && (
                          <CheckCircle className="h-3 w-3 text-white" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Previous Agent Option - Card Style */}
                  <div 
                    className={`relative rounded-xl border-2 transition-all duration-200 ${
                      selectedRecipientType === "agent" 
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-md shadow-emerald-500/10" 
                        : "border-transparent bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/20"
                    }`}
                  >
                    <div 
                      className="p-4 cursor-pointer"
                      onClick={() => setSelectedRecipientType("agent")}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all ${
                          selectedRecipientType === "agent" 
                            ? "bg-emerald-500 text-white" 
                            : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-600"
                        }`}>
                          <UserCheck className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">Previous Participant</div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Someone who worked on an earlier step
                          </p>
                        </div>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedRecipientType === "agent" 
                            ? "border-emerald-500 bg-emerald-500" 
                            : "border-muted-foreground/40"
                        }`}>
                          {selectedRecipientType === "agent" && (
                            <CheckCircle className="h-3 w-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Participant Selection */}
                    {selectedRecipientType === "agent" && (
                      <div className="px-4 pb-4 pt-2 border-t border-emerald-200 dark:border-emerald-800/50 animate-in slide-in-from-top-2 duration-200">
                        {previousAgents && previousAgents.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Available Participants
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {previousAgents.length} found
                              </Badge>
                            </div>
                            <div className="grid gap-2 max-h-[160px] overflow-y-auto pr-1">
                              {previousAgents.map((agent: any, index) => {
                                const stepName = agent.step_name || agent.last_step_name || "Unknown Step";
                                const stepType = agent.step_type || (agent.role === 'Approver' ? 'APPROVAL_STEP' : 'TASK_STEP');
                                const isApproval = stepType === 'APPROVAL_STEP' || agent.role === 'Approver';
                                const uniqueKey = `${agent.email}::${stepName}::${index}`;
                                const isSelected = selectedAgentKey === uniqueKey;
                                const initials = agent.display_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?';
                                
                                return (
                                  <div
                                    key={uniqueKey}
                                    onClick={() => {
                                      setRequestedFromEmail(`${agent.email}::${stepName}`);
                                      setSelectedAgentKey(uniqueKey);
                                    }}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-150 ${
                                      isSelected 
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-2 ring-emerald-500 ring-offset-1' 
                                        : 'bg-background hover:bg-muted/70 border border-border hover:border-emerald-300'
                                    }`}
                                  >
                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                      isApproval 
                                        ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white' 
                                        : 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                                    }`}>
                                      {initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm truncate">{agent.display_name}</span>
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${
                                            isApproval
                                              ? 'border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300' 
                                              : 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300'
                                          }`}
                                        >
                                          {isApproval ? 'Approver' : 'Agent'}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">{stepName}</p>
                                    </div>
                                    {isSelected && (
                                      <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-emerald-50 dark:bg-emerald-950/30 px-2 text-muted-foreground">or</span>
                              </div>
                            </div>
                            <Input
                              placeholder="Enter email address manually..."
                              value={requestedFromEmail?.includes('::') ? '' : (requestedFromEmail || '')}
                              onChange={(e) => {
                                setRequestedFromEmail(e.target.value || undefined);
                                setSelectedAgentKey('');
                              }}
                              className="h-9 text-sm bg-background"
                            />
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <div className="h-10 w-10 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center">
                              <Users className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              No previous participants found
                            </p>
                            <Input
                              placeholder="Enter email address manually..."
                              value={requestedFromEmail || ""}
                              onChange={(e) => setRequestedFromEmail(e.target.value || undefined)}
                              className="h-9 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <Separator className="my-2" />
              
              {/* Subject & Message Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Send className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <Label className="text-sm font-semibold">Your Message</Label>
                </div>
                
                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="info-subject" className="text-xs text-muted-foreground">
                    Subject (optional)
                  </Label>
                  <Input
                    id="info-subject"
                    placeholder="Brief topic of your request..."
                    value={infoSubject}
                    onChange={(e) => setInfoSubject(e.target.value)}
                    className="h-10 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors"
                  />
                </div>
                
                {/* Message */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="question" className="text-xs text-muted-foreground">
                      Message <span className="text-destructive">*</span>
                    </Label>
                    <span className={`text-xs ${formData.question.length > 500 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {formData.question.length}/1000
                    </span>
                  </div>
                  <Textarea
                    id="question"
                    placeholder="Describe what information you need and why it's important for completing this task..."
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: e.target.value.slice(0, 1000) })}
                    rows={4}
                    className="resize-none bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              
              {/* Attachments Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Paperclip className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <Label className="text-sm font-semibold">
                    Attachments <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                </div>
                <FileUpload
                  ticketId={dialog.ticketId}
                  context="info_request"
                  multiple={true}
                  compact={true}
                  onFilesChange={setInfoAttachmentIds}
                />
              </div>
            </div>
          </div>
          
          {/* Premium Footer */}
          <div className="shrink-0 p-4 border-t bg-muted/30 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground hidden sm:block">
              The recipient will be notified and can respond directly.
            </p>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={closeDialog} className="px-4">
                Cancel
              </Button>
              <Button
                onClick={handleRequestInfo}
                disabled={
                  requestInfo.isPending || 
                  !formData.question.trim() ||
                  (selectedRecipientType === "agent" && !requestedFromEmail?.trim())
                }
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 px-6"
              >
                {requestInfo.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Request
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Acknowledge SLA Dialog */}
      <Dialog open={dialog.open && dialog.type === "sla"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge SLA Breach</DialogTitle>
            <DialogDescription>
              Acknowledge that this task has exceeded its SLA deadline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Task is overdue</span>
              </div>
            </div>
            <div>
              <p className="text-sm"><strong>Ticket:</strong> {dialog.ticketTitle}</p>
              <p className="text-sm text-muted-foreground"><strong>Task:</strong> {dialog.stepName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slaNotes">Notes (optional)</Label>
              <Textarea
                id="slaNotes"
                placeholder="Add any notes about the delay..."
                value={formData.slaNotes}
                onChange={(e) => setFormData({ ...formData, slaNotes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleAcknowledgeSla}
              disabled={acknowledgeSla.isPending}
              variant="destructive"
            >
              <Bell className="h-4 w-4 mr-2" />
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={dialog.open && dialog.type === "note"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Progress Note</DialogTitle>
            <DialogDescription>
              Add a note to document your progress on this task. Notes help track what actions have been taken.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm"><strong>Ticket:</strong> {dialog.ticketTitle}</p>
              <p className="text-sm text-muted-foreground"><strong>Task:</strong> {dialog.stepName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                placeholder="Describe the progress or actions taken..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleAddNote}
              disabled={!formData.note.trim() || addNote.isPending}
            >
              <History className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function TaskList({
  tasks,
  onComplete,
  onHold,
  onHandover,
  onCancelHandover,
  isCancellingHandover,
  onRequestInfo,
  onAcknowledgeSla,
  onSaveDraft,
  isSavingDraft,
  showOverdue = false,
  taskFormValues = {},
  taskExecutionNotes = {},
  taskFormErrors = {},
  updateTaskFormValue,
  updateTaskExecutionNotes,
}: {
  tasks: any[];
  onComplete: (ticketId: string, stepId: string, fields?: FormField[], sections?: FormSection[], executionNotesRequired?: boolean, linkedRows?: LinkedRowContext[], linkedSourceInfo?: { source_step_id: string; source_section_id: string; total_rows: number }) => void;
  onHold: (ticketId: string, stepId: string, ticketTitle: string, stepName: string) => void;
  onHandover: (ticketId: string, stepId: string, ticketTitle: string, stepName: string) => void;
  onCancelHandover: (ticketId: string, stepId: string, handoverRequestId: string) => void;
  isCancellingHandover?: boolean;
  onRequestInfo: (ticketId: string, stepId: string, ticketTitle: string, stepName: string) => void;
  onAcknowledgeSla: (ticketId: string, stepId: string, ticketTitle: string, stepName: string) => void;
  onSaveDraft?: (ticketId: string, stepId: string) => void;
  isSavingDraft?: boolean;
  showOverdue?: boolean;
  taskFormValues?: Record<string, Record<string, any>>;
  taskExecutionNotes?: Record<string, string>;
  taskFormErrors?: Record<string, Record<string, string>>;
  updateTaskFormValue?: (stepId: string, key: string, value: any) => void;
  updateTaskExecutionNotes?: (stepId: string, notes: string) => void;
}) {
  return (
    <div className="space-y-4">
      {tasks.map(({ step, ticket, pending_handover, assigned_by, has_open_info_request, open_info_request, is_waiting_for_cr, pending_cr_info }: any) => {
        const isOverdue = step.due_at && parseUTCDate(step.due_at) <= new Date();
        const hasHandoverPending = !!pending_handover;
        const hasInfoRequestPending = has_open_info_request === true;
        const isWaitingForCR = is_waiting_for_cr === true || step.state === "WAITING_FOR_CR";
        const isDisabled = hasHandoverPending || hasInfoRequestPending || isWaitingForCR;
        
        return (
          <Card 
            key={step.ticket_step_id} 
            className={`transition-colors ${
              isWaitingForCR
                ? "border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 opacity-75"
                : hasInfoRequestPending
                  ? "border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 opacity-75"
                  : hasHandoverPending 
                    ? "border-orange-400 dark:border-orange-600 bg-orange-50/50 dark:bg-orange-950/20" 
                    : isOverdue 
                      ? "border-red-300 dark:border-red-800" 
                      : "hover:border-primary/50"
            }`}
          >
            {/* Change Request Pending Banner - Workflow Paused */}
            {isWaitingForCR && !hasHandoverPending && (
              <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-500 dark:from-purple-600 dark:to-violet-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 relative">
                      <Clock className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Workflow Paused - Change Request Pending</p>
                      <p className="text-xs text-white/90">
                        {pending_cr_info?.change_request_id || "A change request"} is awaiting approval
                        {pending_cr_info?.requested_at && ` • ${formatDistanceToNow(parseUTCDate(pending_cr_info.requested_at), { addSuffix: true })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-xs text-white/80">Actions Paused</p>
                    <p className="text-sm font-medium">Notes still enabled</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Info Request Pending Banner */}
            {hasInfoRequestPending && !hasHandoverPending && !isWaitingForCR && (
              <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 dark:from-amber-600 dark:to-yellow-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Waiting for Info Response</p>
                      <p className="text-xs text-white/90">
                        Requested from {open_info_request?.requested_from?.display_name || "someone"} 
                        {open_info_request?.requested_at && ` • ${formatDistanceToNow(parseUTCDate(open_info_request.requested_at), { addSuffix: true })}`}
                      </p>
                    </div>
                  </div>
                  {open_info_request?.subject && (
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-white/80">Subject</p>
                      <p className="text-sm font-medium max-w-[200px] truncate">{open_info_request.subject}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Handover Pending Banner - Very Prominent */}
            {hasHandoverPending && (
              <div className="px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 dark:from-orange-600 dark:to-amber-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <ArrowRightLeft className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Handover Request Pending</p>
                      <p className="text-xs text-white/90">
                        Awaiting approval • Requested {pending_handover.requested_at 
                          ? formatDistanceToNow(parseUTCDate(pending_handover.requested_at), { addSuffix: true })
                          : "recently"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-xs text-white/80">Reason</p>
                    <p className="text-sm font-medium max-w-[200px] truncate">{pending_handover.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 shrink-0"
                    onClick={() => onCancelHandover(ticket.ticket_id, step.ticket_step_id, pending_handover.handover_request_id)}
                    disabled={isCancellingHandover}
                  >
                    {isCancellingHandover ? "Cancelling..." : "Cancel Request"}
                  </Button>
                </div>
              </div>
            )}
            
            <CardHeader className={`pb-2 ${hasHandoverPending ? "pt-3" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{step.step_name}</CardTitle>
                    <StepTypeBadge type={step.step_type} />
                    {hasHandoverPending && (
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-0">
                        <ArrowRightLeft className="h-3 w-3 mr-1" />
                        Handover Pending
                      </Badge>
                    )}
                    {isOverdue && !hasHandoverPending && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    <Link href={`/tickets/${ticket.ticket_id}`} className="hover:underline">
                      {ticket.workflow_name} - {ticket.ticket_id}
                    </Link>
                    {" • "}
                    <span className="font-mono text-xs">{ticket.ticket_id}</span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <SlaIndicator dueAt={step.due_at} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => onComplete(
                          ticket.ticket_id, 
                          step.ticket_step_id,
                          step.data?.output_fields,
                          step.data?.sections,
                          step.data?.execution_notes_required
                        )}
                        disabled={isDisabled}
                        className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />
                        Complete Task
                        {isDisabled && <span className="ml-2 text-xs">({hasInfoRequestPending ? "Info pending" : "Handover pending"})</span>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onHold(ticket.ticket_id, step.ticket_step_id, ticket.title, step.step_name)}
                        disabled={isDisabled}
                        className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <PauseCircle className="h-4 w-4 mr-2 text-amber-500" />
                        Put on Hold
                      </DropdownMenuItem>
                      {hasHandoverPending && (
                        <DropdownMenuItem 
                          onClick={() => onCancelHandover(ticket.ticket_id, step.ticket_step_id, pending_handover.handover_request_id)}
                          className="text-orange-600"
                          disabled={isCancellingHandover}
                        >
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          {isCancellingHandover ? "Cancelling..." : "Cancel Handover"}
                        </DropdownMenuItem>
                      )}
                      {isOverdue && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => onAcknowledgeSla(ticket.ticket_id, step.ticket_step_id, ticket.title, step.step_name)}
                            className="text-red-600"
                          >
                            <Bell className="h-4 w-4 mr-2" />
                            Acknowledge SLA
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Metadata Row - Enhanced */}
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Requester</p>
                  <UserPill user={ticket.requester} size="sm" />
                </div>
                {assigned_by && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Assigned by</p>
                    <UserPill user={assigned_by} size="sm" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Started</p>
                  <p className="text-sm flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {step.started_at
                      ? formatDistanceToNow(parseUTCDate(step.started_at), { addSuffix: true })
                      : "Not started"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Workflow</p>
                  <p className="text-sm">{ticket.workflow_name || "Unknown"}</p>
                </div>
              </div>

              {/* Task Form Fields - Display inline if they exist (skip for linked tasks - they use the dialog) */}
              {step.data?.output_fields && step.data.output_fields.length > 0 && updateTaskFormValue && !step.data?.linked_rows?.length && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold">Task Form</h4>
                  <TaskFormFields
                    fields={step.data.output_fields}
                    sections={step.data.sections || []}
                    formValues={taskFormValues[step.ticket_step_id] || {}}
                    formErrors={taskFormErrors[step.ticket_step_id] || {}}
                    updateFormValue={(key, value) => updateTaskFormValue(step.ticket_step_id, key, value)}
                  />
                </div>
              )}
              
              {/* Linked Task Form Fields - Inline display for linked tasks */}
              {step.data?.linked_rows?.length > 0 && step.data?.output_fields?.length > 0 && updateTaskFormValue && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-600 text-white">Linked Task</Badge>
                    <span className="text-sm font-medium">{step.data.linked_rows.length} items to complete</span>
                  </div>
                  <LinkedTaskFormFields
                    fields={step.data.output_fields}
                    linkedRows={step.data.linked_rows}
                    formValues={taskFormValues[step.ticket_step_id] || {}}
                    formErrors={taskFormErrors[step.ticket_step_id] || {}}
                    updateFormValue={(rowIndex, key, value) => {
                      const rowKey = `__linked_row_${rowIndex}`;
                      updateTaskFormValue(step.ticket_step_id, rowKey, (prev: Record<string, any>) => ({
                        ...prev,
                        [key]: value
                      }));
                    }}
                  />
                </div>
              )}

              {/* Execution Notes - Display inline if required or if form fields exist */}
              {(step.data?.execution_notes_required || (step.data?.output_fields && step.data.output_fields.length > 0)) && updateTaskExecutionNotes && (
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor={`execution-notes-${step.ticket_step_id}`}>
                    Execution Notes
                    {step.data?.execution_notes_required && <span className="text-red-500 ml-1">*</span>}
                    {!step.data?.execution_notes_required && <span className="text-muted-foreground ml-1">(optional)</span>}
                  </Label>
                  <Textarea
                    id={`execution-notes-${step.ticket_step_id}`}
                    placeholder="Add notes about what was done..."
                    value={taskExecutionNotes[step.ticket_step_id] || ""}
                    onChange={(e) => updateTaskExecutionNotes(step.ticket_step_id, e.target.value)}
                    rows={4}
                    className={step.data?.execution_notes_required && !taskExecutionNotes[step.ticket_step_id]?.trim() ? "border-red-500" : ""}
                  />
                  {step.data?.execution_notes_required && !taskExecutionNotes[step.ticket_step_id]?.trim() && (
                    <p className="text-xs text-red-500">Execution notes are required</p>
                  )}
                </div>
              )}
              
              {/* Attachments Section - Separate from notes */}
              <StepAttachments
                ticketId={ticket.ticket_id}
                stepId={step.ticket_step_id}
                stepName={step.step_name || "Task"}
                stepType="TASK_STEP"
                queryKey={['agent-tasks']}
                canUpload={!isDisabled}
                defaultExpanded={false}
              />
              
              {/* Activity Log - Notes only */}
              <ActivityLog
                ticketId={ticket.ticket_id}
                stepId={step.ticket_step_id}
                notes={step.data?.notes || []}
                queryKey={['agent-tasks']}
              />
              
              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <Button
                  size="sm"
                  className={isDisabled 
                    ? "bg-gray-400 hover:bg-gray-400 cursor-not-allowed" 
                    : "bg-emerald-600 hover:bg-emerald-700"
                  }
                  onClick={() => !isDisabled && onComplete(
                    ticket.ticket_id, 
                    step.ticket_step_id,
                    step.data?.output_fields || step.data?.fields,
                    step.data?.sections,
                    step.data?.execution_notes_required,
                    step.data?.linked_rows,
                    step.data?.linked_source_info
                  )}
                  disabled={isDisabled}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isDisabled ? (hasInfoRequestPending ? "Waiting for Info" : "Pending Handover") : "Complete"}
                </Button>
                {/* Save Draft Button - only show if there are form fields */}
                {((step.data?.output_fields && step.data?.output_fields.length > 0) || 
                  (step.data?.linked_rows && step.data?.linked_rows.length > 0)) && onSaveDraft && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onSaveDraft(ticket.ticket_id, step.ticket_step_id)}
                    disabled={isSavingDraft}
                    className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                  >
                    {isSavingDraft ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4 mr-2" />
                    )}
                    {step.data?.draft_saved_at ? "Update Draft" : "Save Draft"}
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => !isDisabled && onHold(ticket.ticket_id, step.ticket_step_id, ticket.title, step.step_name)}
                  disabled={isDisabled}
                  className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                >
                  <PauseCircle className="h-4 w-4 mr-2" />
                  Hold
                </Button>
                {/* Request Info Button - Prominent outside dropdown */}
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => !isDisabled && onRequestInfo(ticket.ticket_id, step.ticket_step_id, ticket.title, step.step_name)}
                  disabled={isDisabled}
                  className={isDisabled ? "opacity-50 cursor-not-allowed" : "border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"}
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Request Info
                </Button>
                {/* Request Handover Button - Prominent outside dropdown */}
                {hasHandoverPending ? (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onCancelHandover(ticket.ticket_id, step.ticket_step_id, pending_handover.handover_request_id)}
                    disabled={isCancellingHandover}
                    className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    {isCancellingHandover ? "Cancelling..." : "Cancel Handover"}
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => !isDisabled && onHandover(ticket.ticket_id, step.ticket_step_id, ticket.title, step.step_name)}
                    disabled={isDisabled}
                    className={isDisabled ? "opacity-50 cursor-not-allowed" : "border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950"}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Handover
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/tickets/${ticket.ticket_id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View
                  </Link>
                </Button>
                {/* Draft saved indicator */}
                {step.data?.draft_saved_at && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Draft saved {formatDistanceToNow(parseUTCDate(step.data.draft_saved_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OnHoldTaskList({
  tasks,
  onResume,
}: {
  tasks: any[];
  onResume: (ticketId: string, stepId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {tasks.map(({ step, ticket }: any) => (
        <Card key={step.ticket_step_id} className="border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{step.step_name}</CardTitle>
                  <StepTypeBadge type={step.step_type} />
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    <PauseCircle className="h-3 w-3 mr-1" />
                    On Hold
                  </Badge>
                </div>
                <CardDescription>
                  <Link href={`/tickets/${ticket.ticket_id}`} className="hover:underline">
                    {ticket.workflow_name} - {ticket.ticket_id}
                  </Link>
                  {" • "}
                  <span className="font-mono text-xs">{ticket.ticket_id}</span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {step.data?.hold_reason && (
              <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">Hold Reason:</p>
                <p className="text-sm">{step.data.hold_reason}</p>
              </div>
            )}
            
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Requester</p>
                <UserPill user={ticket.requester} size="sm" />
              </div>
              {step.data?.held_at && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">On Hold Since</p>
                  <p className="text-sm">
                    {formatDistanceToNow(parseUTCDate(step.data.held_at), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onResume(ticket.ticket_id, step.ticket_step_id)}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Resume Task
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/tickets/${ticket.ticket_id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Ticket
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Task Form Fields Component
interface TaskFormFieldsProps {
  fields: FormField[];
  sections: FormSection[];
  formValues: Record<string, any>;
  formErrors: Record<string, string>;
  updateFormValue: (key: string, value: any) => void;
}

function TaskFormFields({ fields, sections, formValues, formErrors, updateFormValue }: TaskFormFieldsProps) {
  // Group fields by section
  const fieldsBySection = useMemo(() => {
    return sections.reduce((acc, section) => {
      acc[section.section_id] = fields.filter(f => f.section_id === section.section_id);
      return acc;
    }, {} as Record<string, FormField[]>);
  }, [fields, sections]);
  
  const ungroupedFields = useMemo(() => {
    return fields.filter(f => !f.section_id);
  }, [fields]);
  
  // Sort sections by order
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);
  
  // Helper to update repeating section row value
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
  
  // Helper to add a new row to repeating section
  const addRepeatingSectionRow = useCallback((sectionId: string) => {
    const sectionDataKey = `__section_${sectionId}`;
    updateFormValue(sectionDataKey, (prevRows: any[]) => {
      const currentRows = prevRows || [];
      return [...currentRows, {}];
    });
  }, [updateFormValue]);
  
  // Helper to remove a row from repeating section
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
            <div key={section.section_id} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{section.section_title}</h4>
                  {section.section_description && (
                    <p className="text-xs text-muted-foreground mt-1">{section.section_description}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addRepeatingSectionRow(section.section_id)}
                  className="gap-2"
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
                <div className={`text-center py-6 border border-dashed rounded-lg ${
                  formErrors[`${sectionDataKey}_min_rows`]
                    ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                    : "bg-muted/30"
                }`}>
                  <p className={`text-sm ${
                    formErrors[`${sectionDataKey}_min_rows`]
                      ? "text-red-600 dark:text-red-400 font-medium"
                      : "text-muted-foreground"
                  }`}>
                    {section.min_rows && section.min_rows > 0 
                      ? `At least ${section.min_rows} row${section.min_rows > 1 ? 's' : ''} required`
                      : "No rows added yet"
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Add Row" to add a line item</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rows.map((row: Record<string, any>, rowIndex: number) => (
                    <Card key={`${section.section_id}_row_${rowIndex}`} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-medium text-muted-foreground">
                            Row {rowIndex + 1}
                          </h5>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRepeatingSectionRow(section.section_id, rowIndex)}
                            className="h-7 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {sectionFields.map((field) => (
                            <TaskDynamicField
                              key={`${section.section_id}_${rowIndex}_${field.field_key}`}
                              field={field}
                              value={row[field.field_key]}
                              onChange={(value) => updateRepeatingSectionValue(section.section_id, rowIndex, field.field_key, value)}
                              error={formErrors[`__section_${section.section_id}_${rowIndex}_${field.field_key}`]}
                              allFormValues={formValues}
                              rowContext={row}
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
        
        // Non-repeating section
        return (
          <div key={section.section_id} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{section.section_title}</h4>
              {section.section_description && (
                <p className="text-xs text-muted-foreground mt-1">{section.section_description}</p>
              )}
            </div>
            <div className="space-y-4 pl-2">
              {sectionFields.map((field) => (
                <TaskDynamicField
                  key={field.field_key}
                  field={field}
                  value={formValues[field.field_key]}
                  onChange={(value) => updateFormValue(field.field_key, value)}
                  error={formErrors[field.field_key]}
                  allFormValues={formValues}
                />
              ))}
            </div>
          </div>
        );
      })}
      
      {/* Render ungrouped fields */}
      {ungroupedFields.length > 0 && (
        <div className={sortedSections.length > 0 ? "space-y-4 pt-2" : "space-y-4"}>
          {ungroupedFields.map((field) => (
            <TaskDynamicField
              key={field.field_key}
              field={field}
              value={formValues[field.field_key]}
              onChange={(value) => updateFormValue(field.field_key, value)}
              error={formErrors[field.field_key]}
              allFormValues={formValues}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface TaskDynamicFieldProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  allFormValues?: Record<string, any>;  // All form values for conditional requirements
  rowContext?: Record<string, any>;     // For repeating sections: current row values
}

function TaskDynamicField({ field, value, onChange, error, allFormValues = {}, rowContext }: TaskDynamicFieldProps) {
  const fieldId = `field-${field.field_key}`;
  const fieldIsRequired = isFieldRequired(field, allFormValues, rowContext);
  
  const renderField = () => {
    switch (field.field_type) {
      case "TEXT":
        return (
          <Input
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={error ? "border-red-500" : ""}
          />
        );
        
      case "TEXTAREA":
        return (
          <Textarea
            id={fieldId}
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className={error ? "border-red-500" : ""}
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
            className={error ? "border-red-500" : ""}
          />
        );
        
      case "DATE": {
        // Get date validation settings (static + conditional)
        const dateSettings = getDateValidation(field, allFormValues, rowContext);
        const dateConstraints = getDateInputConstraints(dateSettings);
        
        // Build description of allowed dates
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
              className={error ? "border-red-500" : ""}
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
            <SelectTrigger className={error ? "border-red-500" : ""}>
              <SelectValue placeholder={field.placeholder || "Select an option"} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        
      case "CHECKBOX":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldId}
              checked={!!value}
              onCheckedChange={onChange}
            />
            <Label htmlFor={fieldId} className="cursor-pointer text-sm">
              {field.placeholder || field.field_label}
            </Label>
          </div>
        );
        
      case "MULTISELECT":
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {(field.options || []).map((option) => (
              <div key={option} className="flex items-center space-x-2">
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
                />
                <Label htmlFor={`${fieldId}-${option}`} className="cursor-pointer text-sm">
                  {option}
                </Label>
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
            className={error ? "border-red-500" : ""}
          />
        );
        
      case "FILE":
        return (
          <FileUpload
            context="form_field"
            fieldLabel={field.field_label}
            multiple={true}
            compact={true}
            onFilesChange={(attachmentIds) => {
              onChange(attachmentIds.length > 0 ? attachmentIds : null);
            }}
            className={error ? "border-red-500 rounded-lg" : ""}
          />
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="space-y-2">
      {field.field_type !== "CHECKBOX" && (
        <Label htmlFor={fieldId}>
          {field.field_label}
          {fieldIsRequired && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      {renderField()}
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

// ============================================================================
// Linked Task Form Fields Component - For tasks linked to repeating sections
// ============================================================================

interface LinkedTaskFormFieldsProps {
  fields: FormField[];
  linkedRows: LinkedRowContext[];
  formValues: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formErrors: Record<string, any>;
  updateFormValue: (rowIndex: number, key: string, value: any) => void;
}

function LinkedTaskFormFields({ 
  fields, 
  linkedRows, 
  formValues, 
  formErrors, 
  updateFormValue 
}: LinkedTaskFormFieldsProps) {
  return (
    <div className="space-y-6">
      {linkedRows.map((row, rowIndex) => {
        const rowKey = `__linked_row_${rowIndex}`;
        const rowValues = formValues[rowKey] || {};
        const rowErrors = formErrors[rowKey] || {};
        
        // Build context display from the row's __context data
        const contextItems = Object.entries(row.__context || {}).map(([key, data]) => ({
          key,
          label: (data as { label: string; value: any }).label,
          value: (data as { label: string; value: any }).value
        }));
        
        return (
          <div 
            key={rowIndex} 
            className="p-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20"
          >
            {/* Row Header with Context */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">
                  {rowIndex + 1}
                </div>
                <span className="font-medium text-foreground">
                  Item {rowIndex + 1} of {linkedRows.length}
                </span>
              </div>
            </div>
            
            {/* Context Information (Read-only) */}
            {contextItems.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500"></span>
                  Source Data (Read-only)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {contextItems.map((item) => (
                    <div key={item.key} className="text-sm">
                      <span className="text-muted-foreground">{item.label}:</span>{" "}
                      <span className="font-medium">{String(item.value || "-")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Form Fields - Use TaskDynamicField */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <TaskDynamicField
                  key={`${rowKey}-${field.field_key}`}
                  field={field}
                  value={rowValues[field.field_key]}
                  error={rowErrors[field.field_key] || ""}
                  onChange={(value) => updateFormValue(rowIndex, field.field_key, value)}
                  allFormValues={formValues}
                  rowContext={rowValues}
                />
              ))}
            </div>
          </div>
        );
      })}
      
      {linkedRows.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No items to complete. The source form has no data.</p>
        </div>
      )}
    </div>
  );
}
