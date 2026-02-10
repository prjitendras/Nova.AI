/**
 * AI Insights Page - Full AI Analysis Dashboard
 * Powered by NOVA Intelligence - Neural Analysis Engine
 */
"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTickets } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import {
  Brain,
  Sparkles,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Lightbulb,
  Zap,
  Activity,
  ChevronRight,
  Bot,
  Search,
  FileText,
  Workflow,
  Users,
  AlertTriangle,
  UserCheck,
  Cpu,
  ClipboardList,
  CheckSquare,
} from "lucide-react";

// Animated Analysis Progress Component (same as Cortex Analyzer in dashboard)
function AnalysisProgress({ step }: { step: number }) {
  const steps = [
    { label: "Connecting to NOVA Core", icon: Cpu },
    { label: "Fetching ticket data", icon: ClipboardList },
    { label: "Running deep analysis", icon: Brain },
    { label: "Processing workflow state", icon: Workflow },
    { label: "Generating insights", icon: Sparkles },
  ];

  return (
    <div className="py-6 px-2">
      {/* Animated Brain Icon */}
      <div className="relative mx-auto w-16 h-16 mb-5">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/30 to-violet-500/30 animate-ping" />
        <div className="absolute inset-1.5 rounded-full bg-gradient-to-r from-primary/50 to-violet-500/50 animate-pulse" />
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
          <Brain className="h-5 w-5 text-white animate-pulse" />
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-5">
        <div 
          className="absolute inset-0 bg-gradient-to-r from-primary via-violet-500 to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, (step + 1) * 20)}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
      </div>
      
      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === step;
          const isCompleted = idx < step;
          
          return (
            <div 
              key={idx}
              className={`flex items-center gap-2.5 p-2 rounded-lg transition-all duration-300 ${
                isActive ? "bg-primary/10 border border-primary/30" : 
                isCompleted ? "opacity-50" : "opacity-30"
              }`}
            >
              <div className={`p-1.5 rounded-lg ${
                isActive ? "bg-primary text-white" : 
                isCompleted ? "bg-emerald-500 text-white" : "bg-muted"
              }`}>
                {isCompleted ? (
                  <CheckSquare className="h-3 w-3" />
                ) : (
                  <Icon className={`h-3 w-3 ${isActive ? "animate-pulse" : ""}`} />
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-medium text-primary" : ""}`}>
                {s.label}
                {isActive && <span className="ml-1 animate-pulse">...</span>}
              </span>
              {isActive && (
                <RefreshCw className="h-3 w-3 ml-auto text-primary animate-spin" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Types
interface WorkflowStepDetail {
  order: number;
  name: string;
  step_type: string;
  state: string;
  assignee?: string;
  assignee_email?: string;
  is_current: boolean;
  ai_insight?: string;
}

interface TicketExplanation {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  requester: string;
  workflow_name: string;
  created_at: string;
  summary: string;
  current_state: string;
  current_step_detail?: {
    name: string;
    type: string;
    state: string;
    assignee: string;
    assignee_email: string;
  };
  next_steps: string[];
  workflow_steps: WorkflowStepDetail[];
  timeline_estimate?: string;
  key_details: Record<string, string>;
  pending_actions: string[];
  ai_confidence: string;
  generated_at: string;
}

// NOVA Pulse response (same as dashboard - works reliably)
interface NOVAPulseResponse {
  greeting: string;
  overall_summary: string;
  ticket_briefings: {
    ticket_id: string;
    title: string;
    status: string;
    ai_summary: string;
    ai_action?: string;
    priority_score: number;
    sentiment: "positive" | "neutral" | "urgent";
  }[];
  smart_recommendations: string[];
  productivity_insight?: string;
  generated_at: string;
  ai_powered: boolean;
}

export default function AIInsightsPage() {
  const { user } = useAuth();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [isPageReady, setIsPageReady] = useState(false);
  
  // Lazy load: Wait 300ms after mount before fetching AI data
  useEffect(() => {
    const timer = setTimeout(() => setIsPageReady(true), 300);
    return () => clearTimeout(timer);
  }, []);
  
  // Fetch all user tickets (for showing full list)
  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useTickets({ 
    mine: true, 
    pageSize: 100  // Get more tickets
  });
  
  // Fetch AI briefings for top 5 tickets (deferred until page is ready)
  const { data: pulseData, isLoading: pulseLoading, refetch: refetchPulse, isRefetching: isPulseRefetching } = useQuery<NOVAPulseResponse>({
    queryKey: ["nova-pulse-insights"],
    queryFn: async () => {
      const response = await apiClient.get<NOVAPulseResponse>("/ai-chat/nova-pulse");
      return response;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    enabled: isPageReady, // Only fetch after page renders
  });
  
  // Mutation for explaining a specific ticket
  const explainMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await apiClient.get<TicketExplanation>(`/ai-chat/explain-ticket/${ticketId}`);
      return response;
    },
  });
  
  // Animate through analysis steps while loading
  useEffect(() => {
    if (explainMutation.isPending) {
      setAnalysisStep(0);
      const interval = setInterval(() => {
        setAnalysisStep(prev => (prev < 4 ? prev + 1 : prev));
      }, 800);
      return () => clearInterval(interval);
    }
  }, [explainMutation.isPending]);
  
  const handleExplainTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    explainMutation.mutate(ticketId);
  };
  
  const handleRefresh = () => {
    refetchPulse();
    refetchTickets();
  };
  
  // Get ticket IDs that already have AI briefings
  const briefingTicketIds = useMemo(() => {
    return new Set(pulseData?.ticket_briefings?.map(b => b.ticket_id) || []);
  }, [pulseData]);
  
  // Other tickets = all tickets minus those with AI briefings
  const otherTickets = useMemo(() => {
    if (!ticketsData?.items) return [];
    return ticketsData.items.filter(t => !briefingTicketIds.has(t.ticket_id));
  }, [ticketsData, briefingTicketIds]);
  
  // Status breakdown from all tickets
  const statusBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    ticketsData?.items?.forEach(t => {
      breakdown[t.status] = (breakdown[t.status] || 0) + 1;
    });
    return breakdown;
  }, [ticketsData]);
  
  const userName = user?.display_name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary via-violet-500 to-purple-600 shadow-lg">
              <Brain className="h-6 w-6 text-white" />
            </div>
            AI Insights Center
          </h1>
          <p className="text-muted-foreground mt-1">
            NOVA Intelligence - Real-time neural analysis of your tickets
          </p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={isPulseRefetching || ticketsLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isPulseRefetching ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>
      
      {/* AI Status Banner */}
      <Card className="border-0 bg-gradient-to-r from-primary/10 via-violet-500/10 to-purple-500/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="p-2 rounded-full bg-emerald-500/20">
                  <Zap className="h-5 w-5 text-emerald-500" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div>
                <p className="font-semibold">NOVA AI Engine Active</p>
                <p className="text-sm text-muted-foreground">
                  Analyzing {ticketsData?.total || 0} tickets with NOVA Intelligence
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              Connected
            </Badge>
          </div>
        </CardContent>
      </Card>
      
      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - AI Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overall AI Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI Summary
                {pulseData?.ai_powered && (
                  <Badge variant="secondary" className="text-[10px] ml-2">
                    <Sparkles className="h-3 w-3 mr-1" />
                    NOVA Neural
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pulseLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    {pulseData?.overall_summary || "No analysis available. Click refresh to generate AI insights."}
                  </p>
                  
                  {/* Status Breakdown from tickets data */}
                  {Object.keys(statusBreakdown).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusBreakdown).map(([status, count]) => (
                        <Badge key={status} variant="outline" className="text-xs">
                          {status.replace(/_/g, " ")}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Smart Recommendations */}
                  {pulseData?.smart_recommendations && pulseData.smart_recommendations.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          AI Recommendations
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {pulseData.smart_recommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <ChevronRight className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Productivity Insight */}
                  {pulseData?.productivity_insight && (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-emerald-700 dark:text-emerald-400">
                          {pulseData.productivity_insight}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Ticket AI Briefings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                AI Ticket Briefings
              </CardTitle>
              <CardDescription>
                Click any ticket for detailed AI explanation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pulseLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : pulseData?.ticket_briefings && pulseData.ticket_briefings.length > 0 ? (
                <div className="space-y-3">
                  {pulseData.ticket_briefings.map((briefing) => {
                    const isSelected = selectedTicketId === briefing.ticket_id;
                    const sentimentColors = {
                      urgent: "border-red-500/30 bg-red-500/5",
                      neutral: "border-blue-500/30 bg-blue-500/5",
                      positive: "border-emerald-500/30 bg-emerald-500/5",
                    };
                    const dotColors = {
                      urgent: "bg-red-500",
                      neutral: "bg-blue-500",
                      positive: "bg-emerald-500",
                    };
                    
                    return (
                      <div
                        key={briefing.ticket_id}
                        className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                          isSelected ? "ring-2 ring-primary" : ""
                        } ${sentimentColors[briefing.sentiment]}`}
                        onClick={() => handleExplainTicket(briefing.ticket_id)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 mb-1 min-w-0 flex-wrap">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${dotColors[briefing.sentiment]}`} />
                              <span className="font-semibold text-sm truncate max-w-[200px]">{briefing.title}</span>
                              <Badge variant="outline" className="text-[9px] shrink-0">{briefing.status.replace(/_/g, " ")}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {briefing.ai_summary}
                            </p>
                            {briefing.ai_action && (
                              <div className="flex items-center gap-2 text-xs text-primary font-medium">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span className="truncate">{briefing.ai_action}</span>
                              </div>
                            )}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExplainTicket(briefing.ticket_id);
                            }}
                          >
                            <Brain className="h-3 w-3 mr-1" />
                            Explain
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No tickets to analyze</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Other Tickets - Each ticket has an Explain button */}
          {otherTickets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Other Tickets
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {otherTickets.length} more
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Click "Explain" for AI-powered analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {otherTickets.map((ticket) => {
                      const isSelected = selectedTicketId === ticket.ticket_id;
                      const statusColor = 
                        ticket.status === "COMPLETED" ? "bg-emerald-500" :
                        ticket.status === "IN_PROGRESS" ? "bg-blue-500" :
                        ticket.status === "CANCELLED" ? "bg-red-500" :
                        ticket.status.includes("WAITING") ? "bg-amber-500" :
                        "bg-gray-400";
                      
                      return (
                        <div
                          key={ticket.ticket_id}
                          className={`p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50 ${
                            isSelected ? "ring-2 ring-primary bg-primary/5" : ""
                          }`}
                          onClick={() => handleExplainTicket(ticket.ticket_id)}
                        >
                          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${statusColor}`} />
                                <span className="font-medium text-sm truncate">{ticket.title}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px] h-4">
                                {ticket.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="h-7 px-3 text-xs bg-primary text-white hover:bg-primary/90"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExplainTicket(ticket.ticket_id);
                              }}
                            >
                              <Brain className="h-3 w-3 mr-1" />
                              Explain
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Right Column - Detailed Explanation */}
        <div className="space-y-6">
          {/* AI Explanation Panel */}
          <Card className="sticky top-6">
            <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-violet-500/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Explanation
              </CardTitle>
              <CardDescription>
                {selectedTicketId ? "Deep neural analysis by NOVA Intelligence" : "Select a ticket to analyze"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {!selectedTicketId ? (
                <div className="text-center py-12">
                  <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto mb-4">
                    <Search className="h-8 w-8 text-primary/50" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Click on any ticket to get a detailed AI explanation
                  </p>
                </div>
              ) : explainMutation.isPending ? (
                <AnalysisProgress step={analysisStep} />
              ) : explainMutation.data ? (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {/* Title & Status */}
                    <div className="p-3 rounded-xl bg-muted/30 border">
                      <h3 className="font-semibold mb-1">{explainMutation.data.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{explainMutation.data.status.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary" className="text-[9px]">{explainMutation.data.priority}</Badge>
                        <Badge 
                          variant="secondary" 
                          className={`text-[9px] ${
                            explainMutation.data.ai_confidence === "high" ? "bg-emerald-500/10 text-emerald-600" :
                            explainMutation.data.ai_confidence === "medium" ? "bg-amber-500/10 text-amber-600" :
                            "bg-red-500/10 text-red-600"
                          }`}
                        >
                          {explainMutation.data.ai_confidence} confidence
                        </Badge>
                      </div>
                      {explainMutation.data.workflow_name && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Workflow: {explainMutation.data.workflow_name}
                        </p>
                      )}
                    </div>
                    
                    {/* AI Summary */}
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">AI Deep Summary</span>
                      </div>
                      <p className="text-sm leading-relaxed">
                        {explainMutation.data.summary}
                      </p>
                    </div>
                    
                    {/* Current State with Step Detail */}
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="font-semibold text-sm text-blue-700 dark:text-blue-400">
                          Current State
                        </span>
                      </div>
                      <p className="text-sm mb-2">{explainMutation.data.current_state}</p>
                      
                      {/* Current Step Detail */}
                      {explainMutation.data.current_step_detail && (
                        <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px]">
                          <div className="flex items-center gap-1 mb-1">
                            <UserCheck className="h-3 w-3 text-blue-600" />
                            <span className="font-semibold">Current Step:</span>
                            <span>{explainMutation.data.current_step_detail.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Assigned to:</span>
                            <span className="font-medium">{explainMutation.data.current_step_detail.assignee || "Unassigned"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Pending Actions */}
                    {explainMutation.data.pending_actions && explainMutation.data.pending_actions.length > 0 && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="font-semibold text-sm text-red-700 dark:text-red-400">
                            Action Required
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {explainMutation.data.pending_actions.map((action, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                              <ChevronRight className="h-3 w-3" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Workflow Steps */}
                    {explainMutation.data.workflow_steps && explainMutation.data.workflow_steps.length > 0 && (
                      <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                        <div className="flex items-center gap-2 mb-3">
                          <Workflow className="h-4 w-4 text-indigo-500" />
                          <span className="font-semibold text-sm text-indigo-700 dark:text-indigo-400">
                            Workflow Progress ({explainMutation.data.workflow_steps.filter(s => s.state === "COMPLETED").length}/{explainMutation.data.workflow_steps.length})
                          </span>
                        </div>
                        <div className="space-y-2">
                          {explainMutation.data.workflow_steps.map((step, idx) => {
                            const stateColor = step.state === "COMPLETED" ? "bg-emerald-500" :
                              step.is_current ? "bg-blue-500 animate-pulse" :
                              step.state === "SKIPPED" ? "bg-gray-400" :
                              "bg-gray-300 dark:bg-gray-600";
                            
                            return (
                              <div 
                                key={idx} 
                                className={`p-2 rounded-lg ${step.is_current ? "bg-blue-500/10 border border-blue-500/30" : "bg-background/50"}`}
                              >
                                <div className="flex items-start gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full mt-1 ${stateColor}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-medium">{step.order}. {step.name}</span>
                                      {step.is_current && (
                                        <Badge className="text-[8px] h-3 bg-blue-500 text-white px-1">Current</Badge>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                      <span>{step.state.replace(/_/g, " ")}</span>
                                      {step.assignee && (
                                        <span className="flex items-center gap-0.5">
                                          <Users className="h-2.5 w-2.5" />
                                          {step.assignee}
                                        </span>
                                      )}
                                    </div>
                                    {step.ai_insight && (
                                      <p className="text-[9px] text-muted-foreground mt-1 flex items-start gap-1">
                                        <Brain className="h-2.5 w-2.5 text-primary shrink-0 mt-0.5" />
                                        {step.ai_insight}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Next Steps */}
                    {explainMutation.data.next_steps && explainMutation.data.next_steps.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                            Recommended Actions
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {explainMutation.data.next_steps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Timeline */}
                    {explainMutation.data.timeline_estimate && (
                      <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-violet-500" />
                          <span className="font-semibold text-sm text-violet-700 dark:text-violet-400">
                            Timeline
                          </span>
                        </div>
                        <p className="text-sm mt-1">{explainMutation.data.timeline_estimate}</p>
                      </div>
                    )}
                    
                    {/* Key Details */}
                    {Object.keys(explainMutation.data.key_details).length > 0 && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <span className="font-semibold text-sm">Key Details</span>
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          {Object.entries(explainMutation.data.key_details).map(([key, value]) => (
                            <div key={key} className="text-[10px]">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="ml-1 font-medium">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* View Ticket Link */}
                    <Button asChild className="w-full mt-4">
                      <Link href={`/tickets/${explainMutation.data.ticket_id}`}>
                        View Full Ticket
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </ScrollArea>
              ) : explainMutation.isError ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 mx-auto text-red-500 mb-3" />
                  <p className="text-sm text-muted-foreground">Failed to analyze ticket</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => selectedTicketId && explainMutation.mutate(selectedTicketId)}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
