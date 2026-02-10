/**
 * Manager Team Dashboard - Enhanced Version
 * Modern UI with comprehensive history tab, detailed metrics, and performance tracking
 */
"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTeamDashboard, usePendingApprovals, useUnassignedTasks, usePendingHandovers, useMyInfoRequests } from "@/hooks/use-tickets";
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
  Users,
  Ticket,
  PauseCircle,
  ArrowRightLeft,
  TrendingUp,
  ExternalLink,
  RefreshCw,
  BarChart3,
  UserCheck,
  MessageSquare,
  HelpCircle,
  History,
  Search,
  Filter,
  Calendar,
  FileText,
  User,
  ArrowRight,
  Target,
  Activity,
  Download,
  CalendarDays,
  Timer,
  Gauge,
  TrendingDown,
  Award,
  Flame,
  CircleDot,
  SortAsc,
  SortDesc,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { formatDistanceToNow, format, subDays, startOfDay, differenceInHours } from "date-fns";
import { parseUTCDate, cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const { data: dashboard, isLoading, error, refetch } = useTeamDashboard(user?.email || "");
  const { data: approvals } = usePendingApprovals(user?.email || "");
  const { data: unassigned } = useUnassignedTasks(user?.email || "");
  const { data: handovers } = usePendingHandovers(user?.email || "");
  const { data: myInfoRequests } = useMyInfoRequests();

  // History state
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyFilter, setHistoryFilter] = React.useState("all");
  const [historyPage, setHistoryPage] = React.useState(1);
  const [historySortBy, setHistorySortBy] = React.useState("created_at");
  const [historySortOrder, setHistorySortOrder] = React.useState<"asc" | "desc">("desc");
  const [datePeriod, setDatePeriod] = React.useState("all");

  // Fetch manager approval history - tickets where manager made approval decisions
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["manager-history", user?.email, historyFilter, historyPage, historySearch],
    queryFn: async () => {
      const params: any = { page: historyPage, page_size: 20 };
      if (historyFilter !== "all") {
        params.status = historyFilter;
      }
      if (historySearch) {
        params.q = historySearch;
      }
      // Use the new manager/history endpoint that returns tickets where this manager
      // made approval decisions (approved or rejected)
      const response = await apiClient.get<any>("/tickets/manager/history", params);
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

  const workload = dashboard?.workload || {
    status_counts: {},
    unassigned_tasks: 0,
    total_tickets: 0,
  };
  
  const overdueSteps = dashboard?.overdue_steps || [];
  const onHoldSteps = dashboard?.on_hold_steps || [];
  const recentTickets = dashboard?.recent_tickets || [];
  const agentWorkload = dashboard?.agent_workload || [];

  // Calculate metrics
  const totalActive = (workload.status_counts?.IN_PROGRESS || 0) + 
                     (workload.status_counts?.OPEN || 0) +
                     (workload.status_counts?.WAITING_FOR_REQUESTER || 0);
  const totalCompleted = workload.status_counts?.COMPLETED || 0;
  const totalRejected = workload.status_counts?.REJECTED || 0;
  const totalCancelled = workload.status_counts?.CANCELLED || 0;
  const completionRate = workload.total_tickets > 0 
    ? Math.round((totalCompleted / workload.total_tickets) * 100) 
    : 0;

  // SLA metrics (calculated from overdue)
  const slaAtRisk = overdueSteps.length;
  const slaBreach = overdueSteps.filter((s: any) => {
    if (!s.due_at) return false;
    const dueDate = parseUTCDate(s.due_at);
    return differenceInHours(new Date(), dueDate) > 24;
  }).length;

  // Filter history with date period
  // historyItems now contains: { ticket: {...}, approval_decision, decided_at, step_name }
  const historyItems = historyData?.items || [];
  
  // Search is now handled server-side via params.q, so we don't need client-side filtering
  let filteredHistory = historyItems;

  // Apply date period filter (using decided_at for manager history)
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
      // Use decided_at for manager history, fallback to ticket.created_at
      const dateStr = item.decided_at || item.ticket?.created_at;
      if (!dateStr) return true;
      const decisionDate = parseUTCDate(dateStr);
      return decisionDate >= startDate;
    });
  }

  // Sort history by decided_at (already sorted from server, but allow re-sort)
  filteredHistory = [...filteredHistory].sort((a: any, b: any) => {
    // For manager history, sort by decided_at
    const sortField = historySortBy === "created_at" ? "decided_at" : historySortBy;
    let aVal = sortField === "decided_at" ? a.decided_at : a.ticket?.[historySortBy];
    let bVal = sortField === "decided_at" ? b.decided_at : b.ticket?.[historySortBy];
    if (sortField === "decided_at" || historySortBy === "created_at" || historySortBy === "updated_at") {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    }
    if (historySortOrder === "asc") {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Ticket ID", "Title", "Decision", "Workflow", "Requester", "Decided At", "Ticket Status"];
    const rows = filteredHistory.map((item: any) => {
      const ticket = item.ticket || item;
      return [
        ticket.ticket_id,
        ticket.title,
        item.approval_decision || ticket.status,
        ticket.workflow_name,
        ticket.requester?.display_name || "",
        item.decided_at ? format(parseUTCDate(item.decided_at), "yyyy-MM-dd HH:mm") : "",
        ticket.status,
      ];
    });
    
    const csv = [headers, ...rows].map(row => row.map((cell: string) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `approval-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("Exported to CSV");
  };

  // Determine default tab
  const getDefaultTab = () => {
    if (myInfoRequests && myInfoRequests.length > 0) return "info-requests";
    if (overdueSteps.length > 0) return "overdue";
    return "overview";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Team Dashboard"
        description="Monitor team workload, approvals, and performance"
        actions={
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* ===== KEY METRICS CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Pending Approvals"
          value={approvals?.items?.length || 0}
          icon={CheckCircle}
          color="amber"
          link="/manager/approvals"
          linkText="View all approvals"
        />
        <MetricCard
          title="Unassigned Tasks"
          value={unassigned?.items?.length || workload.unassigned_tasks || 0}
          icon={UserCheck}
          color="blue"
          link="/manager/assignments"
          linkText="Assign tasks"
        />
        <MetricCard
          title="Handover Requests"
          value={handovers?.items?.length || 0}
          icon={ArrowRightLeft}
          color="purple"
          link="/manager/handovers"
          linkText="Review handovers"
        />
        <MetricCard
          title="Overdue Tasks"
          value={overdueSteps.length}
          icon={AlertTriangle}
          color="red"
          subtitle="Require immediate attention"
        />
              </div>

      {/* ===== SLA & PERFORMANCE METRICS ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <MiniMetricCard
          label="Total Tickets"
          value={workload.total_tickets}
          icon={Ticket}
        />
        <MiniMetricCard
          label="Active"
          value={totalActive}
          icon={Activity}
          color="blue"
        />
        <MiniMetricCard
          label="Completed"
          value={totalCompleted}
          icon={CheckCircle}
          color="emerald"
        />
        <MiniMetricCard
          label="Completion Rate"
          value={`${completionRate}%`}
          icon={Target}
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
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          {myInfoRequests && myInfoRequests.length > 0 && (
            <TabsTrigger value="info-requests" className="gap-2 relative data-[state=active]:bg-background">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Info Requests
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {myInfoRequests.length}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="overdue" className="gap-2 data-[state=active]:bg-background">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Overdue
            {overdueSteps.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {overdueSteps.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="onhold" className="gap-2 data-[state=active]:bg-background">
            <PauseCircle className="h-4 w-4 text-amber-500" />
            On Hold
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {onHoldSteps.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2 data-[state=active]:bg-background">
            <Users className="h-4 w-4" />
            Agents
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {agentWorkload.length}
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
            {/* Status Distribution */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
              <div>
                    <CardTitle>Ticket Status Distribution</CardTitle>
                    <CardDescription>Current status breakdown of all team tickets</CardDescription>
              </div>
              </div>
          </CardHeader>
              <CardContent className="space-y-4">
                <AnimatedStatusBar 
                label="In Progress" 
                count={workload.status_counts?.IN_PROGRESS || 0} 
                total={workload.total_tickets}
                color="bg-blue-500"
                  icon={<Activity className="h-4 w-4 text-blue-500" />}
              />
                <AnimatedStatusBar 
                label="Waiting for Requester" 
                count={workload.status_counts?.WAITING_FOR_REQUESTER || 0} 
                total={workload.total_tickets}
                color="bg-amber-500"
                  icon={<Clock className="h-4 w-4 text-amber-500" />}
              />
                <AnimatedStatusBar 
                label="Completed" 
                count={workload.status_counts?.COMPLETED || 0} 
                total={workload.total_tickets}
                color="bg-emerald-500"
                  icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
              />
                <AnimatedStatusBar 
                label="Rejected" 
                count={workload.status_counts?.REJECTED || 0} 
                total={workload.total_tickets}
                color="bg-red-500"
                  icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              />
                <AnimatedStatusBar 
                label="Cancelled" 
                count={workload.status_counts?.CANCELLED || 0} 
                total={workload.total_tickets}
                  color="bg-gray-400"
                  icon={<PauseCircle className="h-4 w-4 text-gray-400" />}
                />
          </CardContent>
        </Card>

            {/* Quick Stats & Team Performance */}
            <div className="space-y-6">
        <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Gauge className="h-5 w-5 text-emerald-500" />
                    </div>
                    <CardTitle>Performance</CardTitle>
                  </div>
          </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-sm font-medium">Completion Rate</span>
                    <span className="text-2xl font-bold text-emerald-600">{completionRate}%</span>
              </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Resolved Today</span>
                    <Badge variant="secondary">--</Badge>
              </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Avg. Resolution Time</span>
                    <Badge variant="secondary">--</Badge>
              </div>
                </CardContent>
              </Card>

              {/* SLA Health */}
              <Card className={cn(slaAtRisk > 0 && "border-amber-200 dark:border-amber-800")}>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center",
                      slaAtRisk > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                    )}>
                      <Timer className={cn("h-5 w-5", slaAtRisk > 0 ? "text-amber-500" : "text-emerald-500")} />
              </div>
                    <CardTitle>SLA Health</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      At Risk
                    </span>
                    <span className="text-xl font-bold text-amber-600">{slaAtRisk}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Flame className="h-4 w-4 text-red-500" />
                      Breached
                    </span>
                    <span className="text-xl font-bold text-red-600">{slaBreach}</span>
            </div>
          </CardContent>
        </Card>
            </div>
      </div>

          {/* Agent Workload Summary */}
          {agentWorkload.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle>Agent Workload</CardTitle>
                      <CardDescription>Task distribution across team members</CardDescription>
                    </div>
                  </div>
                </div>
          </CardHeader>
          <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="text-center">On Hold</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Load</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentWorkload.map((agent: any) => {
                        const loadPercent = agent.total_tasks > 0 ? Math.round((agent.active_tasks / 10) * 100) : 0;
                        return (
                          <TableRow key={agent.email || agent.aad_id}>
                            <TableCell>
                  <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
                      {(agent.display_name || agent.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                                  <p className="font-medium text-sm">{agent.display_name || agent.email}</p>
                      <p className="text-xs text-muted-foreground">{agent.email}</p>
                    </div>
                  </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {agent.active_tasks}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {agent.on_hold_tasks}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-semibold">{agent.total_tasks}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full",
                                      loadPercent > 80 ? "bg-red-500" : loadPercent > 50 ? "bg-amber-500" : "bg-emerald-500"
                                    )}
                                    style={{ width: `${Math.min(loadPercent, 100)}%` }}
                                  />
                    </div>
                                <span className="text-xs text-muted-foreground w-8">{loadPercent}%</span>
                    </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                    </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest team tickets</CardDescription>
                </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/tickets">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentTickets.length === 0 ? (
                <EmptyState icon={Ticket} title="No recent tickets" description="Recent team activity will appear here" />
              ) : (
                <div className="space-y-2">
                  {recentTickets.slice(0, 5).map((ticket: any) => (
                    <TicketRow key={ticket.ticket_id} ticket={ticket} />
              ))}
            </div>
              )}
          </CardContent>
        </Card>
        </TabsContent>

        {/* ===== INFO REQUESTS TAB ===== */}
        <TabsContent value="info-requests">
          {!myInfoRequests || myInfoRequests.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No pending info requests"
              description="You have no info requests waiting for your response"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {myInfoRequests.map((ir: any) => (
                <InfoRequestCard key={ir.info_request_id} infoRequest={ir} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== OVERDUE TAB ===== */}
        <TabsContent value="overdue">
          {overdueSteps.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No overdue tasks"
              description="All tasks are on track"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {overdueSteps.map((step: any) => (
                <StepCard key={step.ticket_step_id} step={step} variant="overdue" />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== ON HOLD TAB ===== */}
        <TabsContent value="onhold">
          {onHoldSteps.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No tasks on hold"
              description="All tasks are progressing"
              iconColor="text-emerald-500"
            />
          ) : (
            <div className="space-y-3">
              {onHoldSteps.map((step: any) => (
                <StepCard key={step.ticket_step_id} step={step} variant="onhold" />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== AGENTS TAB ===== */}
        <TabsContent value="agents">
          {agentWorkload.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No agents assigned"
              description="Agent workload information will appear here"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentWorkload.map((agent: any) => (
                <AgentCard key={agent.email || agent.aad_id} agent={agent} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== HISTORY TAB (ENHANCED) ===== */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters Bar */}
          <Card>
                  <CardContent className="py-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID, title, requester, or workflow..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                        </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={historyFilter} onValueChange={setHistoryFilter}>
                    <SelectTrigger className="w-[150px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="SKIPPED">Skipped</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                      <SelectItem value="WAITING_FOR_REQUESTER">Waiting</SelectItem>
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

                  {/* Sort */}
                  <Select value={`${historySortBy}-${historySortOrder}`} onValueChange={(v) => {
                    const [field, order] = v.split("-");
                    setHistorySortBy(field);
                    setHistorySortOrder(order as "asc" | "desc");
                  }}>
                    <SelectTrigger className="w-[160px]">
                      {historySortOrder === "desc" ? <SortDesc className="h-4 w-4 mr-2" /> : <SortAsc className="h-4 w-4 mr-2" />}
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at-desc">Newest First</SelectItem>
                      <SelectItem value="created_at-asc">Oldest First</SelectItem>
                      <SelectItem value="updated_at-desc">Recently Updated</SelectItem>
                      <SelectItem value="title-asc">Title A-Z</SelectItem>
                      <SelectItem value="title-desc">Title Z-A</SelectItem>
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
              Showing {filteredHistory.length} of {historyData?.total || 0} tickets
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
              title="No tickets found"
              description={historySearch ? "Try adjusting your search or filters" : "Team ticket history will appear here"}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Ticket ID</TableHead>
                      <TableHead>Step Name</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Decided</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((item: any, index: number) => {
                      // Extract ticket from the new structure: { ticket: {...}, approval_decision, decided_at, step_name }
                      const ticket = item.ticket || item;
                      const approvalDecision = item.approval_decision;
                      const decidedAt = item.decided_at;
                      const stepName = item.step_name || "Approval";
                      
                      // Use index + approval_task_id as key since same ticket can appear multiple times
                      const uniqueKey = item.approval_task_id || `${ticket.ticket_id}-${index}`;
                      
                      return (
                      <TableRow key={uniqueKey} className="group">
                        <TableCell className="font-mono text-xs font-medium text-primary">
                          {ticket.ticket_id}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{stepName}</span>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="max-w-[250px]">
                                  <p className="font-medium truncate cursor-default">{ticket.workflow_name} - {ticket.ticket_id}</p>
                                  <p className="text-xs text-muted-foreground truncate">{ticket.workflow_name}</p>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[400px]">
                                <p className="font-medium">{ticket.workflow_name} - {ticket.ticket_id}</p>
                                <p className="text-sm text-muted-foreground">{ticket.workflow_name}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          {ticket.requester?.display_name ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                {ticket.requester.display_name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm">{ticket.requester.display_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Show approval decision if available, otherwise ticket status */}
                          {approvalDecision ? (
                            <Badge 
                              variant={approvalDecision === "APPROVED" ? "default" : approvalDecision === "SKIPPED" ? "secondary" : "destructive"}
                              className={cn(
                                approvalDecision === "APPROVED" && "bg-green-500/10 text-green-600 border-green-200",
                                approvalDecision === "SKIPPED" && "bg-amber-500/10 text-amber-600 border-amber-200"
                              )}
                            >
                              {approvalDecision === "APPROVED" ? "Approved" : approvalDecision === "SKIPPED" ? "Skipped" : "Rejected"}
                            </Badge>
                          ) : (
                            <StatusBadge status={ticket.status} size="sm" />
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {/* Show decided_at for manager history */}
                          {decidedAt ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {formatDistanceToNow(parseUTCDate(decidedAt), { addSuffix: true })}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {format(parseUTCDate(decidedAt), "MMM d, yyyy h:mm a")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : ticket.created_at ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {formatDistanceToNow(parseUTCDate(ticket.created_at), { addSuffix: true })}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {format(parseUTCDate(ticket.created_at), "MMM d, yyyy h:mm a")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            "--"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/tickets/${ticket.ticket_id}`}>
                              <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
                  </CardContent>
                </Card>
          )}

          {/* Pagination */}
          {historyData?.total > 20 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {historyPage} of {Math.ceil(historyData.total / 20)}
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
                  disabled={historyPage >= Math.ceil(historyData.total / 20)}
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
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600",
    emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
  };

  const textColors = {
    amber: "text-amber-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
    red: "text-red-600",
    emerald: "text-emerald-600",
  };

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-all duration-300">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold", textColors[color])}>{value}</p>
          </div>
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", colorClasses[color])}>
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

function TicketRow({ ticket }: { ticket: any }) {
  return (
    <Link
      href={`/tickets/${ticket.ticket_id}`}
      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
          <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </div>
        <div className="min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="font-medium truncate cursor-pointer">{ticket.workflow_name} - {ticket.ticket_id}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[400px]">
                <p>{ticket.workflow_name} - {ticket.ticket_id}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{ticket.ticket_id}</span>
            {ticket.workflow_name && <span> • {ticket.workflow_name}</span>}
            {ticket.requester?.display_name && <span> • {ticket.requester.display_name}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={ticket.status} size="sm" />
        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function InfoRequestCard({ infoRequest }: { infoRequest: any }) {
  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <HelpCircle className="h-4 w-4 text-blue-600" />
              </div>
              <Link 
                href={`/tickets/${infoRequest.ticket_id}`}
                className="font-semibold hover:underline text-blue-900 dark:text-blue-100"
              >
                {infoRequest.ticket_title}
              </Link>
              <Badge className="bg-blue-500 hover:bg-blue-500 text-white">
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
              {infoRequest.request_attachment_ids?.length > 0 && (
                <>
                  <span>•</span>
                  <span>📎 {infoRequest.request_attachment_ids.length} attachment(s)</span>
                </>
              )}
            </div>
          </div>
          <Link href={`/tickets/${infoRequest.ticket_id}?action=respond&stepId=${infoRequest.ticket_step_id}`}>
            <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
              <MessageSquare className="h-4 w-4" />
              Respond
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function StepCard({ step, variant }: { step: any; variant: "overdue" | "onhold" }) {
  const isOverdue = variant === "overdue";
  const overdueHours = step.due_at ? differenceInHours(new Date(), parseUTCDate(step.due_at)) : 0;
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      isOverdue ? "border-red-200 dark:border-red-800" : "border-amber-200 dark:border-amber-800"
    )}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              isOverdue ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"
            )}>
              {isOverdue ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : (
                <PauseCircle className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div>
              <p className="font-semibold">{step.step_name}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{step.ticket_id}</span>
                <StepTypeBadge type={step.step_type} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {step.assigned_to && <UserPill user={step.assigned_to} size="sm" />}
            {step.due_at && isOverdue && (
              <Badge variant="destructive" className="text-xs gap-1">
                <Flame className="h-3 w-3" />
                {overdueHours > 24 ? `${Math.floor(overdueHours / 24)}d` : `${overdueHours}h`} overdue
              </Badge>
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/tickets/${step.ticket_id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent }: { agent: any }) {
  const loadPercent = Math.min((agent.active_tasks / 10) * 100, 100);
  const loadStatus = loadPercent > 80 ? "high" : loadPercent > 50 ? "medium" : "low";
  
  return (
    <Card className="hover:shadow-lg transition-all duration-300">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-xl font-bold text-primary">
            {(agent.display_name || agent.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{agent.display_name || agent.email}</p>
            <p className="text-sm text-muted-foreground truncate">{agent.email}</p>
          </div>
          <Badge variant="outline" className={cn(
            "text-xs",
            loadStatus === "high" && "border-red-300 text-red-600",
            loadStatus === "medium" && "border-amber-300 text-amber-600",
            loadStatus === "low" && "border-emerald-300 text-emerald-600"
          )}>
            {loadStatus === "high" ? "High Load" : loadStatus === "medium" ? "Moderate" : "Available"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
            <p className="text-2xl font-bold text-blue-600">{agent.active_tasks}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30">
            <p className="text-2xl font-bold text-amber-600">{agent.on_hold_tasks}</p>
            <p className="text-xs text-muted-foreground">On Hold</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted">
            <p className="text-2xl font-bold">{agent.total_tasks}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
        {/* Workload bar */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground">Workload</span>
            <span className="font-medium">{Math.round(loadPercent)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                loadStatus === "high" ? "bg-red-500" : loadStatus === "medium" ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${loadPercent}%` }}
            />
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
