/**
 * Agent Dashboard - Enhanced Version
 * Modern UI with comprehensive history, detailed metrics, and performance tracking
 */
"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  useAgentDashboard, 
  useAgentInfoRequests, 
  useAgentPendingHandovers,
  useAssignedTasks 
} from "@/hooks/use-tickets";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { ErrorState } from "@/components/error-state";
import { PageLoading } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  ListTodo,
  Ticket,
  PauseCircle,
  ArrowRightLeft,
  TrendingUp,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  HelpCircle,
  Play,
  History,
  Timer,
  Inbox,
  Search,
  Filter,
  Calendar,
  User,
  Target,
  Activity,
  Zap,
  ArrowRight,
  Download,
  CalendarDays,
  Gauge,
  Flame,
  Award,
  SortAsc,
  SortDesc,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck,
  TrendingDown,
} from "lucide-react";
import { formatDistanceToNow, format, subDays, startOfDay, differenceInHours, isAfter } from "date-fns";
import { parseUTCDate, cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const { data: dashboard, isLoading, error, refetch } = useAgentDashboard(user?.email || "");
  const { data: infoRequests } = useAgentInfoRequests(user?.email || "");
  const { data: handovers } = useAgentPendingHandovers(user?.email || "");
  const { data: tasks } = useAssignedTasks(user?.email || "", user?.aad_id || "");

  // History state
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyFilter, setHistoryFilter] = React.useState("all");
  const [historyPage, setHistoryPage] = React.useState(1);
  const [historySortBy, setHistorySortBy] = React.useState("completed_at");
  const [historySortOrder, setHistorySortOrder] = React.useState<"asc" | "desc">("desc");
  const [datePeriod, setDatePeriod] = React.useState("all");

  // Fetch agent history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["agent-history", user?.email, historyFilter, historyPage],
    queryFn: async () => {
      const params: any = { page: historyPage, page_size: 20 };
      if (historyFilter !== "all") {
        params.date_filter = historyFilter;
      }
      const response = await apiClient.get<any>("/tickets/agent/history", params);
      return response;
    },
    enabled: !!user?.email,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState message="Failed to load dashboard" onRetry={() => refetch()} />
      </PageContainer>
    );
  }

  const summary = dashboard?.summary || {
    total_tasks: 0,
    active_tasks: 0,
    on_hold_tasks: 0,
    waiting_for_info_tasks: 0,
    info_requests: 0,
    pending_handovers: 0,
    overdue_tasks: 0
  };

  const overdueTasks = dashboard?.overdue_tasks || [];
  const recentCompleted = dashboard?.recent_completed || [];
  const pendingHandovers = dashboard?.pending_handovers || [];

  // Calculate additional metrics
  const completionRate = summary.total_tasks > 0 
    ? Math.round((recentCompleted.length / (recentCompleted.length + summary.total_tasks)) * 100) 
    : 0;
  
  // SLA metrics
  const slaAtRisk = summary.overdue_tasks;
  const slaBreach = overdueTasks.filter((item: any) => {
    if (!item.step?.due_at) return false;
    const dueDate = parseUTCDate(item.step.due_at);
    return differenceInHours(new Date(), dueDate) > 24;
  }).length;

  // Filter history with search and date
  const historyItems = historyData?.items || [];
  let filteredHistory = historySearch
    ? historyItems.filter((item: any) =>
        item.ticket?.title?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.ticket?.ticket_id?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.step?.step_name?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.ticket?.workflow_name?.toLowerCase().includes(historySearch.toLowerCase())
      )
    : historyItems;

  // Apply date period filter
  if (datePeriod !== "all") {
    const now = new Date();
    let startDate: Date;
    
    switch (datePeriod) {
      case "today":
        startDate = startOfDay(now);
        break;
      case "week":
        startDate = subDays(now, 7);
        break;
      case "month":
        startDate = subDays(now, 30);
        break;
      case "quarter":
        startDate = subDays(now, 90);
        break;
      default:
        startDate = new Date(0);
    }
    
    filteredHistory = filteredHistory.filter((item: any) => {
      if (!item.step?.completed_at) return true;
      const completedAt = parseUTCDate(item.step.completed_at);
      return completedAt >= startDate;
    });
  }

  // Calculate history stats
  const thisWeekCompleted = historyItems.filter((item: any) => {
    if (!item.step?.completed_at) return false;
    const completedAt = parseUTCDate(item.step.completed_at);
    const weekAgo = subDays(new Date(), 7);
    return isAfter(completedAt, weekAgo);
  }).length;

  const todayCompleted = historyItems.filter((item: any) => {
    if (!item.step?.completed_at) return false;
    const completedAt = parseUTCDate(item.step.completed_at);
    return isAfter(completedAt, startOfDay(new Date()));
  }).length;

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Ticket ID", "Task Name", "Task Type", "Ticket Title", "Workflow", "Requester", "Completed At"];
    const rows = filteredHistory.map((item: any) => [
      item.ticket?.ticket_id || "",
      item.step?.step_name || "",
      item.step?.step_type || "",
      item.ticket?.title || "",
      item.ticket?.workflow_name || "",
      item.ticket?.requester?.display_name || "",
      item.step?.completed_at ? format(parseUTCDate(item.step.completed_at), "yyyy-MM-dd HH:mm") : "",
    ]);
    
    const csv = [headers, ...rows].map(row => row.map((cell: string) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-completed-tasks-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("Exported to CSV");
  };

  // Determine default tab
  const getDefaultTab = () => {
    if (infoRequests && infoRequests.length > 0) return "info-requests";
    if (overdueTasks.length > 0) return "overdue";
    return "overview";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Agent Dashboard"
        description="Overview of your tasks, info requests, and handovers"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button asChild className="gap-2">
              <Link href="/agent/tasks">
                <ListTodo className="h-4 w-4" />
                Go to My Tasks
              </Link>
            </Button>
          </div>
        }
      />

      {/* ===== KEY METRICS CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Active Tasks"
          value={summary.active_tasks}
          icon={Play}
          color="blue"
          link="/agent/tasks"
          linkText="View all tasks"
        />
        <MetricCard
          title="Info Requests"
          value={infoRequests?.length || summary.info_requests}
          icon={MessageSquare}
          color="purple"
          subtitle="Waiting for your response"
        />
        <MetricCard
          title="Pending Handovers"
          value={handovers?.items?.length || summary.pending_handovers}
          icon={ArrowRightLeft}
          color="amber"
          subtitle="Awaiting manager decision"
        />
        <MetricCard
          title="Overdue Tasks"
          value={summary.overdue_tasks}
          icon={AlertTriangle}
          color="red"
          subtitle="Require immediate attention"
        />
              </div>

      {/* ===== PERFORMANCE METRICS ROW ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <MiniMetricCard
          label="Total Assigned"
          value={summary.total_tasks}
          icon={Target}
        />
        <MiniMetricCard
          label="Active"
          value={summary.active_tasks}
          icon={Activity}
          color="blue"
        />
        <MiniMetricCard
          label="On Hold"
          value={summary.on_hold_tasks}
          icon={PauseCircle}
          color="amber"
        />
        <MiniMetricCard
          label="Completed Today"
          value={todayCompleted}
          icon={CheckCircle}
          color="emerald"
        />
        <MiniMetricCard
          label="SLA At Risk"
          value={slaAtRisk}
          icon={Timer}
          color="amber"
        />
        <MiniMetricCard
          label="SLA Breached"
          value={slaBreach}
          icon={Flame}
          color="red"
        />
              </div>

      {/* ===== MAIN CONTENT TABS ===== */}
      <Tabs defaultValue={getDefaultTab()} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap gap-1">
          <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          {infoRequests && infoRequests.length > 0 && (
            <TabsTrigger value="info-requests" className="gap-2 relative data-[state=active]:bg-background">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              Info Requests
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {infoRequests.length}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="overdue" className="gap-2 data-[state=active]:bg-background">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Overdue
            {overdueTasks.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {overdueTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="handovers" className="gap-2 data-[state=active]:bg-background">
            <ArrowRightLeft className="h-4 w-4 text-amber-500" />
            Handovers
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {pendingHandovers.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-background">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Task Status Overview */}
        <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                    <ListTodo className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle>Task Status Overview</CardTitle>
            <CardDescription>Current status of your assigned tasks</CardDescription>
                  </div>
                </div>
          </CardHeader>
              <CardContent className="space-y-4">
                <AnimatedStatusBar 
                label="Active" 
                count={summary.active_tasks} 
                total={summary.total_tasks}
                color="bg-blue-500"
                  icon={<Play className="h-4 w-4 text-blue-500" />}
              />
                <AnimatedStatusBar 
                label="On Hold" 
                count={summary.on_hold_tasks} 
                total={summary.total_tasks}
                color="bg-amber-500"
                  icon={<PauseCircle className="h-4 w-4 text-amber-500" />}
              />
                <AnimatedStatusBar 
                label="Waiting for Info" 
                count={summary.waiting_for_info_tasks} 
                total={summary.total_tasks}
                color="bg-purple-500"
                  icon={<MessageSquare className="h-4 w-4 text-purple-500" />}
                />
                
                <div className="mt-6 pt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Total Assigned: <span className="font-semibold text-foreground">{summary.total_tasks}</span>
                    </span>
            </div>
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 gap-1">
                    <CheckCircle className="h-3 w-3" />
                {recentCompleted.length} completed recently
              </Badge>
            </div>
          </CardContent>
        </Card>

            {/* Performance & Quick Actions */}
            <div className="space-y-6">
              {/* Personal Performance */}
        <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Gauge className="h-5 w-5 text-emerald-500" />
                    </div>
                    <CardTitle>My Performance</CardTitle>
                  </div>
          </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Award className="h-4 w-4 text-emerald-500" />
                      Completed Today
                    </span>
                    <span className="text-xl font-bold text-emerald-600">{todayCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      This Week
                    </span>
                    <span className="text-xl font-bold text-blue-600">{thisWeekCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Avg. Completion Time</span>
                    <Badge variant="secondary">--</Badge>
            </div>
          </CardContent>
        </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-purple-500" />
                    </div>
                    <CardTitle>Quick Actions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <QuickActionButton
                    icon={ListTodo}
                    label="View All Tasks"
                    badge={summary.total_tasks}
                    href="/agent/tasks"
                  />
                  <QuickActionButton
                    icon={History}
                    label="Full Task History"
                    href="/agent/history"
                  />
                  <QuickActionButton
                    icon={Ticket}
                    label="All Tickets"
                    href="/tickets"
                  />
                </CardContent>
              </Card>
            </div>
      </div>

          {/* SLA Health Card */}
          {(slaAtRisk > 0 || slaBreach > 0) && (
            <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50/50 to-red-50/50 dark:from-amber-950/20 dark:to-red-950/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-6">
                  <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Timer className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">SLA Health Check</p>
                    <p className="text-sm text-muted-foreground">
                      You have {slaAtRisk} task(s) at risk of SLA breach. Please prioritize these tasks.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-600">{slaAtRisk}</p>
                      <p className="text-xs text-muted-foreground">At Risk</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{slaBreach}</p>
                      <p className="text-xs text-muted-foreground">Breached</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Completed */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle>Recently Completed</CardTitle>
                    <CardDescription>Your latest completed tasks</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/agent/history">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentCompleted.length === 0 ? (
                <EmptyState 
                  icon={Inbox} 
                  title="No recent completions" 
                  description="Your completed tasks will appear here" 
                />
              ) : (
                <div className="space-y-2">
                  {recentCompleted.slice(0, 5).map((item: any) => (
                    <CompletedTaskRow key={item.step?.ticket_step_id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== INFO REQUESTS TAB ===== */}
        <TabsContent value="info-requests">
          {!infoRequests || infoRequests.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No pending info requests"
              description="You have no info requests waiting for your response"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {infoRequests.map((ir: any) => (
                <InfoRequestCard key={ir.info_request_id} infoRequest={ir} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== OVERDUE TAB ===== */}
        <TabsContent value="overdue">
          {overdueTasks.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No overdue tasks"
              description="All your tasks are on track"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {overdueTasks.map((item: any) => (
                <OverdueTaskCard key={item.step?.ticket_step_id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== HANDOVERS TAB ===== */}
        <TabsContent value="handovers">
          {pendingHandovers.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No pending handovers"
              description="You haven't requested any handovers"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {pendingHandovers.map((item: any) => (
                <HandoverCard key={item.handover_request?.handover_request_id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== HISTORY TAB (ENHANCED) ===== */}
        <TabsContent value="history" className="space-y-4">
          {/* History Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Completed</p>
                    <p className="text-3xl font-bold">{historyData?.items?.length || 0}</p>
                        </div>
                  <div className="h-12 w-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <FileCheck className="h-6 w-6 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                        <div>
                    <p className="text-sm text-muted-foreground">Completed Today</p>
                    <p className="text-3xl font-bold text-emerald-600">{todayCompleted}</p>
                          </div>
                  <div className="h-12 w-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                        </div>
                      </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This Week</p>
                    <p className="text-3xl font-bold text-blue-600">{thisWeekCompleted}</p>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg. Time</p>
                    <p className="text-3xl font-bold">--</p>
            </div>
                  <div className="h-12 w-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ticket ID, title, task name, or workflow..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={historyFilter} onValueChange={setHistoryFilter}>
                    <SelectTrigger className="w-[150px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Date Period Filter */}
                  <Select value={datePeriod} onValueChange={setDatePeriod}>
                    <SelectTrigger className="w-[150px]">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 Days</SelectItem>
                      <SelectItem value="month">Last 30 Days</SelectItem>
                      <SelectItem value="quarter">Last 90 Days</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Export */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={exportToCSV}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export to CSV</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredHistory.length} completed tasks
              {datePeriod !== "all" && (
                <span className="ml-2">
                  ({datePeriod === "today" ? "Today" : datePeriod === "week" ? "Last 7 days" : datePeriod === "month" ? "Last 30 days" : "Last 90 days"})
                </span>
              )}
            </span>
          </div>

          {/* History Table */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState
              icon={History}
              title="No completed tasks found"
              description={historySearch ? "Try adjusting your search or filters" : "Completed tasks will appear here"}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Ticket ID</TableHead>
                      <TableHead>Task Name</TableHead>
                      <TableHead>Ticket Title</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((item: any) => (
                      <TableRow key={item.step?.ticket_step_id} className="group">
                        <TableCell className="font-mono text-xs font-medium text-primary">
                          {item.ticket?.ticket_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-medium truncate max-w-[150px] cursor-default">{item.step?.step_name || "Task"}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{item.step?.step_name || "Task"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <StepTypeBadge type={item.step?.step_type} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="max-w-[200px]">
                                  <p className="truncate text-sm cursor-default">{item.ticket?.title}</p>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[400px]">
                                <p className="font-medium">{item.ticket?.title}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate max-w-[120px] inline-block cursor-default">{item.ticket?.workflow_name || "--"}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{item.ticket?.workflow_name || "No workflow"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          {item.ticket?.requester?.display_name ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                {item.ticket.requester.display_name.charAt(0).toUpperCase()}
                        </div>
                              <span className="text-sm">{item.ticket.requester.display_name}</span>
                      </div>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.step?.completed_at ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                            {formatDistanceToNow(parseUTCDate(item.step.completed_at), { addSuffix: true })}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {format(parseUTCDate(item.step.completed_at), "MMM d, yyyy h:mm a")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            "--"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/tickets/${item.ticket?.ticket_id}`}>
                              <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </CardContent>
                </Card>
          )}

          {/* Pagination */}
          {historyData?.total > 20 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {historyPage}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryPage(p => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ===== COMPONENT DEFINITIONS =====

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  link,
  linkText,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: any;
  color: "amber" | "blue" | "purple" | "red" | "emerald";
  link?: string;
  linkText?: string;
  subtitle?: string;
}) {
  const colorClasses = {
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 border-l-amber-500",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 border-l-blue-500",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 border-l-purple-500",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600 border-l-red-500",
    emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 border-l-emerald-500",
  };

  const textColors = {
    amber: "text-amber-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
    red: "text-red-600",
    emerald: "text-emerald-600",
  };

  return (
    <Card className={cn("overflow-hidden border-l-4 group hover:shadow-lg transition-all duration-300", `border-l-${color}-500`)}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold", textColors[color])}>{value}</p>
          </div>
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", colorClasses[color].split(" ").slice(0, 2).join(" "))}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        {link && linkText && (
          <Button variant="link" asChild className="px-0 mt-2 h-auto">
            <Link href={link} className="text-sm">
              {linkText}
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetricCard({
  label,
  value,
  icon: Icon,
  color = "default",
}: {
  label: string;
  value: number | string;
  icon: any;
  color?: "default" | "blue" | "emerald" | "amber" | "red";
}) {
  const bgColors = {
    default: "bg-muted/50",
    blue: "bg-blue-50 dark:bg-blue-950/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    red: "bg-red-50 dark:bg-red-950/30",
  };
  const iconColors = {
    default: "text-muted-foreground",
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-red-500",
  };
  const textColors = {
    default: "text-foreground",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };

  return (
    <div className={cn("p-3 rounded-xl", bgColors[color])}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", iconColors[color])} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", textColors[color])}>{value}</p>
    </div>
  );
}

function AnimatedStatusBar({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon?: React.ReactNode;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{count}</span>
          <span className="text-xs text-muted-foreground">({percentage.toFixed(0)}%)</span>
      </div>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  badge,
  href,
}: {
  icon: any;
  label: string;
  badge?: number | string;
  href: string;
}) {
  return (
    <Button variant="outline" className="w-full justify-start h-12 group" asChild>
      <Link href={href}>
        <Icon className="h-4 w-4 mr-3 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="flex-1 text-left">{label}</span>
        {badge !== undefined && (
          <Badge variant="secondary" className="ml-auto">
            {badge}
          </Badge>
        )}
      </Link>
    </Button>
  );
}

function CompletedTaskRow({ item }: { item: any }) {
  return (
    <Link
      href={`/tickets/${item.ticket?.ticket_id}`}
      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="font-medium truncate cursor-pointer">{item.step?.step_name || "Task"}</p>
              </TooltipTrigger>
              <TooltipContent>
                <p>{item.step?.step_name || "Task"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground truncate cursor-pointer">
                  <span className="font-mono text-xs">{item.ticket?.ticket_id}</span>
                  {" • "}
                  {item.ticket?.title}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[400px]">
                <p>{item.ticket?.title}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {item.step?.completed_at && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(parseUTCDate(item.step.completed_at), { addSuffix: true })}
          </span>
        )}
        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function InfoRequestCard({ infoRequest }: { infoRequest: any }) {
  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-transparent dark:from-purple-950/20">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <HelpCircle className="h-4 w-4 text-purple-600" />
              </div>
              <Link 
                href={`/tickets/${infoRequest.ticket_id}`}
                className="font-semibold hover:underline text-purple-900 dark:text-purple-100"
              >
                {infoRequest.ticket_title}
              </Link>
              <Badge className="bg-purple-500 hover:bg-purple-500 text-white">
                Awaiting Response
              </Badge>
            </div>
            {infoRequest.subject && (
              <p className="text-sm font-medium">Subject: {infoRequest.subject}</p>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">{infoRequest.question_text}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                From: <strong>{infoRequest.requested_by?.display_name}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(parseUTCDate(infoRequest.requested_at), { addSuffix: true })}
              </span>
              <span>•</span>
              <Badge variant="secondary" className="text-xs">{infoRequest.step_name}</Badge>
              {infoRequest.workflow_name && (
                <>
                  <span>•</span>
                  <span>{infoRequest.workflow_name}</span>
                </>
              )}
              {infoRequest.request_attachment_ids?.length > 0 && (
                <>
                  <span>•</span>
                  <span>📎 {infoRequest.request_attachment_ids.length} attachment(s)</span>
                </>
              )}
            </div>
          </div>
          <Link href={`/tickets/${infoRequest.ticket_id}?action=respond&stepId=${infoRequest.ticket_step_id}`}>
            <Button className="bg-purple-600 hover:bg-purple-700 gap-2">
              <MessageSquare className="h-4 w-4" />
              Respond
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function OverdueTaskCard({ item }: { item: any }) {
  const overdueHours = item.step?.due_at ? differenceInHours(new Date(), parseUTCDate(item.step.due_at)) : 0;
  
  return (
    <Card className="border-red-200 dark:border-red-800 hover:shadow-md transition-all">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold">{item.step?.step_name || "Task"}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{item.ticket?.ticket_id}</span>
                <span>•</span>
                <span className="truncate max-w-[200px]">{item.ticket?.title}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {item.step?.due_at && (
              <Badge variant="destructive" className="text-xs gap-1">
                <Flame className="h-3 w-3" />
                {overdueHours > 24 ? `${Math.floor(overdueHours / 24)}d` : `${overdueHours}h`} overdue
              </Badge>
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/tickets/${item.ticket?.ticket_id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HandoverCard({ item }: { item: any }) {
  return (
    <Card className="border-amber-200 dark:border-amber-800 hover:shadow-md transition-all">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ArrowRightLeft className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold">{item.step?.step_name || "Task"}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{item.ticket?.ticket_id}</span>
                <span>•</span>
                <span className="truncate max-w-[200px]">{item.ticket?.title}</span>
              </div>
              {item.handover_request?.reason && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reason: {item.handover_request.reason}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
              <Timer className="h-3 w-3" />
              Pending Review
              </Badge>
            {item.handover_request?.requested_at && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(parseUTCDate(item.handover_request.requested_at), { addSuffix: true })}
              </span>
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/tickets/${item.ticket?.ticket_id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  iconColor = "text-muted-foreground",
}: {
  icon: any;
  title: string;
  description: string;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardContent className="py-16">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Icon className={cn("h-8 w-8", iconColor)} />
          </div>
          <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
      </CardContent>
    </Card>
  );
}
