/**
 * Workflow Preview Mode Component
 * Interactive simulation of workflow execution - Premium UI
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  RotateCcw,
  FastForward,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  CheckSquare,
  ListChecks,
  Bell,
  Sparkles,
  GitBranch,
  Eye,
  Zap,
  ArrowDown,
  Send,
  ThumbsUp,
  ThumbsDown,
  Workflow,
} from "lucide-react";
import type { WorkflowDefinition, StepTemplate, TransitionTemplate, StepType, FormField } from "@/lib/types";

interface PreviewStep {
  step_id: string;
  step_name: string;
  step_type: StepType;
  state: "pending" | "active" | "completed" | "rejected" | "skipped";
  enteredAt?: Date;
  completedAt?: Date;
  formValues?: Record<string, unknown>;
  decision?: "approved" | "rejected";
}

interface SimulationEvent {
  timestamp: Date;
  type: "step_entered" | "step_completed" | "step_rejected" | "step_skipped" | "condition_evaluated" | "workflow_complete";
  stepId: string;
  stepName: string;
  details?: string;
  icon?: "enter" | "complete" | "reject" | "branch" | "done";
}

interface WorkflowPreviewProps {
  definition: WorkflowDefinition;
  isOpen: boolean;
  onClose: () => void;
}

const stepTypeConfig: Record<StepType, { icon: any; color: string; gradient: string; actionLabel: string }> = {
  FORM_STEP: { 
    icon: FileText, 
    color: "text-blue-400", 
    gradient: "from-blue-500 to-cyan-400",
    actionLabel: "Submit Form"
  },
  APPROVAL_STEP: { 
    icon: CheckSquare, 
    color: "text-emerald-400", 
    gradient: "from-emerald-500 to-teal-400",
    actionLabel: "Approve / Reject"
  },
  TASK_STEP: { 
    icon: ListChecks, 
    color: "text-amber-400", 
    gradient: "from-amber-500 to-orange-400",
    actionLabel: "Complete Task"
  },
  NOTIFY_STEP: { 
    icon: Bell, 
    color: "text-purple-400", 
    gradient: "from-purple-500 to-pink-400",
    actionLabel: "Auto-advance"
  },
  FORK_STEP: { 
    icon: GitBranch, 
    color: "text-indigo-400", 
    gradient: "from-indigo-500 to-violet-400",
    actionLabel: "Auto-fork"
  },
  JOIN_STEP: { 
    icon: GitBranch, 
    color: "text-cyan-400", 
    gradient: "from-cyan-500 to-blue-400",
    actionLabel: "Auto-join"
  },
  SUB_WORKFLOW_STEP: { 
    icon: Workflow, 
    color: "text-purple-400", 
    gradient: "from-purple-500 to-indigo-400",
    actionLabel: "Auto-expand"
  },
};

export function WorkflowPreview({ definition, isOpen, onClose }: WorkflowPreviewProps) {
  const [previewSteps, setPreviewSteps] = useState<PreviewStep[]>([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const [testFormValues, setTestFormValues] = useState<Record<string, unknown>>({});
  const [isSimulating, setIsSimulating] = useState(false);
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [isComplete, setIsComplete] = useState(false);
  
  // Use ref to track completion status to avoid stale closures in setTimeout callbacks
  const isCompleteRef = useRef(false);
  const processedStepsRef = useRef<Set<string>>(new Set());

  // Initialize preview on open
  useEffect(() => {
    if (isOpen && definition.steps.length > 0) {
      resetSimulation();
    }
  }, [isOpen, definition]);

  const resetSimulation = () => {
    // Reset refs
    isCompleteRef.current = false;
    processedStepsRef.current = new Set();
    
    const steps = definition.steps.map((s) => ({
      step_id: s.step_id,
      step_name: s.step_name,
      step_type: s.step_type,
      state: "pending" as const,
    }));
    setPreviewSteps(steps);
    setCurrentStepId(null);
    setSimulationEvents([]);
    setTestFormValues({});
    setIsSimulating(false);
    setIsComplete(false);
  };

  const startSimulation = () => {
    if (!definition.start_step_id) return;
    setIsSimulating(true);
    setIsComplete(false);
    activateStep(definition.start_step_id);
  };

  const activateStep = (stepId: string) => {
    // Use refs to check completion status (avoids stale closure issues)
    if (isCompleteRef.current) return;
    if (processedStepsRef.current.has(stepId)) {
      // Step already processed, complete workflow
      markWorkflowComplete("Workflow completed (step already processed)");
      return;
    }
    
    const step = definition.steps.find((s) => s.step_id === stepId);
    if (!step) return;

    setCurrentStepId(stepId);
    setPreviewSteps((prev) =>
      prev.map((s) =>
        s.step_id === stepId
          ? { ...s, state: "active", enteredAt: new Date() }
          : s
      )
    );

    addEvent({
      type: "step_entered",
      stepId,
      stepName: step.step_name,
      details: `Entered ${step.step_type.replace(/_/g, " ").toLowerCase()}`,
      icon: "enter",
    });

    // Auto-advance for NOTIFY_STEP, FORK_STEP, JOIN_STEP, SUB_WORKFLOW_STEP - check if terminal first
    if (step.step_type === "NOTIFY_STEP" || step.step_type === "FORK_STEP" || step.step_type === "JOIN_STEP" || step.step_type === "SUB_WORKFLOW_STEP") {
      setTimeout(() => {
        // Double-check we haven't already completed
        if (isCompleteRef.current) return;
        
        // Mark as processed
        processedStepsRef.current.add(stepId);
        
        setPreviewSteps((prev) =>
          prev.map((s) =>
            s.step_id === stepId
              ? { ...s, state: "completed", completedAt: new Date() }
              : s
          )
        );
        
        const detailsMap: Record<string, string> = {
          NOTIFY_STEP: "Notification sent",
          FORK_STEP: "Parallel branches activated",
          JOIN_STEP: "Branches merged",
          SUB_WORKFLOW_STEP: "Sub-workflow completed",
        };
        
        addEvent({
          type: "step_completed",
          stepId,
          stepName: step.step_name,
          details: detailsMap[step.step_type] || "Step completed",
          icon: "complete",
        });
        
        // If this is a terminal step OR no outgoing transitions, complete workflow
        // SUB_WORKFLOW_STEP uses COMPLETE_TASK event (same as regular task completion)
        const transitionEvent = "COMPLETE_TASK";
        const hasOutgoingTransition = definition.transitions.some(
          t => t.from_step_id === stepId && t.on_event === transitionEvent
        );
        
        if (step.is_terminal || !hasOutgoingTransition) {
          markWorkflowComplete("Workflow completed successfully!");
        } else {
          // Find and activate next step using COMPLETE_TASK event
          const nextTransition = definition.transitions.find(
            t => t.from_step_id === stepId && t.on_event === transitionEvent
          );
          if (nextTransition) {
            setTimeout(() => activateStep(nextTransition.to_step_id), getDelay());
          } else {
            markWorkflowComplete("Workflow completed (no next step)");
          }
        }
      }, getDelay());
    }
  };
  
  const markWorkflowComplete = (message: string) => {
    if (isCompleteRef.current) return; // Already complete
    isCompleteRef.current = true;
    setIsSimulating(false);
    setCurrentStepId(null);
    setIsComplete(true);
    addEvent({
      type: "workflow_complete",
      stepId: "workflow",
      stepName: "Workflow",
      details: message,
      icon: "done",
    });
  };

  const completeCurrentStep = (decision?: "approved" | "rejected") => {
    if (!currentStepId) return;
    if (isCompleteRef.current) return; // Use ref to prevent stale closure issues
    
    // Check if step was already processed
    if (processedStepsRef.current.has(currentStepId)) {
      return;
    }

    const step = definition.steps.find((s) => s.step_id === currentStepId);
    if (!step) return;
    
    // Mark as processed
    processedStepsRef.current.add(currentStepId);

    const newState = decision === "rejected" ? "rejected" : "completed";

    setPreviewSteps((prev) =>
      prev.map((s) =>
        s.step_id === currentStepId
          ? { ...s, state: newState, completedAt: new Date(), decision, formValues: testFormValues }
          : s
      )
    );

    addEvent({
      type: decision === "rejected" ? "step_rejected" : "step_completed",
      stepId: currentStepId,
      stepName: step.step_name,
      details: decision ? `Decision: ${decision}` : "Step completed",
      icon: decision === "rejected" ? "reject" : "complete",
    });

    // Find next step
    if (newState === "rejected") {
      const rejectTransition = definition.transitions.find(
        (t) => t.from_step_id === currentStepId && t.on_event === "REJECT"
      );
      if (rejectTransition) {
        setTimeout(() => activateStep(rejectTransition.to_step_id), getDelay());
      } else {
        markWorkflowComplete("Workflow ended (rejection path)");
      }
    } else {
      const nextTransition = findNextTransition(currentStepId, step.step_type);
      if (nextTransition) {
        setTimeout(() => activateStep(nextTransition.to_step_id), getDelay());
      } else {
        if (step.is_terminal) {
          markWorkflowComplete("Workflow completed successfully!");
        } else {
          markWorkflowComplete("No more steps");
        }
      }
    }
  };

  const findNextTransition = (fromStepId: string, stepType: StepType): TransitionTemplate | null => {
    const eventMap: Record<StepType, string> = {
      FORM_STEP: "SUBMIT_FORM",
      APPROVAL_STEP: "APPROVE",
      TASK_STEP: "COMPLETE_TASK",
      NOTIFY_STEP: "COMPLETE_TASK",
      FORK_STEP: "COMPLETE_TASK",
      JOIN_STEP: "COMPLETE_TASK",
      SUB_WORKFLOW_STEP: "COMPLETE_TASK",
    };

    const event = eventMap[stepType];
    const candidates = definition.transitions.filter(
      (t) => t.from_step_id === fromStepId && t.on_event === event
    );

    if (candidates.length === 0) return null;

    const validTransitions: Array<{ t: TransitionTemplate; priority: number }> = [];

    for (const t of candidates) {
      if (!t.condition || !t.condition.conditions || t.condition.conditions.length === 0) {
        validTransitions.push({ t, priority: t.priority || 0 });
      } else {
        const result = evaluateCondition(t.condition);
        if (result) {
          validTransitions.push({ t, priority: t.priority || 0 });
          addEvent({
            type: "condition_evaluated",
            stepId: fromStepId,
            stepName: "Branch",
            details: `Condition matched → ${definition.steps.find((s) => s.step_id === t.to_step_id)?.step_name}`,
            icon: "branch",
          });
        }
      }
    }

    if (validTransitions.length === 0) return null;
    validTransitions.sort((a, b) => b.priority - a.priority);
    return validTransitions[0].t;
  };

  const evaluateCondition = (conditionGroup: { logic: string; conditions: Array<{ field: string; operator: string; value: unknown }> }): boolean => {
    const { logic, conditions } = conditionGroup;
    const results = conditions.map((c) => {
      const fieldValue = getNestedValue(testFormValues, c.field);
      return evaluateSingleCondition(fieldValue, c.operator, c.value);
    });
    return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
  };

  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split(".").reduce((curr: unknown, key) => {
      if (curr && typeof curr === "object") {
        return (curr as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  const evaluateSingleCondition = (fieldValue: unknown, operator: string, compareValue: unknown): boolean => {
    switch (operator) {
      case "EQUALS": return fieldValue === compareValue;
      case "NOT_EQUALS": return fieldValue !== compareValue;
      case "GREATER_THAN": return Number(fieldValue) > Number(compareValue);
      case "LESS_THAN": return Number(fieldValue) < Number(compareValue);
      case "CONTAINS": return String(fieldValue).includes(String(compareValue));
      case "IS_EMPTY": return !fieldValue || fieldValue === "";
      case "IS_NOT_EMPTY": return !!fieldValue && fieldValue !== "";
      default: return true;
    }
  };

  const addEvent = (event: Omit<SimulationEvent, "timestamp">) => {
    setSimulationEvents((prev) => [...prev, { ...event, timestamp: new Date() }]);
  };

  const getDelay = () => {
    switch (speed) { case "slow": return 1500; case "fast": return 300; default: return 800; }
  };

  const currentStep = definition.steps.find((s) => s.step_id === currentStepId);
  const sortedSteps = [...definition.steps].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="p-0 gap-0 overflow-hidden flex flex-col"
        style={{ 
          maxWidth: '1200px', 
          width: 'calc(100vw - 48px)', 
          height: '85vh',
          maxHeight: '85vh'
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Eye className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Workflow Preview</DialogTitle>
                <DialogDescription>
                  Simulate and test your workflow step by step
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={speed} onValueChange={(v) => setSpeed(v as typeof speed)}>
                <SelectTrigger className="w-28 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">🐢 Slow</SelectItem>
                  <SelectItem value="normal">🚀 Normal</SelectItem>
                  <SelectItem value="fast">⚡ Fast</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={resetSimulation} className="h-9">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              {!isSimulating && !currentStepId && !isComplete && (
                <Button onClick={startSimulation} className="h-9 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg">
                  <Play className="h-4 w-4 mr-2" />
                  Start Simulation
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: Workflow Steps Visual */}
          <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-background to-muted/30">
            <div className="max-w-md mx-auto">
              {/* Instructions when not started */}
              {!isSimulating && !currentStepId && !isComplete && (
                <div className="mb-6 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-violet-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-violet-400">How to use Preview Mode</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click "Start Simulation" to begin. You'll progress through each step, 
                        making decisions like a real user. Great for testing conditional branches!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Workflow completion */}
              {isComplete && (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Simulation Complete!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        The workflow has finished. Click Reset to try again with different values.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step Cards */}
              <div className="space-y-1">
                {sortedSteps.map((step, idx) => {
                  const previewStep = previewSteps.find((s) => s.step_id === step.step_id);
                  const isActive = currentStepId === step.step_id;
                  const config = stepTypeConfig[step.step_type];
                  const Icon = config.icon;

                  let ringColor = "";
                  let bgColor = "bg-card";
                  let opacity = "";

                  if (isActive) {
                    ringColor = "ring-2 ring-violet-500 shadow-lg shadow-violet-500/20";
                    bgColor = "bg-gradient-to-r from-violet-500/10 to-purple-500/10";
                  } else if (previewStep?.state === "completed") {
                    ringColor = "ring-1 ring-emerald-500/50";
                    opacity = "opacity-70";
                  } else if (previewStep?.state === "rejected") {
                    ringColor = "ring-1 ring-red-500/50";
                    opacity = "opacity-70";
                  }

                  return (
                    <div key={step.step_id}>
                      {/* Connection line */}
                      {idx > 0 && (
                        <div className="flex justify-center py-1">
                          <div className={`w-0.5 h-8 rounded-full ${
                            previewStep?.state === "completed" || previewStep?.state === "rejected" 
                              ? "bg-emerald-500/50" 
                              : previewStep?.state === "active" 
                              ? "bg-violet-500/50" 
                              : "bg-border"
                          }`}>
                            {(previewStep?.state === "completed" || previewStep?.state === "active") && (
                              <div className="relative h-full flex items-center justify-center">
                                <ArrowDown className={`h-3 w-3 ${
                                  previewStep?.state === "completed" ? "text-emerald-400" : "text-violet-400"
                                }`} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Step Card */}
                      <Card className={`relative transition-all duration-300 ${ringColor} ${bgColor} ${opacity}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            {/* Step icon */}
                            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${config.gradient} shadow-md`}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>

                            {/* Step info */}
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{step.step_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {step.step_type.replace(/_/g, " ").toLowerCase()}
                              </p>
                            </div>

                            {/* State indicator */}
                            <div className="shrink-0">
                              {previewStep?.state === "completed" && (
                                <div className="p-2 rounded-full bg-emerald-500 text-white">
                                  <CheckCircle className="h-4 w-4" />
                                </div>
                              )}
                              {previewStep?.state === "rejected" && (
                                <div className="p-2 rounded-full bg-red-500 text-white">
                                  <XCircle className="h-4 w-4" />
                                </div>
                              )}
                              {previewStep?.state === "active" && (
                                <div className="p-2 rounded-full bg-violet-500 text-white animate-pulse">
                                  <Zap className="h-4 w-4" />
                                </div>
                              )}
                              {previewStep?.state === "pending" && (
                                <div className="p-2 rounded-full bg-muted text-muted-foreground">
                                  <Clock className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Active step - show form fields and actions */}
                          {isActive && (
                            <div className="mt-4 pt-4 border-t space-y-4">
                              {/* Form fields for FORM_STEP */}
                              {step.step_type === "FORM_STEP" && step.fields && step.fields.length > 0 && (
                                <div className="space-y-3">
                                  <p className="text-xs font-medium text-violet-400 flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    Enter test values
                                  </p>
                                  {step.fields.slice(0, 4).map((field: FormField) => (
                                    <div key={field.field_key} className="space-y-1">
                                      <Label className="text-xs">{field.field_label}</Label>
                                      <Input
                                        className="h-9"
                                        value={String(testFormValues[field.field_key] || "")}
                                        onChange={(e) =>
                                          setTestFormValues((prev) => ({
                                            ...prev,
                                            [field.field_key]: e.target.value,
                                          }))
                                        }
                                        placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
                                      />
                                    </div>
                                  ))}
                                  {step.fields.length > 4 && (
                                    <p className="text-xs text-muted-foreground">
                                      +{step.fields.length - 4} more fields
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex gap-2">
                                {step.step_type === "FORM_STEP" && (
                                  <Button 
                                    className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                                    onClick={() => completeCurrentStep()}
                                  >
                                    <Send className="h-4 w-4 mr-2" />
                                    Submit Form
                                  </Button>
                                )}
                                {step.step_type === "APPROVAL_STEP" && (
                                  <>
                                    <Button 
                                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                                      onClick={() => completeCurrentStep("approved")}
                                    >
                                      <ThumbsUp className="h-4 w-4 mr-2" />
                                      Approve
                                    </Button>
                                    <Button 
                                      variant="destructive"
                                      className="flex-1"
                                      onClick={() => completeCurrentStep("rejected")}
                                    >
                                      <ThumbsDown className="h-4 w-4 mr-2" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {step.step_type === "TASK_STEP" && (
                                  <Button 
                                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                                    onClick={() => completeCurrentStep()}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Complete Task
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Event Timeline & Stats */}
          <div className="w-80 min-w-[320px] border-l bg-card flex flex-col">
            {/* Stats */}
            <div className="p-4 border-b bg-muted/30">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <p className="text-2xl font-bold text-emerald-400">
                    {previewSteps.filter((s) => s.state === "completed").length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Completed</p>
                </div>
                <div className="p-3 rounded-lg bg-violet-500/10">
                  <p className="text-2xl font-bold text-violet-400">
                    {previewSteps.filter((s) => s.state === "active").length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold text-muted-foreground">
                    {previewSteps.filter((s) => s.state === "pending").length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending</p>
                </div>
              </div>
            </div>

            {/* Timeline Header */}
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-400" />
                Event Timeline
              </h3>
            </div>

            {/* Timeline Events */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {simulationEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No events yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click "Start Simulation" to begin
                    </p>
                  </div>
                ) : (
                  [...simulationEvents].reverse().map((event, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        idx === 0 ? "bg-violet-500/10 border border-violet-500/20" : "bg-muted/30"
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-full shrink-0 ${
                          event.icon === "complete"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : event.icon === "reject"
                            ? "bg-red-500/20 text-red-400"
                            : event.icon === "branch"
                            ? "bg-violet-500/20 text-violet-400"
                            : event.icon === "done"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {event.icon === "complete" && <CheckCircle className="h-3.5 w-3.5" />}
                        {event.icon === "reject" && <XCircle className="h-3.5 w-3.5" />}
                        {event.icon === "branch" && <GitBranch className="h-3.5 w-3.5" />}
                        {event.icon === "enter" && <ArrowRight className="h-3.5 w-3.5" />}
                        {event.icon === "done" && <Sparkles className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{event.stepName}</p>
                        {event.details && (
                          <p className="text-xs text-muted-foreground truncate">{event.details}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Quick Legend */}
            <div className="p-4 border-t bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Legend</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-muted-foreground">Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Rejected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">Pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WorkflowPreview;
