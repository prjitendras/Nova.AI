/**
 * Draggable Step List Component
 * Drag and drop reordering for workflow steps with parallel branch visualization
 * Supports multi-step branches with full sub-workflow chains
 */
"use client";

import { useState, Fragment, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GripVertical,
  FileText,
  CheckSquare,
  ListChecks,
  Bell,
  MoreHorizontal,
  Settings,
  Copy,
  PlusCircle,
  MoveUp,
  MoveDown,
  Play,
  Flag,
  Trash2,
  Users,
  Zap,
  Plus,
  GitBranch,
  Split,
  Merge,
  ArrowDown,
  ChevronDown,
  Workflow,
} from "lucide-react";
import type { StepTemplate, StepType, TransitionTemplate, BranchDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";

const stepTypeConfig: Record<StepType, { 
  icon: any; 
  label: string; 
  color: string; 
  bg: string; 
  gradient: string; 
  glow: string; 
  desc: string 
}> = {
  FORM_STEP: { 
    icon: FileText, 
    label: "Form", 
    color: "text-blue-400", 
    bg: "bg-blue-500/15", 
    gradient: "from-blue-500 to-cyan-400", 
    glow: "shadow-blue-500/30", 
    desc: "Collect data" 
  },
  APPROVAL_STEP: { 
    icon: CheckSquare, 
    label: "Approval", 
    color: "text-emerald-400", 
    bg: "bg-emerald-500/15", 
    gradient: "from-emerald-500 to-teal-400", 
    glow: "shadow-emerald-500/30", 
    desc: "Get approval" 
  },
  TASK_STEP: { 
    icon: ListChecks, 
    label: "Task", 
    color: "text-amber-400", 
    bg: "bg-amber-500/15", 
    gradient: "from-amber-500 to-orange-400", 
    glow: "shadow-amber-500/30", 
    desc: "Assign work" 
  },
  NOTIFY_STEP: { 
    icon: Bell, 
    label: "Notify", 
    color: "text-purple-400", 
    bg: "bg-purple-500/15", 
    gradient: "from-purple-500 to-pink-400", 
    glow: "shadow-purple-500/30", 
    desc: "Send notification" 
  },
  FORK_STEP: { 
    icon: Split, 
    label: "Fork", 
    color: "text-rose-400", 
    bg: "bg-rose-500/15", 
    gradient: "from-rose-500 to-pink-400", 
    glow: "shadow-rose-500/30", 
    desc: "Parallel branches" 
  },
  JOIN_STEP: { 
    icon: Merge, 
    label: "Join", 
    color: "text-cyan-400", 
    bg: "bg-cyan-500/15", 
    gradient: "from-cyan-500 to-blue-400", 
    glow: "shadow-cyan-500/30", 
    desc: "Merge branches" 
  },
  SUB_WORKFLOW_STEP: { 
    icon: Workflow, 
    label: "Workflow", 
    color: "text-indigo-400", 
    bg: "bg-indigo-500/15", 
    gradient: "from-indigo-500 to-violet-400", 
    glow: "shadow-indigo-500/30", 
    desc: "Embedded workflow" 
  },
};

// Branch colors for visualization
const branchColors = [
  { name: "Rose", value: "#f43f5e", bg: "bg-rose-500", light: "bg-rose-500/10" },
  { name: "Amber", value: "#f59e0b", bg: "bg-amber-500", light: "bg-amber-500/10" },
  { name: "Emerald", value: "#10b981", bg: "bg-emerald-500", light: "bg-emerald-500/10" },
  { name: "Blue", value: "#3b82f6", bg: "bg-blue-500", light: "bg-blue-500/10" },
  { name: "Violet", value: "#8b5cf6", bg: "bg-violet-500", light: "bg-violet-500/10" },
  { name: "Cyan", value: "#06b6d4", bg: "bg-cyan-500", light: "bg-cyan-500/10" },
];

// Compact step card for branch display
function BranchStepCard({
  step,
  isSelected,
  branchColor,
  onSelect,
  onDelete,
  showConnector = true,
}: {
  step: StepTemplate;
  isSelected: boolean;
  branchColor: string;
  onSelect: () => void;
  onDelete: () => void;
  showConnector?: boolean;
}) {
  const cfg = stepTypeConfig[step.step_type];
  const Icon = cfg?.icon || FileText;

  return (
    <div className="relative w-full">
      <Card
        className={`relative rounded-xl transition-all cursor-pointer border-l-4 w-full ${
          isSelected
            ? `border-l-4 shadow-md ring-1 ring-primary/50`
            : "hover:shadow-sm hover:border-primary/30"
        }`}
        style={{ borderLeftColor: branchColor }}
        onClick={onSelect}
      >
        <CardHeader className="p-2.5">
          <div className="flex items-start gap-2 w-full">
            <div className={`p-1.5 rounded-lg bg-gradient-to-br flex-shrink-0 ${cfg?.gradient}`}>
              <Icon className="h-3 w-3 text-white" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <CardTitle className="text-xs font-medium leading-tight break-words line-clamp-2">
                {step.step_name}
              </CardTitle>
              <CardDescription className="text-[10px] mt-0.5 truncate">{cfg?.label}</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
      </Card>
      
      {/* Connector to next step */}
      {showConnector && (
        <div className="flex justify-center py-1">
          <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: branchColor }} />
        </div>
      )}
    </div>
  );
}

// Add step button for branches
function AddBranchStepButton({
  branchColor,
  onAddStep,
}: {
  branchColor: string;
  onAddStep: (type: StepType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs border-dashed hover:border-solid"
          style={{ borderColor: branchColor, color: branchColor }}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Step
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-40">
        <DropdownMenuItem onClick={() => onAddStep("FORM_STEP")}>
          <FileText className="h-3.5 w-3.5 mr-2 text-blue-500" />
          Form
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddStep("APPROVAL_STEP")}>
          <CheckSquare className="h-3.5 w-3.5 mr-2 text-emerald-500" />
          Approval
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddStep("TASK_STEP")}>
          <ListChecks className="h-3.5 w-3.5 mr-2 text-amber-500" />
          Task
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddStep("NOTIFY_STEP")}>
          <Bell className="h-3.5 w-3.5 mr-2 text-purple-500" />
          Notify
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortableStepCardProps {
  step: StepTemplate;
  isSelected: boolean;
  isStart: boolean;
  isEnd: boolean;
  isLast: boolean;
  index: number;
  transitions: TransitionTemplate[];
  onSelect: () => void;
  onDuplicate: () => void;
  onInsertAfter: (type: StepType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetStart: () => void;
  onSetTerminal: () => void;
  onDelete: () => void;
}

function SortableStepCard({
  step,
  isSelected,
  isStart,
  isEnd,
  isLast,
  index,
  transitions,
  onSelect,
  onDuplicate,
  onInsertAfter,
  onMoveUp,
  onMoveDown,
  onSetStart,
  onSetTerminal,
  onDelete,
}: SortableStepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.step_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cfg = stepTypeConfig[step.step_type];
  const Icon = cfg?.icon || FileText;

  // Check for conditional transitions
  const hasConditionalBranch = transitions.some(
    (t) => t.from_step_id === step.step_id && t.condition && t.condition.conditions?.length > 0
  );
  const outgoingTransitions = transitions.filter((t) => t.from_step_id === step.step_id);

  // For Fork steps, show branch count
  const branchCount = step.step_type === "FORK_STEP" ? (step.branches?.length || 0) : 0;

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      {/* Glow effect when selected */}
      {isSelected && (
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${cfg?.gradient} opacity-20 blur-xl -z-10`} />
      )}

      <Card
        className={`relative rounded-2xl transition-all cursor-pointer ${
          isSelected
            ? `border-primary shadow-lg ${cfg?.glow}`
            : isDragging
            ? "border-primary/50 shadow-xl"
            : "border-border/50 hover:border-primary/50"
        }`}
        onClick={onSelect}
      >
        {/* Badges */}
        {(isStart || isEnd || hasConditionalBranch) && (
          <div className="absolute -top-2.5 left-4 flex gap-1.5">
            {isStart && (
              <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-5">
                <Play className="h-2.5 w-2.5 mr-0.5" />
                Start
              </Badge>
            )}
            {isEnd && (
              <Badge className="bg-rose-500 text-white text-[10px] px-1.5 py-0 h-5">
                <Flag className="h-2.5 w-2.5 mr-0.5" />
                End
              </Badge>
            )}
            {hasConditionalBranch && (
              <Badge className="bg-violet-500 text-white text-[10px] px-1.5 py-0 h-5">
                <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                Branch
              </Badge>
            )}
          </div>
        )}

        <CardHeader className="p-4 pb-2">
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${cfg?.gradient} shadow-md ${cfg?.glow}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-semibold truncate">{step.step_name}</CardTitle>
              <CardDescription className="text-xs">{cfg?.label}</CardDescription>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelect(); }}>
                  <Settings className="h-3.5 w-3.5 mr-2" />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <PlusCircle className="h-3.5 w-3.5 mr-2" />
                    Insert After
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("FORM_STEP"); }}>
                      <FileText className="h-3.5 w-3.5 mr-2" />Form Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("APPROVAL_STEP"); }}>
                      <CheckSquare className="h-3.5 w-3.5 mr-2" />Approval Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("TASK_STEP"); }}>
                      <ListChecks className="h-3.5 w-3.5 mr-2" />Task Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("NOTIFY_STEP"); }}>
                      <Bell className="h-3.5 w-3.5 mr-2" />Notify Step
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("FORK_STEP"); }}>
                      <Split className="h-3.5 w-3.5 mr-2" />Fork Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onInsertAfter("JOIN_STEP"); }}>
                      <Merge className="h-3.5 w-3.5 mr-2" />Join Step
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0}>
                  <MoveUp className="h-3.5 w-3.5 mr-2" />
                  Move Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}>
                  <MoveDown className="h-3.5 w-3.5 mr-2" />
                  Move Down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetStart(); }}>
                  <Play className="h-3.5 w-3.5 mr-2" />
                  {isStart ? "Unmark Start" : "Set Start"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetTerminal(); }}>
                  <Flag className="h-3.5 w-3.5 mr-2" />
                  {isEnd ? "Unmark End" : "Set End"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        {step.description && (
          <CardContent className="px-4 pb-3 pt-0">
            <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
          </CardContent>
        )}

        {/* Step metadata */}
        {(step.fields?.length || step.approver_resolution || step.instructions || outgoingTransitions.length > 1 || branchCount > 0) && (
          <CardContent className="px-4 pb-3 pt-0">
            <div className="flex flex-wrap gap-1.5">
              {step.fields?.length && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  <FileText className="h-2.5 w-2.5 mr-1" />
                  {step.fields.length} fields
                </Badge>
              )}
              {step.approver_resolution && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  <Users className="h-2.5 w-2.5 mr-1" />
                  {step.approver_resolution === "REQUESTER_MANAGER" ? "Manager" : "Custom"}
                </Badge>
              )}
              {step.instructions && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  <Zap className="h-2.5 w-2.5 mr-1" />
                  Has instructions
                </Badge>
              )}
              {branchCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 bg-rose-500/20 text-rose-400">
                  <Split className="h-2.5 w-2.5 mr-1" />
                  {branchCount} branches
                </Badge>
              )}
              {outgoingTransitions.length > 1 && step.step_type !== "FORK_STEP" && (
                <Badge variant="secondary" className="text-[10px] h-5 bg-violet-500/20 text-violet-400">
                  <GitBranch className="h-2.5 w-2.5 mr-1" />
                  {outgoingTransitions.length} paths
                </Badge>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Overlay card during drag
function DragOverlayCard({ step }: { step: StepTemplate }) {
  const cfg = stepTypeConfig[step.step_type];
  const Icon = cfg?.icon || FileText;

  return (
    <Card className="rounded-2xl border-primary shadow-2xl rotate-3 scale-105">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start gap-3">
          <div className="p-1 -ml-1 rounded">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${cfg?.gradient} shadow-md ${cfg?.glow}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{step.step_name}</CardTitle>
            <CardDescription className="text-xs">{cfg?.label}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// Branch lane component showing all steps in a branch
function BranchLane({
  branch,
  branchIndex,
  branchSteps,
  allSteps,
  transitions,
  selectedStepId,
  onSelectStep,
  onDeleteStep,
  onAddStepToBranch,
}: {
  branch: BranchDefinition;
  branchIndex: number;
  branchSteps: StepTemplate[];
  allSteps: StepTemplate[];
  transitions: TransitionTemplate[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStepToBranch: (branchId: string, afterStepId: string | null, type: StepType) => void;
}) {
  const color = branch.color || branchColors[branchIndex % branchColors.length].value;
  const lightBg = branchColors[branchIndex % branchColors.length]?.light || "bg-gray-500/10";
  
  return (
    <div className="flex-1 min-w-[180px] max-w-[260px] group">
      {/* Branch header */}
      <div 
        className="text-center mb-3 py-2 px-2 rounded-lg text-xs font-semibold text-white shadow-md w-full overflow-hidden"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0">
          <GitBranch className="h-3 w-3 flex-shrink-0" />
          <span className="truncate block min-w-0">{branch.branch_name}</span>
        </div>
        {branch.assigned_team && (
          <div className="text-[10px] opacity-80 mt-0.5 truncate block w-full">{branch.assigned_team}</div>
        )}
      </div>

      {/* Branch content */}
      <div 
        className="relative rounded-xl p-3 min-h-[120px] border-2 border-dashed transition-colors w-full overflow-hidden"
        style={{ 
          backgroundColor: `${color}08`,
          borderColor: `${color}40`,
        }}
      >
        {/* Steps in this branch */}
        {branchSteps.length > 0 ? (
          <div className="space-y-1">
            {branchSteps.map((step, idx) => (
              <BranchStepCard
                key={step.step_id}
                step={step}
                isSelected={selectedStepId === step.step_id}
                branchColor={color}
                onSelect={() => onSelectStep(step.step_id)}
                onDelete={() => onDeleteStep(step.step_id)}
                showConnector={idx < branchSteps.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center mb-2 opacity-50"
              style={{ backgroundColor: `${color}20` }}
            >
              <Plus className="h-5 w-5" style={{ color }} />
            </div>
            <p className="text-xs text-muted-foreground font-medium">No steps yet</p>
          </div>
        )}

        {/* Add step button */}
        <div className="mt-3">
          <AddBranchStepButton
            branchColor={color}
            onAddStep={(type) => onAddStepToBranch(
              branch.branch_id, 
              branchSteps.length > 0 ? branchSteps[branchSteps.length - 1].step_id : null,
              type
            )}
          />
        </div>
      </div>

      {/* Connector to join */}
      <div className="flex justify-center mt-2">
        <div className="flex flex-col items-center">
          <div 
            className="w-0.5 h-6 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div 
            className="w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// Branch visualization component
function BranchVisualization({ 
  forkStep, 
  allSteps,
  transitions,
  selectedStepId,
  onSelectStep,
  onDeleteStep,
  onAddStepToBranch,
}: {
  forkStep: StepTemplate;
  allSteps: StepTemplate[];
  transitions: TransitionTemplate[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStepToBranch: (forkStepId: string, branchId: string, afterStepId: string | null, type: StepType) => void;
}) {
  const branches = forkStep.branches || [];
  
  // Find the JOIN step that corresponds to this FORK
  const joinStep = allSteps.find(s => 
    s.step_type === "JOIN_STEP" && s.source_fork_step_id === forkStep.step_id
  );

  // Trace steps in each branch by following transitions
  const getBranchSteps = useCallback((branch: BranchDefinition): StepTemplate[] => {
    if (!branch.start_step_id) return [];
    
    const result: StepTemplate[] = [];
    const visited = new Set<string>();
    let currentId: string | null = branch.start_step_id;
    
    // Get all branch start step IDs to avoid cross-branch contamination
    const allBranchStartIds = new Set(
      branches.map(b => b.start_step_id).filter(Boolean)
    );
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      
      const step = allSteps.find(s => s.step_id === currentId);
      if (!step) break;
      
      // Stop if we hit a JOIN step
      if (step.step_type === "JOIN_STEP") break;
      
      // Verify step belongs to this branch using multiple methods:
      // 1. Check explicit branch_id (preferred, most reliable)
      // 2. Check if it's the start step for this branch
      // 3. Fallback to name pattern matching for legacy compatibility
      const branchNamePrefix = branch.branch_name || "";
      const stepName = step.step_name || "";
      
      const belongsToBranch = 
        // Method 1: Explicit branch_id match (most reliable)
        step.branch_id === branch.branch_id ||
        // Method 2: This is the start step
        currentId === branch.start_step_id ||
        // Method 3: Name pattern match (legacy fallback)
        stepName.startsWith(branchNamePrefix + " -");
      
      if (belongsToBranch) {
        result.push(step);
      } else {
        // Step doesn't belong to this branch, stop tracing
        break;
      }
      
      // Find next step via transitions
      const outgoing = transitions.find(t => 
        t.from_step_id === currentId && 
        (t.on_event === "SUBMIT_FORM" || t.on_event === "APPROVE" || t.on_event === "COMPLETE_TASK")
      );
      
      currentId = outgoing?.to_step_id || null;
      
      // Stop if next step is the join
      if (currentId && joinStep && currentId === joinStep.step_id) break;
      
      // Stop if next step is the start of another branch (cross-branch contamination)
      if (currentId && allBranchStartIds.has(currentId) && currentId !== branch.start_step_id) {
        break;
      }
    }
    
    return result;
  }, [allSteps, transitions, joinStep, branches]);

  if (branches.length === 0) {
    return (
      <div className="p-6 rounded-xl border-2 border-dashed border-rose-500/30 bg-rose-500/5 text-center">
        <Split className="h-10 w-10 mx-auto text-rose-500/50 mb-3" />
        <p className="text-sm text-rose-500/70 font-medium">No branches configured</p>
        <p className="text-xs text-muted-foreground mt-1">Click on the Fork step to add branches</p>
      </div>
    );
  }

  return (
    <div className="relative py-2">
      {/* Split visualization from fork */}
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-2">
          {branches.map((branch, idx) => {
            const color = branch.color || branchColors[idx % branchColors.length].value;
            return (
              <div key={branch.branch_id} className="flex flex-col items-center">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div 
                  className="w-0.5 h-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Branch lanes */}
      <div className="flex gap-4 justify-center flex-wrap">
        {branches.map((branch, idx) => (
          <BranchLane
            key={branch.branch_id}
            branch={branch}
            branchIndex={idx}
            branchSteps={getBranchSteps(branch)}
            allSteps={allSteps}
            transitions={transitions}
            selectedStepId={selectedStepId}
            onSelectStep={onSelectStep}
            onDeleteStep={onDeleteStep}
            onAddStepToBranch={(branchId, afterStepId, type) => 
              onAddStepToBranch(forkStep.step_id, branchId, afterStepId, type)
            }
          />
        ))}
      </div>

      {/* Merge visualization to join */}
      <div className="flex justify-center mt-2">
        <div className="flex items-center gap-2">
          {branches.map((branch, idx) => {
            const color = branch.color || branchColors[idx % branchColors.length].value;
            return (
              <div key={branch.branch_id} className="flex flex-col items-center">
                <div 
                  className="w-0.5 h-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Join step indicator if exists - CLICKABLE */}
      {joinStep && (
        <div className="flex justify-center mt-3">
          <button
            onClick={() => onSelectStep(joinStep.step_id)}
            className={cn(
              "px-4 py-2 rounded-full text-white text-xs font-semibold flex items-center gap-2 shadow-lg transition-all",
              "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600",
              "hover:scale-105 hover:shadow-cyan-500/40 cursor-pointer",
              selectedStepId === joinStep.step_id && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background scale-105"
            )}
          >
            <Merge className="h-3.5 w-3.5" />
            {joinStep.step_name}
          </button>
        </div>
      )}
    </div>
  );
}

interface DraggableStepListProps {
  steps: StepTemplate[];
  transitions: TransitionTemplate[];
  selectedStepId: string | null;
  startStepId: string;
  onStepsReorder: (steps: StepTemplate[]) => void;
  onSelectStep: (stepId: string) => void;
  onDuplicateStep: (step: StepTemplate) => void;
  onInsertAfter: (afterId: string, type: StepType) => void;
  onMoveStep: (stepId: string, direction: "up" | "down") => void;
  onSetStart: (stepId: string) => void;
  onSetTerminal: (stepId: string, isTerminal: boolean) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStepToBranch?: (forkStepId: string, branchId: string, afterStepId: string | null, type: StepType) => void;
}

export function DraggableStepList({
  steps,
  transitions,
  selectedStepId,
  startStepId,
  onStepsReorder,
  onSelectStep,
  onDuplicateStep,
  onInsertAfter,
  onMoveStep,
  onSetStart,
  onSetTerminal,
  onDeleteStep,
  onAddStepToBranch,
}: DraggableStepListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Analyze workflow structure for parallel branches
  const { mainFlowSteps, branchStepIds, forkSteps } = useMemo(() => {
    const sortedSteps = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
    const forks = sortedSteps.filter(s => s.step_type === "FORK_STEP");
    const joins = sortedSteps.filter(s => s.step_type === "JOIN_STEP");
    
    // Collect all step IDs that are part of branches
    const branchIds = new Set<string>();
    
    forks.forEach(fork => {
      fork.branches?.forEach(branch => {
        if (branch.start_step_id) {
          // Trace all steps in this branch
          let currentId: string | null = branch.start_step_id;
          const visited = new Set<string>();
          
          while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            branchIds.add(currentId);
            
            const step = sortedSteps.find(s => s.step_id === currentId);
            if (!step || step.step_type === "JOIN_STEP") break;
            
            // Find next step
            const outgoing = transitions.find(t => 
              t.from_step_id === currentId && 
              (t.on_event === "SUBMIT_FORM" || t.on_event === "APPROVE" || t.on_event === "COMPLETE_TASK")
            );
            
            const nextId = outgoing?.to_step_id;
            const nextStep = nextId ? sortedSteps.find(s => s.step_id === nextId) : null;
            
            // Stop if next is a join
            if (nextStep?.step_type === "JOIN_STEP") break;
            
            currentId = nextId || null;
          }
        }
      });
    });
    
    // Main flow = all steps NOT in branches (except joins are in main flow if they follow forks)
    const mainFlow = sortedSteps.filter(s => !branchIds.has(s.step_id));
    
    return {
      mainFlowSteps: mainFlow,
      branchStepIds: branchIds,
      forkSteps: forks,
    };
  }, [steps, transitions]);

  const sortedSteps = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  const activeStep = sortedSteps.find((s) => s.step_id === activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = sortedSteps.findIndex((s) => s.step_id === active.id);
      const newIndex = sortedSteps.findIndex((s) => s.step_id === over.id);
      
      const reorderedSteps = arrayMove(sortedSteps, oldIndex, newIndex).map((s, i) => ({
        ...s,
        order: i,
      }));

      onStepsReorder(reorderedSteps);
    }
  };

  // Handle adding step to branch
  const handleAddStepToBranch = useCallback((forkStepId: string, branchId: string, afterStepId: string | null, type: StepType) => {
    if (onAddStepToBranch) {
      onAddStepToBranch(forkStepId, branchId, afterStepId, type);
    }
  }, [onAddStepToBranch]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedSteps.map((s) => s.step_id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {/* Start badge */}
          <div className="flex flex-col items-center mb-2 animate-slide-down">
            <div className="px-4 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-500/25">
              <Play className="h-3 w-3" />
              Start
            </div>
            <div className="w-0.5 h-4 bg-emerald-500/50 rounded-full mt-1" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background shadow-md" />
            <div className="w-0.5 h-6 bg-primary/40 rounded-full" />
          </div>

          {/* Step cards - main flow only */}
          {mainFlowSteps.map((step, idx) => {
            const isStart = step.is_start || startStepId === step.step_id;
            const isEnd = step.is_terminal;
            const isLast = idx === mainFlowSteps.length - 1;
            const isFork = step.step_type === "FORK_STEP";
            const isJoin = step.step_type === "JOIN_STEP";
            
            // Skip join steps that are part of a fork (they're shown in branch viz)
            if (isJoin && step.source_fork_step_id) {
              const parentFork = forkSteps.find(f => f.step_id === step.source_fork_step_id);
              if (parentFork) return null;
            }

            return (
              <Fragment key={step.step_id}>
                {idx > 0 && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-0.5 h-6 bg-primary/40 rounded-full" />
                    <div className="w-2 h-2 rounded-full bg-primary/60 border-2 border-background shadow-sm" />
                    <div className="w-0.5 h-6 bg-primary/40 rounded-full" />
                  </div>
                )}
                
                <SortableStepCard
                  step={step}
                  isSelected={selectedStepId === step.step_id}
                  isStart={isStart}
                  isEnd={isEnd || false}
                  isLast={isLast}
                  index={idx}
                  transitions={transitions}
                  onSelect={() => onSelectStep(step.step_id)}
                  onDuplicate={() => onDuplicateStep(step)}
                  onInsertAfter={(type) => onInsertAfter(step.step_id, type)}
                  onMoveUp={() => onMoveStep(step.step_id, "up")}
                  onMoveDown={() => onMoveStep(step.step_id, "down")}
                  onSetStart={() => onSetStart(step.step_id)}
                  onSetTerminal={() => onSetTerminal(step.step_id, !isEnd)}
                  onDelete={() => onDeleteStep(step.step_id)}
                />

                {/* Show branch visualization after Fork step */}
                {isFork && (
                  <div className="mt-4 mb-4">
                    <div className="flex flex-col items-center py-1">
                      <div className="w-0.5 h-4 bg-rose-500/60 rounded-full" />
                      <Split className="h-5 w-5 text-rose-500" />
                    </div>
                    <BranchVisualization
                      forkStep={step}
                      allSteps={steps}
                      transitions={transitions}
                      selectedStepId={selectedStepId}
                      onSelectStep={onSelectStep}
                      onDeleteStep={onDeleteStep}
                      onAddStepToBranch={handleAddStepToBranch}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* End badge */}
          {mainFlowSteps.length > 0 && (
            <div className="flex flex-col items-center mt-2">
              <div className="w-0.5 h-6 bg-rose-500/50 rounded-full" />
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-background shadow-md" />
              <div className="w-0.5 h-4 bg-rose-500/50 rounded-full" />
              <div className="px-4 py-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-500/25">
                <Flag className="h-3 w-3" />
                End
              </div>
            </div>
          )}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeStep && <DragOverlayCard step={activeStep} />}
      </DragOverlay>
    </DndContext>
  );
}

export default DraggableStepList;
