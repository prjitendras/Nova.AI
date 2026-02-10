/**
 * Admin Dashboard Page
 * Premium design with comprehensive stats and quick actions
 */
"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  useAdminDashboard,
  useSystemHealth,
  useNotificationDashboard,
} from "@/hooks/use-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Users,
  Crown,
  Palette,
  Activity,
  Bell,
  Mail,
  FileText,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  trend,
  href,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
  trend?: string;
  href?: string;
}) {
  const content = (
    <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-200 border shadow-sm bg-card">
      <div className={`absolute inset-0 ${gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-xl font-bold mt-0.5 tracking-tight">{value}</p>
            {trend && (
              <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1">
                <TrendingUp className="h-2.5 w-2.5" />
                {trend}
              </p>
            )}
          </div>
          <div className={`h-8 w-8 rounded-lg ${gradient} flex items-center justify-center`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
        {href && (
          <div className="mt-2 flex items-center text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            View details
            <ChevronRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function HealthIndicator({ status, label }: { status: string; label: string }) {
  const colors = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    unhealthy: "bg-red-500",
  };

  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`h-1.5 w-1.5 rounded-full ${colors[status as keyof typeof colors] || colors.unhealthy}`} />
        <span className="text-xs font-medium capitalize">{status}</span>
      </div>
    </div>
  );
}

function ActivityItem({
  action,
  actor,
  target,
  timestamp,
}: {
  action: string;
  actor: string;
  target?: string;
  timestamp: string;
}) {
  const actionLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    GRANT_DESIGNER_ACCESS: { label: "Granted Designer", color: "bg-emerald-500", icon: CheckCircle },
    REVOKE_DESIGNER_ACCESS: { label: "Revoked Designer", color: "bg-red-500", icon: AlertTriangle },
    GRANT_ADMIN_ACCESS: { label: "Granted Admin", color: "bg-blue-500", icon: Shield },
    REVOKE_ADMIN_ACCESS: { label: "Revoked Admin", color: "bg-amber-500", icon: Shield },
    UPDATE_SYSTEM_CONFIG: { label: "Updated Config", color: "bg-purple-500", icon: Activity },
    UPDATE_EMAIL_TEMPLATE: { label: "Updated Template", color: "bg-cyan-500", icon: Mail },
    SUPER_ADMIN_CREATED: { label: "Super Admin Setup", color: "bg-gradient-to-r from-amber-500 to-orange-600", icon: Crown },
  };

  const info = actionLabels[action] || { label: action, color: "bg-slate-500", icon: Activity };
  const Icon = info.icon;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0">
      <div className={`h-5 w-5 rounded ${info.color} flex items-center justify-center shrink-0`}>
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate">
          {info.label}
          {target && <span className="text-muted-foreground"> → {target}</span>}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {actor} • {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data: dashboard, isLoading: dashboardLoading } = useAdminDashboard();
  const { data: health, isLoading: healthLoading } = useSystemHealth();
  const { data: dashboardStats } = useNotificationDashboard();
  
  // Extract notification stats from dashboard
  const notificationStats = dashboardStats ? {
    sent: dashboardStats.status_counts?.sent || 0,
    pending: dashboardStats.status_counts?.pending || 0,
    failed: dashboardStats.status_counts?.failed || 0,
  } : null;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            System overview and quick actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/health">
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              Health
            </Link>
          </Button>
          <Button size="sm" asChild className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
            <Link href="/admin/access-control">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Users
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {dashboardLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <Skeleton className="h-3 w-20 mb-1" />
                  <Skeleton className="h-6 w-12" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Admins"
              value={dashboard?.users.total || 0}
              icon={Users}
              gradient="bg-gradient-to-br from-blue-500 to-cyan-600"
              href="/admin/admins"
            />
            <StatCard
              title="Super Admins"
              value={dashboard?.users.super_admins || 0}
              icon={Crown}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
            />
            <StatCard
              title="Admins"
              value={dashboard?.users.admins || 0}
              icon={Shield}
              gradient="bg-gradient-to-br from-purple-500 to-pink-600"
            />
            <StatCard
              title="Designers"
              value={dashboard?.users.designers || 0}
              icon={Palette}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              href="/admin/designers"
            />
          </>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* System Health */}
        <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Activity className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm">System Health</CardTitle>
                  <CardDescription className="text-[10px]">Real-time status</CardDescription>
                </div>
              </div>
              <Badge
                variant={health?.status === "healthy" ? "default" : "destructive"}
                className={cn("text-[10px] h-5", health?.status === "healthy" ? "bg-emerald-500" : "")}
              >
                {health?.status || "..."}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {healthLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div>
                <HealthIndicator status={health?.mongo?.status || "unknown"} label="Database" />
                <HealthIndicator status={health?.scheduler?.status || "unknown"} label="Scheduler" />
                <HealthIndicator status={health?.email?.status || "unknown"} label="Email" />
                <HealthIndicator status={health?.status || "unknown"} label="API" />
              </div>
            )}
            <Link
              href="/admin/health"
              className="flex items-center justify-center gap-1.5 mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View details
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        {/* Notification Stats */}
        <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Bell className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Notifications</CardTitle>
                <CardDescription className="text-[10px]">Email delivery</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{notificationStats?.sent || 0}</p>
                <p className="text-[10px] text-muted-foreground">Sent</p>
              </div>
              <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{notificationStats?.pending || 0}</p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
              <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{notificationStats?.failed || 0}</p>
                <p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
            </div>
            <Link
              href="/admin/notifications"
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 rounded-md text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors mt-2"
            >
              <Mail className="h-3 w-3" />
              View All
            </Link>
            {(notificationStats?.failed || 0) > 0 && (
              <Link
                href="/admin/notifications?status=FAILED"
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 rounded-md text-xs font-medium hover:bg-red-100 dark:hover:bg-red-950 transition-colors mt-1.5"
              >
                <AlertTriangle className="h-3 w-3" />
                View {notificationStats?.failed} failed
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Recent Activity</CardTitle>
                <CardDescription className="text-[10px]">Latest admin actions</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link href="/admin/audit-log">
                View All
                <ArrowUpRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {dashboardLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-36 mb-1" />
                    <Skeleton className="h-2 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : dashboard?.recent_activity && dashboard.recent_activity.length > 0 ? (
            <div>
              {dashboard.recent_activity.slice(0, 5).map((event) => (
                <ActivityItem
                  key={event.audit_id}
                  action={event.action}
                  actor={event.actor_display_name || event.actor_email}
                  target={event.target_display_name || event.target_email || undefined}
                  timestamp={event.timestamp}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-2 grid-cols-3">
        <Link href="/admin/access-control">
          <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white dark:bg-slate-900">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Users</p>
                <p className="text-[10px] text-muted-foreground truncate">Manage access</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/email-templates">
          <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white dark:bg-slate-900">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Templates</p>
                <p className="text-[10px] text-muted-foreground truncate">Email configs</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/audit-log">
          <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white dark:bg-slate-900">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Audit Log</p>
                <p className="text-[10px] text-muted-foreground truncate">View activity</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
