/**
 * Notification Detail Page - Full page view for notification details
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { useNotificationDetail, useRetryNotification, useCancelNotification } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  User,
  Calendar,
  Ticket,
  Ban,
  Loader2,
  AlertCircle,
  RotateCcw,
  Workflow,
  Info,
} from "lucide-react";
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
  PENDING: { 
    color: "text-amber-700 dark:text-amber-400", 
    bgColor: "bg-amber-50 dark:bg-amber-950/50", 
    borderColor: "border-amber-200 dark:border-amber-800",
    icon: Clock,
    label: "Pending"
  },
  SENT: { 
    color: "text-emerald-700 dark:text-emerald-400", 
    bgColor: "bg-emerald-50 dark:bg-emerald-950/50", 
    borderColor: "border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle,
    label: "Sent"
  },
  FAILED: { 
    color: "text-red-700 dark:text-red-400", 
    bgColor: "bg-red-50 dark:bg-red-950/50", 
    borderColor: "border-red-200 dark:border-red-800",
    icon: XCircle,
    label: "Failed"
  },
  CANCELLED: { 
    color: "text-slate-600 dark:text-slate-400", 
    bgColor: "bg-slate-100 dark:bg-slate-700", 
    borderColor: "border-slate-200 dark:border-slate-700",
    icon: Ban,
    label: "Cancelled"
  },
};

// Template display names
const templateDisplayNames: Record<string, string> = {
  TICKET_CREATED: "Ticket Created",
  APPROVAL_PENDING: "Approval Request",
  APPROVAL_REASSIGNED: "Approval Reassigned",
  APPROVED: "Request Approved",
  REJECTED: "Request Rejected",
  SKIPPED: "Request Skipped",
  INFO_REQUESTED: "Info Requested",
  INFO_RESPONDED: "Info Response",
  FORM_PENDING: "Form Pending",
  TASK_ASSIGNED: "Task Assigned",
  TASK_REASSIGNED: "Task Reassigned",
  TASK_COMPLETED: "Task Completed",
  SLA_REMINDER: "SLA Reminder",
  SLA_ESCALATION: "SLA Escalation",
  TICKET_CANCELLED: "Ticket Cancelled",
  TICKET_COMPLETED: "Ticket Completed",
};

export default function NotificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const notificationId = params.id as string;
  
  const { data: notification, isLoading, error } = useNotificationDetail(notificationId);
  const retryMutation = useRetryNotification();
  const cancelMutation = useCancelNotification();
  
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");

  const config = notification?.status ? statusConfig[notification.status] : statusConfig.PENDING;
  const StatusIcon = config?.icon || Clock;
  const templateName = notification?.template_key 
    ? templateDisplayNames[notification.template_key] || notification.template_name 
    : "Notification";

  const handleCopyId = () => {
    navigator.clipboard.writeText(notificationId);
    setCopied(true);
    toast.success("ID copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = () => {
    retryMutation.mutate(notificationId, {
      onSuccess: () => toast.success("Notification queued for retry")
    });
  };

  const handleCancel = () => {
    cancelMutation.mutate(notificationId, {
      onSuccess: () => toast.success("Notification cancelled")
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Notification Not Found</h2>
        <p className="text-muted-foreground mb-6">The notification you're looking for doesn't exist or has been deleted.</p>
        <Button onClick={() => router.push("/admin/notifications")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Notifications
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push("/admin/notifications")}
            className="mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center",
            config.bgColor
          )}>
            <StatusIcon className={cn("h-7 w-7", config.color)} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{templateName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <code className="text-sm bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">
                {notificationId}
              </code>
              <button onClick={handleCopyId} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-400" />}
              </button>
              <Badge 
                variant="outline" 
                className={cn("font-medium", config.bgColor, config.color, config.borderColor)}
              >
                {config.label}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {notification.status === "FAILED" && (
            <Button onClick={handleRetry} disabled={retryMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {retryMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Retry Now
            </Button>
          )}
          {notification.status === "PENDING" && (
            <Button variant="destructive" onClick={handleCancel} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Calendar className="h-4 w-4" />
              Created
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {notification.created_at ? format(new Date(notification.created_at), "MMM d, yyyy") : "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              {notification.created_at ? format(new Date(notification.created_at), "h:mm a") : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Send className="h-4 w-4" />
              Sent
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {notification.sent_at ? format(new Date(notification.sent_at), "MMM d, yyyy") : "Not sent"}
            </p>
            <p className="text-sm text-muted-foreground">
              {notification.sent_at ? format(new Date(notification.sent_at), "h:mm a") : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <RefreshCw className="h-4 w-4" />
              Retry Count
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{notification.retry_count || 0}</p>
            <p className="text-sm text-muted-foreground">attempts</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Age
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {notification.created_at 
                ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: false })
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">old</p>
          </CardContent>
        </Card>
      </div>

        {/* Error Alert */}
      {notification.last_error && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800 dark:text-red-300">Last Error</h4>
                <p className="text-sm text-red-700 dark:text-red-400 font-mono mt-1">{notification.last_error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Recipients */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
              <User className="h-4 w-4 text-blue-500" />
              Recipients
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {notification.recipients.map((recipient, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {recipient.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate">{recipient}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ticket Info */}
        {notification.ticket_id && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                <Ticket className="h-4 w-4 text-purple-500" />
                Ticket Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-100 dark:border-purple-800">
                  <div>
                    <p className="text-xs text-muted-foreground">Ticket ID</p>
                    <p className="font-mono text-sm text-purple-700 dark:text-purple-400 font-semibold">{notification.ticket_id}</p>
                  </div>
                  <Link 
                    href={`/tickets/${notification.ticket_id}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                {notification.payload && (
                  <div className="space-y-2 text-sm">
                    {Boolean((notification.payload as Record<string, unknown>).ticket_title) && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <p className="text-xs text-muted-foreground">Title</p>
                        <p className="font-medium">{String((notification.payload as Record<string, unknown>).ticket_title)}</p>
                      </div>
                    )}
                    {Boolean((notification.payload as Record<string, unknown>).requester_name) && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <p className="text-xs text-muted-foreground">Requester</p>
                        <p className="font-medium">{String((notification.payload as Record<string, unknown>).requester_name)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workflow Info */}
        {notification.payload && (Boolean((notification.payload as Record<string, unknown>).workflow_id) || Boolean((notification.payload as Record<string, unknown>).workflow_name)) && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                <Workflow className="h-4 w-4 text-indigo-500" />
                Workflow Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {Boolean((notification.payload as Record<string, unknown>).workflow_id) && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <p className="text-xs text-muted-foreground">Workflow ID</p>
                    <p className="font-mono text-sm text-indigo-700 dark:text-indigo-400 font-semibold">
                      {String((notification.payload as Record<string, unknown>).workflow_id)}
                    </p>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).workflow_name) && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <p className="text-xs text-muted-foreground">Workflow Name</p>
                    <p className="font-medium text-indigo-700 dark:text-indigo-400">{String((notification.payload as Record<string, unknown>).workflow_name)}</p>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).step_name) && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <p className="text-xs text-muted-foreground">Current Step</p>
                    <p className="font-medium">{String((notification.payload as Record<string, unknown>).step_name)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Context */}
        {notification.payload && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                <Info className="h-4 w-4 text-slate-500" />
                Additional Context
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 text-sm">
                {Boolean((notification.payload as Record<string, unknown>).approver_name) && (
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <span className="text-muted-foreground">Approver</span>
                    <span className="font-medium">{String((notification.payload as Record<string, unknown>).approver_name)}</span>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).assigned_to_name) && (
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium">{String((notification.payload as Record<string, unknown>).assigned_to_name)}</span>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).assigned_by_name) && (
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <span className="text-muted-foreground">Assigned By</span>
                    <span className="font-medium">{String((notification.payload as Record<string, unknown>).assigned_by_name)}</span>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).reason) && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded border border-amber-100 dark:border-amber-800">
                    <p className="text-xs text-muted-foreground mb-1">Reason</p>
                    <p className="font-medium text-amber-800 dark:text-amber-400">{String((notification.payload as Record<string, unknown>).reason)}</p>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).question) && (
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded border border-blue-100 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Question</p>
                    <p className="font-medium text-blue-800 dark:text-blue-400">{String((notification.payload as Record<string, unknown>).question)}</p>
                  </div>
                )}
                {Boolean((notification.payload as Record<string, unknown>).due_date) && (
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium">{String((notification.payload as Record<string, unknown>).due_date)}</span>
                  </div>
                )}
                {!(notification.payload as Record<string, unknown>).approver_name && 
                 !(notification.payload as Record<string, unknown>).assigned_to_name &&
                 !(notification.payload as Record<string, unknown>).reason &&
                 !(notification.payload as Record<string, unknown>).question && (
                  <p className="text-muted-foreground text-center py-4">No additional context</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Email Content */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-100 dark:bg-slate-800">
              <TabsTrigger value="preview">
                <Mail className="h-4 w-4 mr-2" />
                Email Preview
              </TabsTrigger>
              <TabsTrigger value="payload">Raw Payload</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="preview" className="m-0">
              {notification.email_content ? (
                <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Email Subject */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                    <p className="text-xs text-muted-foreground mb-1">Subject</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{notification.email_content.subject}</p>
                  </div>
                  
                  {/* Email Body */}
                  <ScrollArea className="h-[400px]">
                    <div className="p-6 bg-white dark:bg-slate-900">
                      <div 
                        className="prose prose-sm max-w-none dark:prose-invert [&_img]:max-w-full [&_img]:h-auto"
                        dangerouslySetInnerHTML={{ __html: notification.email_content.body }}
                      />
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground border dark:border-slate-700 rounded-lg">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Email content not available</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="payload" className="m-0">
              <ScrollArea className="h-[400px] border dark:border-slate-700 rounded-lg">
                <pre className="p-4 text-sm font-mono bg-slate-900 text-slate-100 min-h-full">
                  {JSON.stringify(notification.payload, null, 2)}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
