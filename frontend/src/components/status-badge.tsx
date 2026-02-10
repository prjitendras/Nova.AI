/**
 * Status Badge Component
 * Displays ticket status and step state with appropriate colors
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TicketStatus, StepState } from "@/lib/types";

interface StatusBadgeProps {
  status: TicketStatus | StepState;
  size?: "sm" | "default" | "lg";
  className?: string;
}

const statusConfig: Record<string, { label: string; variant: string; className: string }> = {
  // Ticket statuses
  OPEN: {
    label: "Open",
    variant: "secondary",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  IN_PROGRESS: {
    label: "In Progress",
    variant: "default",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  WAITING_FOR_REQUESTER: {
    label: "Waiting for Info",
    variant: "warning",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  WAITING_FOR_AGENT: {
    label: "Info Requested",
    variant: "warning",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  COMPLETED: {
    label: "Completed",
    variant: "success",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  REJECTED: {
    label: "Rejected",
    variant: "destructive",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  SKIPPED: {
    label: "Skipped",
    variant: "warning",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "secondary",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  
  // Step states
  NOT_STARTED: {
    label: "Not Started",
    variant: "outline",
    className: "border-gray-300 text-gray-500 dark:border-gray-600",
  },
  ACTIVE: {
    label: "Active",
    variant: "default",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  WAITING_FOR_APPROVAL: {
    label: "Pending Approval",
    variant: "warning",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  ON_HOLD: {
    label: "On Hold",
    variant: "warning",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  WAITING_FOR_CR: {
    label: "Waiting for CR",
    variant: "warning",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
};

export function StatusBadge({ status, size = "default", className }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    variant: "secondary",
    className: "",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0",
    default: "text-xs px-2 py-0.5",
    lg: "text-sm px-3 py-1",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(config.className, sizeClasses[size], "font-medium", className)}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Step Type Badge
 */
interface StepTypeBadgeProps {
  type: string;
  className?: string;
}

const stepTypeConfig: Record<string, { label: string; className: string }> = {
  FORM_STEP: {
    label: "Form",
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  },
  APPROVAL_STEP: {
    label: "Approval",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  },
  TASK_STEP: {
    label: "Task",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  NOTIFY_STEP: {
    label: "Notify",
    className: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  },
  FORK_STEP: {
    label: "Fork",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  },
  JOIN_STEP: {
    label: "Join",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  },
  SUB_WORKFLOW_STEP: {
    label: "Workflow",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
};

export function StepTypeBadge({ type, className }: StepTypeBadgeProps) {
  const config = stepTypeConfig[type] || {
    label: type,
    className: "",
  };

  return (
    <Badge variant="secondary" className={cn(config.className, "text-xs font-medium", className)}>
      {config.label}
    </Badge>
  );
}

/**
 * Workflow Status Badge
 */
interface WorkflowStatusBadgeProps {
  status: string;
  className?: string;
}

const workflowStatusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  PUBLISHED: {
    label: "Published",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

export function WorkflowStatusBadge({ status, className }: WorkflowStatusBadgeProps) {
  const config = workflowStatusConfig[status] || {
    label: status,
    className: "",
  };

  return (
    <Badge variant="secondary" className={cn(config.className, "text-xs font-medium", className)}>
      {config.label}
    </Badge>
  );
}

/**
 * Step State Badge - for step runtime state
 */
interface StepStateBadgeProps {
  state: string;
  size?: "sm" | "default";
  className?: string;
}

const stepStateConfig: Record<string, { label: string; className: string }> = {
  NOT_STARTED: {
    label: "Not Started",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  WAITING_FOR_APPROVAL: {
    label: "Pending Approval",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  WAITING_FOR_REQUESTER: {
    label: "Waiting for Info",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  SKIPPED: {
    label: "Skipped",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  WAITING_FOR_AGENT: {
    label: "Waiting for Agent",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  WAITING_FOR_BRANCHES: {
    label: "Waiting for Branches",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  WAITING_FOR_CR: {
    label: "Waiting for CR",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
};

export function StepStateBadge({ state, size = "default", className }: StepStateBadgeProps) {
  const config = stepStateConfig[state] || {
    label: state,
    className: "",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0",
    default: "text-xs px-2 py-0.5",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(config.className, sizeClasses[size], "font-medium", className)}
    >
      {config.label}
    </Badge>
  );
}

