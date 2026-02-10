/**
 * Premium Visual Workflow Designer
 * Modern, stunning UI inspired by Linear, Vercel, and Raycast
 * Features: Conditional Branching, Drag & Drop, Preview Mode
 */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import dynamic from "next/dynamic";
import { useWorkflow, useSaveDraft, usePublishWorkflow, useValidateWorkflow, useUpdateMetadata, useWorkflowVersions, usePublishedWorkflowsForEmbedding } from "@/hooks/use-workflows";
import { useGenerateWorkflow } from "@/hooks/use-genai";
import { useLookups } from "@/hooks/use-lookups";
import { PageContainer } from "@/components/page-header";
import { WorkflowStatusBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading-skeleton";
import { ErrorState, NotFoundError } from "@/components/error-state";
import { UserSearchSelect } from "@/components/user-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, Upload, Sparkles, Plus, Trash2, CheckCircle, AlertTriangle, XCircle, Settings, FileText, CheckSquare, ListChecks, Bell, MoreHorizontal, Copy, Play, Flag, Zap, Users, X, Workflow, Layers, Loader2, PlusCircle, Wand2, MoveUp, MoveDown, ChevronDown, Command, Keyboard, LayoutGrid, Eye, GitBranch, GripVertical, Split, Merge, Download, History, Link2, Info, Star, AlertCircle, Package, ChevronRight, ChevronUp, Table2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { WorkflowDefinition, StepTemplate, StepType, TransitionTemplate, FormField, ConditionOperator } from "@/lib/types";

// Dynamic imports for new components - MUST be at module level to prevent re-mounting
const DraggableStepList = dynamic(() => import("@/components/workflow-studio/draggable-step-list").then(m => m.DraggableStepList), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
});
const WorkflowPreview = dynamic(() => import("@/components/workflow-studio/workflow-preview").then(m => m.WorkflowPreview), { ssr: false });
const ConditionBuilder = dynamic(() => import("@/components/workflow-studio/condition-builder").then(m => m.ConditionBuilder), { ssr: false });
const FormFieldBuilderComponent = dynamic(() => import("@/components/workflow-studio/form-field-builder").then(m => m.FormFieldBuilder), { 
  ssr: false, 
  loading: () => <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div> 
});
const VersionHistory = dynamic(() => import("@/components/workflow-studio/version-history").then(m => m.VersionHistory), { ssr: false });
const LookupManager = dynamic(() => import("@/components/workflow-studio/lookup-manager").then(m => m.LookupManager), { 
  ssr: false,
  loading: () => <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
});

const stepTypeConfig: Record<StepType, { icon: any; label: string; color: string; bg: string; gradient: string; glow: string; desc: string }> = {
  FORM_STEP: { icon: FileText, label: "Form", color: "text-blue-400", bg: "bg-blue-500/15", gradient: "from-blue-500 to-cyan-400", glow: "shadow-blue-500/30", desc: "Collect data" },
  APPROVAL_STEP: { icon: CheckSquare, label: "Approval", color: "text-emerald-400", bg: "bg-emerald-500/15", gradient: "from-emerald-500 to-teal-400", glow: "shadow-emerald-500/30", desc: "Get approval" },
  TASK_STEP: { icon: ListChecks, label: "Task", color: "text-amber-400", bg: "bg-amber-500/15", gradient: "from-amber-500 to-orange-400", glow: "shadow-amber-500/30", desc: "Assign work" },
  NOTIFY_STEP: { icon: Bell, label: "Notify", color: "text-purple-400", bg: "bg-purple-500/15", gradient: "from-purple-500 to-pink-400", glow: "shadow-purple-500/30", desc: "Send notification" },
  FORK_STEP: { icon: Split, label: "Fork", color: "text-rose-400", bg: "bg-rose-500/15", gradient: "from-rose-500 to-red-400", glow: "shadow-rose-500/30", desc: "Parallel branches" },
  JOIN_STEP: { icon: Merge, label: "Join", color: "text-cyan-400", bg: "bg-cyan-500/15", gradient: "from-cyan-500 to-blue-400", glow: "shadow-cyan-500/30", desc: "Merge branches" },
  SUB_WORKFLOW_STEP: { icon: Workflow, label: "Workflow", color: "text-indigo-400", bg: "bg-indigo-500/15", gradient: "from-indigo-500 to-violet-400", glow: "shadow-indigo-500/30", desc: "Embed workflow" },
};

// Component to select a lookup table from available lookups
function LookupTableSelect({ workflowId, value, onChange }: { workflowId: string; value: string; onChange: (v: string) => void }) {
  const { data: lookupsData, isLoading } = useLookups(workflowId);
  const lookups = lookupsData?.items || [];
  
  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Loading lookups...</div>;
  }
  
  if (lookups.length === 0) {
    return (
      <div className="text-xs text-amber-600 dark:text-amber-400 p-2 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-950/30">
        No lookup tables found. Create one in the Lookups manager first.
      </div>
    );
  }
  
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl">
        <SelectValue placeholder="Select a lookup table" />
      </SelectTrigger>
      <SelectContent>
        {lookups.map((lookup) => (
          <SelectItem key={lookup.lookup_id} value={lookup.lookup_id}>
            <div className="flex items-center gap-2">
              <Table2 className="h-3.5 w-3.5 text-violet-500" />
              <span>{lookup.name}</span>
              <span className="text-xs text-muted-foreground">({lookup.entries?.length || 0} entries)</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Published Workflows Section Component
 * Shows list of published workflows that can be embedded as sub-workflows
 * Expanded by default so users can see available workflows
 * Collapsible to give more space to Step Library when needed
 */
function PublishedWorkflowsSection({ 
  workflowId, 
  onAddSubWorkflow 
}: { 
  workflowId: string;
  onAddSubWorkflow: (workflow: {
    workflow_id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    current_version: number;
    step_count: number;
  }) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true); // Expanded by default so users can see workflows
  const { data, isLoading } = usePublishedWorkflowsForEmbedding(workflowId);
  
  const workflows = data?.items || [];
  
  return (
    <div className="border-t">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <Package className="h-3.5 w-3.5" />
        <span className="font-medium flex-1 text-left">PUBLISHED WORKFLOWS</span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {workflows.length}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 space-y-1.5 max-h-60 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p>No published workflows available</p>
              <p className="mt-1 text-[10px]">Publish workflows to embed them here</p>
            </div>
          ) : (
            workflows.map((wf) => (
              <button
                key={wf.workflow_id}
                onClick={() => onAddSubWorkflow(wf)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/15 transition-all group text-left"
              >
                <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-400 shadow-lg shadow-indigo-500/30">
                  <Workflow className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{wf.name}</p>
                  <p className="text-xs text-muted-foreground">
                    v{wf.current_version} • {wf.step_count} steps
                  </p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Migrate steps to have explicit branch_id for proper branch tracking.
 * This analyzes the workflow structure and assigns branch_id to steps
 * that belong to parallel branches but don't have it set yet.
 */
function migrateStepBranchIds(def: WorkflowDefinition): WorkflowDefinition {
  const steps = [...def.steps];
  const transitions = def.transitions;
  let hasChanges = false;
  
  // Find all fork steps
  const forkSteps = steps.filter(s => s.step_type === "FORK_STEP" && s.branches && s.branches.length > 0);
  
  for (const forkStep of forkSteps) {
    if (!forkStep.branches) continue;
    
    for (const branch of forkStep.branches) {
      if (!branch.start_step_id) continue;
      
      // Trace all steps in this branch using transitions
      const visited = new Set<string>();
      const queue = [branch.start_step_id];
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        // Find the step
        const stepIndex = steps.findIndex(s => s.step_id === currentId);
        if (stepIndex === -1) continue;
        
        const step = steps[stepIndex];
        
        // Stop at JOIN steps
        if (step.step_type === "JOIN_STEP") continue;
        
        // Assign branch_id if not already set
        if (!step.branch_id) {
          steps[stepIndex] = {
            ...step,
            branch_id: branch.branch_id,
            parent_fork_step_id: forkStep.step_id,
          };
          hasChanges = true;
        }
        
        // Find next steps via transitions
        const outgoing = transitions.filter(t => 
          t.from_step_id === currentId &&
          (t.on_event === "SUBMIT_FORM" || t.on_event === "APPROVE" || t.on_event === "COMPLETE_TASK")
        );
        
        for (const trans of outgoing) {
          if (trans.to_step_id && !visited.has(trans.to_step_id)) {
            // Don't follow to JOIN step or to other branches' start steps
            const targetStep = steps.find(s => s.step_id === trans.to_step_id);
            if (targetStep && targetStep.step_type !== "JOIN_STEP") {
              // Check if it's another branch's start step
              const isOtherBranchStart = forkStep.branches?.some(
                b => b.branch_id !== branch.branch_id && b.start_step_id === trans.to_step_id
              );
              if (!isOtherBranchStart) {
                queue.push(trans.to_step_id);
              }
            }
          }
        }
      }
    }
  }
  
  return hasChanges ? { ...def, steps } : def;
}

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = params.workflowId as string;
  const isAiMode = searchParams.get("mode") === "ai";
  const initialPrompt = searchParams.get("prompt");

  const { data: workflow, isLoading, error, refetch } = useWorkflow(workflowId);
  const saveDraft = useSaveDraft();
  const publishWorkflow = usePublishWorkflow();
  const validateWorkflow = useValidateWorkflow();
  const generateWorkflow = useGenerateWorkflow();
  const updateMetadata = useUpdateMetadata();

  // State
  const [definition, setDefinition] = useState<WorkflowDefinition>({ steps: [], transitions: [], start_step_id: "" });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState(initialPrompt || "");
  const [validationResult, setValidationResult] = useState<{ is_valid: boolean; errors: Array<{ type: string; message: string }>; warnings: Array<{ type: string; message: string }> } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isStepSheetOpen, setIsStepSheetOpen] = useState(false);
  const [insertAfterStepId, setInsertAfterStepId] = useState<string | null>(null);
  const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "transitions">("config");
  
  // Settings dialog state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isLookupManagerOpen, setIsLookupManagerOpen] = useState(false);
  const [workflowMetadata, setWorkflowMetadata] = useState({
    name: "",
    description: "",
    category: "",
    tags: [] as string[],
    newTag: "",
  });

  // Track if definition has been initialized to prevent overwriting local changes
  const [definitionInitialized, setDefinitionInitialized] = useState(false);

  // Sync definition and metadata from workflow when loaded
  useEffect(() => {
    if (workflow && !definitionInitialized) {
      // Check if there's an imported definition in sessionStorage
      const importKey = `import_workflow_${workflowId}`;
      const importedDefinition = sessionStorage.getItem(importKey);
      
      // Check if there's a restored version in sessionStorage
      const restoreKey = `restore_version_${workflowId}`;
      const restoredDefinition = sessionStorage.getItem(restoreKey);
      
      // Handle version restore (from card 3-dot menu)
      if (restoredDefinition && searchParams.get("restore") === "true") {
        try {
          const def = JSON.parse(restoredDefinition);
          if (def && def.steps && Array.isArray(def.steps)) {
            const restoredDef: WorkflowDefinition = {
              steps: def.steps || [],
              transitions: def.transitions || [],
              start_step_id: def.start_step_id || (def.steps[0]?.step_id || ""),
            };
            const migratedDef = migrateStepBranchIds(restoredDef);
            setDefinition(migratedDef);
            setHasChanges(true);
            setDefinitionInitialized(true);
            sessionStorage.removeItem(restoreKey);
            toast.success("Version restored to draft. Save to keep changes.");
          }
        } catch {
          // Failed to parse restored definition - will fall back to workflow definition
        }
      }
      // Handle import
      else if (importedDefinition && searchParams.get("import") === "true") {
        try {
          const def = JSON.parse(importedDefinition);
          if (def && def.steps && Array.isArray(def.steps)) {
            const importedDef: WorkflowDefinition = {
              steps: def.steps || [],
              transitions: def.transitions || [],
              start_step_id: def.start_step_id || (def.steps[0]?.step_id || ""),
            };
            // Migrate legacy steps to have proper branch_id
            const migratedDef = migrateStepBranchIds(importedDef);
            setDefinition(migratedDef);
            setHasChanges(true);
            setDefinitionInitialized(true);
            // Auto-save the imported definition
            saveDraft.mutateAsync({ workflowId, definition: migratedDef }).then(() => {
              setHasChanges(false);
              toast.success("Imported workflow saved successfully");
            }).catch(() => {
              toast.error("Failed to save imported workflow");
            });
            // Clear the sessionStorage after loading
            sessionStorage.removeItem(importKey);
          }
        } catch {
          // Fall back to workflow definition
        }
      }
      
      // If no import or restore, use workflow definition
      const hasSpecialLoad = (importedDefinition && searchParams.get("import") === "true") || 
                             (restoredDefinition && searchParams.get("restore") === "true");
      if (!hasSpecialLoad) {
        const def = workflow.definition;
        if (def && def.steps && Array.isArray(def.steps)) {
          // Build the definition and migrate branch IDs for existing steps
          const loadedDef: WorkflowDefinition = {
            steps: def.steps || [],
            transitions: def.transitions || [],
            start_step_id: def.start_step_id || (def.steps[0]?.step_id || ""),
          };
          // Migrate legacy steps to have proper branch_id
          const migratedDef = migrateStepBranchIds(loadedDef);
          setDefinition(migratedDef);
          setDefinitionInitialized(true);
        } else {
          setDefinition({ steps: [], transitions: [], start_step_id: "" });
          setDefinitionInitialized(true);
        }
      }
      
      // Sync metadata
      setWorkflowMetadata({
        name: workflow.name || "",
        description: workflow.description || "",
        category: workflow.category || "",
        tags: workflow.tags || [],
        newTag: "",
      });
    }
  }, [workflow, workflowId, searchParams, definitionInitialized]);

  // Auto-generate AI workflow if mode=ai and prompt provided
  const [aiGenerated, setAiGenerated] = useState(false);
  useEffect(() => {
    if (isAiMode && initialPrompt && definition.steps.length === 0 && !generateWorkflow.isPending && !aiGenerated) {
      setAiGenerated(true);
      handleAIGenerate(initialPrompt);
    }
  }, [isAiMode, initialPrompt, definition.steps.length, generateWorkflow.isPending, aiGenerated]);

  const selectedStep = definition.steps.find((s) => s.step_id === selectedStepId);

  // Get available fields from all form steps (for condition builder) - memoized for performance
  const availableFields = useMemo(() => 
    definition.steps
      .filter((s) => s.step_type === "FORM_STEP" && s.fields)
      .flatMap((s) =>
        (s.fields || []).map((f: FormField) => ({
          key: `form_values.${f.field_key}`,
          label: f.field_label,
          type: f.field_type,
        }))
      ),
    [definition.steps]
  );

  // Real-time local validation - runs whenever definition changes
  useEffect(() => {
    if (definition.steps.length === 0) {
      setValidationResult(null);
      return;
    }
    
    const errors: Array<{ type: string; message: string }> = [];
    const warnings: Array<{ type: string; message: string }> = [];
    
    // Check for start step
    const hasStart = definition.start_step_id || definition.steps.some(s => s.is_start === true);
    if (!hasStart && definition.steps.length > 0) {
      warnings.push({ type: "NO_START", message: "No start step defined (first step will be used)" });
    }
    
    // Check for terminal step - explicitly check for true (not truthy)
    const hasTerminal = definition.steps.some(s => s.is_terminal === true);
    if (!hasTerminal) {
      errors.push({ type: "NO_TERMINAL", message: "Workflow must have at least one terminal step" });
    }
    
    // Check for orphan steps (no incoming transitions except start) - skip for single step workflows
    if (definition.steps.length > 1) {
      const startStepId = definition.start_step_id || definition.steps.find(s => s.is_start)?.step_id || definition.steps[0]?.step_id;
      definition.steps.forEach(step => {
        if (step.step_id !== startStepId) {
          const hasIncoming = definition.transitions.some(t => t.to_step_id === step.step_id);
          if (!hasIncoming) {
            warnings.push({ type: "ORPHAN_STEP", message: `"${step.step_name}" has no incoming transitions` });
          }
        }
      });
    }
    
    // Check form steps have at least one field
    definition.steps.filter(s => s.step_type === "FORM_STEP").forEach(step => {
      if (!step.fields || step.fields.length === 0) {
        warnings.push({ type: "EMPTY_FORM", message: `Form "${step.step_name}" has no fields` });
      }
    });
    
    // Check approval steps have REJECT handling (either terminal or has REJECT transition)
    definition.steps.filter(s => s.step_type === "APPROVAL_STEP").forEach(step => {
      const hasRejectTransition = definition.transitions.some(
        t => t.from_step_id === step.step_id && t.on_event === "REJECT"
      );
      if (!hasRejectTransition && !step.is_terminal) {
        warnings.push({ 
          type: "NO_REJECT_HANDLING", 
          message: `"${step.step_name}" has no REJECT transition (rejection will end workflow)` 
        });
      }
    });
    
    // Check task steps have instructions
    definition.steps.filter(s => s.step_type === "TASK_STEP").forEach(step => {
      if (!step.instructions || step.instructions.trim().length === 0) {
        warnings.push({ type: "NO_INSTRUCTIONS", message: `Task "${step.step_name}" has no instructions` });
      }
    });
    
    setValidationResult({ is_valid: errors.length === 0, errors, warnings });
  }, [definition]);

  // Action handlers
  const handleSaveDraft = async () => {
    try {
      const result = await saveDraft.mutateAsync({ workflowId, definition });
      setValidationResult(result.validation);
      setHasChanges(false);
      toast.success("Saved successfully");
    } catch { toast.error("Failed to save"); }
  };

  const handleSaveStep = async () => {
    setIsSavingStep(true);
    try {
      const result = await saveDraft.mutateAsync({ workflowId, definition });
      
      setValidationResult(result.validation);
      setHasChanges(false);
      
      toast.success("Step saved successfully");
      setIsStepSheetOpen(false);
    } catch (err: unknown) { 
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save step: ${message}`); 
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validateWorkflow.mutateAsync(workflowId);
      setValidationResult(result);
      toast[result.is_valid ? "success" : "error"](result.is_valid ? "Workflow is valid!" : `${result.errors.length} error(s) found`);
    } catch { toast.error("Validation failed"); }
  };

  const handlePublish = async () => {
    try { 
      await publishWorkflow.mutateAsync(workflowId); 
      refetch(); 
      toast.success("Workflow published successfully!"); 
      // Navigate to workflow studio page after successful publish
      setTimeout(() => {
        router.push("/studio");
      }, 500); // Small delay to show the success toast
    } catch { 
      toast.error("Failed to publish"); 
    }
  };

  const handleAIGenerate = async (prompt?: string) => {
    const text = prompt || aiPrompt;
    if (!text.trim()) return;
    try {
      const result = await generateWorkflow.mutateAsync({ promptText: text });
      setDefinition(result.draft_definition);
      setValidationResult(result.validation);
      setHasChanges(true);
      toast.success("Workflow generated!");
    } catch { toast.error("Generation failed"); }
  };

  const handleExportWorkflow = () => {
    try {
      const exportData = {
        name: workflowMetadata.name || workflow?.name || "Untitled Workflow",
        description: workflowMetadata.description || workflow?.description || "",
        category: workflowMetadata.category || workflow?.category || "",
        tags: workflowMetadata.tags || workflow?.tags || [],
        definition: definition,
        exported_at: new Date().toISOString(),
        version: "1.0"
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportData.name.replace(/[^a-z0-9]/gi, "_")}_workflow.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Workflow exported successfully");
    } catch {
      toast.error("Failed to export workflow");
    }
  };

  const getTransitionEvent = (type: StepType): string => ({ 
    FORM_STEP: "SUBMIT_FORM", 
    APPROVAL_STEP: "APPROVE", 
    TASK_STEP: "COMPLETE_TASK", 
    NOTIFY_STEP: "COMPLETE_TASK",
    FORK_STEP: "COMPLETE_TASK",  // Fork auto-completes
    JOIN_STEP: "COMPLETE_TASK",  // Join completes when all branches done
    SUB_WORKFLOW_STEP: "COMPLETE_TASK",  // Sub-workflow completes when child workflow done
  }[type] || "COMPLETE_TASK");

  const addStep = (type: StepType) => {
    const newStep: StepTemplate = { 
      step_id: `step_${Date.now()}`, 
      step_name: `New ${stepTypeConfig[type].label}`, 
      step_type: type, 
      order: definition.steps.length, 
      is_start: definition.steps.length === 0 
    };
    if (type === "APPROVAL_STEP") newStep.approver_resolution = "REQUESTER_MANAGER";
    if (type === "TASK_STEP") { newStep.instructions = ""; newStep.execution_notes_required = false; }
    if (type === "FORM_STEP") newStep.fields = [];
    if (type === "NOTIFY_STEP") newStep.is_terminal = true;
    if (type === "FORK_STEP") { 
      newStep.branches = []; 
      newStep.failure_policy = "FAIL_ALL";
    }
    if (type === "JOIN_STEP") {
      newStep.join_mode = "ALL";
      newStep.source_fork_step_id = "";
    }
    
    const transitions = [...definition.transitions];
    if (definition.steps.length > 0) {
      const last = definition.steps[definition.steps.length - 1];
      transitions.push({ 
        transition_id: `t_${Date.now()}`, 
        from_step_id: last.step_id, 
        to_step_id: newStep.step_id, 
        on_event: getTransitionEvent(last.step_type),
        priority: 0
      });
    }
    setDefinition({ 
      ...definition, 
      steps: [...definition.steps, newStep], 
      transitions, 
      start_step_id: definition.steps.length === 0 ? newStep.step_id : definition.start_step_id 
    });
    setSelectedStepId(newStep.step_id);
    setIsStepSheetOpen(true);
    setHasChanges(true);
  };

  // Add a sub-workflow step (embedding a published workflow)
  const addSubWorkflowStep = (publishedWorkflow: {
    workflow_id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    current_version: number;
    step_count: number;
  }) => {
    const newStep: StepTemplate = { 
      step_id: `step_${Date.now()}`, 
      step_name: publishedWorkflow.name, 
      step_type: "SUB_WORKFLOW_STEP" as StepType, 
      order: definition.steps.length, 
      is_start: definition.steps.length === 0,
      // Sub-workflow specific fields
      sub_workflow_id: publishedWorkflow.workflow_id,
      sub_workflow_version: publishedWorkflow.current_version,
      sub_workflow_name: publishedWorkflow.name,
      sub_workflow_category: publishedWorkflow.category || undefined,
    };
    
    const transitions = [...definition.transitions];
    if (definition.steps.length > 0) {
      const last = definition.steps[definition.steps.length - 1];
      transitions.push({ 
        transition_id: `t_${Date.now()}`, 
        from_step_id: last.step_id, 
        to_step_id: newStep.step_id, 
        on_event: getTransitionEvent(last.step_type),
        priority: 0
      });
    }
    
    // Add transition from sub-workflow to next (using SUB_WORKFLOW_COMPLETED event)
    // This will be connected when the next step is added
    
    setDefinition({ 
      ...definition, 
      steps: [...definition.steps, newStep], 
      transitions, 
      start_step_id: definition.steps.length === 0 ? newStep.step_id : definition.start_step_id 
    });
    setSelectedStepId(newStep.step_id);
    setIsStepSheetOpen(true);
    setHasChanges(true);
    toast.success(`Added "${publishedWorkflow.name}" workflow`);
  };

  const insertStepAfter = (afterId: string, type: StepType) => {
    const after = definition.steps.find(s => s.step_id === afterId);
    if (!after) return;
    
    const newStep: StepTemplate = { 
      step_id: `step_${Date.now()}`, 
      step_name: `New ${stepTypeConfig[type].label}`, 
      step_type: type, 
      order: (after.order || 0) + 0.5 
    };
    if (type === "APPROVAL_STEP") newStep.approver_resolution = "REQUESTER_MANAGER";
    if (type === "TASK_STEP") { newStep.instructions = ""; newStep.execution_notes_required = false; }
    if (type === "FORM_STEP") newStep.fields = [];
    
    const newTransitions = definition.transitions.map(t => 
      t.from_step_id === afterId ? { ...t, from_step_id: newStep.step_id } : t
    );
    newTransitions.push({ 
      transition_id: `t_${Date.now()}`, 
      from_step_id: afterId, 
      to_step_id: newStep.step_id, 
      on_event: getTransitionEvent(after.step_type),
      priority: 0
    });
    
    const newSteps = [...definition.steps, newStep]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((s, i) => ({ ...s, order: i }));
    
    setDefinition({ ...definition, steps: newSteps, transitions: newTransitions });
    setSelectedStepId(newStep.step_id);
    setIsStepSheetOpen(true);
    setInsertAfterStepId(null);
    setIsAddStepDialogOpen(false);
    setHasChanges(true);
  };

  // Add step to a specific branch within a Fork
  const addStepToBranch = useCallback((forkStepId: string, branchId: string, afterStepId: string | null, type: StepType) => {
    const forkStep = definition.steps.find(s => s.step_id === forkStepId);
    if (!forkStep || !forkStep.branches) {
      toast.error("Failed to add step: Fork step not found");
      return;
    }
    
    const branch = forkStep.branches.find(b => b.branch_id === branchId);
    if (!branch) {
      toast.error("Failed to add step: Branch not found");
      return;
    }
    
    // Find the JOIN step for this fork
    const joinStep = definition.steps.find(s => 
      s.step_type === "JOIN_STEP" && s.source_fork_step_id === forkStepId
    );
    
    // Create the new step with explicit branch_id for proper tracking
    const newStepId = `step_${Date.now()}`;
    const stepName = `${branch.branch_name} - ${stepTypeConfig[type].label}`;
    const newStep: StepTemplate = { 
      step_id: newStepId, 
      step_name: stepName, 
      step_type: type, 
      order: definition.steps.length,
      description: `Step in ${branch.branch_name} branch`,
      // Store branch association explicitly (not just in name)
      branch_id: branchId,
      parent_fork_step_id: forkStepId,
    };
    
    // Set type-specific defaults
    if (type === "APPROVAL_STEP") newStep.approver_resolution = "REQUESTER_MANAGER";
    if (type === "TASK_STEP") { newStep.instructions = ""; newStep.execution_notes_required = false; }
    if (type === "FORM_STEP") newStep.fields = [];
    
    const newTransitions = [...definition.transitions];
    
    if (afterStepId) {
      // Insert after existing step in branch
      const afterStep = definition.steps.find(s => s.step_id === afterStepId);
      if (!afterStep) {
        toast.error("Failed to add step: Previous step not found");
        return;
      }
      
      // Find ALL outgoing transitions from afterStep (to handle any edge cases)
      const afterStepOutgoing = definition.transitions.filter(t => 
        t.from_step_id === afterStepId &&
        (t.on_event === "SUBMIT_FORM" || t.on_event === "APPROVE" || t.on_event === "COMPLETE_TASK")
      );
      
      // Remove ALL transitions from afterStep (we'll recreate the necessary ones)
      afterStepOutgoing.forEach(trans => {
        const idx = newTransitions.findIndex(t => t.transition_id === trans.transition_id);
        if (idx !== -1) {
          newTransitions.splice(idx, 1);
        }
      });
      
      // Add transition from afterStep to new step
      const timestamp = Date.now();
      const afterToNewEvent = getTransitionEvent(afterStep.step_type);
      newTransitions.push({ 
        transition_id: `t_${timestamp}_a`, 
        from_step_id: afterStepId, 
        to_step_id: newStepId, 
        on_event: afterToNewEvent,
        priority: 0
      });
      
      // Add transition from new step to join (if join exists)
      // OR reconnect to whatever afterStep was pointing to
      if (joinStep) {
        const newToJoinEvent = getTransitionEvent(type);
        newTransitions.push({ 
          transition_id: `t_${timestamp}_b`, 
          from_step_id: newStepId, 
          to_step_id: joinStep.step_id, 
          on_event: newToJoinEvent,
          priority: 0
        });
      } else {
        // If no join, reconnect to whatever afterStep was pointing to (if any)
        const targetStepId = afterStepOutgoing[0]?.to_step_id;
        if (targetStepId && targetStepId !== newStepId) {
          const newToTargetEvent = getTransitionEvent(type);
          newTransitions.push({ 
            transition_id: `t_${timestamp}_c`, 
            from_step_id: newStepId, 
            to_step_id: targetStepId, 
            on_event: newToTargetEvent,
            priority: 0
          });
        }
      }
    } else {
      // This is the first step in the branch
      // Update the branch's start_step_id
      const updatedBranches = forkStep.branches.map(b => 
        b.branch_id === branchId ? { ...b, start_step_id: newStepId } : b
      );
      
      // Add transition from fork step to new step (for this branch)
      // Find existing fork transitions and ensure we have one for this branch
      const forkToBranchTransition = newTransitions.find(t => 
        t.from_step_id === forkStepId && t.to_step_id === branch.start_step_id
      );
      
      // If there's an existing start step, remove its transition from fork
      if (branch.start_step_id) {
        const existingForkTransitionIdx = newTransitions.findIndex(t => 
          t.from_step_id === forkStepId && t.to_step_id === branch.start_step_id
        );
        if (existingForkTransitionIdx !== -1) {
          newTransitions.splice(existingForkTransitionIdx, 1);
        }
      }
      
      // Add transition from fork to new step
      newTransitions.push({ 
        transition_id: `t_${Date.now()}_fork`, 
        from_step_id: forkStepId, 
        to_step_id: newStepId, 
        on_event: "COMPLETE_TASK", // Fork step completes and activates branches
        priority: 0
      });
      
      // Add transition from new step to join (if join exists)
      if (joinStep) {
        newTransitions.push({ 
          transition_id: `t_${Date.now()}_c`, 
          from_step_id: newStepId, 
          to_step_id: joinStep.step_id, 
          on_event: getTransitionEvent(type),
          priority: 0
        });
      }
    }
    
    // Insert the new step in the correct position
    // For branch steps, we want to insert them near other branch steps, not at the end
    let insertIndex = definition.steps.length;
    
    if (afterStepId) {
      // Insert right after the afterStep
      const afterIndex = definition.steps.findIndex(s => s.step_id === afterStepId);
      if (afterIndex !== -1) {
        insertIndex = afterIndex + 1;
        
        // Make sure we don't insert after a join step
        if (joinStep) {
          const joinIndex = definition.steps.findIndex(s => s.step_id === joinStep.step_id);
          if (joinIndex !== -1 && insertIndex > joinIndex) {
            insertIndex = joinIndex; // Insert before join instead
          }
        }
        
        // Also ensure we don't insert after steps from other branches
        const forkIndex = definition.steps.findIndex(s => s.step_id === forkStepId);
        if (forkIndex !== -1) {
          const otherBranchStartIds = new Set(
            forkStep.branches
              .filter(b => b.branch_id !== branchId && b.start_step_id)
              .map(b => b.start_step_id)
          );
          
          for (let i = insertIndex; i < definition.steps.length; i++) {
            const step = definition.steps[i];
            if (otherBranchStartIds.has(step.step_id)) {
              insertIndex = i;
              break;
            }
          }
        }
      }
    } else {
      // For first step in branch, find where to insert it
      const forkIndex = definition.steps.findIndex(s => s.step_id === forkStepId);
      if (forkIndex !== -1) {
        const joinIndex = joinStep ? definition.steps.findIndex(s => s.step_id === joinStep.step_id) : -1;
        
        if (joinIndex > forkIndex) {
          insertIndex = joinIndex; // Insert before join
        } else {
          insertIndex = forkIndex + 1; // Insert right after fork
        }
      }
    }
    
    // Ensure insertIndex is valid
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > definition.steps.length) insertIndex = definition.steps.length;
    
    const newSteps = [...definition.steps];
    newSteps.splice(insertIndex, 0, newStep);
    const finalSteps = newSteps.map((s, i) => ({ ...s, order: i }));
    
    // Update fork step branches - do this for both first step and subsequent steps to ensure consistency
    const updatedBranches = forkStep.branches.map(b => 
      b.branch_id === branchId 
        ? { ...b, start_step_id: afterStepId ? b.start_step_id : newStepId }
        : b
    );
    
    const finalStepsWithBranches = finalSteps.map(s => 
      s.step_id === forkStepId ? { 
        ...s, 
        branches: updatedBranches
      } : s
    );
    
    setDefinition(prev => ({ 
      ...prev, 
      steps: finalStepsWithBranches, 
      transitions: newTransitions 
    }));
    setSelectedStepId(newStepId);
    setIsStepSheetOpen(true);
    setHasChanges(true);
    toast.success(`Added ${stepTypeConfig[type].label} to ${branch.branch_name}`);
  }, [definition, getTransitionEvent]);

  const updateStep = useCallback((id: string, updates: Partial<StepTemplate>) => {
    setDefinition(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.step_id === id ? { ...s, ...updates } : s),
    }));
    setHasChanges(true);
  }, []);

  const deleteStep = (id: string) => {
    const incoming = definition.transitions.filter(t => t.to_step_id === id);
    const outgoing = definition.transitions.filter(t => t.from_step_id === id);
    const bypass: TransitionTemplate[] = incoming.flatMap(i => 
      outgoing.map(o => ({ 
        transition_id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, 
        from_step_id: i.from_step_id, 
        to_step_id: o.to_step_id, 
        on_event: i.on_event,
        priority: 0
      }))
    );
    const newTransitions = definition.transitions.filter(t => t.from_step_id !== id && t.to_step_id !== id).concat(bypass);
    const newSteps = definition.steps.filter(s => s.step_id !== id).map((s, i) => ({ ...s, order: i }));
    let newStart = definition.start_step_id;
    if (newStart === id) { 
      newStart = newSteps[0]?.step_id || ""; 
      if (newSteps[0]) newSteps[0].is_start = true; 
    }
    setDefinition({ ...definition, steps: newSteps, transitions: newTransitions, start_step_id: newStart });
    if (selectedStepId === id) { 
      setSelectedStepId(null); 
      setIsStepSheetOpen(false); 
    }
    setHasChanges(true);
    toast.success("Step deleted");
  };

  const duplicateStep = (step: StepTemplate) => {
    const newStep = { 
      ...step, 
      step_id: `step_${Date.now()}`, 
      step_name: `${step.step_name} (copy)`, 
      order: definition.steps.length, 
      is_start: false, 
      is_terminal: false 
    };
    setDefinition({ ...definition, steps: [...definition.steps, newStep] });
    setSelectedStepId(newStep.step_id);
    setHasChanges(true);
  };

  const moveStep = (id: string, dir: "up" | "down") => {
    const idx = definition.steps.findIndex(s => s.step_id === id);
    if (idx === -1 || (dir === "up" && idx === 0) || (dir === "down" && idx === definition.steps.length - 1)) return;
    const arr = [...definition.steps];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setDefinition({ ...definition, steps: arr.map((s, i) => ({ ...s, order: i })) });
    setHasChanges(true);
  };

  const handleStepsReorder = (reorderedSteps: StepTemplate[]) => {
    // Rebuild transitions to maintain linear flow for steps without explicit branching
    // BUT preserve transitions for steps inside parallel branches (to JOIN steps)
    const newTransitions: TransitionTemplate[] = [];
    
    // Identify all JOIN steps and FORK steps
    const joinStepIds = new Set(reorderedSteps.filter(s => s.step_type === "JOIN_STEP").map(s => s.step_id));
    const forkSteps = reorderedSteps.filter(s => s.step_type === "FORK_STEP");
    
    // Collect all step IDs that are inside branches (these should preserve their transitions)
    const branchStepIds = new Set<string>();
    forkSteps.forEach(fork => {
      fork.branches?.forEach(branch => {
        if (branch.start_step_id) {
          // Trace all steps in this branch
          let currentId: string | null = branch.start_step_id;
          const visited = new Set<string>();
          
          while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            branchStepIds.add(currentId);
            
            const step = reorderedSteps.find(s => s.step_id === currentId);
            if (!step || step.step_type === "JOIN_STEP") break;
            
            // Find next step via existing transitions
            const outgoing = definition.transitions.find(t => 
              t.from_step_id === currentId && 
              (t.on_event === "SUBMIT_FORM" || t.on_event === "APPROVE" || t.on_event === "COMPLETE_TASK")
            );
            
            const nextId = outgoing?.to_step_id;
            const nextStep = nextId ? reorderedSteps.find(s => s.step_id === nextId) : null;
            
            // Stop if next is a join
            if (nextStep?.step_type === "JOIN_STEP") break;
            
            currentId = nextId || null;
          }
        }
      });
    });
    
    // Also preserve transitions that target JOIN steps (from branch steps)
    const transitionsToJoin = definition.transitions.filter(t => joinStepIds.has(t.to_step_id));
    const branchTransitionFromIds = new Set(transitionsToJoin.map(t => t.from_step_id));
    
    reorderedSteps.forEach((step, idx) => {
      // Check if this step is inside a parallel branch or transitions to a JOIN
      const isInBranch = branchStepIds.has(step.step_id) || branchTransitionFromIds.has(step.step_id);
      
      // For branch steps, preserve their original transitions completely
      if (isInBranch) {
        const existingTransitions = definition.transitions.filter(t => t.from_step_id === step.step_id);
        existingTransitions.forEach(t => newTransitions.push(t));
        return;
      }
      
      // For FORK steps, preserve their transitions (they don't have simple linear flow)
      if (step.step_type === "FORK_STEP") {
        const existingTransitions = definition.transitions.filter(t => t.from_step_id === step.step_id);
        existingTransitions.forEach(t => newTransitions.push(t));
        return;
      }
      
      // For JOIN steps, update their outgoing transitions to point to the actual next step
      // (This handles the case where a new step is inserted after JOIN)
      if (step.step_type === "JOIN_STEP") {
        const existingTransitions = definition.transitions.filter(t => t.from_step_id === step.step_id);
        const nextStep = idx < reorderedSteps.length - 1 ? reorderedSteps[idx + 1] : null;
        
        if (existingTransitions.length > 0 && nextStep) {
          // Update the JOIN's transition to point to the actual next step in order
          existingTransitions.forEach(t => {
            // If the existing transition doesn't point to the next step, update it
            if (t.to_step_id !== nextStep.step_id) {
              newTransitions.push({ ...t, to_step_id: nextStep.step_id });
            } else {
              newTransitions.push(t);
            }
          });
        } else if (existingTransitions.length > 0) {
          // No next step, just preserve existing
          existingTransitions.forEach(t => newTransitions.push(t));
        } else if (nextStep) {
          // No existing transition, create one
          newTransitions.push({
            transition_id: `t_${Date.now()}_join_${idx}`,
            from_step_id: step.step_id,
            to_step_id: nextStep.step_id,
            on_event: "COMPLETE_TASK", // JOIN steps use COMPLETE_TASK event
            priority: 0
          });
        }
        return;
      }
      
      if (idx < reorderedSteps.length - 1) {
        // Check if there's an existing transition from this step
        const existingTransitions = definition.transitions.filter(t => t.from_step_id === step.step_id);
        
        if (existingTransitions.length > 0) {
          // Keep existing transitions but update targets if needed for linear flow
          existingTransitions.forEach(t => {
            const nextStep = reorderedSteps[idx + 1];
            // Only update if it's a simple single transition without conditions
            // AND the target is not a JOIN step (preserve branch-to-join transitions)
            if (existingTransitions.length === 1 && !t.condition && !joinStepIds.has(t.to_step_id)) {
              newTransitions.push({ ...t, to_step_id: nextStep.step_id });
            } else {
              newTransitions.push(t);
            }
          });
        } else {
          // Create new transition
          newTransitions.push({
            transition_id: `t_${Date.now()}_${idx}`,
            from_step_id: step.step_id,
            to_step_id: reorderedSteps[idx + 1].step_id,
            on_event: getTransitionEvent(step.step_type),
            priority: 0
          });
        }
      }
    });

    // Update start step ID
    const newStartId = reorderedSteps[0]?.step_id || "";
    const updatedSteps = reorderedSteps.map((s, idx) => ({
      ...s,
      is_start: idx === 0,
    }));

    setDefinition({
      ...definition,
      steps: updatedSteps,
      transitions: newTransitions,
      start_step_id: newStartId,
    });
    setHasChanges(true);
  };

  const setStart = (id: string) => {
    setDefinition(prev => ({ 
      ...prev, 
      steps: prev.steps.map(s => ({ ...s, is_start: s.step_id === id })), 
      start_step_id: id 
    }));
    setHasChanges(true);
  };

  const setTerminal = (id: string, val: boolean) => { 
    updateStep(id, { is_terminal: val }); 
  };

  // Transition management
  const addBranchTransition = (fromStepId: string, toStepId: string, event: string) => {
    const fromStep = definition.steps.find(s => s.step_id === fromStepId);
    if (!fromStep) {
      toast.error("Failed to add transition: source step not found");
      return;
    }

    const newTransition: TransitionTemplate = {
      transition_id: `t_${Date.now()}`,
      from_step_id: fromStepId,
      to_step_id: toStepId,
      on_event: event,
      priority: definition.transitions.filter(t => t.from_step_id === fromStepId).length,
    };

    setDefinition(prev => ({
      ...prev,
      transitions: [...prev.transitions, newTransition],
    }));
    setHasChanges(true);
    toast.success("Transition added");
  };

  const updateTransition = (transitionId: string, updates: Partial<TransitionTemplate>) => {
    setDefinition(prev => ({
      ...prev,
      transitions: prev.transitions.map(t => 
        t.transition_id === transitionId ? { ...t, ...updates } : t
      ),
    }));
    setHasChanges(true);
  };

  const deleteTransition = (transitionId: string) => {
    setDefinition(prev => ({
      ...prev,
      transitions: prev.transitions.filter(t => t.transition_id !== transitionId),
    }));
    setHasChanges(true);
    toast.success("Transition removed");
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
  
  if (error || !workflow) return (
    <PageContainer>
      {error ? <ErrorState message="Failed to load" onRetry={refetch} /> : <NotFoundError onGoBack={() => router.push("/studio")} />}
    </PageContainer>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      {/* Premium Header */}
      <header className="flex items-center justify-between px-6 h-14 border-b glass">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" asChild>
            <Link href="/studio"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                <Workflow className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{workflow.name}</h1>
                <p className="text-xs text-muted-foreground">{workflow.category || "Workflow"}</p>
              </div>
            </div>
            <WorkflowStatusBadge status={workflow.status} />
            {hasChanges && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs animate-pulse">
                Unsaved
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Version History Button */}
          {workflow?.published_version && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsVersionHistoryOpen(true)}
              className="rounded-lg h-8 px-3 text-xs"
              title="View version history"
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              v{workflow.published_version}
            </Button>
          )}
          {/* Export Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleExportWorkflow}
            disabled={definition.steps.length === 0}
            className="rounded-lg h-8 px-3 text-xs"
            title="Export workflow as JSON"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          {/* Lookup Tables Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsLookupManagerOpen(true)} 
            className="rounded-lg h-8 px-3 text-xs"
            title="Manage lookup tables for dynamic user assignments"
          >
            <Table2 className="h-3.5 w-3.5 mr-1.5" />
            Lookups
          </Button>
          {/* Settings Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsSettingsOpen(true)} 
            className="rounded-lg h-8 px-3 text-xs"
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </Button>
          {/* Preview Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsPreviewOpen(true)} 
            disabled={definition.steps.length === 0}
            className="rounded-lg h-8 px-3 text-xs"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={handleValidate} disabled={validateWorkflow.isPending} className="rounded-lg h-8 px-3 text-xs">
            {validateWorkflow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
            Validate
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saveDraft.isPending || !hasChanges} className="rounded-lg h-8 px-3 text-xs">
            {saveDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={publishWorkflow.isPending || !validationResult?.is_valid || hasChanges} className="rounded-lg h-8 px-4 text-xs btn-premium text-white">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Publish
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass">
              <AlertDialogHeader>
                <AlertDialogTitle>Publish Workflow</AlertDialogTitle>
                <AlertDialogDescription>Create a new version and make it available.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handlePublish} className="btn-premium text-white">Publish</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Step Library & AI */}
        <aside className="w-72 border-r flex flex-col bg-card/50">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              <span className="font-medium">STEP LIBRARY</span>
            </div>
          </div>
          <div className="p-3 space-y-1.5 flex-1 overflow-auto">
            {/* Regular step types (excluding SUB_WORKFLOW_STEP which is in Published Workflows) */}
            {Object.entries(stepTypeConfig)
              .filter(([type]) => type !== "SUB_WORKFLOW_STEP")
              .map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button 
                  key={type} 
                  onClick={() => addStep(type as StepType)} 
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-primary/30 ${cfg.bg} hover:bg-opacity-25 transition-all group text-left card-hover`}
                >
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${cfg.gradient} shadow-lg ${cfg.glow}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          <Separator />

          {/* Published Workflows Section - Collapsed by default */}
          <PublishedWorkflowsSection 
            workflowId={workflowId} 
            onAddSubWorkflow={(wf) => addSubWorkflowStep(wf)}
          />

          {/* Validation Result */}
          {validationResult && (
            <div className={`mx-4 mb-4 p-3 rounded-xl border ${validationResult.is_valid ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}>
              <div className="flex items-center gap-2">
                {validationResult.is_valid ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-xs font-medium ${validationResult.is_valid ? "text-emerald-500" : "text-destructive"}`}>
                  {validationResult.is_valid ? "Ready to publish" : `${validationResult.errors.length} error(s)`}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Center Canvas - Draggable Steps */}
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 dot-background" />
          <ScrollArea className="h-full">
            <div className="min-h-full p-10 relative z-10">
              {definition.steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-purple-500/30 blur-3xl rounded-full animate-pulse" />
                    <div className="relative p-8 rounded-3xl glass border border-white/10">
                      <Workflow className="h-16 w-16 text-muted-foreground" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold mt-8 gradient-text">Build Your Workflow</h2>
                  <p className="text-muted-foreground mt-2 text-center max-w-md">
                    Add steps from the library, drag to reorder, or let AI create one for you
                  </p>
                  <div className="flex gap-3 mt-8">
                    <Button variant="outline" onClick={() => addStep("FORM_STEP")} className="rounded-xl h-10">
                      <Plus className="h-4 w-4 mr-2" />Add Step
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Or use the AI Generator in the sidebar →
                  </p>
                </div>
              ) : (
                <div className="max-w-xl mx-auto">
                  <DraggableStepList
                    steps={definition.steps}
                    transitions={definition.transitions}
                    selectedStepId={selectedStepId}
                    startStepId={definition.start_step_id}
                    onStepsReorder={handleStepsReorder}
                    onSelectStep={(id) => { setSelectedStepId(id); setIsStepSheetOpen(true); }}
                    onDuplicateStep={duplicateStep}
                    onInsertAfter={insertStepAfter}
                    onMoveStep={moveStep}
                    onSetStart={setStart}
                    onSetTerminal={setTerminal}
                    onDeleteStep={deleteStep}
                    onAddStepToBranch={addStepToBranch}
                  />

                  {/* Add Step Button */}
                  <div className="flex justify-center mt-8">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="rounded-xl border-dashed">
                          <Plus className="h-4 w-4 mr-2" />Add Step
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {Object.entries(stepTypeConfig).map(([t, c]) => (
                          <DropdownMenuItem key={t} onClick={() => addStep(t as StepType)}>
                            <c.icon className={`h-4 w-4 mr-2 ${c.color}`} />{c.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* Right Panel - Issues & Branch Info */}
        {validationResult && (validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
          <aside className="w-64 border-l p-4 bg-card/30 overflow-auto">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">ISSUES</span>
            </div>
            <div className="space-y-2">
              {validationResult.errors.map((e, i) => (
                <div key={`e${i}`} className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex gap-2">
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{e.message}</p>
                  </div>
                </div>
              ))}
              {validationResult.warnings.map((w, i) => (
                <div key={`w${i}`} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-600">{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Insert Dialog */}
      <Dialog open={isAddStepDialogOpen} onOpenChange={setIsAddStepDialogOpen}>
        <DialogContent className="sm:max-w-sm glass">
          <DialogHeader>
            <DialogTitle>Insert Step</DialogTitle>
            <DialogDescription>Choose step type</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {Object.entries(stepTypeConfig).map(([t, c]) => (
              <button 
                key={t} 
                onClick={() => insertAfterStepId && insertStepAfter(insertAfterStepId, t as StepType)} 
                className={`p-3 rounded-xl ${c.bg} border border-transparent hover:border-primary/30 transition-all text-left`}
              >
                <div className={`p-2 rounded-lg bg-gradient-to-br ${c.gradient} w-fit mb-2`}>
                  <c.icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Step Editor Sheet */}
      <Sheet open={isStepSheetOpen} onOpenChange={setIsStepSheetOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-none overflow-y-auto p-0">
          {selectedStep && (
            <>
              <SheetHeader className="p-5 pb-4 border-b">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = stepTypeConfig[selectedStep.step_type]?.icon || FileText;
                    return (
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stepTypeConfig[selectedStep.step_type]?.gradient}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                    );
                  })()}
                  <div>
                    <SheetTitle>Edit {stepTypeConfig[selectedStep.step_type]?.label}</SheetTitle>
                    <SheetDescription>Configure step settings and transitions</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Tabs for Config vs Transitions */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1">
                <div className="px-5 pt-4">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="config" className="text-xs">
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Configuration
                    </TabsTrigger>
                    <TabsTrigger value="transitions" className="text-xs">
                      <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                      Transitions
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="config" className="flex-1 overflow-y-auto p-5 space-y-5 mt-0">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input 
                      value={selectedStep.step_name} 
                      onChange={e => updateStep(selectedStep.step_id, { step_name: e.target.value })} 
                      className="rounded-lg" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea 
                      value={selectedStep.description || ""} 
                      onChange={e => updateStep(selectedStep.step_id, { description: e.target.value })} 
                      rows={3} 
                      className="rounded-lg resize-none" 
                    />
                  </div>
                  <Separator />
                  {selectedStep.step_type === "APPROVAL_STEP" && <ApprovalConfig step={selectedStep} onUpdate={u => updateStep(selectedStep.step_id, u)} allSteps={definition.steps} workflowId={workflowId} />}
                  {selectedStep.step_type === "TASK_STEP" && <TaskConfig step={selectedStep} onUpdate={u => updateStep(selectedStep.step_id, u)} allSteps={definition.steps} />}
                  {selectedStep.step_type === "FORM_STEP" && <FormConfig step={selectedStep} onUpdate={u => updateStep(selectedStep.step_id, u)} allSteps={definition.steps} />}
                  {selectedStep.step_type === "NOTIFY_STEP" && <NotifyConfig step={selectedStep} onUpdate={u => updateStep(selectedStep.step_id, u)} />}
                  {selectedStep.step_type === "FORK_STEP" && <ForkConfig step={selectedStep} allSteps={definition.steps} onUpdate={u => updateStep(selectedStep.step_id, u)} />}
                  {selectedStep.step_type === "JOIN_STEP" && <JoinConfig step={selectedStep} allSteps={definition.steps} onUpdate={u => updateStep(selectedStep.step_id, u)} />}
                  {selectedStep.step_type === "SUB_WORKFLOW_STEP" && <SubWorkflowConfig step={selectedStep} onUpdate={u => updateStep(selectedStep.step_id, u)} />}
                </TabsContent>

                <TabsContent value="transitions" className="flex-1 overflow-y-auto p-5 space-y-5 mt-0">
                  <TransitionsConfig
                    step={selectedStep}
                    allSteps={definition.steps}
                    transitions={definition.transitions.filter(t => t.from_step_id === selectedStep.step_id)}
                    availableFields={availableFields}
                    onAddTransition={(toId, event) => addBranchTransition(selectedStep.step_id, toId, event)}
                    onUpdateTransition={updateTransition}
                    onDeleteTransition={deleteTransition}
                  />
                </TabsContent>
              </Tabs>

              <div className="p-5 pt-4 border-t flex gap-2">
                <Button className="flex-1 rounded-lg btn-primary" onClick={handleSaveStep} disabled={isSavingStep}>
                  {isSavingStep ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Step
                </Button>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="rounded-lg" 
                  onClick={() => { deleteStep(selectedStep.step_id); setIsStepSheetOpen(false); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Preview Modal */}
      <WorkflowPreview 
        definition={definition} 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
      />

      {/* Version History */}
      <VersionHistory
        workflowId={workflowId}
        currentVersion={workflow?.published_version || null}
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        onRestoreVersion={(restoredDef) => {
          setDefinition(restoredDef);
          toast.success("Version restored to draft. Save to keep changes.");
        }}
      />

      {/* Lookup Manager */}
      <Dialog open={isLookupManagerOpen} onOpenChange={setIsLookupManagerOpen}>
        <DialogContent 
          className="!max-w-5xl w-[90vw] h-[85vh] !p-0 !gap-0 overflow-hidden !block"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Lookup Tables</DialogTitle>
            <DialogDescription>Manage dynamic user assignments for this workflow</DialogDescription>
          </DialogHeader>
          <LookupManager
            workflowId={workflowId}
            steps={definition.steps}
            onClose={() => setIsLookupManagerOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workflow Settings</DialogTitle>
            <DialogDescription>Update workflow metadata and tags</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={workflowMetadata.name} 
                onChange={(e) => setWorkflowMetadata({ ...workflowMetadata, name: e.target.value })}
                placeholder="Workflow name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={workflowMetadata.description} 
                onChange={(e) => setWorkflowMetadata({ ...workflowMetadata, description: e.target.value })}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input 
                value={workflowMetadata.category} 
                onChange={(e) => setWorkflowMetadata({ ...workflowMetadata, category: e.target.value })}
                placeholder="e.g., IT, HR, Finance"
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {workflowMetadata.tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setWorkflowMetadata({
                        ...workflowMetadata,
                        tags: workflowMetadata.tags.filter((_, i) => i !== idx)
                      })}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input 
                  value={workflowMetadata.newTag} 
                  onChange={(e) => setWorkflowMetadata({ ...workflowMetadata, newTag: e.target.value })}
                  placeholder="Add a tag"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && workflowMetadata.newTag.trim()) {
                      e.preventDefault();
                      if (!workflowMetadata.tags.includes(workflowMetadata.newTag.trim())) {
                        setWorkflowMetadata({
                          ...workflowMetadata,
                          tags: [...workflowMetadata.tags, workflowMetadata.newTag.trim()],
                          newTag: ""
                        });
                      }
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (workflowMetadata.newTag.trim() && !workflowMetadata.tags.includes(workflowMetadata.newTag.trim())) {
                      setWorkflowMetadata({
                        ...workflowMetadata,
                        tags: [...workflowMetadata.tags, workflowMetadata.newTag.trim()],
                        newTag: ""
                      });
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
            <Button 
              onClick={async () => {
                await updateMetadata.mutateAsync({
                  workflowId,
                  name: workflowMetadata.name,
                  description: workflowMetadata.description,
                  category: workflowMetadata.category,
                  tags: workflowMetadata.tags,
                });
                setIsSettingsOpen(false);
                refetch();
              }}
              disabled={updateMetadata.isPending}
            >
              {updateMetadata.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Step Type Configurations
// ============================================================================

function ApprovalConfig({ step, onUpdate, allSteps, workflowId }: { step: StepTemplate; onUpdate: (u: Partial<StepTemplate>) => void; allSteps: StepTemplate[]; workflowId: string }) {
  // Get available form fields from all form steps
  const availableFields = useMemo(() => 
    allSteps
      .filter((s) => s.step_type === "FORM_STEP" && s.fields)
      .flatMap((s) =>
        (s.fields || []).map((f: FormField) => ({
          key: f.field_key,
          label: f.field_label,
          type: f.field_type,
        }))
      ),
    [allSteps]
  );

  const conditionalRules = step.conditional_approver_rules || [];

  const addConditionalRule = () => {
    const newRule = {
      field_key: availableFields[0]?.key || "",
      operator: "EQUALS" as ConditionOperator,
      value: "",
      approver_email: "",
    };
    onUpdate({ 
      conditional_approver_rules: [...conditionalRules, newRule] 
    });
  };

  const updateConditionalRule = (index: number, updates: Partial<typeof conditionalRules[0]>) => {
    const updated = [...conditionalRules];
    updated[index] = { ...updated[index], ...updates };
    onUpdate({ conditional_approver_rules: updated });
  };

  const removeConditionalRule = (index: number) => {
    onUpdate({ 
      conditional_approver_rules: conditionalRules.filter((_, i) => i !== index) 
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckSquare className="h-4 w-4 text-emerald-500" />
        Approval Settings
      </div>
      
      {/* Hide Approver dropdown when parallel approvals is enabled */}
      {!step.parallel_approval && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Approver</Label>
            <Select value={step.approver_resolution || "REQUESTER_MANAGER"} onValueChange={v => onUpdate({ approver_resolution: v as any })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REQUESTER_MANAGER">Requester's Manager</SelectItem>
                <SelectItem value="SPECIFIC_EMAIL">Specific Person</SelectItem>
                <SelectItem value="CONDITIONAL">Conditional (Based on Form Field)</SelectItem>
                <SelectItem value="STEP_ASSIGNEE">Step Assignee (From Previous Step)</SelectItem>
                <SelectItem value="FROM_LOOKUP">From Lookup Table</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {step.approver_resolution === "SPECIFIC_EMAIL" && (
            <div className="space-y-2">
              <Label className="text-xs">Select Person</Label>
              <UserSearchSelect 
                value={step.specific_approver_email ? { 
                  email: step.specific_approver_email, 
                  display_name: step.specific_approver_display_name || step.specific_approver_email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                  aad_id: step.specific_approver_aad_id
                } : null} 
                onChange={u => onUpdate({ 
                  specific_approver_email: u?.email || "",
                  specific_approver_aad_id: u?.aad_id || "",
                  specific_approver_display_name: u?.display_name || ""
                })} 
              />
            </div>
          )}
        </>
      )}
      {!step.parallel_approval && step.approver_resolution === "REQUESTER_MANAGER" && (
        <div className="space-y-2">
          <Label className="text-xs">Fallback Email (Optional)</Label>
          <p className="text-xs text-muted-foreground">If manager not found in Active Directory</p>
          <Input type="email" value={step.spoc_email || ""} onChange={e => onUpdate({ spoc_email: e.target.value })} placeholder="fallback@company.com" className="rounded-xl" />
        </div>
      )}
      {!step.parallel_approval && step.approver_resolution === "CONDITIONAL" && (
        <div className="space-y-4 p-4 border rounded-xl bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Conditional Approver Rules</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Route approval based on form field values. Rules are evaluated in order - first match wins.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addConditionalRule} className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
          
          {conditionalRules.length === 0 ? (
            <div className="text-center py-6 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">No rules configured</p>
              <p className="text-xs text-muted-foreground mt-1">Add a rule to route approvals conditionally</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conditionalRules.map((rule, index) => (
                <Card key={index} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium">Rule {index + 1}</h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeConditionalRule(index)}
                        className="h-7 text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Form Field</Label>
                        <Select
                          value={rule.field_key}
                          onValueChange={(v) => updateConditionalRule(index, { field_key: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map((field) => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={rule.operator}
                          onValueChange={(v) => updateConditionalRule(index, { operator: v as ConditionOperator })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EQUALS">Equals</SelectItem>
                            <SelectItem value="NOT_EQUALS">Not Equals</SelectItem>
                            <SelectItem value="CONTAINS">Contains</SelectItem>
                            <SelectItem value="NOT_CONTAINS">Not Contains</SelectItem>
                            <SelectItem value="IN">In</SelectItem>
                            <SelectItem value="NOT_IN">Not In</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Value</Label>
                      <Input
                        value={rule.value || ""}
                        onChange={(e) => updateConditionalRule(index, { value: e.target.value })}
                        placeholder="Value to compare"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Route to Approver</Label>
                      <UserSearchSelect
                        value={rule.approver_email ? {
                          email: rule.approver_email,
                          display_name: rule.approver_display_name || rule.approver_email.split("@")[0],
                          aad_id: rule.approver_aad_id
                        } : null}
                        onChange={(u) => updateConditionalRule(index, {
                          approver_email: u?.email || "",
                          approver_aad_id: u?.aad_id || "",
                          approver_display_name: u?.display_name || ""
                        })}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">Fallback Approver (if no rules match)</Label>
            <UserSearchSelect
              value={step.conditional_fallback_approver ? {
                email: step.conditional_fallback_approver,
                display_name: step.conditional_fallback_approver.split("@")[0],
              } : null}
              onChange={(u) => onUpdate({ 
                conditional_fallback_approver: u?.email || "" 
              })}
              placeholder="Select fallback approver (optional)"
            />
            <p className="text-xs text-muted-foreground">
              If no conditional rules match, this approver will be used.
            </p>
          </div>
        </div>
      )}
      {!step.parallel_approval && step.approver_resolution === "STEP_ASSIGNEE" && (
        <div className="space-y-2">
          <Label className="text-xs">Reference Step</Label>
          <p className="text-xs text-muted-foreground">
            Select the step whose assignee will become the approver.
          </p>
          <Select
            value={step.step_assignee_step_id || ""}
            onValueChange={(v) => onUpdate({ step_assignee_step_id: v })}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Select a step" />
            </SelectTrigger>
            <SelectContent>
              {allSteps
                .filter((s) => (s.step_type === "TASK_STEP" || s.step_type === "APPROVAL_STEP") && s.step_id !== step.step_id)
                .map((s) => (
                  <SelectItem key={s.step_id} value={s.step_id}>
                    <span className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${s.step_type === "TASK_STEP" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {s.step_type === "TASK_STEP" ? "Task" : "Approval"}
                      </span>
                      {s.step_name}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {step.step_assignee_step_id && (() => {
            const refStep = allSteps.find(s => s.step_id === step.step_assignee_step_id);
            const isTask = refStep?.step_type === "TASK_STEP";
            return (
              <p className="text-xs text-muted-foreground">
                The {isTask ? "agent assigned to" : "approver of"} "{refStep?.step_name || step.step_assignee_step_id}" will be the approver.
              </p>
            );
          })()}
        </div>
      )}
      {!step.parallel_approval && step.approver_resolution === "FROM_LOOKUP" && (
        <div className="space-y-4 p-4 border rounded-xl bg-muted/30">
          <div>
            <Label className="text-xs font-medium">Lookup Table Configuration</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Route approval to the primary user from a lookup table based on form field value.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Source Form Step</Label>
            <Select
              value={step.lookup_source_step_id || ""}
              onValueChange={(v) => onUpdate({ lookup_source_step_id: v, lookup_source_field_key: undefined })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select form step" />
              </SelectTrigger>
              <SelectContent>
                {allSteps
                  .filter((s) => s.step_type === "FORM_STEP" && s.step_id !== step.step_id)
                  .map((s) => (
                    <SelectItem key={s.step_id} value={s.step_id}>
                      {s.step_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          
          {step.lookup_source_step_id && (
            <div className="space-y-2">
              <Label className="text-xs">Dropdown Field</Label>
              <Select
                value={step.lookup_source_field_key || ""}
                onValueChange={(v) => onUpdate({ lookup_source_field_key: v })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select dropdown field" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const sourceStep = allSteps.find(s => s.step_id === step.lookup_source_step_id);
                    const dropdownFields = sourceStep?.fields?.filter(f => f.field_type === "SELECT" || f.field_type === "MULTISELECT") || [];
                    return dropdownFields.map((f) => (
                      <SelectItem key={f.field_key} value={f.field_key}>
                        {f.field_label}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="space-y-2">
            <Label className="text-xs">Select Lookup Table</Label>
            <LookupTableSelect
              workflowId={workflowId}
              value={step.lookup_id || ""}
              onChange={(v) => onUpdate({ lookup_id: v })}
            />
            <p className="text-xs text-muted-foreground">
              The primary user from the matching entry will be the approver.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Fallback Approver (Optional)</Label>
            <Input
              type="email"
              value={step.spoc_email || ""}
              onChange={(e) => onUpdate({ spoc_email: e.target.value })}
              placeholder="fallback@company.com"
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Used if no matching entry is found in the lookup table.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
        <div>
          <Label>Parallel Approvals</Label>
          <p className="text-xs text-muted-foreground">Multiple approvers required</p>
        </div>
        <Switch 
          checked={!!step.parallel_approval} 
          onCheckedChange={c => {
            if (c) {
              // When enabling parallel, initialize with specific person if already set
              const initialApprovers: string[] = [];
              const initialInfo: Array<{ email: string; aad_id?: string; display_name?: string }> = [];
              if (step.specific_approver_email) {
                initialApprovers.push(step.specific_approver_email);
                initialInfo.push({
                  email: step.specific_approver_email,
                  aad_id: step.specific_approver_aad_id,
                  display_name: step.specific_approver_display_name
                });
              }
              onUpdate({ 
                parallel_approval: "ALL", 
                parallel_approvers: initialApprovers,
                parallel_approvers_info: initialInfo,
                primary_approver_email: step.specific_approver_email || undefined
              });
            } else {
              onUpdate({ 
                parallel_approval: undefined, 
                parallel_approvers: undefined, 
                parallel_approvers_info: undefined,
                primary_approver_email: undefined
              });
            }
          }} 
        />
      </div>
      {step.parallel_approval && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30 space-y-4">
          <div className="flex items-center justify-between">
            <Select value={step.parallel_approval} onValueChange={v => onUpdate({ parallel_approval: v as any })}>
              <SelectTrigger className="rounded-lg h-8 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All must approve</SelectItem>
                <SelectItem value="ANY">Any one approves</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Add approver */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Add Approvers</Label>
            <UserSearchSelect 
              value={null} 
              onChange={u => { 
                if (u && !step.parallel_approvers?.includes(u.email)) {
                  const newApprovers = [...(step.parallel_approvers || []), u.email];
                  const newApproversInfo = [...(step.parallel_approvers_info || []), {
                    email: u.email,
                    aad_id: u.aad_id,
                    display_name: u.display_name
                  }];
                  // Set as primary if first approver
                  const isPrimary = newApprovers.length === 1;
                  onUpdate({ 
                    parallel_approvers: newApprovers,
                    parallel_approvers_info: newApproversInfo,
                    primary_approver_email: isPrimary ? u.email : step.primary_approver_email
                  });
                }
              }} 
              placeholder="Search and add approver..." 
            />
          </div>
          
          {/* Approvers list */}
          {(step.parallel_approvers?.length || 0) > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Approvers ({step.parallel_approvers?.length || 0})</Label>
                <span className="text-xs text-muted-foreground">Click ⭐ to set Primary</span>
              </div>
              <div className="space-y-2">
                {step.parallel_approvers?.map((email, i) => {
                  const info = step.parallel_approvers_info?.find(a => a.email === email);
                  const displayName = info?.display_name || email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, l => l.toUpperCase());
                  const isPrimary = step.primary_approver_email === email || (!step.primary_approver_email && i === 0);
                  return (
                    <div 
                      key={email} 
                      className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                        isPrimary 
                          ? "bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 border-2 border-amber-400 dark:border-amber-600" 
                          : "bg-background border border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
                          onClick={() => onUpdate({ primary_approver_email: email })}
                          title={isPrimary ? "Primary approver (assigns tasks)" : "Click to make primary"}
                        >
                          {isPrimary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                        </Button>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{displayName}</span>
                            {isPrimary && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700">
                                Primary
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{email}</span>
                          {isPrimary && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">Responsible for task assignment</span>
                          )}
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-destructive" 
                        onClick={() => {
                          const newApprovers = step.parallel_approvers?.filter((_, j) => j !== i) || [];
                          const newInfo = step.parallel_approvers_info?.filter(a => a.email !== email) || [];
                          // If removing primary, set first remaining as primary
                          const newPrimary = isPrimary ? (newApprovers[0] || undefined) : step.primary_approver_email;
                          onUpdate({ 
                            parallel_approvers: newApprovers,
                            parallel_approvers_info: newInfo,
                            primary_approver_email: newPrimary
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Warning if less than 2 approvers */}
          {(step.parallel_approvers?.length || 0) < 2 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs">Add at least 2 approvers for parallel approval</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskConfig({ step, onUpdate, allSteps }: { step: StepTemplate; onUpdate: (u: Partial<StepTemplate>) => void; allSteps: StepTemplate[] }) {
  // Find forms with repeating sections (potential sources for linkage)
  const formsWithRepeatingSections = useMemo(() => {
    return allSteps
      .filter(s => s.step_type === "FORM_STEP" && s.sections?.some(sec => sec.is_repeating))
      .map(s => {
        const repeatingSection = s.sections?.find(sec => sec.is_repeating);
        return {
          step_id: s.step_id,
          step_name: s.step_name,
          section_id: repeatingSection?.section_id || "",
          section_title: repeatingSection?.section_title || "",
          fields: (s.fields || []).filter(f => f.section_id === repeatingSection?.section_id),
        };
      })
      .filter(item => item.section_id); // Only include if section found
  }, [allSteps]);

  // Get fields from other forms for cross-form conditional requirements
  const otherFormsFields = useMemo(() => {
    return allSteps
      .filter(s => 
        (s.step_type === "FORM_STEP" || s.step_type === "TASK_STEP") && 
        s.step_id !== step.step_id &&
        s.fields && 
        s.fields.length > 0
      )
      .map(s => ({
        stepId: s.step_id,
        stepName: s.step_name,
        fields: s.fields || []
      }));
  }, [allSteps, step.step_id]);

  const isLinked = !!step.linked_repeating_source;
  const linkedSource = step.linked_repeating_source;
  
  // Find the selected source form
  const selectedSourceForm = formsWithRepeatingSections.find(
    f => f.step_id === linkedSource?.source_step_id && f.section_id === linkedSource?.source_section_id
  );
  
  const handleToggleLinkage = (enabled: boolean) => {
    if (enabled && formsWithRepeatingSections.length > 0) {
      // Enable with first available source
      const firstSource = formsWithRepeatingSections[0];
      onUpdate({
        linked_repeating_source: {
          source_step_id: firstSource.step_id,
          source_section_id: firstSource.section_id,
          context_field_keys: [],
        }
      });
    } else {
      // Disable linkage
      onUpdate({ linked_repeating_source: undefined });
    }
  };
  
  const handleSelectSource = (value: string) => {
    const [stepId, sectionId] = value.split(":");
    onUpdate({
      linked_repeating_source: {
        source_step_id: stepId,
        source_section_id: sectionId,
        context_field_keys: [],
      }
    });
  };
  
  const handleToggleContextField = (fieldKey: string) => {
    if (!linkedSource) return;
    const currentKeys = linkedSource.context_field_keys || [];
    const newKeys = currentKeys.includes(fieldKey)
      ? currentKeys.filter(k => k !== fieldKey)
      : [...currentKeys, fieldKey];
    onUpdate({
      linked_repeating_source: {
        ...linkedSource,
        context_field_keys: newKeys,
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ListChecks className="h-4 w-4 text-amber-500" />
        Task Settings
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Instructions</Label>
        <Textarea value={step.instructions || ""} onChange={e => onUpdate({ instructions: e.target.value })} rows={5} className="rounded-xl resize-none" />
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
        <div>
          <Label>Require Notes</Label>
          <p className="text-xs text-muted-foreground">Agent must add notes</p>
        </div>
        <Switch checked={step.execution_notes_required || false} onCheckedChange={c => onUpdate({ execution_notes_required: c })} />
      </div>
      
      <Separator />
      
      {/* Linked Repeating Source Configuration */}
      {formsWithRepeatingSections.length > 0 && (
        <>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4 text-purple-500" />
              Link to Repeating Form
            </div>
            <p className="text-xs text-muted-foreground">
              When linked, the agent form fields will repeat based on the number of rows in the selected form&apos;s repeating section.
            </p>
            
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <div>
                <Label>Enable Linkage</Label>
                <p className="text-xs text-muted-foreground">Repeat agent form for each row</p>
              </div>
              <Switch 
                checked={isLinked} 
                onCheckedChange={handleToggleLinkage}
              />
            </div>
            
            {isLinked && (
              <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
                <div className="space-y-2">
                  <Label className="text-xs">Source Form (Repeating Section)</Label>
                  <Select
                    value={linkedSource ? `${linkedSource.source_step_id}:${linkedSource.source_section_id}` : ""}
                    onValueChange={handleSelectSource}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Select source form" />
                    </SelectTrigger>
                    <SelectContent>
                      {formsWithRepeatingSections.map(form => (
                        <SelectItem key={`${form.step_id}:${form.section_id}`} value={`${form.step_id}:${form.section_id}`}>
                          {form.step_name} → {form.section_title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedSourceForm && selectedSourceForm.fields.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Context Fields to Display</Label>
                    <p className="text-xs text-muted-foreground">
                      These fields will be shown as read-only context for each row
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {selectedSourceForm.fields.map(field => (
                        <div 
                          key={field.field_key} 
                          className="flex items-center gap-2 p-2 rounded-lg bg-background hover:bg-muted/50 cursor-pointer"
                          onClick={() => handleToggleContextField(field.field_key)}
                        >
                          <Checkbox 
                            checked={linkedSource?.context_field_keys?.includes(field.field_key) || false}
                            onCheckedChange={() => handleToggleContextField(field.field_key)}
                          />
                          <span className="text-sm">{field.field_label}</span>
                          <Badge variant="outline" className="text-xs ml-auto">{field.field_type}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  <p className="text-xs">
                    At runtime, if user fills {selectedSourceForm?.step_name || "the source form"} with 3 rows, 
                    agent will see 3 sets of the form fields below - one for each row.
                  </p>
                </div>
              </div>
            )}
          </div>
          <Separator />
        </>
      )}
      
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-blue-500" />
          Agent Form Fields
        </div>
        <p className="text-xs text-muted-foreground">
          Configure form fields that the agent must fill out as part of completing this task.
          {isLinked && " These fields will repeat for each row in the linked form."}
        </p>
        <FormFieldBuilderComponent 
          fields={step.fields || []} 
          onChange={f => onUpdate({ fields: f })}
          sections={step.sections}
          onSectionsChange={s => onUpdate({ sections: s })}
          otherFormsFields={otherFormsFields}
          currentStepId={step.step_id}
        />
      </div>
    </div>
  );
}

function FormConfig({ step, onUpdate, allSteps }: { step: StepTemplate; onUpdate: (u: Partial<StepTemplate>) => void; allSteps: StepTemplate[] }) {
  // Get fields from other forms for cross-form conditional requirements
  const otherFormsFields = useMemo(() => {
    return allSteps
      .filter(s => 
        (s.step_type === "FORM_STEP" || s.step_type === "TASK_STEP") && 
        s.step_id !== step.step_id &&
        s.fields && 
        s.fields.length > 0
      )
      .map(s => ({
        stepId: s.step_id,
        stepName: s.step_name,
        fields: s.fields || []
      }));
  }, [allSteps, step.step_id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-blue-500" />
        Form Fields
      </div>
      <FormFieldBuilderComponent 
        fields={step.fields || []} 
        onChange={f => onUpdate({ fields: f })}
        sections={step.sections}
        onSectionsChange={s => onUpdate({ sections: s })}
        otherFormsFields={otherFormsFields}
        currentStepId={step.step_id}
      />
    </div>
  );
}

function NotifyConfig({ step, onUpdate }: { step: StepTemplate; onUpdate: (u: Partial<StepTemplate>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4 text-purple-500" />
        Notification
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Template</Label>
        <Select value={step.notification_template || "TICKET_COMPLETED"} onValueChange={v => onUpdate({ notification_template: v })}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TICKET_COMPLETED">Completed</SelectItem>
            <SelectItem value="TICKET_CREATED">Created</SelectItem>
            <SelectItem value="APPROVAL_PENDING">Approval Pending</SelectItem>
            <SelectItem value="TASK_ASSIGNED">Task Assigned</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Recipients</Label>
        <div className="space-y-1.5">
          {[{ k: "requester", l: "Requester" }, { k: "assigned_agent", l: "Agent" }, { k: "approvers", l: "Approvers" }].map(r => (
            <label key={r.k} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors">
              <input 
                type="checkbox" 
                checked={(step.recipients || []).includes(r.k)} 
                onChange={e => { 
                  const c = step.recipients || []; 
                  onUpdate({ recipients: e.target.checked ? [...c, r.k] : c.filter(x => x !== r.k) }); 
                }} 
                className="rounded" 
              />
              <span className="text-sm">{r.l}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Sub-workflow configuration (read-only info about embedded workflow)
function SubWorkflowConfig({ step, onUpdate }: { step: StepTemplate; onUpdate: (u: Partial<StepTemplate>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Workflow className="h-4 w-4 text-indigo-500" />
        Embedded Workflow
      </div>
      
      {/* Sub-workflow Info (read-only) */}
      <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Workflow Name</Label>
          <p className="text-sm font-medium">{step.sub_workflow_name || "Unknown"}</p>
        </div>
        {step.sub_workflow_category && (
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <p className="text-sm">{step.sub_workflow_category}</p>
          </div>
        )}
        <div>
          <Label className="text-xs text-muted-foreground">Version (Locked)</Label>
          <p className="text-sm font-mono">v{step.sub_workflow_version}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Workflow ID</Label>
          <p className="text-xs font-mono text-muted-foreground">{step.sub_workflow_id}</p>
        </div>
      </div>
      
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> This step embeds a published workflow. When this step is reached, 
          all steps from the embedded workflow will be executed within the same ticket context.
        </p>
      </div>
      
      {/* Step Name Override */}
      <div className="space-y-2">
        <Label className="text-xs">Display Name Override</Label>
        <Input 
          value={step.step_name} 
          onChange={e => onUpdate({ step_name: e.target.value })}
          className="rounded-xl"
          placeholder="Enter custom display name"
        />
        <p className="text-xs text-muted-foreground">
          Override how this step appears in the workflow (defaults to workflow name)
        </p>
      </div>
    </div>
  );
}

// Color palette for parallel branches
const branchColors = [
  { name: "Blue", value: "#3b82f6", bg: "bg-blue-500" },
  { name: "Emerald", value: "#10b981", bg: "bg-emerald-500" },
  { name: "Violet", value: "#8b5cf6", bg: "bg-violet-500" },
  { name: "Amber", value: "#f59e0b", bg: "bg-amber-500" },
  { name: "Rose", value: "#f43f5e", bg: "bg-rose-500" },
  { name: "Cyan", value: "#06b6d4", bg: "bg-cyan-500" },
];

function ForkConfig({ step, allSteps, onUpdate }: { 
  step: StepTemplate; 
  allSteps: StepTemplate[]; 
  onUpdate: (u: Partial<StepTemplate>) => void;
}) {
  const branches = step.branches || [];

  const addBranch = () => {
    const newBranch = {
      branch_id: `branch_${Date.now()}`,
      branch_name: `Branch ${branches.length + 1}`,
      description: "",
      assigned_team: "",
      start_step_id: "",
      color: branchColors[branches.length % branchColors.length].value,
    };
    onUpdate({ branches: [...branches, newBranch] });
  };

  const updateBranch = (branchId: string, updates: Record<string, any>) => {
    onUpdate({
      branches: branches.map(b => 
        b.branch_id === branchId ? { ...b, ...updates } : b
      )
    });
  };

  const deleteBranch = (branchId: string) => {
    onUpdate({
      branches: branches.filter(b => b.branch_id !== branchId)
    });
  };

  // Count steps in each branch
  const getBranchStepCount = (branchId: string, startStepId: string): number => {
    if (!startStepId) return 0;
    // This is a simplified count - actual traversal happens in draggable-step-list
    return allSteps.filter(s => s.step_id === startStepId).length > 0 ? 1 : 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Split className="h-4 w-4 text-rose-500" />
        Parallel Branches
      </div>
      
      <div className="p-3 rounded-xl bg-gradient-to-r from-rose-500/10 to-orange-500/10 border border-rose-500/20">
        <p className="text-xs text-muted-foreground">
          <strong>How to use:</strong> Add branches here, then use the <strong>"Add Step"</strong> buttons in the workflow canvas to add steps to each branch. Each branch can have multiple steps (forms, approvals, tasks).
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Failure Policy</Label>
        <Select 
          value={step.failure_policy || "FAIL_ALL"} 
          onValueChange={v => onUpdate({ failure_policy: v as "FAIL_ALL" | "CONTINUE_OTHERS" | "CANCEL_OTHERS" })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FAIL_ALL">Fail All - If any branch fails, workflow fails</SelectItem>
            <SelectItem value="CONTINUE_OTHERS">Continue Others - Failed branches don't block</SelectItem>
            <SelectItem value="CANCEL_OTHERS">Cancel Others - If one fails, cancel rest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Branches ({branches.length})</Label>
          <Button size="sm" variant="outline" onClick={addBranch} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add Branch
          </Button>
        </div>

        {branches.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed text-center">
            <Split className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No branches yet</p>
            <p className="text-xs text-muted-foreground">Add branches to create parallel workflows</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map((branch, idx) => {
              const stepCount = branch.start_step_id ? 1 : 0;
              const hasSteps = stepCount > 0;
              
              return (
                <Card key={branch.branch_id} className="p-3 border-l-4" style={{ borderLeftColor: branch.color || branchColors[idx % branchColors.length].value }}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Input
                        value={branch.branch_name}
                        onChange={e => updateBranch(branch.branch_id, { branch_name: e.target.value })}
                        className="h-8 text-sm font-semibold border-none bg-transparent p-0 focus-visible:ring-0 flex-1"
                        placeholder="Branch name..."
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteBranch(branch.branch_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">Team (optional)</Label>
                      <Input
                        value={branch.assigned_team || ""}
                        onChange={e => updateBranch(branch.branch_id, { assigned_team: e.target.value })}
                        placeholder="e.g., IT Team, Security Team"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">Color</Label>
                      <div className="flex gap-1.5">
                        {branchColors.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => updateBranch(branch.branch_id, { color: c.value })}
                            className={`w-6 h-6 rounded-full ${c.bg} transition-all ${
                              branch.color === c.value ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : "hover:scale-105"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${hasSteps ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                      {hasSteps ? (
                        <>
                          <CheckCircle className="h-3 w-3" />
                          <span>Has steps configured</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3 w-3" />
                          <span>Add steps using "Add Step" in canvas</span>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinConfig({ step, allSteps, onUpdate }: { step: StepTemplate; allSteps: StepTemplate[]; onUpdate: (u: Partial<StepTemplate>) => void }) {
  const forkSteps = allSteps.filter(s => s.step_type === "FORK_STEP");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Merge className="h-4 w-4 text-cyan-500" />
        Join Configuration
      </div>
      
      <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
        <p className="text-xs text-muted-foreground">
          Join step waits for all parallel branches from a Fork to complete before proceeding to the next step.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Source Fork Step</Label>
        <Select
          value={step.source_fork_step_id || ""}
          onValueChange={v => onUpdate({ source_fork_step_id: v })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Select the fork step to join..." />
          </SelectTrigger>
          <SelectContent>
            {forkSteps.length === 0 ? (
              <SelectItem value="" disabled>No fork steps found</SelectItem>
            ) : (
              forkSteps.map(s => (
                <SelectItem key={s.step_id} value={s.step_id}>
                  {s.step_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Join Mode</Label>
        <Select
          value={step.join_mode || "ALL"}
          onValueChange={v => onUpdate({ join_mode: v as "ALL" | "ANY" | "MAJORITY" })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Branches - Wait for all to complete</SelectItem>
            <SelectItem value="ANY">Any Branch - Proceed when one completes</SelectItem>
            <SelectItem value="MAJORITY">Majority - Proceed when &gt;50% complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {step.source_fork_step_id && (
        <div className="p-3 rounded-xl bg-muted/50 space-y-2">
          <Label className="text-xs text-muted-foreground">Connected Fork</Label>
          {(() => {
            const fork = forkSteps.find(f => f.step_id === step.source_fork_step_id);
            if (!fork) return <p className="text-xs text-destructive">Fork step not found</p>;
            return (
              <div className="space-y-1">
                <p className="text-sm font-medium">{fork.step_name}</p>
                <p className="text-xs text-muted-foreground">
                  {fork.branches?.length || 0} branches configured
                </p>
                {fork.branches?.map((b, i) => (
                  <div key={b.branch_id} className="flex items-center gap-2 text-xs">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: b.color || branchColors[i % branchColors.length].value }}
                    />
                    <span>{b.branch_name}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Transitions Configuration
// ============================================================================

interface TransitionsConfigProps {
  step: StepTemplate;
  allSteps: StepTemplate[];
  transitions: TransitionTemplate[];
  availableFields: Array<{ key: string; label: string; type: string }>;
  onAddTransition: (toId: string, event: string) => void;
  onUpdateTransition: (transitionId: string, updates: Partial<TransitionTemplate>) => void;
  onDeleteTransition: (transitionId: string) => void;
}

function TransitionsConfig({ 
  step, 
  allSteps, 
  transitions, 
  availableFields, 
  onAddTransition, 
  onUpdateTransition, 
  onDeleteTransition 
}: TransitionsConfigProps) {
  const eventOptions: Record<string, string[]> = {
    FORM_STEP: ["SUBMIT_FORM"],
    APPROVAL_STEP: ["APPROVE", "REJECT"],
    TASK_STEP: ["COMPLETE_TASK"],
    NOTIFY_STEP: ["COMPLETE_TASK"],
    JOIN_STEP: ["COMPLETE_TASK"],  // Join completes when all branches done
    FORK_STEP: ["COMPLETE_TASK"],   // Fork auto-completes
    SUB_WORKFLOW_STEP: ["COMPLETE_TASK"],  // Sub-workflow completes
  };

  const events = eventOptions[step.step_type] || ["COMPLETE_TASK"];
  const otherSteps = allSteps.filter(s => s.step_id !== step.step_id);

  const [newTargetId, setNewTargetId] = useState("");
  const [newEvent, setNewEvent] = useState(events[0]);

  const handleAddBranch = () => {
    if (!newTargetId) return;
    onAddTransition(newTargetId, newEvent);
    setNewTargetId("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <GitBranch className="h-4 w-4 text-violet-500" />
        Outgoing Transitions
      </div>
      
      {transitions.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed text-center">
          <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No transitions yet</p>
          <p className="text-xs text-muted-foreground">Add branches to control workflow path</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transitions.map((t, idx) => {
            const targetStep = allSteps.find(s => s.step_id === t.to_step_id);
            const hasCondition = t.condition && t.condition.conditions?.length > 0;
            
            return (
              <Card key={t.transition_id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t.on_event?.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-sm font-medium">{targetStep?.step_name || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasCondition && (
                      <Badge className="text-[10px] bg-violet-500/20 text-violet-400">
                        <GitBranch className="h-2.5 w-2.5 mr-1" />
                        Conditional
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive" 
                      onClick={() => onDeleteTransition(t.transition_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Target selector */}
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Go to Step</Label>
                  <Select 
                    value={t.to_step_id} 
                    onValueChange={(v) => onUpdateTransition(t.transition_id, { to_step_id: v })}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {otherSteps.map(s => (
                        <SelectItem key={s.step_id} value={s.step_id}>{s.step_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Priority (higher = checked first)</Label>
                  <Input 
                    type="number" 
                    value={t.priority || 0}
                    onChange={(e) => onUpdateTransition(t.transition_id, { priority: parseInt(e.target.value) || 0 })}
                    className="h-8 rounded-lg"
                  />
                </div>

                {/* Condition Builder */}
                <ConditionBuilder
                  condition={t.condition}
                  onChange={(cond) => onUpdateTransition(t.transition_id, { condition: cond })}
                  availableFields={availableFields}
                />
              </Card>
            );
          })}
        </div>
      )}

      {/* Add new branch */}
      <Separator />
      <div className="space-y-3">
        <Label className="text-xs">Add New Branch</Label>
        <div className="flex gap-2">
          <Select value={newEvent} onValueChange={setNewEvent}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {events.map(e => (
                <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newTargetId} onValueChange={setNewTargetId}>
            <SelectTrigger className="flex-1 h-9 text-xs">
              <SelectValue placeholder="Select target step..." />
            </SelectTrigger>
            <SelectContent>
              {otherSteps.map(s => (
                <SelectItem key={s.step_id} value={s.step_id}>{s.step_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={handleAddBranch} disabled={!newTargetId}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
