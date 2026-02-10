/**
 * Admin Notification Center - List view with navigation to details
 */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import {
  useNotificationDashboard,
  useNotificationsList,
  useRetryNotification,
  useBulkRetryNotifications,
  useCancelNotification,
} from "@/hooks/use-admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  RotateCcw,
  Ban,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Inbox,
  TrendingUp,
  Ticket,
  ExternalLink,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Status configuration
const statusConfig: Record<string, { 
  color: string; 
  bgColor: string; 
  borderColor: string;
  icon: React.ElementType;
  label: string;
}> = {
  PENDING: { color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/50", borderColor: "border-amber-200 dark:border-amber-800", icon: Clock, label: "Pending" },
  SENT: { color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/50", borderColor: "border-emerald-200 dark:border-emerald-800", icon: CheckCircle, label: "Sent" },
  FAILED: { color: "text-red-700 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/50", borderColor: "border-red-200 dark:border-red-800", icon: XCircle, label: "Failed" },
  CANCELLED: { color: "text-slate-600 dark:text-slate-400", bgColor: "bg-slate-100 dark:bg-slate-700", borderColor: "border-slate-200 dark:border-slate-600", icon: Ban, label: "Cancelled" },
};

const templateDisplayNames: Record<string, string> = {
  TICKET_CREATED: "Ticket Created",
  APPROVAL_PENDING: "Approval Request",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  TASK_ASSIGNED: "Task Assigned",
  TASK_COMPLETED: "Task Completed",
  INFO_REQUESTED: "Info Requested",
};

// Stat Card
function StatCard({ title, value, icon: Icon, gradient, trend, subtitle, onClick, isActive }: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
  trend?: number;
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Card 
      className={cn(
        "relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all cursor-pointer",
        isActive && "ring-2 ring-blue-500"
      )}
      onClick={onClick}
    >
      <div className={`absolute inset-0 ${gradient} opacity-5`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-white">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend !== undefined && trend > 0 && (
              <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3" />+{trend} today
              </p>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl ${gradient} flex items-center justify-center`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Notification Row
function NotificationRow({ notification, isSelected, onSelect, onRetry, onCancel, isRetrying }: {
  notification: {
    notification_id: string;
    ticket_id: string | null;
    template_key: string;
    template_name: string;
    recipients: string[];
    status: string;
    retry_count: number;
    last_error: string | null;
    created_at: string | null;
    sent_at: string | null;
    locked_by: string | null;
    preview: { 
      ticket_title: string; 
      requester_name: string; 
      step_name: string;
      workflow_name: string;
      workflow_id: string;
    };
  };
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onRetry: () => void;
  onCancel: () => void;
  isRetrying: boolean;
}) {
  const router = useRouter();
  const config = statusConfig[notification.status] || statusConfig.PENDING;
  const StatusIcon = config.icon;
  const templateName = templateDisplayNames[notification.template_key] || notification.template_name;

  return (
    <div 
      className={cn(
        "group flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg hover:shadow-md transition-all cursor-pointer",
        isSelected && "ring-2 ring-blue-500 bg-blue-50/30 dark:bg-blue-950/30"
      )}
      onClick={() => router.push(`/admin/notifications/${notification.notification_id}`)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </div>

      <Badge variant="outline" className={cn("flex items-center gap-1.5 px-2 py-1", config.bgColor, config.color, config.borderColor)}>
        <StatusIcon className="h-3 w-3" />
        {config.label}
      </Badge>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{templateName}</span>
          {notification.locked_by && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded text-xs">
              <Lock className="h-3 w-3" />
              Processing
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
          {notification.preview.ticket_title && (
            <span className="flex items-center gap-1 truncate max-w-[160px] text-slate-600 dark:text-slate-400" title={notification.preview.ticket_title}>
              <FileText className="h-3 w-3 flex-shrink-0" />
              {notification.preview.ticket_title}
            </span>
          )}
          {notification.ticket_id && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-mono text-xs">
              <Ticket className="h-3 w-3 flex-shrink-0" />
              {notification.ticket_id}
            </span>
          )}
          {notification.preview.workflow_name && (
            <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-xs">
              • {notification.preview.workflow_name}
            </span>
          )}
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 w-48">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {notification.recipients[0]?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate text-slate-700 dark:text-slate-300">{notification.recipients[0]?.split("@")[0]}</p>
                {notification.recipients.length > 1 && (
                  <p className="text-xs text-muted-foreground">+{notification.recipients.length - 1} more</p>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {notification.recipients.map((r, i) => <p key={i}>{r}</p>)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="w-32 text-right">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {notification.sent_at 
            ? format(new Date(notification.sent_at), "MMM d, h:mm a")
            : notification.created_at 
              ? format(new Date(notification.created_at), "MMM d, h:mm a")
              : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {notification.created_at && formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>

      <div className="w-12 text-center">
        {notification.retry_count > 0 ? (
          <Badge variant="secondary" className="font-mono">{notification.retry_count}x</Badge>
        ) : <span className="text-muted-foreground">—</span>}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/admin/notifications/${notification.notification_id}`)}>
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View Details</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {notification.status === "FAILED" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={onRetry} disabled={isRetrying}>
                  {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {notification.status === "PENDING" && !notification.locked_by && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={onCancel}>
                  <Ban className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {notification.ticket_id && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href={`/tickets/${notification.ticket_id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Ticket</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

// Main Page
export default function NotificationsDashboardPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useNotificationDashboard();
  const { data: notifications, isLoading: listLoading, refetch: refetchList } = useNotificationsList({
    status: statusFilter !== "all" ? statusFilter : undefined,
    recipient: searchQuery || undefined,
    page,
    page_size: pageSize,
  });

  const retryMutation = useRetryNotification();
  const bulkRetryMutation = useBulkRetryNotifications();
  const cancelMutation = useCancelNotification();

  const handleRefresh = () => {
    refetchStats();
    refetchList();
    toast.success("Refreshed!");
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(notifications?.items.map((n) => n.notification_id) || []) : new Set());
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    checked ? newSet.add(id) : newSet.delete(id);
    setSelectedIds(newSet);
  };

  const handleBulkRetry = () => {
    const failedIds = Array.from(selectedIds).filter((id) =>
      notifications?.items.find((n) => n.notification_id === id && n.status === "FAILED")
    );
    if (failedIds.length > 0) {
      bulkRetryMutation.mutate(failedIds, { onSuccess: () => setSelectedIds(new Set()) });
    } else {
      toast.error("No failed notifications selected");
    }
  };

  const handleCancel = () => {
    if (cancelConfirmId) {
      cancelMutation.mutate(cancelConfirmId, { onSuccess: () => setCancelConfirmId(null) });
    }
  };

  const failedCount = useMemo(() => {
    return notifications?.items.filter(n => selectedIds.has(n.notification_id) && n.status === "FAILED").length || 0;
  }, [notifications?.items, selectedIds]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-900 dark:text-white">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Mail className="h-5 w-5 text-white" />
            </div>
            Notification Center
          </h1>
          <p className="text-muted-foreground mt-1">Track and manage all email notifications</p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {statsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Sent" value={stats?.status_counts.sent || 0} icon={Send} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" trend={stats?.last_24_hours.sent} subtitle={`${stats?.success_rate || 0}% success`} onClick={() => setStatusFilter("SENT")} isActive={statusFilter === "SENT"} />
            <StatCard title="Pending" value={stats?.status_counts.pending || 0} icon={Clock} gradient="bg-gradient-to-br from-amber-500 to-orange-600" subtitle={stats?.currently_locked ? `${stats.currently_locked} processing` : undefined} onClick={() => setStatusFilter("PENDING")} isActive={statusFilter === "PENDING"} />
            <StatCard title="Failed" value={stats?.status_counts.failed || 0} icon={AlertTriangle} gradient="bg-gradient-to-br from-red-500 to-rose-600" onClick={() => setStatusFilter("FAILED")} isActive={statusFilter === "FAILED"} />
            <StatCard title="Total" value={stats?.status_counts.total || 0} icon={Inbox} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" trend={stats?.last_24_hours.total} onClick={() => setStatusFilter("all")} isActive={statusFilter === "all"} />
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                <Filter className="h-4 w-4 text-slate-500" />
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-32 border-0 bg-transparent h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="SENT">Sent</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search recipient..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} className="pl-9 w-64" />
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/50 px-4 py-2 rounded-lg border border-blue-100 dark:border-blue-800">
                <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
                {failedCount > 0 && (
                  <Button size="sm" onClick={handleBulkRetry} disabled={bulkRetryMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                    {bulkRetryMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    Retry {failedCount}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {listLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : notifications?.items.length === 0 ? (
            <div className="py-16 text-center">
              <Inbox className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No notifications</h3>
              <p className="text-muted-foreground mt-1">
                {statusFilter !== "all" || searchQuery ? "Try adjusting filters" : "Notifications will appear here"}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-4">
                <Checkbox checked={notifications?.items.length === selectedIds.size && selectedIds.size > 0} onCheckedChange={handleSelectAll} />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                </span>
              </div>

              <div className="p-3 space-y-2">
                {notifications?.items.map((notification) => (
                  <NotificationRow
                    key={notification.notification_id}
                    notification={notification}
                    isSelected={selectedIds.has(notification.notification_id)}
                    onSelect={(checked) => handleSelect(notification.notification_id, checked)}
                    onRetry={() => retryMutation.mutate(notification.notification_id)}
                    onCancel={() => setCancelConfirmId(notification.notification_id)}
                    isRetrying={retryMutation.isPending && retryMutation.variables === notification.notification_id}
                  />
                ))}
              </div>

              {notifications && notifications.total_pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {notifications.total_pages} ({notifications.total} total)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= notifications.total_pages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Common Errors */}
      {stats?.common_errors && stats.common_errors.length > 0 && (
        <Card className="border-l-4 border-l-red-500 bg-white dark:bg-slate-900">
          <CardHeader className="py-3">
            <h3 className="font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Common Errors
            </h3>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {stats.common_errors.slice(0, 3).map((error, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-50/50 dark:bg-red-950/30 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-300 font-mono truncate flex-1">{error.error}</p>
                  <Badge variant="secondary">{error.count}x</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Notification?</AlertDialogTitle>
            <AlertDialogDescription>This will prevent the notification from being sent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-red-600 hover:bg-red-700">
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Notification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
