/**
 * SLA Indicator Component
 * Displays SLA status with countdown and visual indicators
 */
"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, isPast, differenceInMinutes } from "date-fns";

interface SlaIndicatorProps {
  dueAt?: string | null;
  completedAt?: string | null;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

type SlaStatus = "completed" | "ontrack" | "atrisk" | "overdue";

export function SlaIndicator({
  dueAt,
  completedAt,
  showLabel = true,
  size = "default",
  className,
}: SlaIndicatorProps) {
  const status = useMemo((): SlaStatus => {
    if (completedAt) return "completed";
    if (!dueAt) return "ontrack";
    
    const dueDate = new Date(dueAt);
    const now = new Date();
    
    if (isPast(dueDate)) return "overdue";
    
    const minutesUntilDue = differenceInMinutes(dueDate, now);
    if (minutesUntilDue <= 60) return "atrisk"; // Within 1 hour
    
    return "ontrack";
  }, [dueAt, completedAt]);
  
  const statusConfig: Record<SlaStatus, {
    icon: typeof Clock;
    label: string;
    className: string;
    bgClassName: string;
  }> = {
    completed: {
      icon: CheckCircle,
      label: "Completed",
      className: "text-emerald-600 dark:text-emerald-400",
      bgClassName: "bg-emerald-100 dark:bg-emerald-900/30",
    },
    ontrack: {
      icon: Clock,
      label: "On Track",
      className: "text-blue-600 dark:text-blue-400",
      bgClassName: "bg-blue-100 dark:bg-blue-900/30",
    },
    atrisk: {
      icon: AlertTriangle,
      label: "At Risk",
      className: "text-amber-600 dark:text-amber-400",
      bgClassName: "bg-amber-100 dark:bg-amber-900/30",
    },
    overdue: {
      icon: AlertTriangle,
      label: "Overdue",
      className: "text-red-600 dark:text-red-400",
      bgClassName: "bg-red-100 dark:bg-red-900/30",
    },
  };
  
  const config = statusConfig[status];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: {
      container: "gap-1 text-xs",
      icon: "h-3 w-3",
      badge: "px-1.5 py-0.5",
    },
    default: {
      container: "gap-1.5 text-sm",
      icon: "h-4 w-4",
      badge: "px-2 py-1",
    },
    lg: {
      container: "gap-2 text-base",
      icon: "h-5 w-5",
      badge: "px-3 py-1.5",
    },
  };
  
  const sizes = sizeClasses[size];
  
  const timeLabel = useMemo(() => {
    if (completedAt) {
      return `Completed ${formatDistanceToNow(new Date(completedAt), { addSuffix: true })}`;
    }
    if (!dueAt) return "No SLA";
    
    const dueDate = new Date(dueAt);
    if (isPast(dueDate)) {
      return `Overdue by ${formatDistanceToNow(dueDate)}`;
    }
    return `Due ${formatDistanceToNow(dueDate, { addSuffix: true })}`;
  }, [dueAt, completedAt]);
  
  if (!dueAt && !completedAt) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center rounded-full font-medium",
              config.bgClassName,
              sizes.container,
              sizes.badge,
              className
            )}
          >
            <Icon className={cn(sizes.icon, config.className)} />
            {showLabel && (
              <span className={config.className}>{config.label}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{timeLabel}</p>
          {dueAt && (
            <p className="text-xs text-muted-foreground">
              Due: {new Date(dueAt).toLocaleString()}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * SLA Progress Bar
 */
interface SlaProgressProps {
  dueAt?: string | null;
  startedAt?: string | null;
  className?: string;
}

export function SlaProgress({ dueAt, startedAt, className }: SlaProgressProps) {
  const progress = useMemo(() => {
    if (!dueAt || !startedAt) return 0;
    
    const start = new Date(startedAt).getTime();
    const due = new Date(dueAt).getTime();
    const now = Date.now();
    
    const total = due - start;
    const elapsed = now - start;
    
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }, [dueAt, startedAt]);
  
  const status = useMemo(() => {
    if (progress >= 100) return "overdue";
    if (progress >= 75) return "atrisk";
    return "ontrack";
  }, [progress]);
  
  const progressColors = {
    ontrack: "bg-blue-500",
    atrisk: "bg-amber-500",
    overdue: "bg-red-500",
  };
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>SLA Progress</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", progressColors[status])}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}

