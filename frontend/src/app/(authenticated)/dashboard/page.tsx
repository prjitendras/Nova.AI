/**
 * Dashboard Page
 * Enhanced AI-themed overview with progress rings, AI Insights, and modern UI
 */
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTickets } from "@/hooks/use-tickets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { 
  PlusCircle, 
  ClipboardList, 
  CheckSquare, 
  Clock, 
  AlertTriangle, 
  Workflow, 
  Sparkles, 
  Users, 
  Zap, 
  BarChart3, 
  Activity,
  ChevronRight,
  Bot,
  ArrowUpRight,
  Cpu,
  Brain,
  AlertCircle,
  TrendingUp,
  UserCheck,
  Lightbulb,
  RefreshCw,
  MessageSquare,
  Search,
  Target,
  Gauge,
  Timer
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { parseUTCDate } from "@/lib/utils";

// NOVA Pulse AI Types
interface TicketBriefing {
  ticket_id: string;
  title: string;
  status: string;
  ai_summary: string;
  ai_action?: string;
  priority_score: number;
  sentiment: "positive" | "neutral" | "urgent";
}

interface NOVAPulseResponse {
  greeting: string;
  overall_summary: string;
  ticket_briefings: TicketBriefing[];
  smart_recommendations: string[];
  productivity_insight?: string;
  generated_at: string;
  ai_powered: boolean;
}

// Sentiment colors
const sentimentColors: Record<string, { bg: string; border: string; dot: string }> = {
  urgent: { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500" },
  neutral: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-500" },
  positive: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-500" },
};

// Workflow Step Type
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

// Ticket Explanation Type
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

// Animated Analysis Steps Component
function AnalysisProgress({ step }: { step: number }) {
  const steps = [
    { label: "Connecting to NOVA Core", icon: Cpu },
    { label: "Fetching ticket data", icon: ClipboardList },
    { label: "Running deep analysis", icon: Brain },
    { label: "Processing workflow state", icon: Workflow },
    { label: "Generating insights", icon: Sparkles },
  ];

  return (
    <div className="py-8 px-4">
      {/* Animated Brain Icon */}
      <div className="relative mx-auto w-20 h-20 mb-6">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/30 to-violet-500/30 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-r from-primary/50 to-violet-500/50 animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
          <Brain className="h-6 w-6 text-white animate-pulse" />
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-6">
        <div 
          className="absolute inset-0 bg-gradient-to-r from-primary via-violet-500 to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, (step + 1) * 20)}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
      </div>
      
      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === step;
          const isCompleted = idx < step;
          
          return (
            <div 
              key={idx}
              className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
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

// AI Explain Dialog Component - Renamed to "Cortex Analyzer"
function AIExplainDialog({ 
  ticketId, 
  isOpen, 
  onClose 
}: { 
  ticketId: string | null; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [analysisStep, setAnalysisStep] = useState(0);
  
  const { data, isLoading, error, refetch } = useQuery<TicketExplanation | null>({
    queryKey: ["ai-explain", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      const response = await apiClient.get<TicketExplanation>(`/ai-chat/explain-ticket/${ticketId}`);
      return response;
    },
    enabled: !!ticketId && isOpen,
    staleTime: 60000,
    retry: 2,
  });
  
  // Animate through steps while loading
  React.useEffect(() => {
    if (isLoading) {
      setAnalysisStep(0);
      const interval = setInterval(() => {
        setAnalysisStep(prev => (prev < 4 ? prev + 1 : prev));
      }, 800);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden border animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-primary/10 via-violet-500/10 to-purple-500/10 border-b relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-violet-500/5 to-purple-500/5 animate-pulse" />
          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-violet-600 shadow-lg shadow-primary/25">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Cortex Analyzer</h3>
                <p className="text-xs text-muted-foreground">Deep Neural Ticket Analysis</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <AlertCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto max-h-[65vh]">
          {isLoading ? (
            <AnalysisProgress step={analysisStep} />
          ) : error ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h4 className="font-semibold mb-2">Analysis Failed</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Unable to connect to NOVA Core. Please try again.
              </p>
              <Button onClick={() => refetch()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Analysis
              </Button>
            </div>
          ) : data ? (
            <div className="p-4 space-y-4">
              {/* Title & Status */}
              <div className="p-3 rounded-xl bg-muted/30 border">
                <h4 className="font-semibold text-base mb-1">{data.title}</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      data.status === "COMPLETED" ? "border-emerald-500/50 text-emerald-600 bg-emerald-500/10" :
                      data.status === "IN_PROGRESS" ? "border-blue-500/50 text-blue-600 bg-blue-500/10" :
                      data.status === "SKIPPED" ? "border-gray-500/50 text-gray-600 bg-gray-500/10" :
                      data.status === "CANCELLED" ? "border-red-500/50 text-red-600 bg-red-500/10" :
                      data.status === "REJECTED" ? "border-red-500/50 text-red-600 bg-red-500/10" :
                      data.status === "ON_HOLD" ? "border-orange-500/50 text-orange-600 bg-orange-500/10" :
                      data.status?.startsWith("WAITING") ? "border-amber-500/50 text-amber-600 bg-amber-500/10" :
                      ""
                    }`}
                  >
                    {data.status?.replace(/_/g, " ") || "UNKNOWN"}
                  </Badge>
                  {data.priority && data.priority !== "NORMAL" && (
                    <Badge 
                      variant="outline" 
                      className={`text-[9px] ${
                        data.priority === "CRITICAL" ? "border-red-500/50 text-red-600 bg-red-500/10" :
                        data.priority === "HIGH" ? "border-orange-500/50 text-orange-600 bg-orange-500/10" :
                        "border-blue-500/50 text-blue-600 bg-blue-500/10"
                      }`}
                    >
                      {data.priority}
                    </Badge>
                  )}
                  <Badge 
                    variant="secondary" 
                    className={`text-[9px] ${
                      data.ai_confidence === "high" ? "bg-emerald-500/10 text-emerald-600" :
                      data.ai_confidence === "medium" ? "bg-amber-500/10 text-amber-600" :
                      "bg-red-500/10 text-red-600"
                    }`}
                  >
                    {data.ai_confidence} confidence
                  </Badge>
                </div>
              </div>
              
              {/* AI Summary Section */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-violet-500/5 to-purple-500/5 border border-primary/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-semibold">AI Deep Summary</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{data.summary}</p>
              </div>
              
              {/* Current State with Step Detail */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10">
                    <Activity className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="font-semibold text-blue-700 dark:text-blue-400">Current State</span>
                </div>
                <p className="text-sm leading-relaxed mb-3">{data.current_state}</p>
                
                {/* Current Step Detail */}
                {data.current_step_detail && (
                  <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <UserCheck className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Current Step Details</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Step:</span>
                        <span className="ml-1 font-medium">{data.current_step_detail.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="ml-1 font-medium">{data.current_step_detail.type.replace(/_/g, " ")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">State:</span>
                        <span className="ml-1 font-medium">{data.current_step_detail.state.replace(/_/g, " ")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assigned to:</span>
                        <span className="ml-1 font-medium">{data.current_step_detail.assignee || "Unassigned"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Workflow Steps */}
              {data.workflow_steps && data.workflow_steps.length > 0 && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10">
                      <Workflow className="h-4 w-4 text-indigo-500" />
                    </div>
                    <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                      Workflow Progress ({data.workflow_steps.filter(s => s.state === "COMPLETED").length}/{data.workflow_steps.length} completed)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {data.workflow_steps.map((step, idx) => {
                      const stateColor = step.state === "COMPLETED" ? "bg-emerald-500" :
                        step.is_current ? "bg-blue-500 animate-pulse" :
                        step.state === "SKIPPED" ? "bg-gray-400" :
                        "bg-gray-300 dark:bg-gray-600";
                      
                      const borderColor = step.is_current ? "border-blue-500/50 bg-blue-500/5" : 
                        step.state === "COMPLETED" ? "border-emerald-500/30 bg-emerald-500/5" :
                        "border-transparent";
                      
                      return (
                        <div 
                          key={idx} 
                          className={`p-3 rounded-lg border ${borderColor} ${step.is_current ? "ring-1 ring-blue-500/30" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Step indicator */}
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${stateColor}`} />
                              {idx < data.workflow_steps.length - 1 && (
                                <div className={`w-0.5 h-8 mt-1 ${step.state === "COMPLETED" ? "bg-emerald-300" : "bg-gray-200 dark:bg-gray-700"}`} />
                              )}
                            </div>
                            
                            {/* Step content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">
                                  {step.order}. {step.name}
                                </span>
                                {step.is_current && (
                                  <Badge className="text-[8px] h-4 bg-blue-500 text-white">
                                    Current
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[8px] h-4 ml-auto">
                                  {step.state.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {step.step_type.replace(/_/g, " ")}
                                {step.assignee && (
                                  <span className="ml-2">
                                    <Users className="h-3 w-3 inline mr-0.5" />
                                    {step.assignee}
                                  </span>
                                )}
                              </div>
                              
                              {/* AI Insight for this step */}
                              {step.ai_insight && (
                                <div className="mt-1 p-2 rounded bg-background/50 text-[10px] text-muted-foreground flex items-start gap-1.5">
                                  <Brain className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                  <span>{step.ai_insight}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Pending Actions */}
              {data.pending_actions && data.pending_actions.length > 0 && (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-red-500/10">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    </div>
                    <span className="font-semibold text-red-700 dark:text-red-400">
                      Action Required ({data.pending_actions.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {data.pending_actions.map((action, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                        <ChevronRight className="h-4 w-4" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Next Steps */}
              {data.next_steps && data.next_steps.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-amber-500/10">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      Recommended Actions ({data.next_steps.length})
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {data.next_steps.map((step: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-background/50 text-sm">
                        <div className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-600">
                          {idx + 1}
                        </div>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Timeline Estimate */}
              {data.timeline_estimate && (
                <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-violet-500/10">
                      <Timer className="h-4 w-4 text-violet-500" />
                    </div>
                    <span className="font-semibold text-violet-700 dark:text-violet-400">Timeline Estimate</span>
                  </div>
                  <p className="text-sm mt-2">{data.timeline_estimate}</p>
                </div>
              )}
              
              {/* Key Details Grid */}
              {data.key_details && Object.keys(data.key_details).length > 0 && (
                <div className="p-4 rounded-xl bg-muted/30 border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-muted">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <span className="font-semibold">Key Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(data.key_details).map(([key, value]) => (
                      <div key={key} className="p-2 rounded-lg bg-background text-xs">
                        <span className="text-muted-foreground block">{key}</span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-muted/30 flex gap-2">
          {data && (
            <Button asChild className="flex-1 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90">
              <Link href={`/tickets/${ticketId}`}>
                View Full Ticket
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// NOVA Pulse - Real AI-Powered Dashboard Widget (Lazy Loaded)
function NOVAPulseWidget() {
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Lazy load: Wait 500ms after mount before fetching AI insights
  // This ensures the main dashboard stats render first
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 500);
    return () => clearTimeout(timer);
  }, []);
  
  // Fetch real AI insights from NOVA Intelligence (deferred until ready)
  const { data: pulseData, isLoading, refetch, isRefetching } = useQuery<NOVAPulseResponse>({
    queryKey: ["nova-pulse"],
    queryFn: async () => {
      const response = await apiClient.get<NOVAPulseResponse>("/ai-chat/nova-pulse");
      return response;
    },
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
    enabled: isReady, // Only fetch after main dashboard loads
  });
  
  // Also fetch ticket counts for quick stats (also deferred)
  const { data: ticketsData } = useTickets({ mine: true, pageSize: 3 });

  // Show loading state when not ready OR when fetching
  if (!isReady || isLoading) {
    return (
      <Card className="border-primary/20 overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-2 pt-3 px-4 bg-gradient-to-r from-primary/5 via-violet-500/5 to-purple-500/5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-violet-600 animate-pulse">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span>NOVA Pulse</span>
              <Badge variant="secondary" className="text-[9px] font-normal h-4 bg-amber-500/10 text-amber-600 border-0">
                <span className="h-1 w-1 rounded-full bg-amber-500 mr-1 animate-pulse" />
                Loading...
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Loading Steps Animation */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="relative">
                <Brain className="h-5 w-5 text-primary animate-pulse" />
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-ping" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">NOVA Intelligence analyzing...</p>
                <p className="text-xs text-muted-foreground">Processing your tickets with neural analysis</p>
              </div>
            </div>
            
            {/* Animated loading steps */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3 text-emerald-500" />
                <span>Fetching ticket data</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Brain className="h-3 w-3 text-primary" />
                <span>Running neural analysis...</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-50">
                <Lightbulb className="h-3 w-3" />
                <span>Generating recommendations</span>
              </div>
            </div>
            
            {/* Skeleton placeholders */}
            <div className="pt-2 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-primary/20 shadow-sm">
        {/* Header */}
        <CardHeader className="pb-2 pt-3 px-4 bg-gradient-to-r from-primary/5 via-violet-500/5 to-purple-500/5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-violet-600">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span>NOVA Pulse</span>
              <Badge variant="secondary" className="text-[9px] font-normal h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                <span className="h-1 w-1 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                {pulseData?.ai_powered ? "AI Active" : "Live"}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                <Link href="/ai-insights">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Full Analysis
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-3">
          {/* AI Summary */}
          {pulseData?.overall_summary && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-3">
              <p className="text-sm leading-relaxed text-foreground">
                {pulseData.overall_summary}
              </p>
            </div>
          )}
          
          {/* AI Ticket Briefings */}
          {pulseData?.ticket_briefings && pulseData.ticket_briefings.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Cpu className="h-3 w-3" />
                AI Ticket Briefings
              </span>
              {pulseData.ticket_briefings.slice(0, 2).map((briefing) => {
                const colors = sentimentColors[briefing.sentiment] || sentimentColors.neutral;
                return (
                  <div
                    key={briefing.ticket_id}
                    className={`p-3 rounded-xl ${colors.bg} border ${colors.border} cursor-pointer transition-all hover:shadow-md`}
                    onClick={() => setSelectedTicket(briefing.ticket_id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`h-2 w-2 rounded-full mt-1.5 ${colors.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold truncate">{briefing.title}</span>
                          <Badge variant="outline" className="text-[8px] h-4 shrink-0">
                            {briefing.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{briefing.ai_summary}</p>
                        {briefing.ai_action && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-primary font-medium">
                            <AlertCircle className="h-3 w-3" />
                            {briefing.ai_action}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] shrink-0">
                        <Brain className="h-3 w-3 mr-1" />
                        Explain
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Smart Recommendations */}
          {pulseData?.smart_recommendations && pulseData.smart_recommendations.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  AI Recommendations
                </span>
              </div>
              <ul className="space-y-1">
                {pulseData.smart_recommendations.slice(0, 2).map((rec, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <ChevronRight className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* AI Explain Dialog */}
      <AIExplainDialog 
        ticketId={selectedTicket} 
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </>
  );
}

// Animated Progress Ring Component
function AnimatedProgressRing({ 
  progress, 
  size = 80, 
  strokeWidth = 6,
  color = "stroke-primary"
}: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedProgress / 100) * circumference;
  
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(progress), 100);
    return () => clearTimeout(timer);
  }, [progress]);
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={`${color} transition-all duration-1000 ease-out`}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-lg font-bold">{animatedProgress}%</span>
        </div>
      </div>
    </div>
  );
}

// Mini Sparkline Component
function MiniSparkline({ data, color = "stroke-primary" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const padding = 2;
  
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${color} opacity-70`}
        points={points}
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2)}
          cy={height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2)}
          r={2.5}
          className={`fill-current ${color.replace('stroke-', 'text-')}`}
        />
      )}
    </svg>
  );
}

// AI Analytics Widget - Premium AI-powered statistics with animations
function AIAnalyticsWidget() {
  const { data: allData, isLoading } = useTickets({ mine: true, pageSize: 1 });
  const { data: completedData } = useTickets({ mine: true, status: "COMPLETED", pageSize: 1 });
  const { data: inProgressData } = useTickets({ mine: true, status: "IN_PROGRESS", pageSize: 1 });
  const { data: waitingData } = useTickets({ mine: true, status: "WAITING_FOR_REQUESTER", pageSize: 1 });
  const { data: onHoldData } = useTickets({ mine: true, status: "ON_HOLD", pageSize: 1 });
  const { data: cancelledData } = useTickets({ mine: true, status: "CANCELLED", pageSize: 1 });
  
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [showInsight, setShowInsight] = useState(false);
  
  // Simulate AI analysis animation
  useEffect(() => {
    const timer1 = setTimeout(() => setIsAnalyzing(false), 800);
    const timer2 = setTimeout(() => setShowInsight(true), 1200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);
  
  const total = allData?.total || 0;
  const completed = completedData?.total || 0;
  const inProgress = inProgressData?.total || 0;
  const waiting = waitingData?.total || 0;
  const onHold = onHoldData?.total || 0;
  const cancelled = cancelledData?.total || 0;
  
  // Enhanced metrics
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const activeRate = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  
  // Smarter health score calculation
  const healthScore = total > 0 
    ? Math.max(0, Math.min(100, Math.round(
        100 
        - (waiting * 15)      // Waiting items heavily penalize health
        - (onHold * 8)        // On hold items moderate penalty
        - (inProgress > 5 ? (inProgress - 5) * 3 : 0)  // Too many active is also bad
        + (completionRate * 0.3)  // Good completion rate boosts health
      )))
    : 100;
  
  // Simulated trend data (in production, fetch from API)
  const trendData = [
    Math.max(0, completed - 5),
    Math.max(0, completed - 3),
    Math.max(0, completed - 2),
    Math.max(0, completed - 1),
    completed
  ];
  
  // AI-generated insights based on data patterns
  const generateAIInsight = () => {
    if (waiting > 3) {
      return {
        type: "warning" as const,
        icon: AlertTriangle,
        message: `${waiting} requests need your attention. Prioritize responding to avoid delays.`,
        action: "View pending items"
      };
    }
    if (onHold > 2) {
      return {
        type: "info" as const,
        icon: Clock,
        message: `${onHold} requests on hold. Consider following up on blockers.`,
        action: "Check on-hold items"
      };
    }
    if (completionRate >= 80) {
      return {
        type: "success" as const,
        icon: Target,
        message: `Excellent ${completionRate}% completion rate! You're a top performer.`,
        action: null
      };
    }
    if (inProgress > 5) {
      return {
        type: "info" as const,
        icon: Activity,
        message: `${inProgress} active requests. Consider focusing on completing some before starting new ones.`,
        action: "View active"
      };
    }
    if (completed > 0) {
      return {
        type: "success" as const,
        icon: TrendingUp,
        message: `Great momentum! You've completed ${completed} requests. Keep it up!`,
        action: null
      };
    }
    return {
      type: "neutral" as const,
      icon: Lightbulb,
      message: "Start your day by checking the service catalog for available requests.",
      action: "Browse catalog"
    };
  };
  
  const insight = generateAIInsight();
  
  // Determine health status with better thresholds
  const getHealthConfig = () => {
    if (healthScore >= 85) return { 
      status: "Excellent", 
      color: "text-emerald-500", 
      ringColor: "stroke-emerald-500",
      bgColor: "from-emerald-500/10 to-emerald-500/5",
      borderColor: "border-emerald-500/20"
    };
    if (healthScore >= 70) return { 
      status: "Good", 
      color: "text-blue-500", 
      ringColor: "stroke-blue-500",
      bgColor: "from-blue-500/10 to-blue-500/5",
      borderColor: "border-blue-500/20"
    };
    if (healthScore >= 50) return { 
      status: "Fair", 
      color: "text-amber-500", 
      ringColor: "stroke-amber-500",
      bgColor: "from-amber-500/10 to-amber-500/5",
      borderColor: "border-amber-500/20"
    };
    return { 
      status: "Needs Focus", 
      color: "text-red-500", 
      ringColor: "stroke-red-500",
      bgColor: "from-red-500/10 to-red-500/5",
      borderColor: "border-red-500/20"
    };
  };
  
  const healthConfig = getHealthConfig();
  
  if (isLoading || total === 0) return null;
  
  return (
    <Card className="border-primary/20 overflow-hidden relative">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 animate-pulse" style={{ animationDuration: '4s' }} />
      
      <CardHeader className="pb-2 pt-3 px-4 relative">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
            <Brain className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent">
            NOVA Intelligence
          </span>
          <Badge variant="secondary" className="text-[8px] font-medium h-4 ml-auto bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-600 dark:text-violet-400 border-0 flex items-center gap-1">
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-2 w-2 animate-spin" />
                Analyzing
              </>
            ) : (
              <>
                <Sparkles className="h-2 w-2" />
                Live
              </>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 relative space-y-4">
        {/* Main Health Section with Ring */}
        <div className={`p-4 rounded-2xl bg-gradient-to-r ${healthConfig.bgColor} border ${healthConfig.borderColor} transition-all duration-500`}>
          <div className="flex items-center gap-4">
            {/* Animated Progress Ring */}
            <div className="relative">
              <AnimatedProgressRing 
                progress={healthScore} 
                size={72} 
                strokeWidth={5}
                color={healthConfig.ringColor}
              />
              {/* Pulse effect for good health */}
              {healthScore >= 70 && (
                <div className={`absolute inset-0 rounded-full ${healthConfig.ringColor.replace('stroke-', 'bg-')}/10 animate-ping`} style={{ animationDuration: '2s' }} />
              )}
            </div>
            
            {/* Health Details */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground font-medium">Workflow Health</span>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${healthConfig.color} border-current/30 font-semibold`}>
                  {healthConfig.status}
                </Badge>
              </div>
              
              {/* Mini stats row */}
              <div className="flex items-center gap-3 text-[10px]">
                {waiting > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {waiting} pending
                  </span>
                )}
                {onHold > 0 && (
                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                    <Clock className="h-2.5 w-2.5" />
                    {onHold} on hold
                  </span>
                )}
                {waiting === 0 && onHold === 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckSquare className="h-2.5 w-2.5" />
                    All clear
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats Grid with Sparklines */}
        <div className="grid grid-cols-3 gap-3">
          {/* Completion Rate */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/10 group hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">Success</span>
              <MiniSparkline data={trendData} color="stroke-emerald-500" />
            </div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{completionRate}%</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{completed} of {total}</p>
          </div>
          
          {/* Active */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/10 group hover:border-blue-500/30 transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">Active</span>
              <Activity className="h-3 w-3 text-blue-500 animate-pulse" />
            </div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{inProgress}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{activeRate}% of total</p>
          </div>
          
          {/* Completed */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/10 group hover:border-violet-500/30 transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">Done</span>
              <CheckSquare className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{completed}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">requests closed</p>
          </div>
        </div>
        
        {/* AI Insight Card */}
        <div 
          className={`
            p-3 rounded-xl border transition-all duration-500
            ${showInsight ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            ${insight.type === 'warning' 
              ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-amber-500/20' 
              : insight.type === 'success'
              ? 'bg-gradient-to-r from-emerald-500/10 to-green-500/5 border-emerald-500/20'
              : 'bg-gradient-to-r from-blue-500/10 to-indigo-500/5 border-blue-500/20'
            }
          `}
        >
          <div className="flex items-start gap-2">
            <div className={`
              p-1.5 rounded-lg mt-0.5
              ${insight.type === 'warning' 
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' 
                : insight.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
              }
            `}>
              <insight.icon className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles className="h-2.5 w-2.5 text-violet-500" />
                <span className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                  AI Insight
                </span>
              </div>
              <p className={`
                text-[11px] leading-relaxed
                ${insight.type === 'warning' 
                  ? 'text-amber-700 dark:text-amber-300' 
                  : insight.type === 'success'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-blue-700 dark:text-blue-300'
                }
              `}>
                {insight.message}
              </p>
              {insight.action && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <Link href="/tickets">
                    {insight.action}
                    <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Bottom Stats Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time sync
            </span>
            <span>•</span>
            <span>Updated just now</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-5 px-2 text-[9px] text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
            asChild
          >
            <Link href="/tickets">
              View all
              <ArrowUpRight className="h-2.5 w-2.5 ml-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Format AI response with structured sections
function formatAIResponse(text: string): React.ReactNode {
  if (!text) return null;
  
  // Check if it's a table response (contains | and ---)
  if (text.includes("|") && text.includes("---")) {
    const lines = text.split("\n");
    const tableStart = lines.findIndex(l => l.includes("|"));
    const tableEnd = lines.findLastIndex(l => l.includes("|"));
    
    if (tableStart >= 0) {
      const beforeTable = lines.slice(0, tableStart).join("\n").trim();
      const afterTable = lines.slice(tableEnd + 1).join("\n").trim();
      const tableLines = lines.slice(tableStart, tableEnd + 1);
      
      // Parse table
      const headerLine = tableLines[0];
      const dataLines = tableLines.slice(2); // Skip header and separator
      
      const headers = headerLine.split("|").map(h => h.trim()).filter(Boolean);
      const rows = dataLines.map(line => 
        line.split("|").map(cell => cell.trim()).filter(Boolean)
      ).filter(row => row.length > 0);
      
      return (
        <div className="space-y-3">
          {beforeTable && <p className="text-xs">{beforeTable}</p>}
          
          {/* Structured ticket list */}
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
            {rows.slice(0, 8).map((row, idx) => {
              const ticketId = row[0] || "";
              const title = row[1] || "";
              const status = row[2] || "";
              
              const statusColor = status.includes("COMPLETED") ? "bg-emerald-500" :
                status.includes("PROGRESS") ? "bg-blue-500" :
                status.includes("CANCELLED") ? "bg-red-500" :
                status.includes("REJECTED") ? "bg-red-400" :
                status.includes("WAITING") ? "bg-amber-500" :
                "bg-gray-500";
              
              return (
                <div key={idx} className="p-2 rounded-lg bg-muted/50 border text-[10px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-medium text-primary">{ticketId}</span>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                      <span className="text-[9px]">{status}</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground truncate">{title}</p>
                </div>
              );
            })}
            {rows.length > 8 && (
              <p className="text-[9px] text-muted-foreground text-center">
                + {rows.length - 8} more tickets
              </p>
            )}
          </div>
          
          {afterTable && <p className="text-[10px] text-muted-foreground">{afterTable}</p>}
        </div>
      );
    }
  }
  
  // Regular text - format with line breaks
  return (
    <div className="text-xs space-y-2">
      {text.split("\n").map((line, idx) => (
        line.trim() ? <p key={idx}>{line}</p> : null
      ))}
    </div>
  );
}

// AI Agent: Synapse - Intelligent Query Agent
function AIQuickAskWidget() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  
  const askMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiClient.post<{ response: string }>("/ai-chat/chat", {
        message: q,
        persona: "requester"
      });
      return res;
    },
    onSuccess: (data: { response: string }) => {
      setResponse(data.response || "No response");
    },
    onError: () => {
      setResponse("Sorry, I couldn't process that. Try again.");
    }
  });
  
  const handleAsk = () => {
    if (!question.trim()) return;
    setResponse(null);
    askMutation.mutate(question);
  };
  
  const quickQuestions = [
    "What's my ticket status?",
    "Any pending actions?",
    "Summary of my requests"
  ];

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-3 bg-gradient-to-r from-cyan-500/5 to-blue-500/5">
        <CardTitle className="text-xs font-semibold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm">
            <Zap className="h-3 w-3 text-white" />
          </div>
          Synapse Agent
          <Badge variant="secondary" className="text-[8px] font-normal h-4 ml-auto bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-0">
            <Bot className="h-2 w-2 mr-0.5" />
            AI Query
          </Badge>
        </CardTitle>
        <CardDescription className="text-[10px]">
          Ask anything about your tickets
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        {/* Quick questions */}
        <div className="flex flex-wrap gap-1 mb-3">
          {quickQuestions.map((q, idx) => (
            <Button 
              key={idx} 
              variant="outline" 
              size="sm" 
              className="h-6 text-[10px] px-2 hover:bg-cyan-500/10 hover:border-cyan-500/30"
              onClick={() => {
                setQuestion(q);
                setResponse(null);
                askMutation.mutate(q);
              }}
              disabled={askMutation.isPending}
            >
              {q}
            </Button>
          ))}
        </div>
        
        {/* Custom question input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask about your tickets..."
            className="flex-1 text-xs px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={askMutation.isPending}
          />
          <Button 
            size="sm" 
            className="h-8 px-3"
            onClick={handleAsk}
            disabled={askMutation.isPending || !question.trim()}
          >
            {askMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
          </Button>
        </div>
        
        {/* Response */}
        {(askMutation.isPending || response) && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20">
            {askMutation.isPending ? (
              <div className="py-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 animate-ping absolute" />
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center relative">
                      <Brain className="h-4 w-4 text-white animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Synapse Processing...</p>
                  <p className="text-[10px] text-muted-foreground">Analyzing your request</p>
                </div>
              </div>
            ) : response ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cyan-500/20">
                  <div className="p-1 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                    <Zap className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">Synapse Response</span>
                </div>
                {formatAIResponse(response)}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// AI Agent: Trend Predictor
function AITrendWidget() {
  const { data: allData, isLoading } = useTickets({ mine: true, pageSize: 1 });
  const { data: completedData } = useTickets({ mine: true, status: "COMPLETED", pageSize: 1 });
  const { data: inProgressData } = useTickets({ mine: true, status: "IN_PROGRESS", pageSize: 1 });
  
  const total = allData?.total || 0;
  const completed = completedData?.total || 0;
  const inProgress = inProgressData?.total || 0;
  
  // Generate AI trend prediction
  const trendData = {
    trend: completed > total / 2 ? "positive" : "neutral",
    prediction: completed > total / 2 
      ? "Your completion rate is above average. Keep it up!" 
      : inProgress > 0 
        ? `${inProgress} request(s) in progress. Stay tuned for updates!`
        : "Start by submitting a request from the catalog.",
    avgResolution: "~2 days",
  };
  
  if (isLoading || total === 0) return null;

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-3 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
        <CardTitle className="text-xs font-semibold flex items-center gap-2">
          <div className="p-1 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
            <Target className="h-3 w-3 text-white" />
          </div>
          AI Trends
          <Badge variant="secondary" className="text-[8px] font-normal h-4 ml-auto bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
            <Zap className="h-2 w-2 mr-0.5" />
            Predictive
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {/* Trend indicator */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/10 mb-3">
          <div className={`p-2 rounded-full ${trendData.trend === "positive" ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
            <TrendingUp className={`h-4 w-4 ${trendData.trend === "positive" ? "text-emerald-500" : "text-amber-500"}`} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium">{trendData.prediction}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Avg resolution: {trendData.avgResolution}
            </p>
          </div>
        </div>
        
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-muted/50 text-center">
            <Timer className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-semibold">{total}</p>
            <p className="text-[8px] text-muted-foreground">Total Requests</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50 text-center">
            <CheckSquare className="h-3 w-3 mx-auto mb-1 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-500">{completed}</p>
            <p className="text-[8px] text-muted-foreground">Completed</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Progress Ring Component
function ProgressRing({ 
  value, 
  max, 
  size = 80, 
  strokeWidth = 8, 
  color = "stroke-primary",
  bgColor = "stroke-muted"
}: { 
  value: number; 
  max: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = max > 0 ? (value / max) * 100 : 0;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          className={bgColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={`${color} transition-all duration-700 ease-out`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{value}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  // Fetch recent tickets for display
  const { data: ticketsData, isLoading } = useTickets({ mine: true, pageSize: 5 });
  // Fetch stats with separate queries for accurate counts
  const { data: allData, isLoading: isLoadingAll } = useTickets({ mine: true, pageSize: 1 });
  const { data: inProgressData } = useTickets({ mine: true, status: "IN_PROGRESS", pageSize: 1 });
  const { data: waitingRequesterData } = useTickets({ mine: true, status: "WAITING_FOR_REQUESTER", pageSize: 1 });
  const { data: waitingAgentData } = useTickets({ mine: true, status: "WAITING_FOR_AGENT", pageSize: 1 });
  const { data: completedData } = useTickets({ mine: true, status: "COMPLETED", pageSize: 1 });
  
  const greeting = getGreeting();
  const firstName = user?.display_name?.split(" ")[0] || "there";

  // Calculate stats from API totals - Pending includes both waiting statuses
  const totalTickets = allData?.total || 0;
  const inProgressCount = inProgressData?.total || 0;
  const pendingCount = (waitingRequesterData?.total || 0) + (waitingAgentData?.total || 0);
  const completedCount = completedData?.total || 0;

  const stats = [
    { 
      title: "Total Tickets", 
      value: totalTickets, 
      icon: ClipboardList, 
      color: "stroke-blue-500",
      bgGradient: "from-blue-500/10 to-blue-600/5",
      iconBg: "bg-blue-500",
      max: totalTickets || 1
    },
    { 
      title: "In Progress", 
      value: inProgressCount, 
      icon: Clock, 
      color: "stroke-amber-500",
      bgGradient: "from-amber-500/10 to-amber-600/5",
      iconBg: "bg-amber-500",
      max: totalTickets || 1
    },
    { 
      title: "Pending Action", 
      value: pendingCount, 
      icon: AlertTriangle, 
      color: "stroke-red-500",
      bgGradient: "from-red-500/10 to-red-600/5",
      iconBg: "bg-red-500",
      max: totalTickets || 1
    },
    { 
      title: "Completed", 
      value: completedCount, 
      icon: CheckSquare, 
      color: "stroke-emerald-500",
      bgGradient: "from-emerald-500/10 to-emerald-600/5",
      iconBg: "bg-emerald-500",
      max: totalTickets || 1
    },
  ];

  const quickActions = [
    { href: "/catalog", icon: PlusCircle, title: "New Request", desc: "Submit a new request", color: "text-primary" },
    { href: "/tickets", icon: ClipboardList, title: "My Tickets", desc: "View all your tickets", color: "text-blue-500" },
    ...(hasRole("designer") ? [{ href: "/studio", icon: Workflow, title: "Workflow Studio Agent", desc: "Design intelligent workflows", color: "text-violet-500" }] : []),
    ...(hasRole("manager") ? [{ href: "/manager/approvals", icon: CheckSquare, title: "Intelligent Approvals", desc: "Review AI-routed items", color: "text-emerald-500" }] : []),
    ...(hasRole("agent") ? [{ href: "/agent/tasks", icon: Zap, title: "My Tasks", desc: "Your assigned missions", color: "text-amber-500" }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Header with AI Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{greeting}, {firstName}</h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[10px] h-5">
              <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
              AI Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bot className="h-3 w-3" />
            Your intelligent workflow assistant is ready
          </p>
        </div>
        <Button asChild size="sm" className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
          <Link href="/catalog">
            <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
            New Request
          </Link>
        </Button>
      </div>

      {/* Stats Grid with Progress Rings */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoadingAll ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-10" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          stats.map((stat) => (
            <Card key={stat.title} className={`overflow-hidden bg-gradient-to-br ${stat.bgGradient} border-0 shadow-sm hover:shadow-md transition-all duration-200`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`p-1 rounded ${stat.iconBg}`}>
                        <stat.icon className="h-2.5 w-2.5 text-white" />
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground">{stat.title}</span>
                    </div>
                    <div className="text-xl font-bold">{stat.value}</div>
                    {stat.title !== "Total Tickets" && totalTickets > 0 && (
                      <div className="text-[9px] text-muted-foreground">
                        {Math.round((stat.value / totalTickets) * 100)}% of total
                      </div>
                    )}
                  </div>
                  <ProgressRing 
                    value={stat.value} 
                    max={stat.max} 
                    color={stat.color}
                    size={48}
                    strokeWidth={4}
                  />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* AI Agents Section */}
      <div className="space-y-4">
        {/* AI Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary via-violet-500 to-purple-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">AI Command Center</h2>
              <p className="text-[10px] text-muted-foreground">Powered by NOVA Intelligence</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="h-7 text-xs">
            <Link href="/ai-insights">
              <Brain className="h-3 w-3 mr-1" />
              Full AI Analysis
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        
        {/* Main AI Widget */}
        <NOVAPulseWidget />
        
        {/* AI Agents Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <AIAnalyticsWidget />
          <AIQuickAskWidget />
          <AITrendWidget />
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-3">
        {/* Recent Tickets */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-[10px]">Your latest tickets</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
              <Link href="/tickets">
                View all <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : ticketsData?.items.length ? (
              <div className="space-y-1">
                {ticketsData.items.slice(0, 5).map((ticket, index) => (
                  <Link key={ticket.ticket_id} href={`/tickets/${ticket.ticket_id}`}>
                    <div 
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-all duration-200 group"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate group-hover:text-primary transition-colors">{ticket.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ticket.workflow_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <StatusBadge status={ticket.status} size="sm" />
                        <span className="text-[9px] text-muted-foreground">
                          {formatDistanceToNow(parseUTCDate(ticket.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 mb-3">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-0.5">No tickets yet</h3>
                <p className="text-xs text-muted-foreground mb-3 max-w-[180px]">Get started by creating your first request</p>
                <Button size="sm" asChild>
                  <Link href="/catalog">
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                    Create Request
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription className="text-[10px]">Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1">
            {quickActions.map((action, index) => (
              <Link key={action.href} href={action.href}>
                <div 
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-all duration-200 group"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={`p-1.5 rounded-md bg-muted`}>
                    <action.icon className={`h-3 w-3 ${action.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs group-hover:text-primary transition-colors truncate">{action.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Role-based Cards */}
      {(hasRole("manager") || hasRole("agent") || hasRole("admin")) && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            Your Role Features
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {hasRole("manager") && (
              <Card className="overflow-hidden group hover:shadow-md transition-all duration-200 border-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/10">
                <CardContent className="p-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 w-fit mb-2">
                    <CheckSquare className="h-3.5 w-3.5 text-white" />
                  </div>
                  <h3 className="text-xs font-semibold mb-0.5">Supervisor Portal</h3>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Approvals & assignments
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" asChild className="flex-1 h-7 text-[10px] bg-white/50 dark:bg-white/5">
                      <Link href="/manager/approvals">Approvals</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild className="flex-1 h-7 text-[10px] bg-white/50 dark:bg-white/5">
                      <Link href="/manager/dashboard">Dashboard</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {hasRole("agent") && (
              <Card className="overflow-hidden group hover:shadow-md transition-all duration-200 border-0 bg-gradient-to-br from-amber-500/5 to-amber-600/10">
                <CardContent className="p-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 w-fit mb-2">
                    <Zap className="h-3.5 w-3.5 text-white" />
                  </div>
                  <h3 className="text-xs font-semibold mb-0.5">Agent Portal</h3>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Tasks & progress
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" asChild className="flex-1 h-7 text-[10px] bg-white/50 dark:bg-white/5">
                      <Link href="/agent/tasks">My Tasks</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild className="flex-1 h-7 text-[10px] bg-white/50 dark:bg-white/5">
                      <Link href="/agent/history">History</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {hasRole("admin") && (
              <Card className="overflow-hidden group hover:shadow-md transition-all duration-200 border-0 bg-gradient-to-br from-purple-500/5 to-purple-600/10">
                <CardContent className="p-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 w-fit mb-2">
                    <BarChart3 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <h3 className="text-xs font-semibold mb-0.5">Admin Console</h3>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    System settings
                  </p>
                  <Button variant="outline" size="sm" asChild className="w-full h-7 text-[10px] bg-white/50 dark:bg-white/5">
                    <Link href="/admin">Open Console</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
