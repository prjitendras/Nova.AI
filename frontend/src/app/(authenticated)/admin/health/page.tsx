/**
 * System Health Page
 * Real-time monitoring of system components
 */
"use client";

import { formatDistanceToNow } from "date-fns";
import {
  useSystemHealth,
  useNotificationDashboard,
  useFailedNotifications,
  useRetryNotification,
} from "@/hooks/use-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Database,
  Bell,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
  Server,
  Loader2,
  Zap,
} from "lucide-react";

function StatusIndicator({ status }: { status: string }) {
  const colors = {
    healthy: { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700" },
    degraded: { bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-700" },
    unhealthy: { bg: "bg-red-500", text: "text-red-600 dark:text-red-400", border: "border-red-200 dark:border-red-700" },
  };

  const config = colors[status as keyof typeof colors] || colors.unhealthy;
  const Icon = status === "healthy" ? CheckCircle : status === "degraded" ? AlertTriangle : XCircle;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.border} ${config.text} bg-white dark:bg-slate-800`}>
      <div className={`h-2 w-2 rounded-full ${config.bg} animate-pulse`} />
      <span className="text-sm font-medium capitalize">{status}</span>
    </div>
  );
}

function HealthCard({
  title,
  status,
  icon: Icon,
  details,
  gradient,
}: {
  title: string;
  status: string;
  icon: React.ElementType;
  details?: Record<string, string | boolean | null>;
  gradient: string;
}) {
  return (
    <Card className="border-0 shadow-md overflow-hidden bg-white dark:bg-slate-900">
      <div className={`h-1 ${gradient}`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-xl ${gradient} flex items-center justify-center`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <StatusIndicator status={status} />
            </div>
          </div>
        </div>
        {details && (
          <div className="space-y-2 mt-4 pt-4 border-t">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="font-medium">
                  {value === null ? "N/A" : value === true ? "Yes" : value === false ? "No" : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemHealthPage() {
  const { data: health, isLoading: healthLoading, refetch } = useSystemHealth();
  const { data: dashboardStats, isLoading: statsLoading } = useNotificationDashboard();
  const { data: failedNotifications, isLoading: failedLoading } = useFailedNotifications(1, 10);
  
  // Extract notification stats from dashboard
  const notificationStats = dashboardStats ? {
    total: dashboardStats.status_counts?.total || 0,
    sent: dashboardStats.status_counts?.sent || 0,
    pending: dashboardStats.status_counts?.pending || 0,
    failed: dashboardStats.status_counts?.failed || 0,
  } : null;
  const retryMutation = useRetryNotification();

  const overallStatus = health?.status || "unknown";

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">System Health</h1>
          <p className="text-muted-foreground mt-1">
            Real-time status of all system components
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Status Banner */}
      <Card className={`border-0 shadow-md overflow-hidden ${
        overallStatus === "healthy" 
          ? "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950" 
          : overallStatus === "degraded"
          ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950"
          : "bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950 dark:to-pink-950"
      }`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${
              overallStatus === "healthy"
                ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                : overallStatus === "degraded"
                ? "bg-gradient-to-br from-amber-500 to-orange-600"
                : "bg-gradient-to-br from-red-500 to-pink-600"
            }`}>
              {healthLoading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : overallStatus === "healthy" ? (
                <Zap className="h-8 w-8 text-white" />
              ) : overallStatus === "degraded" ? (
                <AlertTriangle className="h-8 w-8 text-white" />
              ) : (
                <XCircle className="h-8 w-8 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold capitalize text-slate-900 dark:text-white">
                {healthLoading ? "Checking..." : `System ${overallStatus}`}
              </h2>
              <p className={`text-sm ${
                overallStatus === "healthy"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : overallStatus === "degraded"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-red-700 dark:text-red-300"
              }`}>
                {overallStatus === "healthy"
                  ? "All systems are operational"
                  : overallStatus === "degraded"
                  ? "Some components are experiencing issues"
                  : "Critical issues detected"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {healthLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="border-0 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <HealthCard
              title="API Server"
              status={health?.status || "unknown"}
              icon={Server}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
              details={{ 
                version: "1.0.0",
                uptime: "99.9%"
              }}
            />
            <HealthCard
              title="Database"
              status={health?.mongo?.status || "unknown"}
              icon={Database}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              details={{ 
                type: "MongoDB",
                database: health?.mongo?.database || "ai_ops_workflow"
              }}
            />
            <HealthCard
              title="Scheduler"
              status={health?.scheduler?.status || "unknown"}
              icon={Clock}
              gradient="bg-gradient-to-br from-purple-500 to-pink-600"
              details={{ 
                running: health?.scheduler?.running ?? false,
                interval: "60s"
              }}
            />
            <HealthCard
              title="Email Service"
              status={health?.email?.status || "unknown"}
              icon={Mail}
              gradient="bg-gradient-to-br from-cyan-500 to-blue-600"
              details={{ 
                provider: "Microsoft Graph",
                last_send: health?.email?.last_send || "N/A"
              }}
            />
          </>
        )}
      </div>

      {/* Notification Stats */}
      <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Email Notifications</CardTitle>
                <CardDescription>Delivery statistics and status</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{notificationStats?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-6 bg-emerald-50 dark:bg-emerald-950 rounded-xl">
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{notificationStats?.sent || 0}</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">Sent</p>
              </div>
              <div className="text-center p-6 bg-amber-50 dark:bg-amber-950 rounded-xl">
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{notificationStats?.pending || 0}</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">Pending</p>
              </div>
              <div className="text-center p-6 bg-red-50 dark:bg-red-950 rounded-xl">
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{notificationStats?.failed || 0}</p>
                <p className="text-sm text-red-700 dark:text-red-300">Failed</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed Notifications */}
      {(failedNotifications?.items?.length || 0) > 0 && (
        <Card className="border-0 shadow-md border-l-4 border-l-red-500 bg-white dark:bg-slate-900">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-red-900 dark:text-red-300">Failed Notifications</CardTitle>
                <CardDescription>These notifications failed to send</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {failedNotifications?.items?.map((notification) => (
                <div
                  key={notification.notification_id}
                  className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-red-900 dark:text-red-300">
                        {notification.template_key.replace(/_/g, " ")}
                      </p>
                      <Badge variant="outline" className="text-red-700 dark:text-red-400 border-red-300 dark:border-red-700">
                        {notification.retry_count} retries
                      </Badge>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-400 truncate">
                      To: {notification.recipients.join(", ")}
                    </p>
                    {notification.last_error && (
                      <p className="text-xs text-red-600 dark:text-red-500 mt-1 truncate">
                        Error: {notification.last_error}
                      </p>
                    )}
                    <p className="text-xs text-red-500 dark:text-red-600 mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950"
                    onClick={() => retryMutation.mutate(notification.notification_id)}
                    disabled={retryMutation.isPending}
                  >
                    {retryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Info */}
      <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="text-lg">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Application</span>
                <span className="font-medium">AI OPS Workflow</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">1.0.0</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Environment</span>
                <Badge variant="outline">Development</Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Backend</span>
                <span className="font-medium">FastAPI + Python</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Frontend</span>
                <span className="font-medium">Next.js + React</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Database</span>
                <span className="font-medium">MongoDB</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
