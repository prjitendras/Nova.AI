/**
 * Ticket Detail Page
 * Full ticket view with timeline, actions, and step details
 */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTicket, useCancelTicket, useRespondInfo, useRequestInfo, useSubmitForm, useApprove, useReject, useAddRequesterNote } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { useConsecutiveFormChain } from "@/hooks/use-workflows";
import { PageContainer, PageHeader, SectionHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { SlaIndicator } from "@/components/sla-indicator";
import { LinkedTaskOutputDisplay } from "@/components/linked-task-output";
import { AttachmentsList } from "@/components/attachments-list";
import { FileUpload } from "@/components/file-upload";
import { RequesterAttachments } from "@/components/requester-attachments";
import { PageLoading, TimelineSkeleton } from "@/components/loading-skeleton";
import { ErrorState, NotFoundError } from "@/components/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  FileText,
  MessageSquare,
  History,
  XCircle,
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  GitBranch,
  Plus,
  Trash2,
  Layers,
  Paperclip,
  Send,
  Download,
  Users,
  RefreshCw,
  Workflow,
  SkipForward,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { parseUTCDate } from "@/lib/utils";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserSearchCombobox } from "@/components/workflow-studio/user-search-combobox";
import { FormField, FormSection } from "@/lib/types";
import { apiClient } from "@/lib/api-client";
import { config } from "@/lib/config";
import { FileEdit } from "lucide-react";
import { PendingCRBanner, VersionSelector, VersionUpdateIndicator, VersionCompareDialog } from "@/components/change-request";
import { ChangeRequestForm } from "@/components/change-request/change-request-form";
import { useCancelChangeRequest, useTicketVersions, useChangeRequest, useCompareVersions } from "@/hooks/use-change-requests";

// Validate a single field value against its validation rules
function validateFieldValue(field: any, value: any): string | null {
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
      } catch (e) {
        // Invalid regex pattern - skip validation
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
function isFieldRequired(field: any, allFormValues: Record<string, any>, rowContext?: Record<string, any>): boolean {
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
  field: any, 
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

// Component to show required indicator with conditional support
function RequiredIndicator({ field, allFormValues, rowContext }: { field: any; allFormValues: Record<string, any>; rowContext?: Record<string, any> }) {
  const isRequired = isFieldRequired(field, allFormValues, rowContext);
  const hasConditionalRules = field.conditional_requirements && field.conditional_requirements.length > 0;
  
  if (!isRequired) return null;
  
  return (
    <span className="text-red-500 ml-1" title={hasConditionalRules ? "Conditionally required" : "Required"}>
      *{hasConditionalRules && <span className="text-amber-500 ml-0.5 text-xs">⚡</span>}
    </span>
  );
}

// Helper function to render field input based on field type
// For repeating sections: values=row, allFormValues=all form values, rowContext=row
function renderFieldInput(
  field: any, 
  values: Record<string, any>, 
  onChange: (key: string, value: any) => void, 
  ticketId?: string,
  allFormValues?: Record<string, any>,
  rowContext?: Record<string, any>
) {
  const fieldId = field.field_key;
  const value = values[fieldId] || "";
  // Use allFormValues if provided, otherwise fall back to values for backward compatibility
  const formValuesForConditional = allFormValues || values;
  
  if (field.field_type === "TEXTAREA") {
    return (
      <Textarea
        id={fieldId}
        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(fieldId, e.target.value)}
        rows={3}
      />
    );
  } else if (field.field_type === "SELECT") {
    return (
      <Select
        value={value}
        onValueChange={(val) => onChange(fieldId, val)}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select ${field.field_label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((opt: string) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.field_type === "CHECKBOX") {
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          id={fieldId}
          checked={value || false}
          onCheckedChange={(checked) => onChange(fieldId, checked)}
        />
        <label htmlFor={fieldId} className="text-sm text-muted-foreground">
          {field.placeholder || ""}
        </label>
      </div>
    );
  } else if (field.field_type === "NUMBER") {
    return (
      <Input
        type="number"
        id={fieldId}
        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(fieldId, e.target.value)}
      />
    );
  } else if (field.field_type === "DATE") {
    // Get date validation settings with proper conditional support
    const dateSettings = getDateValidation(field, formValuesForConditional, rowContext);
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
          type="date"
          id={fieldId}
          value={value}
          onChange={(e) => onChange(fieldId, e.target.value)}
          min={dateConstraints.min}
          max={dateConstraints.max}
        />
        {hasRestrictions && (
          <p className="text-xs text-muted-foreground">
            Allowed: {allowedDates.join(", ")} dates
          </p>
        )}
      </div>
    );
  } else if (field.field_type === "EMAIL") {
    return (
      <Input
        type="email"
        id={fieldId}
        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(fieldId, e.target.value)}
      />
    );
  } else if (field.field_type === "USER_SELECT") {
    return (
      <UserSearchCombobox
        value={value}
        onChange={(email: string | undefined) => onChange(fieldId, email || "")}
        placeholder={field.placeholder || "Search for user by name or email..."}
      />
    );
  } else if (field.field_type === "FILE") {
    // File upload field - store attachment IDs
    return (
      <FileUpload
        ticketId={ticketId}
        context="form_field"
        fieldLabel={field.field_label}
        multiple={true}
        compact={true}
        onFilesChange={(attachmentIds) => {
          onChange(fieldId, attachmentIds.length > 0 ? attachmentIds : null);
        }}
      />
    );
  } else {
    return (
      <Input
        type="text"
        id={fieldId}
        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(fieldId, e.target.value)}
      />
    );
  }
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketId = params.ticketId as string;
  const { user } = useAuth();
  
  // Check for action query parameter (e.g., ?action=respond)
  const actionParam = searchParams.get("action");
  const stepIdParam = searchParams.get("stepId");
  
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useTicket(ticketId);
  const cancelTicket = useCancelTicket();
  const submitForm = useSubmitForm();
  const approve = useApprove();
  const reject = useReject();
  const requestInfo = useRequestInfo();
  const respondInfo = useRespondInfo();
  const addRequesterNote = useAddRequesterNote();

  const ticket = data?.ticket;
  const steps = data?.steps || [];
  const auditEvents = data?.audit_events || [];
  const infoRequests = data?.info_requests || [];
  const actionableTasks = data?.actionable_tasks || [];

  // Fetch attachments count for tab badge
  const { data: attachmentsData } = useQuery({
    queryKey: ['ticket-attachments-count', ticketId],
    queryFn: async () => {
      const response = await apiClient.get<{ total_count: number; attachments: any[] }>(
        `/attachments/ticket/${ticketId}`
      );
      return response;
    },
    enabled: !!ticketId,
    staleTime: 30000,
  });
  const attachmentCount = attachmentsData?.total_count || attachmentsData?.attachments?.length || 0;

  // Build a mapping from field_key to field_label from form steps
  const fieldKeyToLabel: Record<string, string> = {};
  steps.forEach((step: any) => {
    if (step.step_type === "FORM_STEP" && step.data?.fields) {
      step.data.fields.forEach((field: any) => {
        if (field.field_key && field.field_label) {
          fieldKeyToLabel[field.field_key] = field.field_label;
        }
      });
    }
  });

  // Helper function to get display label for a field key
  const getFieldLabel = (key: string): string => {
    return fieldKeyToLabel[key] || key.replace(/_/g, " ");
  };

  // Dialog states
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showRequestInfoDialog, setShowRequestInfoDialog] = useState(false);
  const [showRespondInfoDialog, setShowRespondInfoDialog] = useState(false);
  const [comment, setComment] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [infoResponseAttachmentIds, setInfoResponseAttachmentIds] = useState<string[]>([]);
  
  // Change Request states
  const [showChangeRequestForm, setShowChangeRequestForm] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{ v1: number; v2: number }>({ v1: 1, v2: 2 });
  const [viewingVersion, setViewingVersion] = useState<number | null>(null); // null = current version
  const cancelCR = useCancelChangeRequest();
  const { data: versionsData } = useTicketVersions(ticket?.form_version && ticket.form_version > 1 ? ticketId : null);
  const { data: pendingCRData } = useChangeRequest(ticket?.pending_change_request_id || null);
  const { data: versionComparisonData, isLoading: isLoadingComparison, error: comparisonError } = useCompareVersions(
    showVersionCompare ? ticketId : null,
    compareVersions.v1,
    compareVersions.v2
  );
  
  // Get the form values for the currently viewed version
  const viewingVersionData = useMemo(() => {
    if (!viewingVersion || !versionsData?.versions) return null;
    return versionsData.versions.find(v => v.version === viewingVersion);
  }, [viewingVersion, versionsData]);
  
  // Use viewed version's form values or current ticket's form values
  const displayFormValues = useMemo(() => {
    if (viewingVersionData) {
      return viewingVersionData.form_values || {};
    }
    return ticket?.form_values || {};
  }, [viewingVersionData, ticket?.form_values]);
  
  // Requester note state
  const [requesterNoteContent, setRequesterNoteContent] = useState("");
  
  // Auto-open respond dialog when coming from Manager Dashboard with action=respond
  useEffect(() => {
    if (actionParam === "respond" && infoRequests.length > 0) {
      // Find the open info request (either by stepId or just the first open one)
      const openRequest = stepIdParam 
        ? infoRequests.find((ir: any) => ir.ticket_step_id === stepIdParam && (ir.status === "OPEN" || !ir.response_text))
        : infoRequests.find((ir: any) => ir.status === "OPEN" || !ir.response_text);
      
      if (openRequest) {
        setShowRespondInfoDialog(true);
        // Clear the URL params to prevent re-opening on refresh
        router.replace(`/tickets/${ticketId}`, { scroll: false });
      }
    }
  }, [actionParam, stepIdParam, infoRequests, ticketId, router]);
  
  // Form values for current step (for multi-form workflows)
  const [currentStepFormValues, setCurrentStepFormValues] = useState<Record<string, any>>({});
  
  // Wizard state for consecutive mid-workflow forms
  const [wizardFormIndex, setWizardFormIndex] = useState(0);
  const [allWizardFormValues, setAllWizardFormValues] = useState<Record<string, Record<string, any>>>({});
  const [isSubmittingSequence, setIsSubmittingSequence] = useState(false);

  // For parallel branches, there can be multiple actionable steps
  // Group actionable tasks by type for the UI
  const formActionSteps = actionableTasks.filter((t: any) => t.step_type === "FORM_STEP");
  const approvalActionSteps = actionableTasks.filter((t: any) => t.step_type === "APPROVAL_STEP");
  const taskActionSteps = actionableTasks.filter((t: any) => t.step_type === "TASK_STEP");
  
  // For single action scenarios, use the first actionable task
  // For parallel scenarios, we'll show all actionable tasks
  const currentActionStep = actionableTasks[0];
  
  // State to track which parallel step is being acted upon
  const [selectedParallelStepId, setSelectedParallelStepId] = useState<string | null>(null);
  
  // Get the actual step to act on (considering parallel selection)
  const getActiveActionStep = useCallback(() => {
    if (selectedParallelStepId) {
      return actionableTasks.find((t: any) => t.ticket_step_id === selectedParallelStepId) || currentActionStep;
    }
    return currentActionStep;
  }, [selectedParallelStepId, actionableTasks, currentActionStep]);
  
  // Get the step ID for fetching consecutive forms - use selected parallel step if set
  const activeStepForForms = getActiveActionStep();
  
  // Get full step data to check if it's from a sub-workflow
  const activeStepFullData = useMemo(() => {
    if (!activeStepForForms) return null;
    return steps.find((s: any) => s.ticket_step_id === activeStepForForms.ticket_step_id);
  }, [activeStepForForms, steps]);
  
  // Determine which workflow ID and version to use for fetching form fields
  // For sub-workflow steps, use the sub-workflow's ID and version
  const formFetchWorkflowId = activeStepFullData?.from_sub_workflow_id || ticket?.workflow_id || "";
  const formFetchWorkflowVersion = activeStepFullData?.from_sub_workflow_version || ticket?.workflow_version || 0;
  
  // Fetch consecutive forms when dialog opens for a form step
  const {
    data: consecutiveFormsData,
    isLoading: isLoadingConsecutiveForms,
  } = useConsecutiveFormChain(
    formFetchWorkflowId,
    formFetchWorkflowVersion,
    activeStepForForms?.step_id || ""
  );
  
  // Calculate wizard state
  const consecutiveForms = consecutiveFormsData?.consecutive_forms || [];
  const totalWizardForms = consecutiveForms.length;
  const currentWizardForm = consecutiveForms[wizardFormIndex];
  const isMultiFormWizard = totalWizardForms > 1;
  const isLastWizardForm = wizardFormIndex === totalWizardForms - 1;
  
  // Get form fields for the current active step (if it's a form step)
  const currentStepFormFields: any[] = (() => {
    const activeStep = getActiveActionStep();
    if (!activeStep) return [];
    const step = steps.find((s: any) => s.ticket_step_id === activeStep.ticket_step_id);
    if (step?.step_type === "FORM_STEP" && step.data?.fields) {
      return Array.isArray(step.data.fields) ? step.data.fields : [];
    }
    return [];
  })();

  const currentStepSections: any[] = (() => {
    const activeStep = getActiveActionStep();
    if (!activeStep) return [];
    const step = steps.find((s: any) => s.ticket_step_id === activeStep.ticket_step_id);
    if (step?.step_type === "FORM_STEP" && step.data?.sections) {
      return Array.isArray(step.data.sections) ? step.data.sections : [];
    }
    return [];
  })();
  
  // Check if this is the first form step (already filled during ticket creation)
  // The first form step has form_values already in the ticket from creation
  const isFirstFormStep = useMemo(() => {
    const activeStep = getActiveActionStep();
    if (!ticket || !activeStep) return false;
    // If workflow_start_step_id is set, use it
    if (ticket.workflow_start_step_id) {
      return activeStep.step_id === ticket.workflow_start_step_id;
    }
    // Otherwise, check if it's the first step in the list
    const formSteps = steps.filter((s: any) => s.step_type === "FORM_STEP");
    if (formSteps.length === 0) return false;
    // Sort by order or step_id and check if current is first
    return formSteps[0]?.step_id === activeStep.step_id;
  }, [ticket, getActiveActionStep, steps]);
  
  // Check if this is a parallel branch form (has branch_id)
  // Parallel branch forms should always be treated as single forms, not wizard
  const isParallelBranchForm = useMemo(() => {
    const activeStep = getActiveActionStep();
    return !!(activeStep?.branch_id);
  }, [getActiveActionStep]);

  const handleCancel = async () => {
    await cancelTicket.mutateAsync({ ticketId });
  };

  // Helper to get current wizard form fields
  const getWizardFormFields = (formIndex: number): any[] => {
    const form = consecutiveForms[formIndex];
    if (!form) return [];
    // First look in the form data, then check step data from ticket steps
    if (form.fields && form.fields.length > 0) {
      return form.fields;
    }
    // Fallback to step data
    const stepData = steps.find((s: any) => s.step_id === form.step_id);
    return Array.isArray(stepData?.data?.fields) ? stepData.data.fields : [];
  };
  
  // Helper to validate wizard form
  const validateWizardForm = (formIndex: number): string[] => {
    const fields = getWizardFormFields(formIndex);
    const formValues = allWizardFormValues[formIndex] || {};
    return fields
      .filter((f: any) => f.required)
      .filter((f: any) => {
        const value = formValues[f.field_key];
        return value === undefined || value === null || value === '';
      })
      .map((f: any) => f.field_label);
  };
  
  // Handle wizard next button
  const handleWizardNext = () => {
    const missingFields = validateWizardForm(wizardFormIndex);
    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }
    setWizardFormIndex(prev => prev + 1);
  };
  
  // Handle wizard back button
  const handleWizardBack = () => {
    setWizardFormIndex(prev => Math.max(0, prev - 1));
  };
  
  // Handle submit for wizard mode - submit all forms in sequence
  const handleSubmitWizardForms = async () => {
    const activeStep = getActiveActionStep();
    if (!activeStep || isSubmittingSequence || submitForm.isPending) {
      return;
    }
    
    // Validate current form
    const missingFields = validateWizardForm(wizardFormIndex);
    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }
    
    setIsSubmittingSequence(true);
    // Close dialog immediately to prevent double-clicks
    setShowSubmitDialog(false);
    
    try {
      // We need to submit forms one by one because backend processes one step at a time
      // After each submit, the ticket moves to the next step
      // We'll submit the first form, then refetch and repeat for remaining forms
      
      // For simplicity, let's submit the current form and let the user click submit again
      // Or better: submit all forms in sequence
      let currentStepId = activeStep.ticket_step_id;
      
      for (let i = 0; i < totalWizardForms; i++) {
        const formValues = allWizardFormValues[i] || {};
        
        // If this is the first form and it's the initial form (already has values)
        const form = consecutiveForms[i];
        const isInitialForm = i === 0 && ticket?.workflow_start_step_id === form?.step_id;
        const valuesToSubmit = isInitialForm ? (ticket?.form_values || {}) : formValues;
        
        await submitForm.mutateAsync({
          ticketId,
          stepId: currentStepId,
          formValues: valuesToSubmit,
        });
        
        // After submitting, we need to get the new current step
        // For subsequent forms, the backend will have advanced to the next step
        // We need to refetch and get the new step ID
        if (i < totalWizardForms - 1) {
          // Wait a bit and refetch to get new step ID
          await new Promise(resolve => setTimeout(resolve, 500));
          const newData = await refetch();
          const newActionStep = newData.data?.actionable_tasks?.[0];
          if (newActionStep) {
            currentStepId = newActionStep.ticket_step_id;
          } else {
            // No more actionable steps (maybe approval is next)
            break;
          }
        }
      }
      
      resetWizardState();
      refetch();
      toast.success(
        totalWizardForms > 1 
          ? `All ${totalWizardForms} forms submitted successfully!` 
          : "Form submitted successfully! Moving to next step."
      );
    } catch (e: unknown) {
      let errorMessage = "Failed to submit form";
      if (e && typeof e === 'object') {
        const axiosErr = e as { response?: { data?: { detail?: { message?: string } | string } } };
        if (axiosErr.response?.data?.detail) {
          const detail = axiosErr.response.data.detail;
          errorMessage = typeof detail === 'string' ? detail : (detail.message || errorMessage);
        } else if ((e as Error).message) {
          errorMessage = (e as Error).message;
        }
      }
      toast.error(errorMessage);
    } finally {
      setIsSubmittingSequence(false);
    }
  };

  const handleSubmitForm = async () => {
    const activeStep = getActiveActionStep();
    
    if (!activeStep) {
      return;
    }
    
    // Prevent duplicate submissions
    if (submitForm.isPending) {
      return;
    }
    
    // For multi-form wizard, use the wizard submit
    // BUT NOT for parallel branch forms - they should always be submitted individually
    if (isMultiFormWizard && !isFirstFormStep && !isParallelBranchForm) {
      await handleSubmitWizardForms();
      return;
    }
    
    // Determine which form values to use:
    // - For the first form step: use ticket.form_values (filled during creation)
    // - For parallel branch forms: always use currentStepFormValues
    // - For subsequent form steps: use currentStepFormValues (filled in this dialog)
    const formValuesToSubmit = isFirstFormStep 
      ? (ticket?.form_values || {})
      : currentStepFormValues;
    
    // Validate required fields and field validation rules for subsequent form steps
    if (!isFirstFormStep && currentStepFormFields.length > 0) {
      const validationErrors: string[] = [];
      
      // Helper to validate a single field
      // rowContext: For repeating sections, contains the current row's values for conditional requirement checks
      const validateField = (field: any, value: any, rowLabel?: string, rowContext?: Record<string, any>) => {
        const isEmpty = value === undefined || value === null || value === '' ||
          (Array.isArray(value) && value.length === 0);
        
        // Dynamically check if field is required (using conditional rules)
        // Pass rowContext so conditional requirements can check values in the same repeating section row
        const fieldIsRequired = isFieldRequired(field, formValuesToSubmit, rowContext);
        
        // Required check
        if (fieldIsRequired && isEmpty) {
          const label = rowLabel ? `${field.field_label} (${rowLabel})` : field.field_label;
          validationErrors.push(`${label} is required`);
          return;
        }
        
        // Skip further validation if empty
        if (isEmpty) return;
        
        // Field-specific validation (min/max length, regex, etc.)
        const fieldError = validateFieldValue(field, value);
        if (fieldError) {
          const label = rowLabel ? `${fieldError} (${rowLabel})` : fieldError;
          validationErrors.push(label);
        }
      };
      
      // Group fields by section
      const fieldsBySection = currentStepSections.reduce((acc: any, section: any) => {
        acc[section.section_id] = currentStepFormFields.filter((f: any) => f.section_id === section.section_id);
        return acc;
      }, {} as Record<string, any[]>);
      
      // Validate repeating sections
      currentStepSections.forEach((section: any) => {
        if (section.is_repeating) {
          const sectionFields = fieldsBySection[section.section_id] || [];
          const sectionDataKey = `__section_${section.section_id}`;
          const rows = Array.isArray(formValuesToSubmit[sectionDataKey]) 
            ? formValuesToSubmit[sectionDataKey] 
            : [];
          
          // Check minimum rows requirement
          const minRows = section.min_rows || 0;
          if (minRows > 0 && rows.length < minRows) {
            validationErrors.push(`${section.section_title} requires at least ${minRows} row${minRows > 1 ? 's' : ''}`);
          }
          
          rows.forEach((row: Record<string, any>, rowIndex: number) => {
            sectionFields.forEach((field: any) => {
              // Pass the row as rowContext so conditional requirements can check values in the same row
              validateField(field, row[field.field_key], `Row ${rowIndex + 1}`, row);
            });
          });
        } else {
          // Validate non-repeating section fields
          const sectionFields = fieldsBySection[section.section_id] || [];
          sectionFields.forEach((field: any) => {
            validateField(field, formValuesToSubmit[field.field_key]);
          });
        }
      });
      
      // Validate ungrouped fields
      const ungroupedFields = currentStepFormFields.filter((f: any) => !f.section_id);
      ungroupedFields.forEach((field: any) => {
        validateField(field, formValuesToSubmit[field.field_key]);
      });
      
      if (validationErrors.length > 0) {
        toast.error(validationErrors[0]); // Show first error
        return;
      }
    }
    
    // Close dialog immediately to prevent double-clicks
    setShowSubmitDialog(false);
    
    try {
      await submitForm.mutateAsync({
        ticketId,
        stepId: activeStep.ticket_step_id,
        formValues: formValuesToSubmit,
      });
      setCurrentStepFormValues({}); // Reset for next form
      resetWizardState();
      setSelectedParallelStepId(null);
      refetch();
      toast.success("Form submitted successfully! Moving to next step.");
    } catch (e: unknown) {
      // Extract error message from Axios error or generic error
      let errorMessage = "Failed to submit form";
      if (e && typeof e === 'object') {
        const axiosErr = e as { response?: { data?: { detail?: { message?: string } | string } } };
        if (axiosErr.response?.data?.detail) {
          const detail = axiosErr.response.data.detail;
          errorMessage = typeof detail === 'string' ? detail : (detail.message || errorMessage);
        } else if ((e as Error).message) {
          errorMessage = (e as Error).message;
        }
      }
      toast.error(errorMessage);
    }
  };
  
  // Reset wizard state
  const resetWizardState = () => {
    setWizardFormIndex(0);
    setAllWizardFormValues({});
    setCurrentStepFormValues({});
  };

  const handleApprove = async () => {
    const activeStep = getActiveActionStep();
    if (!activeStep) return;
    try {
      await approve.mutateAsync({
        ticketId,
        stepId: activeStep.ticket_step_id,
        comment: comment || undefined,
      });
      setShowApproveDialog(false);
      setComment("");
      setSelectedParallelStepId(null);
      refetch();
      toast.success("Request approved!");
    } catch (e: unknown) {
      let errorMessage = "Failed to approve";
      if (e && typeof e === 'object') {
        const axiosErr = e as { response?: { data?: { detail?: { message?: string } | string } } };
        if (axiosErr.response?.data?.detail) {
          const detail = axiosErr.response.data.detail;
          errorMessage = typeof detail === 'string' ? detail : (detail.message || errorMessage);
        }
      }
      toast.error(errorMessage);
    }
  };

  const handleReject = async () => {
    const activeStep = getActiveActionStep();
    if (!activeStep) return;
    try {
      await reject.mutateAsync({
        ticketId,
        stepId: activeStep.ticket_step_id,
        comment: comment || undefined,
      });
      setShowRejectDialog(false);
      setComment("");
      setSelectedParallelStepId(null);
      refetch();
      toast.success("Request rejected");
    } catch (e: unknown) {
      let errorMessage = "Failed to reject";
      if (e && typeof e === 'object') {
        const axiosErr = e as { response?: { data?: { detail?: { message?: string } | string } } };
        if (axiosErr.response?.data?.detail) {
          const detail = axiosErr.response.data.detail;
          errorMessage = typeof detail === 'string' ? detail : (detail.message || errorMessage);
        }
      }
      toast.error(errorMessage);
    }
  };

  const isRequester = ticket?.requester.email === user?.email;
  const canCancel = isRequester && 
    ticket?.status !== "COMPLETED" && 
    ticket?.status !== "CANCELLED" &&
    ticket?.status !== "REJECTED" &&
    ticket?.status !== "SKIPPED";

  if (isLoading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    );
  }

  if (error || !ticket) {
    return (
      <PageContainer>
        {error ? (
          <ErrorState
            message="Failed to load ticket"
            onRetry={() => refetch()}
          />
        ) : (
          <NotFoundError onGoBack={() => router.push("/tickets")} />
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start gap-4 pb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tickets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{ticket.workflow_name} - {ticket.ticket_id}</h1>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono">{ticket.ticket_id}</span>
            <span>•</span>
            <span>{ticket.workflow_name}</span>
            <span>•</span>
            <span>Created {formatDistanceToNow(parseUTCDate(ticket.created_at), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Ticket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The ticket will be marked as cancelled
                    and all pending steps will be stopped.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Ticket</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Cancel Ticket
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Pending Change Request Banner */}
      {ticket?.pending_change_request_id && pendingCRData && (
        <PendingCRBanner
          changeRequestId={pendingCRData.change_request?.change_request_id || ticket.pending_change_request_id}
          assignedTo={pendingCRData.change_request?.assigned_to || { email: "", display_name: "Approver" }}
          requestedAt={pendingCRData.change_request?.requested_at || new Date().toISOString()}
          onViewDetails={() => {
            // Navigate to manager change requests page
            router.push("/manager/change-requests");
          }}
          onCancel={() => {
            cancelCR.mutate(ticket.pending_change_request_id!, {
              onSuccess: () => {
                toast.success("Change request cancelled");
                refetch();
              },
              onError: (error: any) => {
                toast.error(error?.response?.data?.detail?.message || "Failed to cancel change request");
              },
            });
          }}
          canCancel={isRequester}
        />
      )}

      {/* Action Required Banner */}
      {actionableTasks.length > 0 && (
        <Card className="border-primary bg-primary/5 mb-6">
          <CardContent className="py-4">
            {/* Multiple parallel forms indicator */}
            {formActionSteps.length > 1 && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  📋 {formActionSteps.length} parallel forms need your attention
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  These forms are part of parallel branches. Submit each one to proceed.
                </p>
              </div>
            )}
            
            {/* Render action buttons for each actionable task */}
            <div className="space-y-3">
              {actionableTasks.map((task: any, index: number) => (
                <div key={task.ticket_step_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      task.step_type === "FORM_STEP" ? "bg-primary/10" :
                      task.step_type === "APPROVAL_STEP" ? "bg-emerald-100 dark:bg-emerald-900/20" :
                      "bg-blue-100 dark:bg-blue-900/20"
                    }`}>
                      <AlertCircle className={`h-5 w-5 ${
                        task.step_type === "FORM_STEP" ? "text-primary" :
                        task.step_type === "APPROVAL_STEP" ? "text-emerald-600" :
                        "text-blue-600"
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {actionableTasks.length > 1 ? `${index + 1}. ` : ""}{task.step_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.step_type === "FORM_STEP" 
                          ? "Submit form to proceed"
                          : task.step_type === "APPROVAL_STEP"
                          ? "Waiting for your approval"
                          : "Action needed"
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {task.available_actions.includes("submit_form") && (
                      <Button 
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                        onClick={() => {
                          setSelectedParallelStepId(task.ticket_step_id);
                          setShowSubmitDialog(true);
                        }}
                        disabled={submitForm.isPending}
                      >
                        {submitForm.isPending ? "..." : "Submit"}
                      </Button>
                    )}
                    {task.available_actions.includes("approve") && (
                      <Button 
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          setSelectedParallelStepId(task.ticket_step_id);
                          setShowApproveDialog(true);
                        }}
                        disabled={approve.isPending}
                      >
                        Approve
                      </Button>
                    )}
                    {task.available_actions.includes("reject") && (
                      <Button 
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedParallelStepId(task.ticket_step_id);
                          setShowRejectDialog(true);
                        }}
                        disabled={reject.isPending}
                      >
                        Reject
                      </Button>
                    )}
                    {task.available_actions.includes("respond_info") && (
                      <Button 
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                        onClick={() => setShowRespondInfoDialog(true)}
                        disabled={respondInfo.isPending}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Respond to Info Request
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Info Request Banner - Only show if current user can respond */}
      {actionableTasks.some((task: any) => task.available_actions?.includes("respond_info")) && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-200 dark:bg-amber-800/50 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                </div>
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Information Requested
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {infoRequests.filter(ir => !ir.response_text).length} pending request(s) awaiting your response
                  </p>
                </div>
              </div>
              <Button 
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => setShowRespondInfoDialog(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Respond Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">
                <FileText className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <History className="h-4 w-4 mr-2" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="messages">
                <MessageSquare className="h-4 w-4 mr-2" />
                Messages
                {(() => {
                  // Count total messages: info requests + all notes from steps + requester notes
                  const stepNotesCount = steps.reduce((acc: number, s: any) => 
                    acc + (s.data?.notes?.length || 0), 0
                  );
                  const requesterNotesCount = ticket?.requester_notes?.length || 0;
                  const totalCount = infoRequests.length + stepNotesCount + requesterNotesCount;
                  return totalCount > 0 ? (
                    <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
                  ) : null;
                })()}
              </TabsTrigger>
              <TabsTrigger value="attachments">
                <Paperclip className="h-4 w-4 mr-2" />
                Attachments
                {attachmentCount > 0 && (
                  <Badge variant="secondary" className="ml-2">{attachmentCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-6">
              {/* Description */}
              {ticket.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {ticket.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Form Values - Grouped by Form Step with Colors */}
              {(() => {
                // Collect all form steps (including branch forms)
                const allFormSteps = steps.filter((s: any) => s.step_type === "FORM_STEP");
                const hasMainFormValues = Object.keys(displayFormValues).length > 0;
                const hasBranchFormValues = allFormSteps.some((s: any) => 
                  s.data?.form_values && Object.keys(s.data.form_values).length > 0
                );
                
                if (!hasMainFormValues && !hasBranchFormValues) {
                  return null;
                }
                
                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">Request Details</CardTitle>
                          <CardDescription>
                            Information collected from {allFormSteps.filter(s => s.state === "COMPLETED").length} form(s)
                          </CardDescription>
                        </div>
                        {/* Version Selector - show when multiple versions exist */}
                        {versionsData && versionsData.versions && versionsData.versions.length > 1 && (
                          <VersionSelector
                            versions={versionsData.versions}
                            currentVersion={viewingVersion || ticket?.form_version || 1}
                            onVersionSelect={(version) => {
                              const currentVer = ticket?.form_version || 1;
                              if (version === currentVer) {
                                // Switch back to current version
                                setViewingVersion(null);
                                toast.success("Viewing current version");
                              } else {
                                // View historical version
                                setViewingVersion(version);
                                toast.info(`Viewing Version ${version} (${version === 1 ? 'Original' : 'Historical'})`);
                              }
                            }}
                            onCompare={() => {
                              // Open compare dialog: version 1 (original) vs latest version
                              const latestVersion = versionsData?.versions 
                                ? Math.max(...versionsData.versions.map(v => v.version))
                                : ticket?.form_version || 2;
                              setCompareVersions({ v1: 1, v2: latestVersion });
                              setShowVersionCompare(true);
                            }}
                          />
                        )}
                      </div>
                      {/* Show version update indicator if form was updated via CR */}
                      {!viewingVersion && ticket?.form_version && ticket.form_version > 1 && versionsData?.versions && (
                        <div className="mt-2">
                          <VersionUpdateIndicator
                            currentVersion={ticket.form_version}
                            approvedBy={versionsData.versions.find(v => v.version === ticket.form_version)?.approved_by}
                            approvedAt={versionsData.versions.find(v => v.version === ticket.form_version)?.created_at}
                            changeRequestId={versionsData.versions.find(v => v.version === ticket.form_version)?.change_request_id}
                          />
                        </div>
                      )}
                      {/* Historical version viewing banner */}
                      {viewingVersion && viewingVersionData && (
                        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <History className="h-4 w-4 text-amber-600" />
                              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                Viewing Version {viewingVersion} {viewingVersion === 1 ? "(Original Submission)" : "(Historical)"}
                              </span>
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                • {new Date(viewingVersionData.created_at).toLocaleString()}
                                {viewingVersionData.created_by?.display_name && ` by ${viewingVersionData.created_by.display_name}`}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingVersion(null)}
                              className="text-amber-700 border-amber-300 hover:bg-amber-100"
                            >
                              Back to Current Version
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        // Helper to format field values for display
                        const formatValue = (value: any): string => {
                          if (value === undefined || value === null || value === "") return "-";
                          if (typeof value === "boolean") return value ? "Yes" : "No";
                          if (Array.isArray(value)) {
                            // Check if it's attachment IDs
                            const attachmentIds = value.filter((v: string) => typeof v === "string" && v.startsWith("ATT-"));
                            if (attachmentIds.length > 0) {
                              return `${attachmentIds.length} file(s) attached`;
                            }
                            return value.join(", ") || "-";
                          }
                          if (typeof value === "string" && value.startsWith("ATT-")) {
                            return "1 file attached";
                          }
                          // Handle LOOKUP_USER_SELECT and USER_SELECT objects
                          if (typeof value === "object" && value !== null) {
                            if (value.display_name || value.email) {
                              const isPrimary = value.is_primary ? " (Primary)" : "";
                              return (value.display_name || value.email) + isPrimary;
                            }
                          }
                          return String(value);
                        };
                        
                        // Group form values by their form step
                        const formGroups: Array<{
                          stepName: string;
                          stepState: string;
                          completedAt?: string;
                          assignedTo?: { display_name: string; email: string };
                          fields: Array<{ key: string; label: string; value: any }>;
                          repeatingSections?: Array<{
                            sectionTitle: string;
                            rows: Array<Array<{ key: string; label: string; value: any }>>;
                          }>;
                          colorClass: string;
                          branchName?: string;
                          isBranchForm?: boolean;
                        }> = [];

                        // Color palette for different forms
                        const colorClasses = [
                          "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                          "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                          "border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20",
                          "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
                          "border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20",
                          "border-l-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20",
                        ];

                        allFormSteps.forEach((step: any, idx: number) => {
                          const stepFields = step.data?.fields || [];
                          const stepSections = step.data?.sections || [];
                          const fieldsWithValues: Array<{ key: string; label: string; value: any }> = [];
                          const repeatingSections: Array<{
                            sectionTitle: string;
                            rows: Array<Array<{ key: string; label: string; value: any }>>;
                          }> = [];
                          
                          // Check if this is a branch form (has branch_id or branch_name)
                          const isBranchForm = !!(step.branch_id || step.data?.branch_id || step.branch_name || step.data?.branch_name);
                          const branchName = step.data?.branch_name || step.branch_name;
                          
                          // Get form values - check branch form_values first, then displayFormValues (supports historical versions)
                          const formValues = isBranchForm && step.data?.form_values 
                            ? step.data.form_values 
                            : displayFormValues;

                          // Handle repeating sections - first try from sections array
                          const processedSectionIds = new Set<string>();
                          
                          stepSections.forEach((section: any) => {
                            if (section.is_repeating) {
                              processedSectionIds.add(section.section_id);
                              const sectionDataKey = `__section_${section.section_id}`;
                              const rows = formValues[sectionDataKey];
                              
                              if (Array.isArray(rows) && rows.length > 0) {
                                // Get fields that belong to this section
                                const sectionFields = stepFields.filter(
                                  (f: any) => f.section_id === section.section_id
                                );
                                
                                const formattedRows = rows.map((rowData: any) => {
                                  return sectionFields.map((field: any) => ({
                                    key: field.field_key,
                                    label: field.field_label,
                                    value: rowData[field.field_key],
                                  })).filter((f: any) => f.value !== undefined);
                                });
                                
                                if (formattedRows.some((row: any) => row.length > 0)) {
                                  repeatingSections.push({
                                    sectionTitle: section.section_title || step.step_name,
                                    rows: formattedRows,
                                  });
                                }
                              }
                            }
                          });
                          
                          // Fallback: Check for __section_ keys in formValues that weren't processed
                          // This handles existing tickets where sections weren't stored in step.data
                          Object.keys(formValues).forEach((key) => {
                            if (key.startsWith('__section_')) {
                              const sectionId = key.replace('__section_', '');
                              
                              // Skip if already processed
                              if (processedSectionIds.has(sectionId)) return;
                              
                              const rows = formValues[key];
                              if (!Array.isArray(rows) || rows.length === 0) return;
                              
                              // Find fields that belong to this section
                              const sectionFields = stepFields.filter(
                                (f: any) => f.section_id === sectionId
                              );
                              
                              if (sectionFields.length === 0) return;
                              
                              const formattedRows = rows.map((rowData: any) => {
                                return sectionFields.map((field: any) => ({
                                  key: field.field_key,
                                  label: field.field_label,
                                  value: rowData[field.field_key],
                                })).filter((f: any) => f.value !== undefined);
                              });
                              
                              if (formattedRows.some((row: any) => row.length > 0)) {
                                // Try to find section title from the first field's section
                                const sectionTitle = stepSections.find(
                                  (s: any) => s.section_id === sectionId
                                )?.section_title || step.step_name;
                                
                                repeatingSections.push({
                                  sectionTitle,
                                  rows: formattedRows,
                                });
                                
                                // Mark fields as processed
                                sectionFields.forEach((f: any) => processedSectionIds.add(f.field_key));
                              }
                            }
                          });

                          // Handle regular fields (not in repeating sections)
                          const repeatingFieldKeys = new Set<string>();
                          
                          // From defined sections
                          stepSections.forEach((section: any) => {
                            if (section.is_repeating) {
                              stepFields
                                .filter((f: any) => f.section_id === section.section_id)
                                .forEach((f: any) => repeatingFieldKeys.add(f.field_key));
                            }
                          });
                          
                          // Also exclude fields that belong to detected repeating sections
                          Object.keys(formValues).forEach((key) => {
                            if (key.startsWith('__section_')) {
                              const sectionId = key.replace('__section_', '');
                              stepFields
                                .filter((f: any) => f.section_id === sectionId)
                                .forEach((f: any) => repeatingFieldKeys.add(f.field_key));
                            }
                          });

                          stepFields.forEach((field: any) => {
                            // Skip fields that are part of repeating sections
                            if (repeatingFieldKeys.has(field.field_key)) return;
                            
                            if (formValues[field.field_key] !== undefined) {
                              fieldsWithValues.push({
                                key: field.field_key,
                                label: field.field_label,
                                value: formValues[field.field_key],
                              });
                            }
                          });

                          if (fieldsWithValues.length > 0 || repeatingSections.length > 0) {
                            formGroups.push({
                              stepName: step.step_name,
                              stepState: step.state,
                              completedAt: step.completed_at,
                              assignedTo: step.assigned_to,
                              fields: fieldsWithValues,
                              repeatingSections: repeatingSections.length > 0 ? repeatingSections : undefined,
                              colorClass: colorClasses[idx % colorClasses.length],
                              branchName: branchName,
                              isBranchForm: isBranchForm,
                            });
                          }
                        });

                      // If no grouped fields found (legacy data), show flat list
                      if (formGroups.length === 0) {
                        return (
                          <dl className="grid gap-3 text-sm">
                            {Object.entries(displayFormValues).map(([key, value]) => (
                              <div key={key} className="grid grid-cols-3 gap-2">
                                <dt className="font-medium text-muted-foreground">
                                  {getFieldLabel(key)}
                                </dt>
                                <dd className="col-span-2 break-all min-w-0">
                                  {typeof value === "boolean"
                                    ? value ? "Yes" : "No"
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        );
                      }

                      return formGroups.map((group, gIdx) => (
                        <div 
                          key={gIdx} 
                          className={`rounded-lg border-l-4 p-4 ${group.colorClass}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{group.stepName}</span>
                              {group.isBranchForm && group.branchName && (
                                <Badge variant="outline" className="text-xs">
                                  <GitBranch className="h-3 w-3 mr-1" />
                                  {group.branchName}
                                </Badge>
                              )}
                              {group.stepState === "COMPLETED" && (
                                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                                  Completed
                                </Badge>
                              )}
                            </div>
                            {group.completedAt && (
                              <span className="text-xs text-muted-foreground">
                                {format(parseUTCDate(group.completedAt), "MMM d, yyyy h:mm a")}
                              </span>
                            )}
                          </div>
                          {group.assignedTo && (
                            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Filled by: {group.assignedTo.display_name || group.assignedTo.email}
                            </div>
                          )}
                          {/* Regular fields */}
                          {group.fields.length > 0 && (
                            <dl className="grid gap-2 text-sm">
                              {group.fields.map((field) => (
                                <div key={field.key} className="grid grid-cols-3 gap-2">
                                  <dt className="text-muted-foreground">{field.label}</dt>
                                  <dd className="col-span-2 font-medium break-all min-w-0">
                                    {formatValue(field.value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          
                          {/* Repeating sections */}
                          {group.repeatingSections?.map((section, sIdx) => (
                            <div key={sIdx} className="mt-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                {section.sectionTitle} ({section.rows.length} row{section.rows.length !== 1 ? 's' : ''})
                              </div>
                              <div className="space-y-2">
                                {section.rows.map((row, rIdx) => (
                                  <div 
                                    key={rIdx} 
                                    className="bg-white/50 dark:bg-gray-800/50 rounded-md p-3 border border-gray-200 dark:border-gray-700"
                                  >
                                    <div className="text-xs text-muted-foreground mb-1">Row {rIdx + 1}</div>
                                    <dl className="grid gap-1.5 text-sm">
                                      {row.map((field) => (
                                        <div key={field.key} className="grid grid-cols-3 gap-2">
                                          <dt className="text-muted-foreground text-xs">{field.label}</dt>
                                          <dd className="col-span-2 font-medium break-all min-w-0">
                                            {formatValue(field.value)}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
                );
              })()}

              {/* Workflow Steps */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Workflow Progress</CardTitle>
                  <CardDescription>
                    {steps.filter(s => s.state === "COMPLETED").length} of {steps.length} steps completed
                    {ticket?.active_branches && ticket.active_branches.length > 0 && (
                      <span className="ml-2 text-rose-500">
                        • {ticket.active_branches.length} parallel branch(es) active
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Parallel Branches Summary (if any active) */}
                  {ticket?.active_branches && ticket.active_branches.length > 0 && (
                    <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-rose-500/10 to-orange-500/10 border border-rose-500/20">
                      <p className="text-xs font-medium text-rose-600 dark:text-rose-400 mb-2">
                        Parallel Execution in Progress
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ticket.active_branches.map((branch: any) => (
                          <Badge 
                            key={branch.branch_id} 
                            variant="outline"
                            className="text-xs"
                            style={{ borderLeftColor: branch.color || '#3b82f6', borderLeftWidth: '3px' }}
                          >
                            {branch.branch_name}: {branch.state}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <WorkflowStepsDisplay 
                    steps={steps} 
                    ticket={ticket}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Activity Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {auditEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No activity yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {auditEvents.map((event, index) => (
                        <div key={event.audit_event_id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <EventIcon type={event.event_type} />
                            </div>
                            {index < auditEvents.length - 1 && (
                              <div className="w-0.5 h-full bg-border mt-2" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="font-medium text-sm">
                              {formatEventType(event.event_type)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              by {event.actor.display_name} •{" "}
                              {format(parseUTCDate(event.timestamp), "MMM d, h:mm a")}
                            </p>
                            {event.details && Object.keys(event.details).length > 0 && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                {formatEventDetails(event.event_type, event.details)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="mt-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-white" />
                    </div>
                    Communication Hub
                  </CardTitle>
                  <CardDescription>
                    All messages and notes organized in one place
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <Tabs defaultValue="info-requests" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 mb-4">
                      <TabsTrigger value="info-requests" className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        Info Requests
                        {infoRequests.length > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                            {infoRequests.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="notes" className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                        Notes
                        {(() => {
                          const stepNotesCount = steps.reduce((acc: number, s: any) => 
                            acc + (s.data?.notes?.length || 0), 0
                          );
                          const requesterNotesCount = ticket?.requester_notes?.length || 0;
                          const totalNotesCount = stepNotesCount + requesterNotesCount;
                          return totalNotesCount > 0 ? (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                              {totalNotesCount}
                            </Badge>
                          ) : null;
                        })()}
                      </TabsTrigger>
                    </TabsList>

                    {/* Info Requests Tab */}
                    <TabsContent value="info-requests" className="mt-0">
                      {infoRequests.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed">
                          <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-3">
                            <MessageSquare className="h-7 w-7 text-blue-500" />
                          </div>
                          <p className="text-sm font-medium text-foreground">No information requests</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            When someone requests more information, it will appear here
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Sort info requests by requested_at descending (newest first) */}
                          {[...infoRequests]
                            .sort((a: any, b: any) => {
                              const dateA = new Date(a.requested_at).getTime();
                              const dateB = new Date(b.requested_at).getTime();
                              // Handle invalid dates - push them to the end
                              if (isNaN(dateA) && isNaN(dateB)) return 0;
                              if (isNaN(dateA)) return 1;
                              if (isNaN(dateB)) return -1;
                              return dateB - dateA; // Newest first
                            })
                            .map((req: any, reqIndex: number) => {
                            const step = steps.find((s: any) => s.ticket_step_id === req.ticket_step_id);
                            const isPending = req.status === "OPEN" && !req.response_text;
                            const isApprovalStep = step?.step_type === 'APPROVAL_STEP';
                            const isTaskStep = step?.step_type === 'TASK_STEP';
                            
                            // Calculate response time if both timestamps exist and are valid
                            const getResponseTime = () => {
                              if (!req.responded_at || !req.requested_at) return null;
                              try {
                                const requestedDate = new Date(req.requested_at);
                                const respondedDate = new Date(req.responded_at);
                                
                                // Validate both dates
                                if (isNaN(requestedDate.getTime()) || isNaN(respondedDate.getTime())) return null;
                                
                                const diffMs = respondedDate.getTime() - requestedDate.getTime();
                                // Response must be after request (with small tolerance for same-second responses)
                                if (diffMs < -1000) return null; // Invalid: response before request
                                if (diffMs <= 0) return "<1m"; // Same time or within tolerance
                                
                                const diffMins = Math.floor(diffMs / 60000);
                                const diffHours = Math.floor(diffMins / 60);
                                const diffDays = Math.floor(diffHours / 24);
                                if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
                                if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
                                if (diffMins > 0) return `${diffMins}m`;
                                return "<1m";
                              } catch { return null; }
                            };
                            const responseTime = getResponseTime();
                            
                            return (
                              <div 
                                key={req.info_request_id} 
                                className={`rounded-xl border overflow-hidden ${
                                  isPending 
                                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10' 
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                }`}
                              >
                                {/* Request Header - Enhanced with more metadata */}
                                <div className="px-4 py-3 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/50 border-b flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                      #{reqIndex + 1}
                                    </span>
                                    {step && (
                                      <Badge 
                                        variant="outline" 
                                        className={`text-[10px] font-medium ${
                                          isApprovalStep 
                                            ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300' 
                                            : isTaskStep 
                                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                                            : ''
                                        }`}
                                      >
                                        {isApprovalStep ? '✓ Approval' : isTaskStep ? '📋 Task' : '📝 Step'}: {step.step_name}
                                      </Badge>
                                    )}
                                    {responseTime && !isPending && (
                                      <Badge variant="outline" className="text-[10px] font-normal border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        ⏱ Response: {responseTime}
                                      </Badge>
                                    )}
                                  </div>
                                  <Badge 
                                    variant={isPending ? "destructive" : "secondary"}
                                    className={`text-[10px] ${!isPending ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : ''}`}
                                  >
                                    {isPending ? "⏳ Awaiting Response" : "✅ Responded"}
                                  </Badge>
                                </div>

                                {/* Chat-like Thread */}
                                <div className="p-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-900">
                                  {/* Question Message (Right aligned - sender) */}
                                  <div className="flex justify-end">
                                    <div className="max-w-[85%]">
                                      <div className="flex items-center justify-end gap-2 mb-1.5">
                                        <div className="flex flex-col items-end">
                                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                            {req.requested_by?.display_name || "Unknown"}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {(() => {
                                              try {
                                                const date = new Date(req.requested_at);
                                                return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                              } catch { return "Unknown"; }
                                            })()}
                                          </span>
                                        </div>
                                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium shadow-md ring-2 ring-white dark:ring-slate-800">
                                          {req.requested_by?.display_name?.charAt(0) || "?"}
                                        </div>
                                      </div>
                                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
                                        {req.subject && (
                                          <div className="font-semibold text-sm mb-2 pb-2 border-b border-blue-400/30 flex items-center gap-1.5">
                                            <span className="text-blue-200">📌</span>
                                            {req.subject}
                                          </div>
                                        )}
                                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{req.question_text}</p>
                                        {req.requested_from && (
                                          <div className="text-[11px] text-blue-100 mt-3 pt-2 border-t border-blue-400/30 flex items-center gap-1.5">
                                            <span className="text-blue-200">📤</span>
                                            Sent to: <span className="font-medium">{req.requested_from.display_name || req.requested_from.email}</span>
                                          </div>
                                        )}
                                      </div>
                                      {/* Request Attachments */}
                                      {req.request_attachment_ids && req.request_attachment_ids.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2 justify-end">
                                          <span className="text-[10px] text-muted-foreground w-full text-right mb-1">📎 Attachments:</span>
                                          {req.request_attachment_ids.map((attId: string) => (
                                            <AttachmentChip key={attId} attachmentId={attId} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Response Message (Left aligned - receiver) */}
                                  {req.response_text ? (
                                    <div className="flex justify-start">
                                      <div className="max-w-[85%]">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-sm font-medium shadow-md ring-2 ring-white dark:ring-slate-800">
                                            {(req.responded_by?.display_name || req.requested_from?.display_name || "?").charAt(0)}
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                              {req.responded_by?.display_name || req.requested_from?.display_name || "Unknown"}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                              {(() => {
                                                try {
                                                  // If no responded_at, try to use a reasonable fallback
                                                  if (!req.responded_at) {
                                                    // If we have response but no timestamp, show "just now" or similar
                                                    return req.response_text ? "Recently responded" : "";
                                                  }
                                                  const respondedDate = new Date(req.responded_at);
                                                  const requestedDate = new Date(req.requested_at);
                                                  
                                                  // Validate dates are valid
                                                  if (isNaN(respondedDate.getTime()) || isNaN(requestedDate.getTime())) {
                                                    return req.response_text ? "Recently responded" : "";
                                                  }
                                                  
                                                  // Validate: response must be after request
                                                  if (respondedDate.getTime() < requestedDate.getTime()) {
                                                    // Invalid data - response before request, likely data issue
                                                    return "Response time not recorded";
                                                  }
                                                  
                                                  return `${respondedDate.toLocaleDateString()} at ${respondedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                } catch { return "Response time unavailable"; }
                                              })()}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg">
                                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{req.response_text}</p>
                                        </div>
                                        {/* Response Attachments */}
                                        {req.response_attachment_ids && req.response_attachment_ids.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="text-[10px] text-muted-foreground w-full mb-1">📎 Attachments:</span>
                                            {req.response_attachment_ids.map((attId: string) => (
                                              <AttachmentChip key={attId} attachmentId={attId} />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex justify-start">
                                      <div className="bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/20 text-amber-700 dark:text-amber-300 rounded-2xl rounded-tl-sm px-4 py-3 text-sm border border-amber-200 dark:border-amber-800/50">
                                        <div className="flex items-center gap-2">
                                          <div className="animate-pulse">⏳</div>
                                          <span>Waiting for response from <span className="font-medium">{req.requested_from?.display_name || req.requested_from?.email || "recipient"}</span></span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>

                    {/* Notes Tab - Enhanced with role tags */}
                    <TabsContent value="notes" className="mt-0">
                      {(() => {
                        // Collect all step-based notes with step context
                        const allStepNotes: Array<{
                          note: any;
                          stepName: string;
                          stepType: string;
                          stepId: string;
                        }> = [];

                        steps.forEach((step: any) => {
                          if (step.data?.notes && Array.isArray(step.data.notes)) {
                            step.data.notes.forEach((note: any) => {
                              allStepNotes.push({
                                note,
                                stepName: step.step_name,
                                stepType: step.step_type,
                                stepId: step.ticket_step_id,
                              });
                            });
                          }
                        });

                        // Sort step notes by timestamp (newest first) with validation
                        allStepNotes.sort((a, b) => {
                          const dateA = new Date(a.note.timestamp).getTime();
                          const dateB = new Date(b.note.timestamp).getTime();
                          if (isNaN(dateA) && isNaN(dateB)) return 0;
                          if (isNaN(dateA)) return 1;
                          if (isNaN(dateB)) return -1;
                          return dateB - dateA;
                        });

                        // Get requester notes from ticket
                        const requesterNotes = ticket?.requester_notes || [];

                        // Check if ticket is in terminal state (can't add notes)
                        const canAddRequesterNote = isRequester && 
                          ticket?.status !== "COMPLETED" && 
                          ticket?.status !== "CANCELLED" &&
                          ticket?.status !== "REJECTED" &&
                          ticket?.status !== "SKIPPED";

                        const handleAddRequesterNote = async () => {
                          if (!requesterNoteContent.trim()) return;
                          
                          try {
                            await addRequesterNote.mutateAsync({
                              ticketId,
                              content: requesterNoteContent.trim(),
                            });
                            setRequesterNoteContent("");
                          } catch (error) {
                            // Error is handled by the hook
                          }
                        };

                        // Check if there are any notes at all
                        const hasAnyNotes = allStepNotes.length > 0 || requesterNotes.length > 0;

                        // Group step notes by type
                        const approvalNotes = allStepNotes.filter(n => n.stepType === 'APPROVAL_STEP');
                        const taskNotes = allStepNotes.filter(n => n.stepType === 'TASK_STEP');
                        const otherNotes = allStepNotes.filter(n => n.stepType !== 'APPROVAL_STEP' && n.stepType !== 'TASK_STEP');

                        const renderNoteGroup = (notes: typeof allStepNotes, groupTitle: string, colorScheme: { bg: string; border: string; headerBg: string; iconBg: string; avatarFrom: string; avatarTo: string; badge: string }) => {
                          if (notes.length === 0) return null;
                          
                          const notesByStep = notes.reduce((acc, item) => {
                            const key = item.stepId;
                            if (!acc[key]) {
                              acc[key] = {
                                stepName: item.stepName,
                                stepType: item.stepType,
                                notes: []
                              };
                            }
                            acc[key].notes.push(item.note);
                            return acc;
                          }, {} as Record<string, { stepName: string; stepType: string; notes: any[] }>);

                          return (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className={`h-6 w-6 rounded-md ${colorScheme.iconBg} flex items-center justify-center text-white text-xs`}>
                                  {groupTitle.includes('Approval') ? '✓' : groupTitle.includes('Task') ? '📋' : '📝'}
                                </div>
                                <span className="text-sm font-semibold text-foreground">{groupTitle}</span>
                                <Badge className={`text-[10px] ${colorScheme.badge}`}>
                                  {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                                </Badge>
                              </div>
                              
                              {Object.entries(notesByStep).map(([stepId, { stepName, notes: stepNotes }]) => (
                                <div key={stepId} className={`rounded-xl border ${colorScheme.border} overflow-hidden`}>
                                  <div className={`px-4 py-2.5 ${colorScheme.headerBg} border-b ${colorScheme.border} flex items-center justify-between`}>
                                    <span className="text-sm font-medium text-foreground">{stepName}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {stepNotes.length} {stepNotes.length === 1 ? 'note' : 'notes'}
                                    </span>
                                  </div>

                                  <div className={`divide-y ${colorScheme.bg}`}>
                                    {stepNotes.map((note: any, idx: number) => (
                                      <div key={idx} className="p-4 hover:bg-white/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-start gap-3">
                                          <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${colorScheme.avatarFrom} ${colorScheme.avatarTo} flex items-center justify-center text-white text-sm font-semibold shadow-md ring-2 ring-white dark:ring-slate-800 shrink-0`}>
                                            {note.actor?.display_name?.charAt(0)?.toUpperCase() || '?'}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-foreground">
                                                  {note.actor?.display_name || 'Unknown'}
                                                </span>
                                                {note.actor?.email && (
                                                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                    ({note.actor.email})
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-[11px] text-muted-foreground shrink-0">
                                                {(() => {
                                                  try {
                                                    const date = new Date(note.timestamp);
                                                    return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                  } catch { return ""; }
                                                })()}
                                              </span>
                                            </div>
                                            <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                                              {note.content}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        };

                        // Render requester notes section
                        const renderRequesterNotes = () => {
                          if (requesterNotes.length === 0) return null;
                          
                          return (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-emerald-500 flex items-center justify-center text-white text-xs">
                                  👤
                                </div>
                                <span className="text-sm font-semibold text-foreground">Requester Notes</span>
                                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                                  {requesterNotes.length} {requesterNotes.length === 1 ? 'note' : 'notes'}
                                </Badge>
                              </div>
                              
                              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                                <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">Updates from {ticket?.requester?.display_name || 'Requester'}</span>
                                  <Badge variant="outline" className="text-[10px] border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                                    Ticket Owner
                                  </Badge>
                                </div>

                                <div className="divide-y divide-emerald-100 dark:divide-emerald-900/30">
                                  {[...requesterNotes]
                                    .sort((a: any, b: any) => {
                                      const dateA = new Date(a.created_at).getTime();
                                      const dateB = new Date(b.created_at).getTime();
                                      if (isNaN(dateA) && isNaN(dateB)) return 0;
                                      if (isNaN(dateA)) return 1;
                                      if (isNaN(dateB)) return -1;
                                      return dateB - dateA;
                                    })
                                    .map((note: any, idx: number) => (
                                    <div key={note.note_id || idx} className="p-4 hover:bg-white/50 dark:hover:bg-slate-800/30 transition-colors">
                                      <div className="flex items-start gap-3">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-sm font-semibold shadow-md ring-2 ring-white dark:ring-slate-800 shrink-0">
                                          {note.actor?.display_name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-sm text-foreground">
                                                {note.actor?.display_name || 'Requester'}
                                              </span>
                                              <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 h-4 px-1">
                                                Requester
                                              </Badge>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground shrink-0">
                                              {(() => {
                                                try {
                                                  const date = new Date(note.created_at);
                                                  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                } catch { return ""; }
                                              })()}
                                            </span>
                                          </div>
                                          <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap leading-relaxed bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
                                            {note.content}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-6">
                            {/* Requester Actions - Only for requesters on active tickets */}
                            {canAddRequesterNote && (
                              <div className="space-y-4">
                                {/* Requester Attachments Section - Separate from notes */}
                                <RequesterAttachments
                                  ticketId={ticketId}
                                  queryKey={['tickets', ticketId]}
                                  canUpload={true}
                                  defaultExpanded={false}
                                />
                                
                                {/* Requester Note Input - Just for text notes */}
                                <div className="rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="h-6 w-6 rounded-md bg-emerald-500 flex items-center justify-center text-white text-xs">
                                      ✏️
                                    </div>
                                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Add Note</span>
                                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                      Share updates or additional information
                                    </span>
                                  </div>
                                  <div className="space-y-3">
                                    <Textarea
                                      placeholder="Add a note to your request... (Press Enter to send, Shift+Enter for new line)"
                                      value={requesterNoteContent}
                                      onChange={(e) => setRequesterNoteContent(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleAddRequesterNote();
                                        }
                                      }}
                                      className="w-full min-h-[80px] resize-none bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-700 focus:border-emerald-400 focus:ring-emerald-400"
                                    />
                                  </div>
                                  <div className="flex justify-between items-center mt-3">
                                    <span className="text-[10px] text-muted-foreground">
                                      Relevant team members will be notified
                                    </span>
                                    <Button
                                      size="sm"
                                      onClick={handleAddRequesterNote}
                                      disabled={!requesterNoteContent.trim() || addRequesterNote.isPending}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      {addRequesterNote.isPending ? (
                                        <>
                                          <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                                          Sending...
                                        </>
                                      ) : (
                                        <>
                                          <Send className="h-3 w-3 mr-1.5" />
                                          Send Note
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Show empty state if no notes exist */}
                            {!hasAnyNotes && !canAddRequesterNote && (
                              <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed">
                                <div className="h-14 w-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-3">
                                  <MessageSquare className="h-7 w-7 text-purple-500" />
                                </div>
                                <p className="text-sm font-medium text-foreground">No notes yet</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Notes added will appear here
                                </p>
                              </div>
                            )}

                            {/* Requester Notes - Green theme (shown first for visibility) */}
                            {renderRequesterNotes()}
                            
                            {/* Approval Notes - Orange theme */}
                            {renderNoteGroup(approvalNotes, 'Approval Notes (Manager/Approver)', {
                              bg: 'divide-orange-100 dark:divide-orange-900/30',
                              border: 'border-orange-200 dark:border-orange-800',
                              headerBg: 'bg-orange-50 dark:bg-orange-950/30',
                              iconBg: 'bg-orange-500',
                              avatarFrom: 'from-orange-500',
                              avatarTo: 'to-amber-500',
                              badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                            })}
                            
                            {/* Task Notes - Blue theme */}
                            {renderNoteGroup(taskNotes, 'Task Notes (Agent)', {
                              bg: 'divide-blue-100 dark:divide-blue-900/30',
                              border: 'border-blue-200 dark:border-blue-800',
                              headerBg: 'bg-blue-50 dark:bg-blue-950/30',
                              iconBg: 'bg-blue-500',
                              avatarFrom: 'from-blue-500',
                              avatarTo: 'to-indigo-500',
                              badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                            })}
                            
                            {/* Other Notes - Purple theme */}
                            {renderNoteGroup(otherNotes, 'Other Notes', {
                              bg: 'divide-purple-100 dark:divide-purple-900/30',
                              border: 'border-purple-200 dark:border-purple-800',
                              headerBg: 'bg-purple-50 dark:bg-purple-950/30',
                              iconBg: 'bg-purple-500',
                              avatarFrom: 'from-purple-500',
                              avatarTo: 'to-indigo-500',
                              badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            })}
                          </div>
                        );
                      })()}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attachments" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="h-5 w-5" />
                    Attachments
                  </CardTitle>
                  <CardDescription>
                    Files attached to this ticket
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AttachmentsList ticketId={ticketId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Requester</p>
                <UserPill user={ticket.requester} showEmail size="sm" />
              </div>
              {ticket.manager_snapshot && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Your Manager (from AD)</p>
                  <UserPill user={ticket.manager_snapshot} showEmail size="sm" />
                </div>
              )}
              
              {/* Show current step assignee */}
              {steps.find(s => s.state === "ACTIVE" || s.state === "WAITING_FOR_APPROVAL")?.assigned_to && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      Current Step Assigned To
                    </p>
                    {steps.find(s => s.state === "ACTIVE" || s.state === "WAITING_FOR_APPROVAL")?.assigned_to ? (
                      <UserPill 
                        user={steps.find(s => s.state === "ACTIVE" || s.state === "WAITING_FOR_APPROVAL")!.assigned_to!} 
                        showEmail 
                        size="sm" 
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">Not yet assigned</span>
                    )}
                    <p className="text-xs text-muted-foreground italic">
                      {steps.find(s => s.state === "ACTIVE" || s.state === "WAITING_FOR_APPROVAL")?.step_type === "APPROVAL_STEP" 
                        ? "Waiting for approval from this person"
                        : steps.find(s => s.state === "ACTIVE" || s.state === "WAITING_FOR_APPROVAL")?.step_type === "FORM_STEP"
                        ? "You need to submit the form"
                        : "Working on this step"
                      }
                    </p>
                  </div>
                </>
              )}
              
              <Separator />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">
                  {format(parseUTCDate(ticket.created_at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm">
                  {format(parseUTCDate(ticket.updated_at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              {ticket.due_at && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <SlaIndicator dueAt={ticket.due_at} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {actionableTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Available Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionableTasks.map((task) => (
                  <div key={task.ticket_step_id} className="space-y-2">
                    <p className="text-sm font-medium">{task.step_name}</p>
                    <div className="flex flex-wrap gap-2">
                      {task.available_actions.map((action) => (
                        <Button 
                          key={action} 
                          size="sm" 
                          variant={action === "respond_info" ? "default" : "outline"}
                          className={action === "respond_info" ? "bg-amber-600 hover:bg-amber-700" : ""}
                          onClick={() => {
                            if (action === "respond_info") {
                              setShowRespondInfoDialog(true);
                            } else if (action === "submit_form") {
                              setSelectedParallelStepId(task.ticket_step_id);
                              setShowSubmitDialog(true);
                            } else if (action === "approve") {
                              setSelectedParallelStepId(task.ticket_step_id);
                              setShowApproveDialog(true);
                            } else if (action === "reject") {
                              setSelectedParallelStepId(task.ticket_step_id);
                              setShowRejectDialog(true);
                            }
                          }}
                        >
                          {formatAction(action)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Submit Form Dialog - with Wizard support for consecutive forms */}
      <Dialog open={showSubmitDialog} onOpenChange={(open) => {
        setShowSubmitDialog(open);
        if (!open) resetWizardState();
      }}>
        <DialogContent className="sm:max-w-4xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isFirstFormStep 
                ? "Submit Form" 
                : isMultiFormWizard 
                  ? `Step ${wizardFormIndex + 1} of ${totalWizardForms}: ${currentWizardForm?.step_name || "Form"}`
                  : `Fill: ${getActiveActionStep()?.step_name || "Form"}`
              }
            </DialogTitle>
            <DialogDescription>
              {isFirstFormStep 
                ? "Confirm submission to proceed with your request. This will move the ticket to the next step."
                : isMultiFormWizard
                  ? `Please fill in the required information for ${currentWizardForm?.step_name || "this form"}. ${totalWizardForms - wizardFormIndex - 1} more form(s) after this.`
                  : "Please fill in the required information below to proceed with your request."
              }
            </DialogDescription>
          </DialogHeader>
          
          {/* Progress bar for wizard */}
          {isMultiFormWizard && !isFirstFormStep && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Form Progress</span>
                <span>{wizardFormIndex + 1} / {totalWizardForms}</span>
              </div>
              <Progress value={((wizardFormIndex + 1) / totalWizardForms) * 100} className="h-2" />
              <div className="flex justify-center gap-2">
                {consecutiveForms.map((form: any, idx: number) => (
                  <div 
                    key={form.step_id} 
                    className={`h-2 w-2 rounded-full transition-colors ${
                      idx < wizardFormIndex ? 'bg-emerald-500' : 
                      idx === wizardFormIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
          
          <div className="py-4 space-y-4">
            {isLoadingConsecutiveForms && !isParallelBranchForm ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : isFirstFormStep ? (
              /* First form step - show confirmation of existing values */
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-medium mb-2">Request Details:</p>
                {ticket?.form_values && Object.keys(ticket.form_values).length > 0 ? (
                  <dl className="space-y-1 text-sm">
                    {Object.entries(ticket.form_values).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <dt className="text-muted-foreground">{getFieldLabel(key)}:</dt>
                        <dd className="font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No form data provided</p>
                )}
              </div>
            ) : isMultiFormWizard && !isParallelBranchForm ? (
              /* Multi-form wizard - show current wizard form fields */
              <div className="space-y-4">
                {getWizardFormFields(wizardFormIndex).map((field: any) => (
                  <div key={field.field_key} className="space-y-2">
                    <Label htmlFor={`wizard-${field.field_key}`}>
                      {field.field_label}
                      <RequiredIndicator field={field} allFormValues={allWizardFormValues[wizardFormIndex] || {}} />
                    </Label>
                    {field.field_type === "TEXTAREA" ? (
                      <Textarea
                        id={`wizard-${field.field_key}`}
                        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
                        value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                        onChange={(e) => setAllWizardFormValues(prev => ({
                          ...prev,
                          [wizardFormIndex]: {
                            ...(prev[wizardFormIndex] || {}),
                            [field.field_key]: e.target.value
                          }
                        }))}
                        rows={3}
                      />
                    ) : field.field_type === "SELECT" ? (
                      <Select
                        value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                        onValueChange={(value) => setAllWizardFormValues(prev => ({
                          ...prev,
                          [wizardFormIndex]: {
                            ...(prev[wizardFormIndex] || {}),
                            [field.field_key]: value
                          }
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${field.field_label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options || []).map((opt: string) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.field_type === "CHECKBOX" ? (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`wizard-${field.field_key}`}
                          checked={allWizardFormValues[wizardFormIndex]?.[field.field_key] || false}
                          onCheckedChange={(checked) => setAllWizardFormValues(prev => ({
                            ...prev,
                            [wizardFormIndex]: {
                              ...(prev[wizardFormIndex] || {}),
                              [field.field_key]: checked
                            }
                          }))}
                        />
                        <label htmlFor={`wizard-${field.field_key}`} className="text-sm text-muted-foreground">
                          {field.placeholder || ""}
                        </label>
                      </div>
                    ) : field.field_type === "NUMBER" ? (
                      <Input
                        type="number"
                        id={`wizard-${field.field_key}`}
                        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
                        value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                        onChange={(e) => setAllWizardFormValues(prev => ({
                          ...prev,
                          [wizardFormIndex]: {
                            ...(prev[wizardFormIndex] || {}),
                            [field.field_key]: e.target.value
                          }
                        }))}
                      />
                    ) : field.field_type === "DATE" ? (() => {
                      // Get date validation settings
                      const dateSettings = getDateValidation(field, allWizardFormValues[wizardFormIndex] || {}, undefined);
                      const dateConstraints = getDateInputConstraints(dateSettings);
                      const allowedDates: string[] = [];
                      if (dateSettings.allowPastDates) allowedDates.push("past");
                      if (dateSettings.allowToday) allowedDates.push("today");
                      if (dateSettings.allowFutureDates) allowedDates.push("future");
                      const hasRestrictions = allowedDates.length < 3;
                      
                      return (
                        <div className="space-y-1">
                          <Input
                            type="date"
                            id={`wizard-${field.field_key}`}
                            value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                            min={dateConstraints.min}
                            max={dateConstraints.max}
                            onChange={(e) => setAllWizardFormValues(prev => ({
                              ...prev,
                              [wizardFormIndex]: {
                                ...(prev[wizardFormIndex] || {}),
                                [field.field_key]: e.target.value
                              }
                            }))}
                          />
                          {hasRestrictions && (
                            <p className="text-xs text-muted-foreground">
                              Allowed: {allowedDates.join(", ")} dates
                            </p>
                          )}
                        </div>
                      );
                    })() : field.field_type === "EMAIL" ? (
                      <Input
                        type="email"
                        id={`wizard-${field.field_key}`}
                        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
                        value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                        onChange={(e) => setAllWizardFormValues(prev => ({
                          ...prev,
                          [wizardFormIndex]: {
                            ...(prev[wizardFormIndex] || {}),
                            [field.field_key]: e.target.value
                          }
                        }))}
                      />
                    ) : field.field_type === "FILE" ? (
                      <FileUpload
                        ticketId={ticketId}
                        context="form_field"
                        fieldLabel={field.field_label}
                        multiple={true}
                        compact={true}
                        onFilesChange={(attachmentIds) => {
                          setAllWizardFormValues(prev => ({
                            ...prev,
                            [wizardFormIndex]: {
                              ...(prev[wizardFormIndex] || {}),
                              [field.field_key]: attachmentIds.length > 0 ? attachmentIds : null
                            }
                          }));
                        }}
                      />
                    ) : (
                      <Input
                        type="text"
                        id={`wizard-${field.field_key}`}
                        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
                        value={allWizardFormValues[wizardFormIndex]?.[field.field_key] || ""}
                        onChange={(e) => setAllWizardFormValues(prev => ({
                          ...prev,
                          [wizardFormIndex]: {
                            ...(prev[wizardFormIndex] || {}),
                            [field.field_key]: e.target.value
                          }
                        }))}
                      />
                    )}
                    {field.help_text && (
                      <p className="text-xs text-muted-foreground">{field.help_text}</p>
                    )}
                  </div>
                ))}
                {getWizardFormFields(wizardFormIndex).length === 0 && (
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm text-muted-foreground">No fields defined for this form step.</p>
                  </div>
                )}
              </div>
            ) : (
              /* Single form step - show form fields to fill */
              currentStepFormFields.length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    // Group fields by section
                    const fieldsBySection = currentStepSections.reduce((acc: any, section: any) => {
                      acc[section.section_id] = currentStepFormFields.filter((f: any) => f.section_id === section.section_id);
                      return acc;
                    }, {} as Record<string, any[]>);
                    
                    const ungroupedFields = currentStepFormFields.filter((f: any) => !f.section_id);
                    const sortedSections = [...currentStepSections].sort((a: any, b: any) => a.order - b.order);
                    
                    return (
                      <>
                        {/* Render sections with their fields */}
                        {sortedSections.map((section: any) => {
                          const sectionFields = fieldsBySection[section.section_id] || [];
                          if (sectionFields.length === 0) return null;
                          
                          // Check if this is a repeating section
                          if (section.is_repeating) {
                            const sectionDataKey = `__section_${section.section_id}`;
                            const rows = Array.isArray(currentStepFormValues[sectionDataKey]) 
                              ? currentStepFormValues[sectionDataKey] 
                              : [];
                            
                            // Helper to update repeating section row value
                            const updateRepeatingSectionValue = (rowIndex: number, fieldKey: string, value: any) => {
                              const currentRows = rows || [];
                              const updatedRows = [...currentRows];
                              
                              if (!updatedRows[rowIndex]) {
                                updatedRows[rowIndex] = {};
                              }
                              
                              updatedRows[rowIndex] = {
                                ...updatedRows[rowIndex],
                                [fieldKey]: value
                              };
                              
                              setCurrentStepFormValues(prev => ({ ...prev, [sectionDataKey]: updatedRows }));
                            };
                            
                            // Helper to add a new row
                            const addRow = () => {
                              const currentRows = rows || [];
                              setCurrentStepFormValues(prev => ({ 
                                ...prev, 
                                [sectionDataKey]: [...currentRows, {}] 
                              }));
                            };
                            
                            // Helper to remove a row
                            const removeRow = (rowIndex: number) => {
                              const currentRows = rows || [];
                              const updatedRows = currentRows.filter((_: any, idx: number) => idx !== rowIndex);
                              setCurrentStepFormValues(prev => ({ ...prev, [sectionDataKey]: updatedRows }));
                            };
                            
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
                                    onClick={addRow}
                                    className="gap-2"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Row
                                  </Button>
                                </div>
                                
                                {rows.length === 0 ? (
                                  <div className={`text-center py-6 border border-dashed rounded-lg ${
                                    section.min_rows && section.min_rows > 0 
                                      ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                                      : "bg-muted/30"
                                  }`}>
                                    <p className={`text-sm ${
                                      section.min_rows && section.min_rows > 0 
                                        ? "text-amber-600 dark:text-amber-400 font-medium"
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
                                      <Card key={rowIndex} className="border-2">
                                        <CardHeader className="pb-3">
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-xs font-medium text-muted-foreground">
                                              Row {rowIndex + 1}
                                            </h5>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => removeRow(rowIndex)}
                                              className="h-7 text-muted-foreground hover:text-red-500"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {sectionFields.map((field: any) => (
                                              <div key={`${section.section_id}_${rowIndex}_${field.field_key}`} className="space-y-2">
                                                <Label htmlFor={`${section.section_id}_${rowIndex}_${field.field_key}`}>
                                                  {field.field_label}
                                                  <RequiredIndicator field={field} allFormValues={currentStepFormValues} rowContext={row} />
                                                </Label>
                                                {renderFieldInput(
                                                  field, 
                                                  row, 
                                                  (key, val) => updateRepeatingSectionValue(rowIndex, key, val),
                                                  ticketId,
                                                  currentStepFormValues,
                                                  row
                                                )}
                                                {field.help_text && (
                                                  <p className="text-xs text-muted-foreground">{field.help_text}</p>
                                                )}
                                              </div>
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
                            <div key={section.section_id} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
                              <div>
                                <h4 className="text-sm font-semibold text-foreground">{section.section_title}</h4>
                                {section.section_description && (
                                  <p className="text-xs text-muted-foreground mt-1">{section.section_description}</p>
                                )}
                              </div>
                              <div className="space-y-4 pl-2">
                                {sectionFields.map((field: any) => (
                                  <div key={field.field_key} className="space-y-2">
                                    <Label htmlFor={field.field_key}>
                                      {field.field_label}
                                      <RequiredIndicator field={field} allFormValues={currentStepFormValues} />
                                    </Label>
                                    {renderFieldInput(field, currentStepFormValues, (key, val) => 
                                      setCurrentStepFormValues(prev => ({ ...prev, [key]: val })),
                                      ticketId
                                    )}
                                    {field.help_text && (
                                      <p className="text-xs text-muted-foreground">{field.help_text}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Render ungrouped fields */}
                        {ungroupedFields.length > 0 && (
                          <div className={sortedSections.length > 0 ? "space-y-4 pt-2" : "space-y-4"}>
                            {ungroupedFields.map((field: any) => (
                              <div key={field.field_key} className="space-y-2">
                                <Label htmlFor={field.field_key}>
                                  {field.field_label}
                                  <RequiredIndicator field={field} allFormValues={currentStepFormValues} />
                                </Label>
                                {renderFieldInput(field, currentStepFormValues, (key, val) => 
                                  setCurrentStepFormValues(prev => ({ ...prev, [key]: val })),
                                  ticketId
                                )}
                                {field.help_text && (
                                  <p className="text-xs text-muted-foreground">{field.help_text}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm text-muted-foreground">No additional information required for this step.</p>
                </div>
              )
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Wizard Back Button */}
            {isMultiFormWizard && !isFirstFormStep && wizardFormIndex > 0 && (
              <Button 
                variant="outline" 
                onClick={handleWizardBack}
                disabled={isSubmittingSequence}
                className="sm:mr-auto"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            
            <Button variant="outline" onClick={() => {
              setShowSubmitDialog(false);
              resetWizardState();
            }}>
              Cancel
            </Button>
            
            {/* Wizard Next or Submit Button */}
            {isMultiFormWizard && !isFirstFormStep && !isLastWizardForm ? (
              <Button 
                onClick={handleWizardNext}
                className="bg-primary hover:bg-primary/90"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={isMultiFormWizard && !isFirstFormStep ? handleSubmitWizardForms : handleSubmitForm} 
                disabled={submitForm.isPending || isSubmittingSequence}
                className="bg-primary hover:bg-primary/90"
              >
                {submitForm.isPending || isSubmittingSequence 
                  ? "Submitting..." 
                  : isMultiFormWizard && totalWizardForms > 1
                    ? `Submit All ${totalWizardForms} Forms`
                    : "Submit & Continue"
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Request</DialogTitle>
            <DialogDescription>
              You are about to accept this request. Add an optional comment.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Accepting: {ticket?.title}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-comment">Comment (optional)</Label>
              <Textarea
                id="approve-comment"
                placeholder="Add any notes for the requester..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApproveDialog(false); setComment(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleApprove} 
              disabled={approve.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {approve.isPending ? "Accepting..." : "Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              You are about to reject this request. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Rejecting: {ticket?.title}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-comment">Reason for rejection</Label>
              <Textarea
                id="reject-comment"
                placeholder="Please explain why this request is being rejected..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRejectDialog(false); setComment(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleReject} 
              disabled={reject.isPending}
              variant="destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {reject.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Info Dialog */}
      <Dialog open={showRequestInfoDialog} onOpenChange={setShowRequestInfoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request More Information</DialogTitle>
            <DialogDescription>
              Ask the requester for additional information needed to process this request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Ticket: {ticket?.title}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                The requester will be notified and asked to provide the information.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-text">What information do you need? *</Label>
              <Textarea
                id="question-text"
                placeholder="Please describe what additional information you need from the requester..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRequestInfoDialog(false); setQuestionText(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                const activeStep = getActiveActionStep();
                if (!activeStep || !questionText.trim()) return;
                try {
                  await requestInfo.mutateAsync({
                    ticketId,
                    stepId: activeStep.ticket_step_id,
                    questionText: questionText.trim(),
                  });
                  setShowRequestInfoDialog(false);
                  setQuestionText("");
                  refetch();
                } catch {
                  // Error handled by mutation
                }
              }}
              disabled={requestInfo.isPending || !questionText.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {requestInfo.isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Respond to Info Request Dialog - Enhanced */}
      <Dialog open={showRespondInfoDialog} onOpenChange={setShowRespondInfoDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-600" />
              Respond to Information Request
            </DialogTitle>
            <DialogDescription>
              The reviewer has requested additional information. Please review and respond.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            {/* Open Info Request Details */}
            {infoRequests.filter((ir: any) => ir.status === "OPEN" || !ir.response_text).map((ir: any) => (
              <div key={ir.info_request_id} className="space-y-4">
                {/* Request Header */}
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 overflow-hidden">
                  <div className="px-4 py-3 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          From: {ir.requested_by?.display_name || "Reviewer"}
                        </span>
                      </div>
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {(() => {
                          try {
                            return formatDistanceToNow(parseUTCDate(ir.requested_at)) + " ago";
                          } catch {
                            return "Recently";
                          }
                        })()}
                      </span>
                    </div>
                    {ir.subject && (
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mt-1">
                        Subject: {ir.subject}
                      </p>
                    )}
                  </div>
                  
                  {/* Request Message */}
                  <div className="p-4">
                    <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">
                      {ir.question_text}
                    </p>
                    
                    {/* Request Attachments */}
                    {ir.request_attachment_ids && ir.request_attachment_ids.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          Attached Files ({ir.request_attachment_ids.length})
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          View attachments in the Attachments tab
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                {/* Response Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Send className="h-4 w-4 text-emerald-600" />
                    Your Response
                  </h4>
                  
                  {/* Response Text */}
                  <div className="space-y-2">
                    <Label htmlFor="response-text">
                      Message <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="response-text"
                      placeholder="Provide the requested information in detail..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={6}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Be thorough in your response to avoid back-and-forth.
                    </p>
                  </div>
                  
                  {/* Response Attachments */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Attach completed forms, documents, or any supporting files
                    </p>
                    <FileUpload
                      ticketId={ticketId}
                      context="info_request"
                      multiple={true}
                      compact={true}
                      onFilesChange={setInfoResponseAttachmentIds}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowRespondInfoDialog(false); 
                setResponseText(""); 
                setInfoResponseAttachmentIds([]);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                const openRequest = infoRequests.find((ir: any) => ir.status === "OPEN" || !ir.response_text);
                if (!openRequest || !responseText.trim()) return;
                try {
                  await respondInfo.mutateAsync({
                    ticketId,
                    stepId: openRequest.ticket_step_id,
                    responseText: responseText.trim(),
                    attachmentIds: infoResponseAttachmentIds,
                  });
                  setShowRespondInfoDialog(false);
                  setResponseText("");
                  setInfoResponseAttachmentIds([]);
                  refetch();
                } catch {
                  // Error handled by mutation
                }
              }}
              disabled={respondInfo.isPending || !responseText.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {respondInfo.isPending ? (
                <>
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Response
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Request Form Modal */}
      {ticket && (
        <ChangeRequestForm
          open={showChangeRequestForm}
          onOpenChange={setShowChangeRequestForm}
          ticket={ticket}
          steps={steps}
          workflowSteps={[]} // Will be populated from workflow data if available
          attachments={attachmentsData?.attachments || []}
          onSuccess={() => {
            setShowChangeRequestForm(false);
            refetch();
            toast.success("Change request submitted successfully");
          }}
        />
      )}

      {/* Version Compare Dialog */}
      {versionsData && versionsData.versions && versionsData.versions.length > 1 && (
        <VersionCompareDialog
          isOpen={showVersionCompare}
          onClose={() => setShowVersionCompare(false)}
          versions={versionsData.versions}
          ticketId={ticketId}
          comparisonData={versionComparisonData}
          isLoading={isLoadingComparison}
          error={comparisonError as Error | null}
          selectedVersion1={compareVersions.v1}
          selectedVersion2={compareVersions.v2}
          onVersionChange={(v1, v2) => setCompareVersions({ v1, v2 })}
        />
      )}
    </PageContainer>
  );
}

// Helper components

// Attachment chip for inline display in messages
function AttachmentChip({ attachmentId }: { attachmentId: string }) {
  const [attachment, setAttachment] = useState<{ 
    original_filename: string; 
    size_bytes?: number;
    file_size?: number;
    mime_type?: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    // Fetch attachment info
    apiClient.get(`/attachments/${attachmentId}/info`)
      .then((data: any) => {
        setAttachment(data);
        setError(false);
      })
      .catch(() => {
        setError(true);
        setAttachment(null);
      });
  }, [attachmentId]);
  
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!attachment) return;
    setDownloading(true);
    
    const downloadUrl = `${config.apiBaseUrl}/attachments/${attachmentId}/download`;
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('msal.authToken') : null;
    
    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.original_filename || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      // Try alternative download method - open in new tab
      window.open(downloadUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };
  
  const formatSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  if (error) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
        <FileText className="h-3 w-3" />
        File not found
      </div>
    );
  }
  
  if (!attachment) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground animate-pulse">
        <FileText className="h-3 w-3" />
        Loading...
      </div>
    );
  }
  
  const sizeBytes = attachment.size_bytes || attachment.file_size;
  const sizeStr = formatSize(sizeBytes);
  
  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-xs transition-colors group border"
      title={`Download ${attachment.original_filename}`}
    >
      <FileText className="h-4 w-4 text-orange-500 flex-shrink-0" />
      <span className="font-medium truncate max-w-[180px]">{attachment.original_filename}</span>
      {sizeStr && <span className="text-muted-foreground flex-shrink-0">({sizeStr})</span>}
      {downloading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent border-current flex-shrink-0" />
      ) : (
        <Download className="h-3 w-3 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
      )}
    </button>
  );
}

function StepIndicator({ state, stepType, branchColor }: { state: string; stepType?: string; branchColor?: string }) {
  // Fork/Join specific indicators
  if (stepType === "FORK_STEP") {
    return (
      <div className="h-6 w-6 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
        <div className="h-3 w-3 border-2 border-rose-500 rotate-45 transform" />
      </div>
    );
  }
  
  if (stepType === "JOIN_STEP") {
    return (
      <div className="h-6 w-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
        <div className="h-3 w-3 border-2 border-cyan-500 -rotate-45 transform" />
      </div>
    );
  }
  
  switch (state) {
    case "COMPLETED":
      return (
        <div 
          className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      );
    case "ACTIVE":
    case "WAITING_FOR_APPROVAL":
    case "WAITING_FOR_REQUESTER":
      return (
        <div 
          className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />
        </div>
      );
    case "WAITING_FOR_BRANCHES":
      return (
        <div className="h-6 w-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
          <Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400 animate-pulse" />
        </div>
      );
    case "REJECTED":
      return (
        <div 
          className="h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
      );
    case "SKIPPED":
      return (
        <div 
          className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <SkipForward className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "CANCELLED":
      return (
        <div 
          className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <XCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </div>
      );
    default:
      return (
        <div 
          className="h-6 w-6 rounded-full bg-muted flex items-center justify-center"
          style={branchColor ? { borderLeft: `3px solid ${branchColor}` } : {}}
        >
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
        </div>
      );
  }
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "TICKET_CREATED":
      return <FileText className="h-4 w-4" />;
    case "FORM_SUBMITTED":
      return <CheckCircle className="h-4 w-4" />;
    case "APPROVAL_GRANTED":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "APPROVAL_REJECTED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "APPROVAL_SKIPPED":
    case "SKIP":
      return <SkipForward className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    TICKET_CREATED: "Ticket created",
    FORM_SUBMITTED: "Form submitted",
    APPROVAL_GRANTED: "Approved",
    APPROVAL_REJECTED: "Rejected",
    APPROVAL_SKIPPED: "Skipped",
    SKIP: "Skipped",
    TASK_COMPLETED: "Task completed",
    INFO_REQUESTED: "Information requested",
    INFO_RESPONDED: "Information provided",
    AGENT_ASSIGNED: "Agent assigned",
    FORK_ACTIVATED: "Parallel branches started",
    BRANCH_COMPLETED: "Branch completed",
    JOIN_COMPLETED: "All branches merged",
  };
  return map[type] || type.replace(/_/g, " ").toLowerCase();
}

// Color palette for parallel branches
const branchColorPalette = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#06b6d4", // cyan
];

// Join Step Summary - shows aggregated information from all parallel branches
function JoinStepSummary({ 
  step, 
  allSteps, 
  activeBranches 
}: { 
  step: any; 
  allSteps: any[]; 
  activeBranches: any[];
}) {
  const sourceForkStepId = step.data?.source_fork_step_id;
  const joinMode = step.data?.join_mode || "ALL";
  
  // Find all branch steps (steps that have the source fork as parent)
  const branchSteps = allSteps.filter(s => 
    s.data?.parent_fork_step_id === sourceForkStepId || 
    (s as any).parent_fork_step_id === sourceForkStepId
  );
  
  // Group by branch
  const branchesByName: Record<string, any[]> = {};
  branchSteps.forEach(bs => {
    const name = bs.data?.branch_name || (bs as any).branch_name || "Unknown Branch";
    if (!branchesByName[name]) branchesByName[name] = [];
    branchesByName[name].push(bs);
  });
  
  const branchNames = Object.keys(branchesByName);
  const completedBranches = branchNames.filter(name => 
    branchesByName[name].every(s => s.state === "COMPLETED")
  );
  
  // Collect all form data from branch steps
  const formData: Array<{ branch: string; stepName: string; fields: Record<string, any> }> = [];
  branchSteps.forEach(bs => {
    if (bs.step_type === "FORM_STEP" && bs.data?.form_values) {
      formData.push({
        branch: bs.data?.branch_name || (bs as any).branch_name || "Unknown",
        stepName: bs.step_name,
        fields: bs.data.form_values
      });
    }
  });
  
  // Collect all notes from branch steps (both tasks and approvals)
  const allNotes: Array<{ branch: string; stepName: string; note: any }> = [];
  branchSteps.forEach(bs => {
    // Include notes from TASK_STEP and APPROVAL_STEP
    if ((bs.step_type === "TASK_STEP" || bs.step_type === "APPROVAL_STEP") && bs.data?.notes) {
      (bs.data.notes as any[]).forEach(note => {
        allNotes.push({
          branch: bs.data?.branch_name || (bs as any).branch_name || bs.branch_name || "Unknown",
          stepName: bs.step_name,
          note
        });
      });
    }
  });
  
  if (branchNames.length === 0 && activeBranches.length === 0) {
    return null;
  }
  
  return (
    <div className="mt-3 space-y-3">
      {/* Branch Status Summary */}
      <div className="p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border border-cyan-200 dark:border-cyan-800">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-5 w-5 rounded-full bg-cyan-500 flex items-center justify-center">
            <CheckCircle className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
            Branch Summary
          </span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Mode: {joinMode === "ALL" ? "Wait for All" : joinMode === "ANY" ? "Any One" : "Majority"}
          </Badge>
        </div>
        
        {/* All branches - show with their states */}
        {activeBranches.length > 0 && (
          <div className="grid gap-2 mb-2">
            {activeBranches.map((branch: any, idx: number) => {
              // Find branch color based on branch name or index
              const branchName = branch.branch_name || branch.branch_id || "";
              const branchIndex = branchNames.indexOf(branchName);
              const colorIdx = branchIndex >= 0 ? branchIndex : idx;
              
              return (
                <div 
                  key={branch.branch_id || idx}
                  className="flex items-center gap-2 text-xs p-2 rounded bg-white dark:bg-gray-900/50"
                >
                  <div 
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: branchColorPalette[colorIdx % branchColorPalette.length] }}
                  />
                  <span className="font-medium">{branch.branch_name || branch.branch_id}</span>
                  <StatusBadge status={branch.state || "ACTIVE"} size="sm" />
                  {branch.completed_at ? (
                    <span className="text-muted-foreground ml-auto">
                      Completed: {new Date(branch.completed_at).toLocaleTimeString()}
                    </span>
                  ) : branch.started_at ? (
                    <span className="text-muted-foreground ml-auto">
                      Started: {new Date(branch.started_at).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Completed branches summary */}
        {branchNames.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {completedBranches.length}/{branchNames.length}
            </span>
            {" "}branches completed
          </div>
        )}
      </div>
      
      {/* Aggregated Form Data from Branches */}
      {formData.length > 0 && (
        <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
            📋 Data Collected from Branches
          </p>
          <div className="space-y-2">
            {formData.map((fd, idx) => (
              <div key={idx} className="text-xs p-2 rounded bg-white dark:bg-gray-900/50">
                <p className="font-medium mb-1">
                  <span style={{ color: branchColorPalette[idx % branchColorPalette.length] }}>●</span>
                  {" "}{fd.branch} - {fd.stepName}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(fd.fields).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-medium text-foreground">{String(value)}</span>
                    </div>
                  ))}
                  {Object.keys(fd.fields).length > 4 && (
                    <span className="text-muted-foreground col-span-2">
                      +{Object.keys(fd.fields).length - 4} more fields
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Aggregated Notes from Branch Tasks */}
      {allNotes.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">
            📝 Notes from Branches ({allNotes.length})
          </p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {allNotes.map((item, idx) => (
              <div key={idx} className="text-xs border-l-2 pl-2 py-1" style={{ borderLeftColor: branchColorPalette[idx % branchColorPalette.length] }}>
                <p className="font-medium">{item.branch} - {item.stepName}</p>
                <p className="text-foreground">{item.note.content}</p>
                <p className="text-muted-foreground mt-0.5">
                  {item.note.actor?.display_name || 'Agent'} • {item.note.timestamp ? new Date(item.note.timestamp).toLocaleString() : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getBranchColor(branchId: string, steps: any[]): string {
  // Find all unique branch IDs to create consistent color mapping
  const uniqueBranchIds = [...new Set(
    steps
      .filter((s: any) => s.branch_id)
      .map((s: any) => s.branch_id)
  )];
  
  const index = uniqueBranchIds.indexOf(branchId);
  return branchColorPalette[index % branchColorPalette.length];
}

// Sub-Workflow Steps List with branch grouping
function SubWorkflowStepsList({ childSteps }: { childSteps: any[] }) {
  // Organize sub-workflow steps: detect forks, group branches, show in proper order
  const organizedSteps = useMemo(() => {
    // Find fork and join steps within sub-workflow
    const forkStep = childSteps.find(s => s.step_type === "FORK_STEP");
    const joinStep = childSteps.find(s => s.step_type === "JOIN_STEP");
    
    if (!forkStep) {
      // No fork - just return flat list
      return { type: 'flat' as const, steps: childSteps };
    }
    
    // Group steps by branch
    const branchSteps: Record<string, any[]> = {};
    const preForksSteps: any[] = [];
    const postJoinSteps: any[] = [];
    
    // Get branches from fork step data
    const branches = forkStep.data?.branches || [];
    branches.forEach((b: any) => {
      const branchName = b.branch_name || b.branch_id;
      if (branchName) branchSteps[branchName] = [];
    });
    
    // Categorize steps
    childSteps.forEach(step => {
      if (step.step_type === "FORK_STEP" || step.step_type === "JOIN_STEP") return;
      
      const branchId = step.branch_id;
      const branchName = step.branch_name;
      
      if (branchId || branchName) {
        // This is a branch step
        const key = branchName || branchId;
        // Try to find matching branch from fork definition
        const matchingBranch = branches.find((b: any) => 
          b.branch_id === branchId || b.branch_name === key
        );
        const finalKey = matchingBranch?.branch_name || matchingBranch?.branch_id || key;
        
        if (!branchSteps[finalKey]) branchSteps[finalKey] = [];
        branchSteps[finalKey].push(step);
      } else {
        // Check if step is before fork or after join based on order
        const forkOrder = forkStep.sub_workflow_step_order ?? 0;
        const joinOrder = joinStep?.sub_workflow_step_order ?? Infinity;
        const stepOrder = step.sub_workflow_step_order ?? 0;
        
        if (stepOrder < forkOrder) {
          preForksSteps.push(step);
        } else if (joinStep && stepOrder > joinOrder) {
          postJoinSteps.push(step);
        } else {
          preForksSteps.push(step);
        }
      }
    });
    
    return {
      type: 'branched' as const,
      preForksSteps,
      forkStep,
      branches: Object.entries(branchSteps).map(([name, steps], idx) => ({
        name,
        steps,
        color: branchColorPalette[idx % branchColorPalette.length]
      })),
      joinStep,
      postJoinSteps
    };
  }, [childSteps]);
  
  // Render a single step row
  const renderStepRow = (subStep: any) => {
    const isActionable = subStep.state === "ACTIVE" || subStep.state === "WAITING_FOR_APPROVAL";
    return (
      <div 
        key={subStep.ticket_step_id}
        className={`flex items-center gap-2 p-3 rounded-lg text-sm transition-all ${
          isActionable
            ? "bg-primary/10 ring-1 ring-primary/30 shadow-sm"
            : subStep.state === "COMPLETED"
            ? "bg-emerald-50 dark:bg-emerald-900/20"
            : subStep.state === "REJECTED"
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-muted/30"
        }`}
      >
        <div className="relative">
          <StepIndicator 
            state={subStep.state} 
            stepType={subStep.step_type}
          />
          {isActionable && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-xs truncate ${isActionable ? 'text-primary' : ''}`}>
            {subStep.step_name}
          </p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <StepTypeBadge type={subStep.step_type} />
            <StatusBadge status={subStep.state} size="sm" />
            {isActionable && (
              <Badge className="text-[9px] h-4 bg-primary text-primary-foreground animate-pulse">
                Action Required
              </Badge>
            )}
          </div>
          {subStep.assigned_to && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <User className="h-3 w-3" />
              <span>
                {subStep.step_type === "APPROVAL_STEP" 
                  ? `Approver: ${subStep.assigned_to.display_name}` 
                  : `Assigned to: ${subStep.assigned_to.display_name}`
                }
              </span>
            </div>
          )}
          {/* Show execution notes for task steps */}
          {subStep.step_type === "TASK_STEP" && subStep.state === "COMPLETED" && subStep.data?.execution_notes && (
            <div className="mt-2 p-2 rounded-md bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/50">
              <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">📝 Execution Notes</p>
              <p className="text-xs text-foreground/90 mt-0.5">{subStep.data.execution_notes}</p>
            </div>
          )}
          {/* Show notes from any step type */}
          {subStep.data?.notes && Array.isArray(subStep.data.notes) && subStep.data.notes.length > 0 && (
            <div className="mt-2 p-2 rounded-md bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/50">
              <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">💬 Notes ({subStep.data.notes.length})</p>
              <div className="mt-1 space-y-1">
                {(subStep.data.notes as any[]).slice(-2).map((note: any, idx: number) => (
                  <div key={idx} className="text-[10px] border-l-2 border-blue-300 dark:border-blue-600 pl-2">
                    <p className="text-foreground/90">{note.content}</p>
                    <p className="text-muted-foreground">
                      {note.actor?.display_name || 'Unknown'} • {note.timestamp ? new Date(note.timestamp).toLocaleString() : ''}
                    </p>
                  </div>
                ))}
                {subStep.data.notes.length > 2 && (
                  <p className="text-[10px] text-muted-foreground">+{subStep.data.notes.length - 2} more</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  if (organizedSteps.type === 'flat') {
    return (
      <div className="space-y-2">
        {organizedSteps.steps.map(renderStepRow)}
      </div>
    );
  }
  
  // Render branched structure
  return (
    <div className="space-y-3">
      {/* Pre-fork steps */}
      {organizedSteps.preForksSteps.map(renderStepRow)}
      
      {/* Fork step */}
      {organizedSteps.forkStep && renderStepRow(organizedSteps.forkStep)}
      
      {/* Parallel Branches */}
      {organizedSteps.branches.length > 0 && (
        <div className="ml-2 p-3 rounded-lg bg-gradient-to-r from-rose-50/50 to-orange-50/50 dark:from-rose-950/20 dark:to-orange-950/20 border border-rose-200/50 dark:border-rose-800/30">
          <div className="flex items-center gap-2 mb-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
            <GitBranch className="h-3.5 w-3.5" />
            Parallel Branches ({organizedSteps.branches.length})
          </div>
          
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {organizedSteps.branches.map((branch, branchIdx) => {
              const allCompleted = branch.steps.length > 0 && 
                branch.steps.every(s => s.state === "COMPLETED");
              const hasRejected = branch.steps.some(s => s.state === "REJECTED");
              
              return (
                <div 
                  key={branch.name}
                  className="rounded-lg border p-2"
                  style={{ 
                    borderColor: branch.color,
                    backgroundColor: `${branch.color}10`
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 pb-1 border-b" style={{ borderColor: `${branch.color}40` }}>
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: branch.color }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: branch.color }}>
                      {branch.name}
                    </span>
                    {allCompleted && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto" />
                    )}
                    {hasRejected && (
                      <XCircle className="h-3 w-3 text-red-500 ml-auto" />
                    )}
                  </div>
                  
                  <div className="space-y-1.5">
                    {branch.steps.length > 0 ? (
                      branch.steps.map(step => (
                        <div 
                          key={step.ticket_step_id}
                          className="p-1.5 rounded bg-white/50 dark:bg-black/20 text-[10px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <StepIndicator 
                              state={step.state} 
                              stepType={step.step_type}
                            />
                            <span className="truncate flex-1">{step.step_name}</span>
                            <StatusBadge status={step.state} size="sm" />
                          </div>
                          {step.assigned_to && (
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-1 ml-4">
                              <User className="h-2.5 w-2.5" />
                              <span className="truncate">
                                {step.step_type === "APPROVAL_STEP" 
                                  ? `Approver: ${step.assigned_to.display_name}` 
                                  : `Assigned to: ${step.assigned_to.display_name}`
                                }
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">No steps</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Notes Summary from all branches */}
          {(() => {
            const allBranchNotes: Array<{ branch: string; stepName: string; note: any }> = [];
            organizedSteps.branches.forEach(branch => {
              branch.steps.forEach(step => {
                if (step.data?.notes && Array.isArray(step.data.notes)) {
                  step.data.notes.forEach((note: any) => {
                    allBranchNotes.push({
                      branch: branch.name,
                      stepName: step.step_name,
                      note
                    });
                  });
                }
              });
            });
            
            if (allBranchNotes.length === 0) return null;
            
            return (
              <div className="mt-3 p-2 rounded-lg bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/50">
                <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-2">
                  📝 Notes from Branches ({allBranchNotes.length})
                </p>
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {allBranchNotes.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="text-[10px] border-l-2 border-blue-300 pl-2">
                      <p className="font-medium text-foreground/80">{item.branch} - {item.stepName}</p>
                      <p className="text-foreground/70">{item.note.content}</p>
                      <p className="text-muted-foreground">
                        {item.note.actor?.display_name || 'Unknown'}
                      </p>
                    </div>
                  ))}
                  {allBranchNotes.length > 5 && (
                    <p className="text-[10px] text-muted-foreground">+{allBranchNotes.length - 5} more notes</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      
      {/* Join step */}
      {organizedSteps.joinStep && renderStepRow(organizedSteps.joinStep)}
      
      {/* Post-join steps */}
      {organizedSteps.postJoinSteps.map(renderStepRow)}
    </div>
  );
}

// Intelligent Workflow Steps Display - groups parallel branches visually
function WorkflowStepsDisplay({ steps, ticket }: { steps: any[]; ticket: any }) {
  // Organize steps: main flow, fork sections with branches, sub-workflow sections, then continue
  const organizedSections = useMemo(() => {
    const sections: Array<{
      type: 'step' | 'fork-section' | 'sub-workflow-section';
      step?: any;
      forkStep?: any;
      branches?: Array<{ name: string; color: string; steps: any[]; state?: string }>;
      joinStep?: any;
      // Sub-workflow section fields
      parentStep?: any;
      subWorkflowSteps?: any[];
      subWorkflowName?: string;
    }> = [];
    
    // Find fork, join, and sub-workflow steps
    const forkSteps = steps.filter(s => s.step_type === "FORK_STEP");
    const joinSteps = steps.filter(s => s.step_type === "JOIN_STEP");
    const subWorkflowSteps = steps.filter(s => s.step_type === "SUB_WORKFLOW_STEP");
    
    // Build a map of steps belonging to each sub-workflow
    const stepsBySubWorkflow: Record<string, any[]> = {};
    subWorkflowSteps.forEach(swStep => {
      stepsBySubWorkflow[swStep.ticket_step_id] = steps.filter(
        s => s.parent_sub_workflow_step_id === swStep.ticket_step_id
      ).sort((a, b) => (a.sub_workflow_step_order ?? 0) - (b.sub_workflow_step_order ?? 0));
    });
    
    // Build a map of branch steps - using unified detection logic
    const branchStepsByFork: Record<string, Record<string, any[]>> = {};
    
    // Common branch name patterns
    const branchPattern = /^(Branch \d+|IT Infrastructure|Security Team|Network|HR|Finance|IT Team|Dev Team|QA Team|DevOps|Support)/i;
    
    // Initialize fork entries
    forkSteps.forEach(forkStep => {
      branchStepsByFork[forkStep.step_id] = {};
      branchStepsByFork[forkStep.ticket_step_id] = {}; // Also key by ticket_step_id
    });
    
    // Use active_branches from ticket as source of truth for which branches exist
    // This ensures we show all branches even if they have no steps or are rejected
    // Also fallback to fork step definition branches if active_branches is empty (e.g., after join completes)
    if (forkSteps.length > 0) {
      forkSteps.forEach(forkStep => {
        let forkBranches: any[] = [];
        
        // First, try to get branches from active_branches
        if (ticket?.active_branches && ticket.active_branches.length > 0) {
          forkBranches = ticket.active_branches.filter((b: any) => {
            // Check if branch's parent_fork_step_id matches this fork
            return b.parent_fork_step_id === forkStep.step_id || 
                   b.parent_fork_step_id === forkStep.ticket_step_id;
          });
        }
        
        // Fallback: If active_branches is empty, get branches from fork step definition
        // This handles the case when join step has completed and cleared active_branches
        if (forkBranches.length === 0 && forkStep.data?.branches) {
          forkBranches = forkStep.data.branches.map((branch: any) => ({
            branch_id: branch.branch_id,
            branch_name: branch.branch_name,
            parent_fork_step_id: forkStep.step_id,
            state: "COMPLETED", // Assume completed if active_branches is empty
            color: branch.color
          }));
        }
        
        // Initialize branch entries for all branches
        forkBranches.forEach((branch: any) => {
          const branchName = branch.branch_name || branch.branch_id;
          if (branchName) {
            if (!branchStepsByFork[forkStep.step_id][branchName]) {
              branchStepsByFork[forkStep.step_id][branchName] = [];
            }
            if (!branchStepsByFork[forkStep.ticket_step_id][branchName]) {
              branchStepsByFork[forkStep.ticket_step_id][branchName] = [];
            }
          }
        });
      });
    }
    
    // Detect branch steps using multiple methods
    steps.forEach(step => {
      if (step.step_type === "FORK_STEP" || step.step_type === "JOIN_STEP") return;
      
      // Method 1: Explicit metadata (when fork has been activated)
      // Check for branch_id, branch_name, and parent_fork_step_id
      const branchId = step.branch_id || (step as any).branch_id || step.data?.branch_id;
      const branchName = step.branch_name || (step as any).branch_name || step.data?.branch_name;
      const parentFork = step.parent_fork_step_id || (step as any).parent_fork_step_id || step.data?.parent_fork_step_id;
      
      // If we have branch metadata, use it to assign to the correct fork
      if (branchId || branchName || parentFork) {
        // Find the fork step this branch belongs to
        for (const forkStep of forkSteps) {
          // Check if this step belongs to this fork
          let belongsToFork = parentFork && (
            parentFork === forkStep.step_id || 
            parentFork === forkStep.ticket_step_id
          );
          
          // If no parent_fork_step_id, try to match by branch_id in active_branches
          if (!belongsToFork && branchId && ticket?.active_branches) {
            const matchingBranch = ticket.active_branches.find((b: any) => 
              b.branch_id === branchId && 
              (b.parent_fork_step_id === forkStep.step_id || b.parent_fork_step_id === forkStep.ticket_step_id)
            );
            if (matchingBranch) {
              belongsToFork = true;
            }
          }
          
          if (belongsToFork) {
            const forkKey = branchStepsByFork[forkStep.step_id] ? forkStep.step_id : 
                          (branchStepsByFork[forkStep.ticket_step_id] ? forkStep.ticket_step_id : null);
            
            if (forkKey && branchStepsByFork[forkKey]) {
              // Determine the branch name - MUST match the branch_id from active_branches or fork definition
              // This ensures steps are assigned to the correct branch
              let finalBranchName = branchName;
              
              // Get all possible branches (from active_branches or fork definition)
              const allForkBranches: any[] = [];
              if (ticket?.active_branches && ticket.active_branches.length > 0) {
                allForkBranches.push(...ticket.active_branches.filter((b: any) => 
                  b.parent_fork_step_id === forkStep.step_id || b.parent_fork_step_id === forkStep.ticket_step_id
                ));
              }
              // Fallback to fork step definition branches
              if (allForkBranches.length === 0 && forkStep.data?.branches) {
                allForkBranches.push(...forkStep.data.branches.map((b: any) => ({
                  branch_id: b.branch_id,
                  branch_name: b.branch_name,
                  parent_fork_step_id: forkStep.step_id
                })));
              }
              
              // CRITICAL: Find the branch that matches this branch_id
              // This ensures we use the correct branch name even if step has wrong branch_name
              if (branchId && allForkBranches.length > 0) {
                const matchingBranch = allForkBranches.find((b: any) => 
                  b.branch_id === branchId &&
                  (b.parent_fork_step_id === forkStep.step_id || b.parent_fork_step_id === forkStep.ticket_step_id)
                );
                if (matchingBranch) {
                  // Use the branch name from the branch definition (source of truth)
                  finalBranchName = matchingBranch.branch_name;
                }
              }
              
              // If still no branch name, use branch_id as fallback
              if (!finalBranchName) {
                finalBranchName = branchName || branchId || "Unknown Branch";
              }
              
              // CRITICAL: Only add step if branch_id matches the branch we're assigning to
              // This prevents cross-branch contamination
              if (branchId && allForkBranches.length > 0) {
                const targetBranch = allForkBranches.find((b: any) => 
                  (b.branch_name || b.branch_id) === finalBranchName &&
                  (b.parent_fork_step_id === forkStep.step_id || b.parent_fork_step_id === forkStep.ticket_step_id)
                );
                if (targetBranch && targetBranch.branch_id !== branchId) {
                  // Branch ID doesn't match - don't add this step to this branch
                  return; // Skip this step, don't add it to any branch
                }
              }
              
              if (!branchStepsByFork[forkKey][finalBranchName]) {
                branchStepsByFork[forkKey][finalBranchName] = [];
              }
              
              const exists = branchStepsByFork[forkKey][finalBranchName].some(
                (s: any) => s.ticket_step_id === step.ticket_step_id
              );
              if (!exists) {
                branchStepsByFork[forkKey][finalBranchName].push(step);
              }
            }
            return; // Already categorized
          }
        }
      }
      
      // Method 2: Detect by step name pattern - ONLY if no explicit metadata exists
      // This is a fallback and should be very strict to avoid cross-branch contamination
      // Only use this if we have NO branch metadata at all
      if (!branchId && !branchName && !parentFork && forkSteps.length > 0) {
        // Try to find which branch this step belongs to by checking if step name starts with branch name
        // Steps are named like "BranchName - StepType"
        // IMPORTANT: Only match if step name EXACTLY starts with branch name + " -"
        for (const forkStep of forkSteps) {
          // Get branches from active_branches - now BranchState has parent_fork_step_id
          const forkBranches = ticket?.active_branches?.filter((b: any) => 
            b.parent_fork_step_id === forkStep.step_id || 
            b.parent_fork_step_id === forkStep.ticket_step_id
          ) || [];
          
          // Also check fork step definition branches as fallback
          const forkStepBranches = forkStep.branches || [];
          const allBranches = [...forkBranches, ...forkStepBranches];
          
          for (const branch of allBranches) {
            const branchNameFromBranch = branch.branch_name || branch.branch_id || "";
            const stepName = step.step_name || "";
            
            // STRICT matching: step name must EXACTLY start with branch name + " -"
            // This prevents partial matches that could cause cross-branch contamination
            if (branchNameFromBranch && stepName.startsWith(branchNameFromBranch + " -")) {
              const forkKey = branchStepsByFork[forkStep.step_id] ? forkStep.step_id : 
                            (branchStepsByFork[forkStep.ticket_step_id] ? forkStep.ticket_step_id : null);
              
              if (forkKey && branchStepsByFork[forkKey]) {
                if (!branchStepsByFork[forkKey][branchNameFromBranch]) {
                  branchStepsByFork[forkKey][branchNameFromBranch] = [];
                }
                
                const exists = branchStepsByFork[forkKey][branchNameFromBranch].some(
                  (s: any) => s.ticket_step_id === step.ticket_step_id
                );
                if (!exists) {
                  branchStepsByFork[forkKey][branchNameFromBranch].push(step);
                }
              }
              return; // Found matching branch, stop searching
            }
          }
        }
      }
    });
    
    // Natural sort for branch names (Branch 2 before Branch 10)
    const naturalSort = (a: string, b: string) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    };
    
    // Track which steps have been added
    const addedStepIds = new Set<string>();
    
    // Mark all branch steps as added upfront
    Object.values(branchStepsByFork).forEach(branches => {
      Object.values(branches).forEach(branchSteps => {
        branchSteps.forEach(s => addedStepIds.add(s.ticket_step_id));
      });
    });
    
    // Mark all sub-workflow child steps as added upfront (they'll be shown in sub-workflow sections)
    Object.values(stepsBySubWorkflow).forEach(subSteps => {
      subSteps.forEach(s => addedStepIds.add(s.ticket_step_id));
    });
    
    // Process steps in order, grouping fork sections and sub-workflow sections
    steps.forEach(step => {
      if (addedStepIds.has(step.ticket_step_id)) return;
      
      // Handle SUB_WORKFLOW_STEP - create a grouped section for its child steps
      if (step.step_type === "SUB_WORKFLOW_STEP") {
        const childSteps = stepsBySubWorkflow[step.ticket_step_id] || [];
        sections.push({
          type: 'sub-workflow-section',
          parentStep: step,
          subWorkflowSteps: childSteps,
          subWorkflowName: step.data?.sub_workflow_name || step.step_name || "Sub-Workflow"
        });
        addedStepIds.add(step.ticket_step_id);
        return;
      }
      
      if (step.step_type === "FORK_STEP") {
        // Create a fork section
        const branchGroups = branchStepsByFork[step.step_id] || branchStepsByFork[step.ticket_step_id] || {};
        const branches: Array<{ name: string; color: string; steps: any[]; state?: string }> = [];
        
        // Get all branches for this fork from active_branches (source of truth)
        let forkBranches = ticket?.active_branches?.filter((b: any) => 
          b.parent_fork_step_id === step.step_id || b.parent_fork_step_id === step.ticket_step_id
        ) || [];
        
        // Fallback: If active_branches is empty, get branches from fork step definition
        if (forkBranches.length === 0 && step.data?.branches) {
          forkBranches = step.data.branches.map((branch: any) => ({
            branch_id: branch.branch_id,
            branch_name: branch.branch_name,
            parent_fork_step_id: step.step_id,
            state: "COMPLETED", // Assume completed if active_branches is empty
            color: branch.color
          }));
        }
        
        // Create a set of all branch names (from active_branches/fork definition and from steps)
        const allBranchNames = new Set<string>();
        forkBranches.forEach((b: any) => {
          const branchName = b.branch_name || b.branch_id;
          if (branchName) allBranchNames.add(branchName);
        });
        // Also include branches that have steps but might not be in active_branches
        Object.keys(branchGroups).forEach(name => allBranchNames.add(name));
        
        let colorIdx = 0;
        Array.from(allBranchNames).sort(naturalSort).forEach(branchName => {
          // Find branch metadata from active_branches or fork definition
          let branchMeta = forkBranches.find((b: any) => 
            (b.branch_name || b.branch_id) === branchName
          );
          
          // If not found in forkBranches, try fork step definition
          if (!branchMeta && step.data?.branches) {
            const defBranch = step.data.branches.find((b: any) => 
              (b.branch_name || b.branch_id) === branchName
            );
            if (defBranch) {
              branchMeta = {
                branch_id: defBranch.branch_id,
                branch_name: defBranch.branch_name,
                parent_fork_step_id: step.step_id,
                state: "COMPLETED",
                color: defBranch.color
              };
            }
          }
          
          // Get steps for this branch - STRICTLY filter by branch_id/branch_name to prevent cross-branch contamination
          const branchSteps = (branchGroups[branchName] || []).filter((step: any) => {
            const stepBranchId = step.branch_id || step.data?.branch_id;
            const stepBranchName = step.branch_name || step.data?.branch_name;
            
            // Must match by branch_id if available (most reliable)
            if (branchMeta?.branch_id && stepBranchId) {
              return stepBranchId === branchMeta.branch_id;
            }
            // Or match by branch_name if branch_id not available
            if (branchMeta?.branch_name && stepBranchName) {
              return stepBranchName === branchMeta.branch_name;
            }
            // Last resort: only include if step name EXACTLY starts with branch name + " -"
            // This prevents partial matches
            if (branchMeta?.branch_name) {
              const stepName = step.step_name || "";
              return stepName.startsWith(branchMeta.branch_name + " -");
            }
            return false; // Don't include if no match
          });
          
          // Use branch color from metadata if available, otherwise use palette
          const branchColor = branchMeta?.color || branchColorPalette[colorIdx % branchColorPalette.length];
          
          branches.push({
            name: branchName,
            color: branchColor,
            steps: branchSteps,
            state: branchMeta?.state // Include branch state
          });
          colorIdx++;
        });
        
        // Find corresponding join step - try multiple matching strategies
        let joinStep = joinSteps.find(j => 
          j.data?.source_fork_step_id === step.step_id || 
          (j as any).source_fork_step_id === step.step_id ||
          j.data?.source_fork_step_id === step.ticket_step_id
        );
        
        // Fallback: if only one fork and one join, they belong together
        if (!joinStep && forkSteps.length === 1 && joinSteps.length === 1) {
          joinStep = joinSteps[0];
        }
        
        sections.push({
          type: 'fork-section',
          forkStep: step,
          branches,
          joinStep
        });
        
        addedStepIds.add(step.ticket_step_id);
        if (joinStep) addedStepIds.add(joinStep.ticket_step_id);
        
      } else if (step.step_type === "JOIN_STEP") {
        // Join steps are handled in fork-section
        if (!addedStepIds.has(step.ticket_step_id)) {
          sections.push({ type: 'step', step });
          addedStepIds.add(step.ticket_step_id);
        }
      } else {
        // Check if this is a branch step or a sub-workflow child step
        const parentFork = (step as any).parent_fork_step_id || step.data?.parent_fork_step_id;
        const parentSubWorkflow = step.parent_sub_workflow_step_id;
        
        // Only add if not part of a branch or sub-workflow
        if (!parentFork && !parentSubWorkflow) {
          sections.push({ type: 'step', step });
          addedStepIds.add(step.ticket_step_id);
        }
      }
    });
    
    return sections;
  }, [steps]);

  return (
    <div className="space-y-4">
      {organizedSections.map((section, sectionIdx) => {
        if (section.type === 'step' && section.step) {
          return (
            <StepRow 
              key={section.step.ticket_step_id} 
              step={section.step} 
              steps={steps}
              isLast={sectionIdx === organizedSections.length - 1}
            />
          );
        }
        
        if (section.type === 'fork-section') {
          return (
            <div key={section.forkStep?.ticket_step_id || `fork-${sectionIdx}`} className="space-y-3">
              {/* Fork Step Header */}
              {section.forkStep && (
                <StepRow step={section.forkStep} steps={steps} isLast={false} />
              )}
              
              {/* Parallel Branches Visual */}
              {section.branches && section.branches.length > 0 ? (
                <div className="ml-6 p-4 rounded-xl bg-gradient-to-r from-rose-50/50 to-orange-50/50 dark:from-rose-950/20 dark:to-orange-950/20 border border-rose-200/50 dark:border-rose-800/30">
                  <div className="flex items-center gap-2 mb-3 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    <GitBranch className="h-4 w-4" />
                    Parallel Branches ({section.branches.length})
                  </div>
                  
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {section.branches.map((branch, branchIdx) => (
                      <div 
                        key={branch.name}
                        className="rounded-lg border-2 p-3 bg-white dark:bg-gray-900/50"
                        style={{ borderColor: branch.color }}
                      >
                        {/* Branch Header */}
                        <div 
                          className="flex items-center gap-2 mb-2 pb-2 border-b"
                          style={{ borderBottomColor: `${branch.color}40` }}
                        >
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: branch.color }}
                          />
                          <span className="font-semibold text-sm">{branch.name}</span>
                          {branch.state && (
                            <StatusBadge status={branch.state as any} size="sm" />
                          )}
                          <Badge variant="outline" className="ml-auto text-[10px]">
                            {branch.steps.length > 0 
                              ? `${branch.steps.filter(s => s.state === "COMPLETED").length}/${branch.steps.length}`
                              : "0/0"}
                          </Badge>
                        </div>
                        
                        {/* Branch Steps - Simple View */}
                        <div className="space-y-2">
                          {branch.steps.length > 0 ? (
                            branch.steps.map((branchStep, stepIdx) => (
                              <div 
                                key={branchStep.ticket_step_id}
                                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                                  branchStep.state === "ACTIVE" || branchStep.state === "WAITING_FOR_APPROVAL"
                                    ? "bg-primary/10"
                                    : branchStep.state === "COMPLETED"
                                    ? "bg-emerald-50 dark:bg-emerald-900/20"
                                    : branchStep.state === "REJECTED"
                                    ? "bg-red-50 dark:bg-red-900/20"
                                    : "bg-muted/30"
                                }`}
                              >
                                <StepIndicator 
                                  state={branchStep.state} 
                                  stepType={branchStep.step_type} 
                                  branchColor={branch.color}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-xs truncate">{branchStep.step_name}</p>
                                  <div className="flex items-center gap-1 mt-1">
                                    <StepTypeBadge type={branchStep.step_type} />
                                    <StatusBadge status={branchStep.state} size="sm" />
                                  </div>
                                  {branchStep.assigned_to && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                      <User className="h-3 w-3" />
                                      <span>
                                        {branchStep.step_type === "APPROVAL_STEP" 
                                          ? `Approver: ${branchStep.assigned_to.display_name}` 
                                          : `Assigned to: ${branchStep.assigned_to.display_name}`
                                        }
                                      </span>
                                    </div>
                                  )}
                                  {/* Show parallel pending approvers if exists */}
                                  {branchStep.step_type === "APPROVAL_STEP" && 
                                    branchStep.parallel_pending_approvers && branchStep.parallel_pending_approvers.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                      <Users className="h-3 w-3" />
                                      <span>
                                        {branchStep.parallel_approval_rule === "ALL" ? "All" : "Any"}: {branchStep.parallel_pending_approvers.length - (branchStep.parallel_completed_approvers?.length || 0)} pending
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground italic p-2">
                              No steps in this branch
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ml-6 p-4 rounded-xl bg-gradient-to-r from-rose-50/50 to-orange-50/50 dark:from-rose-950/20 dark:to-orange-950/20 border border-rose-200/50 dark:border-rose-800/30">
                  <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    <GitBranch className="h-4 w-4" />
                    Parallel processing configured - awaiting activation
                  </div>
                </div>
              )}
              
              {/* Branch Execution Details - Tabs before Join Step */}
              {section.branches && section.branches.length > 0 && (() => {
                // Collect all branch execution data
                const branchData = section.branches.map(branch => {
                  const taskSteps = branch.steps.filter((s: any) => s.step_type === "TASK_STEP");
                  const hasExecutionData = taskSteps.some((s: any) => 
                    (s.data?.execution_notes) || 
                    (s.data?.output_values && Object.keys(s.data.output_values).length > 0)
                  );
                  
                  return {
                    branch,
                    taskSteps,
                    hasExecutionData
                  };
                }).filter(bd => bd.hasExecutionData);
                
                if (branchData.length === 0) return null;
                
                return (
                  <div className="ml-6 mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Branch Execution Details
                        </CardTitle>
                        <CardDescription>
                          Execution notes and form data captured during branch execution
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Tabs defaultValue={branchData[0]?.branch.name} className="w-full">
                          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${branchData.length}, 1fr)` }}>
                            {branchData.map((bd) => (
                              <TabsTrigger 
                                key={bd.branch.name}
                                value={bd.branch.name}
                                className="flex items-center gap-2"
                              >
                                <div 
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: bd.branch.color }}
                                />
                                {bd.branch.name}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                          {branchData.map((bd) => (
                            <TabsContent key={bd.branch.name} value={bd.branch.name} className="mt-4 space-y-4">
                              {bd.taskSteps.map((taskStep: any) => (
                                <div key={taskStep.ticket_step_id} className="space-y-3">
                                  <div className="flex items-center gap-2 pb-2 border-b">
                                    <h4 className="font-medium text-sm">{taskStep.step_name}</h4>
                                    <StatusBadge status={taskStep.state} size="sm" />
                                  </div>
                                  
                                  {/* Execution Notes */}
                                  {taskStep.data?.execution_notes && (
                                    <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                                        <FileText className="h-3 w-3" />
                                        Execution Notes
                                      </p>
                                      <p className="text-sm text-foreground whitespace-pre-wrap">
                                        {taskStep.data.execution_notes}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Output Values / Form Data */}
                                  {taskStep.data?.output_values && Object.keys(taskStep.data.output_values).length > 0 && (
                                    taskStep.data.output_values.__is_linked_task ? (
                                      <LinkedTaskOutputDisplay 
                                        outputValues={taskStep.data.output_values}
                                        outputFields={taskStep.data?.output_fields || []}
                                        sections={taskStep.data?.sections || []}
                                      />
                                    ) : (
                                      <TaskOutputValuesDisplay 
                                        step={taskStep}
                                        outputValues={taskStep.data.output_values}
                                        outputFields={taskStep.data?.output_fields || []}
                                        sections={taskStep.data?.sections || []}
                                      />
                                    )
                                  )}
                                </div>
                              ))}
                            </TabsContent>
                          ))}
                        </Tabs>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
              
              {/* Join Step */}
              {section.joinStep && (
                <div className="ml-6">
                  <StepRow 
                    step={section.joinStep} 
                    steps={steps} 
                    isLast={sectionIdx === organizedSections.length - 1}
                    showJoinSummary
                    activeBranches={ticket?.active_branches || []}
                  />
                </div>
              )}
            </div>
          );
        }
        
        // Render SUB_WORKFLOW_STEP section with grouped child steps
        if (section.type === 'sub-workflow-section' && section.parentStep) {
          const parentStep = section.parentStep;
          const childSteps = section.subWorkflowSteps || [];
          const completedCount = childSteps.filter(s => s.state === "COMPLETED").length;
          const totalCount = childSteps.length;
          
          return (
            <div key={parentStep.ticket_step_id} className="space-y-3">
              {/* Sub-Workflow Parent Step */}
              <StepRow step={parentStep} steps={steps} isLast={false} />
              
              {/* Sub-Workflow Steps Container */}
              {childSteps.length > 0 && (
                <div className="ml-6 p-4 rounded-xl bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200/50 dark:border-purple-800/30 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-purple-200/50 dark:border-purple-800/30">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
                      <Workflow className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                        {section.subWorkflowName}
                      </span>
                      <p className="text-[10px] text-muted-foreground">Embedded Workflow</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={totalCount > 0 ? (completedCount / totalCount) * 100 : 0} 
                        className="w-16 h-1.5"
                      />
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {completedCount}/{totalCount}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Sub-Workflow Steps List - With Branch Grouping */}
                  <SubWorkflowStepsList childSteps={childSteps} />
                </div>
              )}
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
}

// Individual step row component
function StepRow({ 
  step, 
  steps, 
  isLast, 
  showJoinSummary = false,
  activeBranches = []
}: { 
  step: any; 
  steps: any[]; 
  isLast: boolean;
  showJoinSummary?: boolean;
  activeBranches?: any[];
}) {
  const branchColor = (step as any).branch_id ? 
    getBranchColor((step as any).branch_id, steps) : undefined;
  
  return (
    <div
      className={`flex items-start gap-4 ${
        step.state === "ACTIVE" || step.state === "WAITING_FOR_APPROVAL" || step.state === "WAITING_FOR_BRANCHES"
          ? "bg-primary/5 -mx-4 px-4 py-3 rounded-lg"
          : ""
      }`}
    >
      <div className="flex flex-col items-center">
        <StepIndicator state={step.state} stepType={step.step_type} branchColor={branchColor} />
        {!isLast && (
          <div className="w-0.5 h-8 bg-border mt-2" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{step.step_name}</span>
          <StepTypeBadge type={step.step_type} />
          <StatusBadge status={step.state} size="sm" />
        </div>
        {step.assigned_to && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-3 w-3" />
            <span>
              {step.step_type === "APPROVAL_STEP" 
                ? `Approver: ${step.assigned_to.display_name}` 
                : step.step_type === "FORM_STEP"
                ? `Form by: ${step.assigned_to.display_name}`
                : `Assigned to: ${step.assigned_to.display_name}`
              }
            </span>
          </div>
        )}
        {/* Show parallel pending approvers if exists */}
        {step.step_type === "APPROVAL_STEP" && step.parallel_pending_approvers && step.parallel_pending_approvers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <Users className="h-3 w-3" />
            <span>
              Parallel approval ({step.parallel_approval_rule === "ALL" ? "All must approve" : "Any one"}):{" "}
              {step.parallel_pending_approvers.length - (step.parallel_completed_approvers?.length || 0)} pending
              {step.parallel_completed_approvers && step.parallel_completed_approvers.length > 0 && `, ${step.parallel_completed_approvers.length} approved`}
            </span>
          </div>
        )}
        {step.due_at && (
          <SlaIndicator
            dueAt={step.due_at}
            completedAt={step.completed_at}
            size="sm"
          />
        )}
        {/* Display execution notes for completed task steps */}
        {step.step_type === "TASK_STEP" && step.state === "COMPLETED" && step.data?.execution_notes && (
          <div className="mt-2 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">📝 Execution Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{step.data.execution_notes}</p>
          </div>
        )}
        
        {/* Display output values (form fields) for completed task steps */}
        {step.step_type === "TASK_STEP" && step.state === "COMPLETED" && step.data?.output_values && Object.keys(step.data.output_values).length > 0 && (
          step.data.output_values.__is_linked_task ? (
            <LinkedTaskOutputDisplay 
              outputValues={step.data.output_values}
              outputFields={step.data?.output_fields || []}
              sections={step.data?.sections || []}
            />
          ) : (
            <TaskOutputValuesDisplay 
              step={step}
              outputValues={step.data.output_values}
              outputFields={step.data?.output_fields || []}
              sections={step.data?.sections || []}
            />
          )
        )}
        
        {/* Display notes if any */}
        {step.data?.notes && Array.isArray(step.data.notes) && step.data.notes.length > 0 && (
          <div className="mt-2 space-y-1.5 p-2 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Notes ({step.data.notes.length})</p>
            {(step.data.notes as any[]).map((note: any, idx: number) => (
              <div key={idx} className="text-xs border-l-2 border-blue-300 pl-2 py-1">
                <p className="text-foreground">{note.content}</p>
                <p className="text-muted-foreground mt-0.5">
                  {note.actor?.display_name || 'Unknown'} • {note.timestamp ? new Date(note.timestamp).toLocaleString() : ''}
                </p>
              </div>
            ))}
          </div>
        )}
        
        {/* JOIN_STEP: Show aggregated branch information */}
        {showJoinSummary && step.step_type === "JOIN_STEP" && (
          <JoinStepSummary 
            step={step} 
            allSteps={steps} 
            activeBranches={activeBranches}
          />
        )}
      </div>
    </div>
  );
}

// Component to display task output values (form fields filled by agent)
function TaskOutputValuesDisplay({
  step,
  outputValues,
  outputFields,
  sections
}: {
  step: any;
  outputValues: Record<string, any>;
  outputFields: FormField[];
  sections: FormSection[];
}) {
  // Helper to format field value for display
  const formatFieldValue = (value: any, fieldType: string): string => {
    if (value === undefined || value === null || value === "") {
      return "-";
    }
    
    if (fieldType === "FILE") {
      // Handle array of attachment IDs
      if (Array.isArray(value)) {
        const attachmentIds = value.filter((v: string) => typeof v === "string" && v.startsWith("ATT-"));
        if (attachmentIds.length > 0) {
          return `${attachmentIds.length} file(s) attached`;
        }
        return "-";
      }
      if (typeof value === "string" && value.startsWith("ATT-")) {
        return "1 file attached";
      }
      if (typeof value === "string") {
        // File name or path
        return value.split("/").pop() || value;
      }
      if (value instanceof File) {
        return value.name;
      }
      return "-";
    }
    
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    
    if (Array.isArray(value)) {
      // Filter out attachment IDs from display
      const displayValues = value.filter((v: string) => !(typeof v === "string" && v.startsWith("ATT-")));
      return displayValues.join(", ") || "-";
    }
    
    if (fieldType === "DATE" && value) {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return String(value);
      }
    }
    
    if (fieldType === "USER_SELECT" && typeof value === "object" && value !== null) {
      return value.display_name || value.email || String(value);
    }
    
    // LOOKUP_USER_SELECT stores the selected user object
    if (fieldType === "LOOKUP_USER_SELECT" && typeof value === "object" && value !== null) {
      const isPrimary = value.is_primary ? " (Primary)" : "";
      return (value.display_name || value.email || String(value)) + isPrimary;
    }
    
    return String(value);
  };
  
  // Group fields by section
  const fieldsBySection = useMemo(() => {
    return sections.reduce((acc, section) => {
      acc[section.section_id] = outputFields.filter(f => f.section_id === section.section_id);
      return acc;
    }, {} as Record<string, any[]>);
  }, [outputFields, sections]);
  
  const ungroupedFields = useMemo(() => {
    return outputFields.filter(f => !f.section_id);
  }, [outputFields]);
  
  // Sort sections by order
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);
  
  return (
    <div className="mt-2 p-3 rounded-lg bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-3">📋 Task Form Data</p>
      
      {/* Render sections with their fields */}
      {sortedSections.map((section) => {
        const sectionFields = fieldsBySection[section.section_id] || [];
        if (sectionFields.length === 0) return null;
        
        // Check if this is a repeating section
        if (section.is_repeating) {
          const sectionDataKey = `__section_${section.section_id}`;
          const rows = Array.isArray(outputValues[sectionDataKey]) ? outputValues[sectionDataKey] : [];
          
          if (rows.length === 0) return null;
          
          return (
            <div key={section.section_id} className="mb-4 last:mb-0">
              <h4 className="text-sm font-semibold text-foreground mb-2">{section.section_title}</h4>
              {section.section_description && (
                <p className="text-xs text-muted-foreground mb-2">{section.section_description}</p>
              )}
              <div className="space-y-3">
                {rows.map((row: Record<string, any>, rowIndex: number) => (
                  <Card key={`${section.section_id}_row_${rowIndex}`} className="border-2">
                    <CardHeader className="pb-2">
                      <h5 className="text-xs font-medium text-muted-foreground">Row {rowIndex + 1}</h5>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {sectionFields.map((field: FormField) => (
                          <div key={field.field_key} className="space-y-1">
                            <dt className="text-muted-foreground text-xs">{field.field_label}</dt>
                            <dd className="font-medium">
                              {formatFieldValue(row[field.field_key], field.field_type)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        }
        
        // Non-repeating section
        return (
          <div key={section.section_id} className="mb-4 last:mb-0">
            <h4 className="text-sm font-semibold text-foreground mb-2">{section.section_title}</h4>
            {section.section_description && (
              <p className="text-xs text-muted-foreground mb-2">{section.section_description}</p>
            )}
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm pl-2">
              {sectionFields.map((field: FormField) => (
                <div key={field.field_key} className="space-y-1">
                  <dt className="text-muted-foreground text-xs">{field.field_label}</dt>
                  <dd className="font-medium">
                    {formatFieldValue(outputValues[field.field_key], field.field_type)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      
      {/* Render ungrouped fields */}
      {ungroupedFields.length > 0 && (
        <div className="space-y-3">
          {sortedSections.length > 0 && <Separator className="my-3" />}
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {ungroupedFields.map((field: FormField) => (
              <div key={field.field_key} className="space-y-1">
                <dt className="text-muted-foreground text-xs">{field.field_label}</dt>
                <dd className="font-medium">
                  {formatFieldValue(outputValues[field.field_key], field.field_type)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      
      {outputFields.length === 0 && (
        <p className="text-xs text-muted-foreground">No form data available</p>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    "submit-form": "Submit Form",
    approve: "Accept",
    reject: "Reject",
    "complete-task": "Complete Task",
    "request-info": "Request Info",
    "respond-info": "Respond",
    "assign-agent": "Assign Agent",
  };
  return map[action] || action;
}

function formatEventDetails(eventType: string, details: Record<string, unknown>): React.ReactNode {
  // Format details based on event type for better readability
  const items: React.ReactNode[] = [];
  
  if (eventType === "INFO_REQUESTED" && details.question_text) {
    items.push(
      <p key="question" className="italic">&quot;{String(details.question_text)}&quot;</p>
    );
  }
  
  if (eventType === "INFO_RESPONDED" && details.response_text) {
    items.push(
      <p key="response" className="italic">&quot;{String(details.response_text)}&quot;</p>
    );
  }
  
  if (eventType === "APPROVAL_REJECTED" && details.comment) {
    items.push(
      <p key="reason">Reason: {String(details.comment)}</p>
    );
  }
  
  if (eventType === "AGENT_ASSIGNED" && details.agent_email) {
    items.push(
      <p key="agent">Assigned to: {String(details.agent_email)}</p>
    );
  }
  
  if (eventType === "TASK_COMPLETED" && details.execution_notes) {
    items.push(
      <p key="notes">Notes: {String(details.execution_notes)}</p>
    );
  }
  
  if (details.step_name) {
    items.push(
      <p key="step" className="text-xs">Step: {String(details.step_name)}</p>
    );
  }
  
  // If no specific formatting, show a clean list of key-value pairs
  if (items.length === 0) {
    const cleanDetails = Object.entries(details)
      .filter(([key]) => !["step_id", "ticket_step_id", "version"].includes(key))
      .map(([key, value]) => (
        <p key={key} className="text-xs">
          {key.replace(/_/g, " ")}: {String(value)}
        </p>
      ));
    return cleanDetails.length > 0 ? cleanDetails : null;
  }
  
  return items;
}