/**
 * My Tickets Page - Refined Premium Design
 * Compact, elegant, professional
 */
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTickets } from "@/hooks/use-tickets";
import { PageContainer } from "@/components/page-header";
import { NoTicketsEmpty } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Search,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  LayoutGrid,
  LayoutList,
  FileText,
  ArrowUpRight,
  Activity,
  Timer,
  Zap,
  Loader2,
  ArrowDownUp,
  Plus,
  FastForward,
  PauseCircle,
  FileEdit,
} from "lucide-react";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { parseUTCDate, cn } from "@/lib/utils";
import type { Ticket as TicketType, TicketStatus } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { ChangeRequestForm } from "@/components/change-request/change-request-form";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// Relative time format (e.g., "1h", "3d")
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = differenceInHours(now, date);
  if (hours < 24) return `${hours}h ago`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d ago`;
  return format(date, "MMM d");
}

// Format date with relative time (e.g., "Jan 30 · 2h ago")
function formatDateTime(date: Date): { date: string; relative: string } {
  const now = new Date();
  const dateStr = format(date, "MMM d, yyyy");
  const mins = differenceInMinutes(now, date);
  
  let relative: string;
  if (mins < 1) relative = "just now";
  else if (mins < 60) relative = `${mins}m ago`;
  else {
    const hours = differenceInHours(now, date);
    if (hours < 24) relative = `${hours}h ago`;
    else {
      const days = differenceInDays(now, date);
      if (days < 7) relative = `${days}d ago`;
      else relative = format(date, "h:mm a");
    }
  }
  
  return { date: dateStr, relative };
}

// Compact Status Badge
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    IN_PROGRESS: { 
      label: "In Progress", 
      bg: "bg-blue-50 dark:bg-blue-950/50",
      text: "text-blue-600 dark:text-blue-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    WAITING_FOR_REQUESTER: { 
      label: "Action Required", 
      bg: "bg-amber-50 dark:bg-amber-950/50",
      text: "text-amber-600 dark:text-amber-400",
      icon: <Timer className="h-3 w-3" />,
    },
    WAITING_FOR_AGENT: { 
      label: "Awaiting", 
      bg: "bg-orange-50 dark:bg-orange-950/50",
      text: "text-orange-600 dark:text-orange-400",
      icon: <Clock className="h-3 w-3" />,
    },
    COMPLETED: { 
      label: "Completed", 
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
      text: "text-emerald-600 dark:text-emerald-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    CANCELLED: { 
      label: "Cancelled", 
      bg: "bg-slate-100 dark:bg-slate-800",
      text: "text-slate-500 dark:text-slate-400",
      icon: <XCircle className="h-3 w-3" />,
    },
    REJECTED: { 
      label: "Rejected", 
      bg: "bg-rose-50 dark:bg-rose-950/50",
      text: "text-rose-600 dark:text-rose-400",
      icon: <XCircle className="h-3 w-3" />,
    },
    SKIPPED: { 
      label: "Skipped", 
      bg: "bg-amber-50 dark:bg-amber-950/50",
      text: "text-amber-600 dark:text-amber-400",
      icon: <FastForward className="h-3 w-3" />,
    },
    ON_HOLD: { 
      label: "On Hold", 
      bg: "bg-purple-50 dark:bg-purple-950/50",
      text: "text-purple-600 dark:text-purple-400",
      icon: <PauseCircle className="h-3 w-3" />,
    },
    PENDING: { 
      label: "Pending", 
      bg: "bg-slate-50 dark:bg-slate-800",
      text: "text-slate-600 dark:text-slate-400",
      icon: <Clock className="h-3 w-3" />,
    },
  };
  
  const config = configs[status] || configs.PENDING;
  
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium", config.bg, config.text)}>
      {config.icon}
      {config.label}
    </span>
  );
}

// Enhanced Stat Tab with visual flair
function StatTab({ 
  label, 
  count, 
  isActive, 
  onClick,
  color = "slate",
  icon: Icon,
  total,
}: { 
  label: string; 
  count: number; 
  isActive?: boolean;
  onClick?: () => void;
  color?: "slate" | "blue" | "amber" | "emerald" | "orange" | "rose" | "purple";
  icon?: React.ElementType;
  total?: number;
}) {
  const colorStyles = {
    slate: {
      bg: "bg-slate-500",
      activeBg: "bg-gradient-to-br from-slate-500 to-slate-600",
      glow: "shadow-slate-500/20",
      text: "text-slate-600 dark:text-slate-400",
      light: "bg-slate-100 dark:bg-slate-800",
    },
    blue: {
      bg: "bg-blue-500",
      activeBg: "bg-gradient-to-br from-blue-500 to-cyan-500",
      glow: "shadow-blue-500/25",
      text: "text-blue-600 dark:text-blue-400",
      light: "bg-blue-50 dark:bg-blue-950/50",
    },
    amber: {
      bg: "bg-amber-500",
      activeBg: "bg-gradient-to-br from-amber-500 to-orange-500",
      glow: "shadow-amber-500/25",
      text: "text-amber-600 dark:text-amber-400",
      light: "bg-amber-50 dark:bg-amber-950/50",
    },
    emerald: {
      bg: "bg-emerald-500",
      activeBg: "bg-gradient-to-br from-emerald-500 to-green-500",
      glow: "shadow-emerald-500/25",
      text: "text-emerald-600 dark:text-emerald-400",
      light: "bg-emerald-50 dark:bg-emerald-950/50",
    },
    orange: {
      bg: "bg-orange-500",
      activeBg: "bg-gradient-to-br from-orange-500 to-red-500",
      glow: "shadow-orange-500/25",
      text: "text-orange-600 dark:text-orange-400",
      light: "bg-orange-50 dark:bg-orange-950/50",
    },
    rose: {
      bg: "bg-rose-500",
      activeBg: "bg-gradient-to-br from-rose-500 to-red-500",
      glow: "shadow-rose-500/25",
      text: "text-rose-600 dark:text-rose-400",
      light: "bg-rose-50 dark:bg-rose-950/50",
    },
    purple: {
      bg: "bg-purple-500",
      activeBg: "bg-gradient-to-br from-purple-500 to-violet-500",
      glow: "shadow-purple-500/25",
      text: "text-purple-600 dark:text-purple-400",
      light: "bg-purple-50 dark:bg-purple-950/50",
    },
  };
  
  const styles = colorStyles[color];
  const percentage = total && total > 0 ? Math.round((count / total) * 100) : 0;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
        isActive 
          ? `${styles.light} shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10` 
          : "hover:bg-muted/50"
      )}
    >
      {/* Icon with gradient background when active */}
      <div className={cn(
        "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200",
        isActive 
          ? `${styles.activeBg} shadow-md ${styles.glow}` 
          : `${styles.light}`
      )}>
        {Icon ? (
          <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : styles.text)} />
        ) : (
          <span className={cn("w-2 h-2 rounded-full", isActive ? "bg-white" : styles.bg)} />
        )}
      </div>
      
      {/* Content */}
      <div className="flex flex-col items-start">
        <span className={cn(
          "text-lg font-bold tabular-nums leading-none",
          isActive ? styles.text : "text-foreground"
        )}>
          {count}
        </span>
        <span className={cn(
          "text-[10px] font-medium leading-tight",
          isActive ? styles.text : "text-muted-foreground"
        )}>
          {label}
        </span>
      </div>
      
      {/* Mini progress bar - only show for non-"All" tabs when active */}
      {isActive && total && total > 0 && label !== "All" && (
        <div className="absolute bottom-1 left-3 right-3 h-0.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all duration-500", styles.bg)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </button>
  );
}

// Compact Ticket Row
function TicketRow({ ticket, onClick, userEmail, userAadId, onCRClick }: { 
  ticket: TicketType; 
  onClick: () => void;
  userEmail?: string;
  userAadId?: string;
  onCRClick: (ticket: TicketType) => void;
}) {
  const borderColors: Record<string, string> = {
    IN_PROGRESS: "border-l-blue-500",
    WAITING_FOR_REQUESTER: "border-l-amber-500",
    WAITING_FOR_AGENT: "border-l-orange-500",
    COMPLETED: "border-l-emerald-500",
    CANCELLED: "border-l-slate-300",
    REJECTED: "border-l-rose-500",
  };

  // Check requester by aad_id first (handles UPN vs primary email mismatch), fallback to email
  const isRequester = (
    (userAadId && ticket.requester?.aad_id && userAadId === ticket.requester.aad_id) ||
    (userEmail && ticket.requester?.email?.toLowerCase() === userEmail.toLowerCase())
  );
  const isInProgress = ticket.status === "IN_PROGRESS";
  const hasPendingCR = !!ticket.pending_change_request_id;
  const firstApprovalCompleted = ticket.first_approval_completed === true;
  const canRequestChange = isRequester && isInProgress && !hasPendingCR && firstApprovalCompleted;
  const isTerminalStatus = ["COMPLETED", "CANCELLED", "REJECTED", "SKIPPED"].includes(ticket.status);

  // Determine button state and style
  const getCRButtonProps = () => {
    if (!isRequester) {
      return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Only the requester can initiate changes" };
    }
    if (isTerminalStatus) {
      return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Cannot change completed/cancelled tickets" };
    }
    // Check if first approval is pending (IN_PROGRESS but not yet approved)
    if (isInProgress && !firstApprovalCompleted) {
      return { disabled: true, className: "bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400", tooltip: "Waiting for first approval - CR available after approval" };
    }
    if (hasPendingCR) {
      return { disabled: true, className: "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400", tooltip: "Change request pending approval" };
    }
    if (canRequestChange) {
      return { disabled: false, className: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900", tooltip: "Initiate a change request" };
    }
    return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Not available" };
  };

  const crButtonProps = getCRButtonProps();

  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-4 py-3 transition-colors",
        "border-l-2 border-b border-border/50 last:border-b-0",
        "hover:bg-muted/50",
        borderColors[ticket.status] || borderColors.IN_PROGRESS
      )}
    >
      {/* Ticket Info - clickable */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-mono text-muted-foreground">{ticket.ticket_id}</span>
          {(ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_FOR_REQUESTER") && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          )}
          {hasPendingCR && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400">
              CR Pending
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium truncate max-w-md group-hover:text-primary transition-colors">
          {ticket.workflow_name} - {ticket.ticket_id}
        </p>
      </div>
      
      {/* Workflow - removed as it's now in title */}
      <div className="hidden lg:block w-40 cursor-pointer" onClick={onClick}>
        <p className="text-xs text-muted-foreground truncate">{ticket.workflow_name}</p>
      </div>
      
      {/* Status */}
      <div className="hidden sm:block cursor-pointer" onClick={onClick}>
        <StatusBadge status={ticket.status} />
      </div>
      
      {/* Change Request Agent Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={crButtonProps.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!crButtonProps.disabled) {
                  onCRClick(ticket);
                }
              }}
              className={cn(
                "h-7 px-2 text-[10px] font-medium whitespace-nowrap",
                crButtonProps.className
              )}
            >
              <FileEdit className="h-3 w-3 mr-1" />
              CR Agent
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {crButtonProps.tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Date & Time */}
      <div className="w-32 text-right cursor-pointer" onClick={onClick}>
        {(() => {
          const { date, relative } = formatDateTime(parseUTCDate(ticket.updated_at));
          return (
            <div className="flex flex-col">
              <span className="text-xs text-foreground/80">{date}</span>
              <span className="text-[10px] text-muted-foreground">{relative}</span>
            </div>
          );
        })()}
      </div>
      
      {/* Arrow */}
      <ArrowUpRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors cursor-pointer" onClick={onClick} />
    </div>
  );
}

// Compact Grid Card
function TicketCard({ ticket, onClick, userEmail, userAadId, onCRClick }: { 
  ticket: TicketType; 
  onClick: () => void;
  userEmail?: string;
  userAadId?: string;
  onCRClick: (ticket: TicketType) => void;
}) {
  const topColors: Record<string, string> = {
    IN_PROGRESS: "bg-blue-500",
    WAITING_FOR_REQUESTER: "bg-amber-500",
    WAITING_FOR_AGENT: "bg-orange-500",
    COMPLETED: "bg-emerald-500",
    CANCELLED: "bg-slate-400",
    REJECTED: "bg-rose-500",
  };

  // Check requester by aad_id first (handles UPN vs primary email mismatch), fallback to email
  const isRequester = (
    (userAadId && ticket.requester?.aad_id && userAadId === ticket.requester.aad_id) ||
    (userEmail && ticket.requester?.email?.toLowerCase() === userEmail.toLowerCase())
  );
  const isInProgress = ticket.status === "IN_PROGRESS";
  const hasPendingCR = !!ticket.pending_change_request_id;
  const firstApprovalCompleted = ticket.first_approval_completed === true;
  const canRequestChange = isRequester && isInProgress && !hasPendingCR && firstApprovalCompleted;
  const isTerminalStatus = ["COMPLETED", "CANCELLED", "REJECTED", "SKIPPED"].includes(ticket.status);

  // Determine button state and style
  const getCRButtonProps = () => {
    if (!isRequester) {
      return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Only the requester can initiate changes" };
    }
    if (isTerminalStatus) {
      return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Cannot change completed/cancelled tickets" };
    }
    // Check if first approval is pending (IN_PROGRESS but not yet approved)
    if (isInProgress && !firstApprovalCompleted) {
      return { disabled: true, className: "bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400", tooltip: "Waiting for first approval - CR available after approval" };
    }
    if (hasPendingCR) {
      return { disabled: true, className: "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400", tooltip: "Change request pending approval" };
    }
    if (canRequestChange) {
      return { disabled: false, className: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900", tooltip: "Initiate a change request" };
    }
    return { disabled: true, className: "opacity-30 cursor-not-allowed", tooltip: "Not available" };
  };

  const crButtonProps = getCRButtonProps();

  return (
    <Card className="group hover:shadow-md transition-all hover:-translate-y-0.5">
      <div className={cn("h-1 rounded-t-lg", topColors[ticket.status] || topColors.IN_PROGRESS)} />
      <CardContent className="p-3">
        <div className="cursor-pointer" onClick={onClick}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground">{ticket.ticket_id}</span>
            <div className="flex items-center gap-1">
              {hasPendingCR && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400">
                  CR
                </Badge>
              )}
              {(ticket.status === "IN_PROGRESS") && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </div>
          </div>
          <h3 className="text-sm font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {ticket.workflow_name} - {ticket.ticket_id}
          </h3>
          <p className="text-xs text-muted-foreground truncate mb-2">{ticket.workflow_name}</p>
        </div>
        
        {/* CR Agent Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={crButtonProps.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!crButtonProps.disabled) {
                    onCRClick(ticket);
                  }
                }}
                className={cn(
                  "w-full h-6 text-[9px] font-medium mb-2",
                  crButtonProps.className
                )}
              >
                <FileEdit className="h-3 w-3 mr-1" />
                Change Request Agent
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {crButtonProps.tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <div className="flex items-center justify-between cursor-pointer" onClick={onClick}>
          <StatusBadge status={ticket.status} />
          {(() => {
            const { relative } = formatDateTime(parseUTCDate(ticket.updated_at));
            return (
              <div className="text-right">
                <div className="text-[10px] text-foreground/80">{format(parseUTCDate(ticket.updated_at), "MMM d")}</div>
                <div className="text-[9px] text-muted-foreground">{relative}</div>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading State
function LoadingSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i}>
            <div className="h-1 bg-muted rounded-t-lg" />
            <CardContent className="p-3 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
              <div className="flex justify-between pt-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  return (
    <Card>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-3 w-28 hidden lg:block" />
          <Skeleton className="h-6 w-24 hidden sm:block" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </Card>
  );
}

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFromStr, setDateFromStr] = useState("");
  const [dateToStr, setDateToStr] = useState("");
  // Temporary state for date picker (apply on button click)
  const [tempDateFrom, setTempDateFrom] = useState("");
  const [tempDateTo, setTempDateTo] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  
  // Change Request form state
  const [showCRForm, setShowCRForm] = useState(false);
  const [selectedTicketForCR, setSelectedTicketForCR] = useState<TicketType | null>(null);
  
  // Handle CR button click
  const handleCRClick = useCallback((ticket: TicketType) => {
    setSelectedTicketForCR(ticket);
    setShowCRForm(true);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== debouncedSearch) {
        setDebouncedSearch(searchInput);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch]);
  
  // Determine status filter based on active tab
  // Each tab maps to either a single status or comma-separated statuses
  const getStatusFilter = () => {
    switch (activeTab) {
      case "all":
        return { status: undefined, statuses: undefined, hasPendingCR: undefined };
      case "action":
        return { status: undefined, statuses: "WAITING_FOR_REQUESTER,WAITING_FOR_AGENT", hasPendingCR: undefined };
      case "pending_cr":
        return { status: undefined, statuses: undefined, hasPendingCR: true };
      case "IN_PROGRESS":
      case "COMPLETED":
      case "CANCELLED":
      case "REJECTED":
      case "SKIPPED":
        return { status: activeTab as TicketStatus, statuses: undefined, hasPendingCR: undefined };
      default:
        return { status: undefined, statuses: undefined, hasPendingCR: undefined };
    }
  };
  
  const { status: statusFilter, statuses: statusesFilter, hasPendingCR: pendingCRFilter } = getStatusFilter();
  
  // Handle date filter - convert to ISO format for API
  const dateFrom = dateFromStr || undefined;
  const dateTo = dateToStr || undefined;
  
  const { data, isLoading, error, refetch, isFetching } = useTickets({
    mine: true,
    status: statusFilter,
    statuses: statusesFilter,
    q: debouncedSearch || undefined,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
    page,
    pageSize: 20,
    hasPendingCR: pendingCRFilter,
  });

  // Dynamic KPI queries
  const { data: allData } = useTickets({ mine: true, pageSize: 1 });
  const { data: inProgressData } = useTickets({ mine: true, status: "IN_PROGRESS", pageSize: 1 });
  const { data: waitingRequesterData } = useTickets({ mine: true, status: "WAITING_FOR_REQUESTER", pageSize: 1 });
  const { data: waitingAgentData } = useTickets({ mine: true, status: "WAITING_FOR_AGENT", pageSize: 1 });
  const { data: completedData } = useTickets({ mine: true, status: "COMPLETED", pageSize: 1 });
  const { data: cancelledData } = useTickets({ mine: true, status: "CANCELLED", pageSize: 1 });
  const { data: rejectedData } = useTickets({ mine: true, status: "REJECTED", pageSize: 1 });
  const { data: skippedData } = useTickets({ mine: true, status: "SKIPPED", pageSize: 1 });
  const { data: pendingCRData } = useTickets({ mine: true, hasPendingCR: true, pageSize: 1 });
  
  const stats = useMemo(() => ({
    total: allData?.total || 0,
    inProgress: inProgressData?.total || 0,
    waiting: (waitingRequesterData?.total || 0) + (waitingAgentData?.total || 0),
    completed: completedData?.total || 0,
    cancelled: cancelledData?.total || 0,
    rejected: rejectedData?.total || 0,
    skipped: skippedData?.total || 0,
    pendingCR: pendingCRData?.total || 0,
  }), [allData?.total, inProgressData?.total, waitingRequesterData?.total, waitingAgentData?.total, completedData?.total, cancelledData?.total, rejectedData?.total, skippedData?.total, pendingCRData?.total]);

  const handleRowClick = (ticket: TicketType) => router.push(`/tickets/${ticket.ticket_id}`);
  const handleTabChange = useCallback((value: string) => { setActiveTab(value); setPage(1); }, []);
  const clearSearch = useCallback(() => { setSearchInput(""); setDebouncedSearch(""); setPage(1); }, []);
  const clearDateFilters = useCallback(() => { 
    setDateFromStr(""); 
    setDateToStr(""); 
    setTempDateFrom("");
    setTempDateTo("");
    setPage(1); 
  }, []);
  
  const applyDateFilters = useCallback(() => {
    setDateFromStr(tempDateFrom);
    setDateToStr(tempDateTo);
    setPage(1);
    setDatePopoverOpen(false);
  }, [tempDateFrom, tempDateTo]);
  
  // Sync temp state when popover opens
  const handleDatePopoverOpen = useCallback((open: boolean) => {
    if (open) {
      setTempDateFrom(dateFromStr);
      setTempDateTo(dateToStr);
    }
    setDatePopoverOpen(open);
  }, [dateFromStr, dateToStr]);
  const clearAllFilters = useCallback(() => {
    setSearchInput(""); setDebouncedSearch(""); setDateFromStr(""); setDateToStr("");
    setSortBy("updated_at"); setSortOrder("desc"); setActiveTab("all"); setPage(1);
  }, []);

  const totalPages = useMemo(() => Math.ceil((data?.total || 1) / 20), [data?.total]);
  const hasActiveFilters = searchInput || dateFromStr || dateToStr || sortBy !== "updated_at" || sortOrder !== "desc";
  const hasDateFilters = dateFromStr || dateToStr;

  return (
    <PageContainer>
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-sm">
            <Ticket className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">My Tickets</h1>
            <p className="text-xs text-muted-foreground">{stats.total} tickets</p>
          </div>
        </div>
        
        <Button asChild size="sm" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 gap-1.5 h-8 px-3">
          <Link href="/catalog">
            <Plus className="h-4 w-4" />
            New
          </Link>
        </Button>
      </div>

      {/* Tabs + Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Enhanced Status Tabs */}
        <div className="flex items-center gap-1 p-1.5 bg-muted/30 rounded-2xl border border-border/50 overflow-x-auto">
          <StatTab label="All" count={stats.total} isActive={activeTab === "all"} onClick={() => handleTabChange("all")} color="orange" icon={FileText} total={stats.total} />
          <StatTab label="Active" count={stats.inProgress} isActive={activeTab === "IN_PROGRESS"} onClick={() => handleTabChange("IN_PROGRESS")} color="blue" icon={Activity} total={stats.total} />
          <StatTab label="Action" count={stats.waiting} isActive={activeTab === "action"} onClick={() => handleTabChange("action")} color="amber" icon={AlertCircle} total={stats.total} />
          <StatTab label="CR Pending" count={stats.pendingCR} isActive={activeTab === "pending_cr"} onClick={() => handleTabChange("pending_cr")} color="purple" icon={FileEdit} total={stats.total} />
          <StatTab label="Done" count={stats.completed} isActive={activeTab === "COMPLETED"} onClick={() => handleTabChange("COMPLETED")} color="emerald" icon={CheckCircle2} total={stats.total} />
          <StatTab label="Cancelled" count={stats.cancelled} isActive={activeTab === "CANCELLED"} onClick={() => handleTabChange("CANCELLED")} color="slate" icon={XCircle} total={stats.total} />
          <StatTab label="Rejected" count={stats.rejected} isActive={activeTab === "REJECTED"} onClick={() => handleTabChange("REJECTED")} color="rose" icon={XCircle} total={stats.total} />
          <StatTab label="Skipped" count={stats.skipped} isActive={activeTab === "SKIPPED"} onClick={() => handleTabChange("SKIPPED")} color="purple" icon={FastForward} total={stats.total} />
        </div>
        
        <div className="flex-1" />
        
        {/* Search + Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 h-8 w-40 sm:w-52 text-sm"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          
          <Popover open={datePopoverOpen} onOpenChange={handleDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant={hasDateFilters ? "secondary" : "outline"} size="sm" className={cn("h-8 gap-1.5", hasDateFilters && "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-400")}>
                <CalendarDays className="h-4 w-4" />
                {hasDateFilters && (
                  <span className="text-xs font-medium">
                    {dateFromStr && dateToStr 
                      ? `${format(new Date(dateFromStr), "MMM d")} - ${format(new Date(dateToStr), "MMM d")}`
                      : dateFromStr 
                        ? `From ${format(new Date(dateFromStr), "MMM d")}`
                        : `To ${format(new Date(dateToStr), "MMM d")}`
                    }
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Filter by Date</h4>
                  {(tempDateFrom || tempDateTo) && (
                    <button 
                      onClick={() => { setTempDateFrom(""); setTempDateTo(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Reset
                    </button>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground">Filter tickets by last activity date</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">From Date</Label>
                    <Input 
                      type="date" 
                      value={tempDateFrom} 
                      onChange={(e) => setTempDateFrom(e.target.value)} 
                      className="h-9 text-sm"
                      max={tempDateTo || undefined}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">To Date</Label>
                    <Input 
                      type="date" 
                      value={tempDateTo} 
                      onChange={(e) => setTempDateTo(e.target.value)} 
                      className="h-9 text-sm"
                      min={tempDateFrom || undefined}
                    />
                  </div>
                </div>
                
                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => {
                      const today = new Date();
                      const weekAgo = new Date(today);
                      weekAgo.setDate(today.getDate() - 7);
                      setTempDateFrom(format(weekAgo, "yyyy-MM-dd"));
                      setTempDateTo(format(today, "yyyy-MM-dd"));
                    }}
                  >
                    Last 7 days
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => {
                      const today = new Date();
                      const monthAgo = new Date(today);
                      monthAgo.setDate(today.getDate() - 30);
                      setTempDateFrom(format(monthAgo, "yyyy-MM-dd"));
                      setTempDateTo(format(today, "yyyy-MM-dd"));
                    }}
                  >
                    Last 30 days
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                      setTempDateFrom(format(firstDay, "yyyy-MM-dd"));
                      setTempDateTo(format(today, "yyyy-MM-dd"));
                    }}
                  >
                    This month
                  </Button>
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 h-9"
                    onClick={() => {
                      clearDateFilters();
                      setDatePopoverOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1 h-9 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    onClick={applyDateFilters}
                    disabled={!tempDateFrom && !tempDateTo}
                  >
                    Apply Filter
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2.5">
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="end">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Sort by</Label>
                  <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updated_at">Updated</SelectItem>
                      <SelectItem value="created_at">Created</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Order</Label>
                  <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest</SelectItem>
                      <SelectItem value="asc">Oldest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <div className="flex border rounded-md">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}>
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message="Failed to load tickets" onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingSkeleton view={viewMode} />
      ) : data?.items.length === 0 ? (
        debouncedSearch || hasDateFilters || activeTab !== "all" ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No tickets found</p>
              <p className="text-xs text-muted-foreground mb-3">Try adjusting your filters</p>
              <Button variant="outline" size="sm" onClick={clearAllFilters}>Clear filters</Button>
            </CardContent>
          </Card>
        ) : (
          <NoTicketsEmpty onCreateTicket={() => router.push("/catalog")} />
        )
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {data?.items.map((ticket) => (
            <TicketCard 
              key={ticket.ticket_id} 
              ticket={ticket} 
              onClick={() => handleRowClick(ticket)}
              userEmail={user?.email}
              userAadId={user?.aad_id}
              onCRClick={handleCRClick}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          {data?.items.map((ticket) => (
            <TicketRow 
              key={ticket.ticket_id} 
              ticket={ticket} 
              onClick={() => handleRowClick(ticket)}
              userEmail={user?.email}
              userAadId={user?.aad_id}
              onCRClick={handleCRClick}
            />
          ))}
        </Card>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground text-xs">
            {((page - 1) * 20) + 1}-{Math.min(page * 20, data.total)} of {data.total}
          </span>
          
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Change Request Form Modal */}
      {showCRForm && selectedTicketForCR && (
        <ChangeRequestForm
          open={showCRForm}
          onOpenChange={(open) => {
            if (!open) {
              setShowCRForm(false);
              // Delay clearing the ticket to allow dialog animation to complete
              setTimeout(() => setSelectedTicketForCR(null), 100);
            }
          }}
          ticket={selectedTicketForCR}
          steps={[]} // Steps will be fetched by the form
          workflowSteps={[]}
          attachments={[]}
          onSuccess={() => {
            setShowCRForm(false);
            setTimeout(() => setSelectedTicketForCR(null), 100);
            refetch();
            toast.success("Change request submitted successfully!");
          }}
        />
      )}
    </PageContainer>
  );
}
