/**
 * Empty State Component
 * Displays a friendly message when no data is available
 */
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Inbox,
  Search,
  FolderOpen,
  ClipboardList,
  Users,
  CheckCircle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="default">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Preset empty states for common scenarios
 */
export function NoTicketsEmpty({ onCreateTicket }: { onCreateTicket?: () => void }) {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No tickets yet"
      description="Create your first ticket to get started with the workflow."
      action={
        onCreateTicket
          ? {
              label: "Create Ticket",
              onClick: onCreateTicket,
            }
          : undefined
      }
    />
  );
}

export function NoWorkflowsEmpty({ onCreateWorkflow }: { onCreateWorkflow?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="No workflows found"
      description="Create a new workflow to define your business processes."
      action={
        onCreateWorkflow
          ? {
              label: "Create Workflow",
              onClick: onCreateWorkflow,
            }
          : undefined
      }
    />
  );
}

export function NoApprovalsEmpty() {
  return (
    <EmptyState
      icon={CheckCircle}
      title="All caught up!"
      description="You have no pending approvals at the moment."
    />
  );
}

export function NoTasksEmpty() {
  return (
    <EmptyState
      icon={Inbox}
      title="No assigned tasks"
      description="You don't have any tasks assigned to you right now."
    />
  );
}

export function NoSearchResultsEmpty({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try a different search term.`}
    />
  );
}

export function NoUsersEmpty() {
  return (
    <EmptyState
      icon={Users}
      title="No users found"
      description="Try searching with a different name or email."
    />
  );
}

