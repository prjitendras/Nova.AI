"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  FileText,
  CheckCircle,
  Clipboard,
  Bell,
  ArrowRight,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  Copy,
  Play,
  AlertTriangle,
} from "lucide-react";
import { FormFieldBuilder, type FormFieldDefinition } from "./form-field-builder";

export interface StepDefinition {
  step_id: string;
  step_name: string;
  step_type: "FORM_STEP" | "APPROVAL_STEP" | "TASK_STEP" | "NOTIFY_STEP";
  description?: string;
  is_start?: boolean;
  is_terminal?: boolean;
  // Form step specific
  fields?: FormFieldDefinition[];
  // Approval step specific
  approver_resolution?: "REQUESTER_MANAGER" | "SPECIFIC_EMAIL";
  specific_approver_email?: string;
  spoc_email?: string;
  parallel_approval?: "ALL" | "ANY";
  parallel_approvers?: string[];
  // Task step specific
  instructions?: string;
  execution_notes_required?: boolean;
  // Notify step specific
  notification_template?: string;
  recipients?: string[];
  // SLA
  sla?: {
    due_minutes: number;
    reminders?: Array<{ minutes_before_due: number; recipients: string[] }>;
    escalations?: Array<{ minutes_after_due: number; recipients: string[] }>;
  };
  order: number;
}

export interface TransitionDefinition {
  transition_id: string;
  from_step_id: string;
  to_step_id: string;
  on_event: string;
  condition?: {
    logic: "AND" | "OR";
    conditions: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  priority: number;
}

interface StepBuilderProps {
  steps: StepDefinition[];
  transitions: TransitionDefinition[];
  onStepsChange: (steps: StepDefinition[]) => void;
  onTransitionsChange: (transitions: TransitionDefinition[]) => void;
}

const STEP_TYPES = [
  {
    value: "FORM_STEP",
    label: "Form Step",
    icon: FileText,
    description: "Collect information from requester",
    color: "bg-blue-500",
  },
  {
    value: "APPROVAL_STEP",
    label: "Approval Step",
    icon: CheckCircle,
    description: "Require approval from manager or specific person",
    color: "bg-green-500",
  },
  {
    value: "TASK_STEP",
    label: "Task Step",
    icon: Clipboard,
    description: "Assign work to an agent",
    color: "bg-yellow-500",
  },
  {
    value: "NOTIFY_STEP",
    label: "Notification Step",
    icon: Bell,
    description: "Send notification and auto-advance",
    color: "bg-purple-500",
  },
];

const APPROVAL_RESOLUTION_OPTIONS = [
  { value: "REQUESTER_MANAGER", label: "Requester's Manager" },
  { value: "SPECIFIC_EMAIL", label: "Specific Person" },
];

function generateStepId(existingIds: string[]): string {
  let counter = 1;
  let id = `step_${counter}`;
  while (existingIds.includes(id)) {
    counter++;
    id = `step_${counter}`;
  }
  return id;
}

export function StepBuilder({
  steps,
  transitions,
  onStepsChange,
  onTransitionsChange,
}: StepBuilderProps) {
  const [selectedStep, setSelectedStep] = useState<StepDefinition | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStepType, setNewStepType] = useState<string>("FORM_STEP");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(steps);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const reorderedSteps = items.map((step, index) => ({
      ...step,
      order: index,
      is_start: index === 0,
    }));

    onStepsChange(reorderedSteps);
  };

  const addStep = (type: string) => {
    const existingIds = steps.map((s) => s.step_id);
    const step_id = generateStepId(existingIds);
    const stepType = STEP_TYPES.find((t) => t.value === type);

    const newStep: StepDefinition = {
      step_id,
      step_name: `New ${stepType?.label || "Step"}`,
      step_type: type as StepDefinition["step_type"],
      order: steps.length,
      is_start: steps.length === 0,
      is_terminal: false,
    };

    // Add type-specific defaults
    if (type === "FORM_STEP") {
      newStep.fields = [];
    } else if (type === "APPROVAL_STEP") {
      newStep.approver_resolution = "REQUESTER_MANAGER";
    } else if (type === "TASK_STEP") {
      newStep.instructions = "";
      newStep.execution_notes_required = true;
    }

    onStepsChange([...steps, newStep]);

    // Auto-create transition from previous step
    if (steps.length > 0) {
      const prevStep = steps[steps.length - 1];
      const event = getDefaultTransitionEvent(prevStep.step_type);
      
      const newTransition: TransitionDefinition = {
        transition_id: `trans_${Date.now()}`,
        from_step_id: prevStep.step_id,
        to_step_id: step_id,
        on_event: event,
        priority: 0,
      };
      
      onTransitionsChange([...transitions, newTransition]);
    }

    setIsAddDialogOpen(false);
    setSelectedStep(newStep);
  };

  const getDefaultTransitionEvent = (stepType: string): string => {
    switch (stepType) {
      case "FORM_STEP":
        return "SUBMIT_FORM";
      case "APPROVAL_STEP":
        return "APPROVE";
      case "TASK_STEP":
        return "COMPLETE_TASK";
      case "NOTIFY_STEP":
        return "SUBMIT_FORM";
      default:
        return "SUBMIT_FORM";
    }
  };

  const updateStep = (stepId: string, updates: Partial<StepDefinition>) => {
    const updatedSteps = steps.map((step) =>
      step.step_id === stepId ? { ...step, ...updates } : step
    );
    onStepsChange(updatedSteps);
    
    if (selectedStep?.step_id === stepId) {
      setSelectedStep({ ...selectedStep, ...updates });
    }
  };

  const deleteStep = (stepId: string) => {
    // Remove step
    const filteredSteps = steps
      .filter((s) => s.step_id !== stepId)
      .map((s, index) => ({
        ...s,
        order: index,
        is_start: index === 0,
      }));
    onStepsChange(filteredSteps);

    // Remove related transitions
    const filteredTransitions = transitions.filter(
      (t) => t.from_step_id !== stepId && t.to_step_id !== stepId
    );
    onTransitionsChange(filteredTransitions);

    if (selectedStep?.step_id === stepId) {
      setSelectedStep(null);
    }
  };

  const duplicateStep = (step: StepDefinition) => {
    const existingIds = steps.map((s) => s.step_id);
    const newStepId = generateStepId(existingIds);

    const duplicatedStep: StepDefinition = {
      ...step,
      step_id: newStepId,
      step_name: `${step.step_name} (Copy)`,
      order: steps.length,
      is_start: false,
    };

    onStepsChange([...steps, duplicatedStep]);
  };

  const toggleExpanded = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getStepIcon = (stepType: string) => {
    const type = STEP_TYPES.find((t) => t.value === stepType);
    return type?.icon || FileText;
  };

  const getStepColor = (stepType: string) => {
    const type = STEP_TYPES.find((t) => t.value === stepType);
    return type?.color || "bg-gray-500";
  };

  const getNextStep = (stepId: string): StepDefinition | null => {
    const transition = transitions.find((t) => t.from_step_id === stepId);
    if (transition) {
      return steps.find((s) => s.step_id === transition.to_step_id) || null;
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Steps List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Workflow Steps</h3>
            <p className="text-sm text-muted-foreground">
              Drag to reorder, click to configure
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Step
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Step</DialogTitle>
                <DialogDescription>
                  Select the type of step to add
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                {STEP_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => addStep(type.value)}
                      className="flex flex-col items-center gap-3 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all"
                    >
                      <div
                        className={`h-12 w-12 rounded-full ${type.color} flex items-center justify-center`}
                      >
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="text-center">
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {type.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {steps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Play className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center mb-4">
                No steps yet. Add your first step to get started.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Step
              </Button>
            </CardContent>
          </Card>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="steps">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-3"
                >
                  {steps.map((step, index) => {
                    const StepIcon = getStepIcon(step.step_type);
                    const stepColor = getStepColor(step.step_type);
                    const isExpanded = expandedSteps.has(step.step_id);
                    const nextStep = getNextStep(step.step_id);

                    return (
                      <Draggable
                        key={step.step_id}
                        draggableId={step.step_id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                          >
                            <Card
                              className={`${
                                snapshot.isDragging ? "shadow-lg" : ""
                              } ${
                                selectedStep?.step_id === step.step_id
                                  ? "ring-2 ring-primary"
                                  : ""
                              }`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center gap-4">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="cursor-grab hover:bg-muted p-1 rounded"
                                  >
                                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                                  </div>

                                  <div
                                    className={`h-10 w-10 rounded-full ${stepColor} flex items-center justify-center flex-shrink-0`}
                                  >
                                    <StepIcon className="h-5 w-5 text-white" />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium truncate">
                                        {step.step_name}
                                      </span>
                                      {step.is_start && (
                                        <Badge variant="outline" className="text-xs">
                                          Start
                                        </Badge>
                                      )}
                                      {step.is_terminal && (
                                        <Badge variant="outline" className="text-xs">
                                          End
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {STEP_TYPES.find(
                                        (t) => t.value === step.step_type
                                      )?.label || step.step_type}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => toggleExpanded(step.step_id)}
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => duplicateStep(step)}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setSelectedStep(step)}
                                    >
                                      <Settings2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteStep(step.step_id)}
                                      className="text-destructive hover:text-destructive"
                                      disabled={steps.length === 1}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                  <div className="mt-4 pt-4 border-t space-y-2">
                                    {step.description && (
                                      <p className="text-sm text-muted-foreground">
                                        {step.description}
                                      </p>
                                    )}
                                    {step.step_type === "FORM_STEP" && step.fields && (
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Fields:
                                        </span>{" "}
                                        {step.fields.length === 0
                                          ? "None configured"
                                          : step.fields.map((f) => f.field_label).join(", ")}
                                      </div>
                                    )}
                                    {step.step_type === "APPROVAL_STEP" && (
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Approver:
                                        </span>{" "}
                                        {step.approver_resolution === "REQUESTER_MANAGER"
                                          ? "Requester's Manager"
                                          : step.specific_approver_email || "Not configured"}
                                      </div>
                                    )}
                                    {step.sla && (
                                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        <Clock className="h-4 w-4" />
                                        SLA: {Math.floor(step.sla.due_minutes / 60)}h{" "}
                                        {step.sla.due_minutes % 60}m
                                      </div>
                                    )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>

                            {/* Transition Arrow */}
                            {nextStep && (
                              <div className="flex justify-center py-2">
                                <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Step Configuration Panel */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedStep ? "Step Configuration" : "Select a Step"}
            </CardTitle>
            <CardDescription>
              {selectedStep
                ? `Configure ${selectedStep.step_name}`
                : "Click on a step to configure it"}
            </CardDescription>
          </CardHeader>
          {selectedStep && (
            <CardContent className="space-y-4">
              <Tabs defaultValue="general">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                  <TabsTrigger value="sla">SLA</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Step Name</Label>
                    <Input
                      value={selectedStep.step_name}
                      onChange={(e) =>
                        updateStep(selectedStep.step_id, {
                          step_name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={selectedStep.description || ""}
                      onChange={(e) =>
                        updateStep(selectedStep.step_id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="Describe what happens in this step"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedStep.is_terminal || false}
                      onCheckedChange={(checked) =>
                        updateStep(selectedStep.step_id, {
                          is_terminal: checked,
                        })
                      }
                    />
                    <Label>This is a terminal step (ends workflow)</Label>
                  </div>
                </TabsContent>

                <TabsContent value="config" className="space-y-4 mt-4">
                  {selectedStep.step_type === "FORM_STEP" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Configure form fields in the expanded panel below.
                      </p>
                      <FormFieldBuilder
                        fields={selectedStep.fields || []}
                        onChange={(fields) =>
                          updateStep(selectedStep.step_id, { fields })
                        }
                      />
                    </div>
                  )}

                  {selectedStep.step_type === "APPROVAL_STEP" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Approver Resolution</Label>
                        <Select
                          value={selectedStep.approver_resolution || "REQUESTER_MANAGER"}
                          onValueChange={(value) =>
                            updateStep(selectedStep.step_id, {
                              approver_resolution: value as StepDefinition["approver_resolution"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APPROVAL_RESOLUTION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedStep.approver_resolution === "SPECIFIC_EMAIL" && (
                        <div className="space-y-2">
                          <Label>Select Person</Label>
                          <p className="text-xs text-muted-foreground mb-2">
                            Search for the person who will always approve this step
                          </p>
                          <Input
                            type="email"
                            value={selectedStep.specific_approver_email || ""}
                            onChange={(e) =>
                              updateStep(selectedStep.step_id, {
                                specific_approver_email: e.target.value,
                              })
                            }
                            placeholder="approver@company.com"
                          />
                        </div>
                      )}

                      {selectedStep.approver_resolution === "REQUESTER_MANAGER" && (
                        <div className="space-y-2">
                          <Label>Fallback Email (Optional)</Label>
                          <p className="text-xs text-muted-foreground mb-2">
                            If the requester's manager is not found in Active Directory, route to this email instead
                          </p>
                          <Input
                            type="email"
                            value={selectedStep.spoc_email || ""}
                            onChange={(e) =>
                              updateStep(selectedStep.step_id, {
                                spoc_email: e.target.value,
                              })
                            }
                            placeholder="fallback-approver@company.com (optional)"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Parallel Approval</Label>
                        <Select
                          value={selectedStep.parallel_approval || ""}
                          onValueChange={(value) =>
                            updateStep(selectedStep.step_id, {
                              parallel_approval: value as "ALL" | "ANY" | undefined,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Single approver" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Single Approver</SelectItem>
                            <SelectItem value="ALL">All Must Approve</SelectItem>
                            <SelectItem value="ANY">Any One Approval</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {selectedStep.step_type === "TASK_STEP" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Task Instructions</Label>
                        <Textarea
                          value={selectedStep.instructions || ""}
                          onChange={(e) =>
                            updateStep(selectedStep.step_id, {
                              instructions: e.target.value,
                            })
                          }
                          placeholder="Instructions for the agent..."
                          rows={4}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={selectedStep.execution_notes_required ?? true}
                          onCheckedChange={(checked) =>
                            updateStep(selectedStep.step_id, {
                              execution_notes_required: checked,
                            })
                          }
                        />
                        <Label>Require execution notes</Label>
                      </div>
                    </div>
                  )}

                  {selectedStep.step_type === "NOTIFY_STEP" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Notification Template</Label>
                        <Select
                          value={selectedStep.notification_template || ""}
                          onValueChange={(value) =>
                            updateStep(selectedStep.step_id, {
                              notification_template: value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TICKET_CREATED">Ticket Created</SelectItem>
                            <SelectItem value="TICKET_COMPLETED">Ticket Completed</SelectItem>
                            <SelectItem value="TASK_ASSIGNED">Task Assigned</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sla" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Due Time (minutes)</Label>
                    <Input
                      type="number"
                      value={selectedStep.sla?.due_minutes || ""}
                      onChange={(e) =>
                        updateStep(selectedStep.step_id, {
                          sla: {
                            ...selectedStep.sla,
                            due_minutes: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      placeholder="e.g., 1440 for 24 hours"
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedStep.sla?.due_minutes
                        ? `= ${Math.floor(selectedStep.sla.due_minutes / 60)}h ${
                            selectedStep.sla.due_minutes % 60
                          }m`
                        : "Enter minutes until step is due"}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span>
                        SLA reminders and escalations are configured system-wide.
                      </span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

