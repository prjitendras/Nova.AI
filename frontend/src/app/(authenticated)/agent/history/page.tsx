/**
 * Agent History Page
 * View completed tasks and personal work history
 */
"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { ErrorState } from "@/components/error-state";
import { TicketCardSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  ExternalLink, 
  Clock, 
  CheckCircle,
  Search,
  Calendar,
  Filter
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { parseUTCDate } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";

export default function AgentHistoryPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Fetch completed tasks from tickets API
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["agent-history", user?.email, page, dateFilter],
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ step: any; ticket: any }>;
        page: number;
        page_size: number;
        total: number;
      }>("/tickets/agent/history", {
        page,
        page_size: 20,
        date_filter: dateFilter !== "all" ? dateFilter : undefined,
      });
      return response;
    },
    enabled: !!user?.email,
  });

  const tasks = data?.items || [];
  const filteredTasks = search
    ? tasks.filter((t: any) =>
        t.ticket.title.toLowerCase().includes(search.toLowerCase()) ||
        t.step.step_name.toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  // Calculate stats
  const stats = {
    totalCompleted: filteredTasks.length,
    thisWeek: filteredTasks.filter((t: any) => {
      const completedAt = new Date(t.step.completed_at);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return completedAt >= weekAgo;
    }).length,
    avgCompletionTime: "N/A", // Would need more data to calculate
  };

  return (
    <PageContainer>
      <PageHeader
        title="My Work History"
        description="View your completed tasks and performance"
        breadcrumbs={[
          { label: "Agent", href: "/agent/tasks" },
          { label: "History" },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Completed</p>
                <p className="text-3xl font-bold">{stats.totalCompleted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-3xl font-bold">{stats.thisWeek}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Completion</p>
                <p className="text-3xl font-bold">{stats.avgCompletionTime}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <TicketCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message="Failed to load history"
          onRetry={() => refetch()}
        />
      ) : !filteredTasks.length ? (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No history yet</h3>
          <p className="text-muted-foreground">
            Completed tasks will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map(({ step, ticket }: any) => (
            <Card key={step.ticket_step_id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{step.step_name}</CardTitle>
                      <StepTypeBadge type={step.step_type} />
                      <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    </div>
                    <CardDescription>
                      <Link href={`/tickets/${ticket.ticket_id}`} className="hover:underline">
                        {ticket.workflow_name} - {ticket.ticket_id}
                      </Link>
                      {" • "}
                      <span className="font-mono text-xs">{ticket.ticket_id}</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Requester</p>
                    <UserPill user={ticket.requester} size="sm" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Completed</p>
                    <p className="text-sm flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      {step.completed_at
                        ? format(parseUTCDate(step.completed_at), "MMM d, yyyy h:mm a")
                        : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Duration</p>
                    <p className="text-sm">
                      {step.started_at && step.completed_at
                        ? formatDistanceToNow(parseUTCDate(step.started_at), { addSuffix: false })
                        : "N/A"}
                    </p>
                  </div>
                </div>
                
                {step.data?.execution_notes && (
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground mb-1">Execution Notes:</p>
                    <p className="text-sm">{step.data.execution_notes}</p>
                  </div>
                )}
                
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/tickets/${ticket.ticket_id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Ticket
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

