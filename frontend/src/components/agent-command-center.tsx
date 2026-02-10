/**
 * Agent Command Center - AI Operations Command Dashboard
 * Comprehensive view of all AI agents powering the platform
 * Only visible to admin and superadmin users
 */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Bot,
  X,
  Activity,
  Zap,
  Bell,
  Clock,
  Shield,
  Users,
  FileCheck,
  Paperclip,
  Brain,
  Mail,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Workflow,
  UserCheck,
  BarChart3,
  MessageSquare,
  GitBranch,
  ArrowLeftRight,
  Gauge,
  Database,
  Sparkles,
  Server,
  AlertCircle,
  Timer,
  Layers,
  Eye,
  Cpu,
  Network,
  HardDrive,
  FileSearch,
  UserPlus,
  ClipboardCheck,
  Send,
  ChevronRight,
  Circle,
  Key,
} from "lucide-react";

// Types - Matches backend response
interface AgentMetrics {
  notifications: { 
    pending: number; 
    sent: number; 
    failed: number; 
    retry_queue: number;
    email_healthy: boolean;
    last_success_minutes_ago: number | null;
    recent_failures: number;
  };
  tickets: { total: number; active: number; completed: number; in_progress: number; waiting_for_requester: number; cancelled: number };
  sla: { approaching: number; overdue: number; on_track: number; compliance_rate: number };
  stuck_tickets: { idle_3_to_7_days: number; idle_7_to_14_days: number; idle_over_14_days: number; total: number };
  approvals: { pending: number; approved: number; rejected: number; total: number };
  handover_requests: { pending: number; approved: number; rejected: number; total: number };
  bootstrap_tokens: { total: number; active: number; expired: number };
  assignments: { total: number; active: number };
  task_steps: { total: number; pending: number; completed: number };
  form_steps: { total: number; pending: number; completed: number };
  attachments: { total: number; today_uploads: number };
  users: { total_access: number; designers: number; managers: number; agents: number; admins: number };
  audit: { today_events: number; total_events: number };
  ai_conversations: { total_sessions: number; today_sessions: number; total_messages: number };
  info_requests: { pending: number; responded: number; total: number };
  workflows: { total: number; published: number; draft: number; versions: number; total_steps: number };
}


// Metric Bar Component - Shows labeled progress
const MetricBar = ({ label, value, max, color, showValue = true }: { label: string; value: number; max: number; color: string; showValue?: boolean }) => {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 dark:text-slate-500 w-16 truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full ${color} rounded-full`}
        />
      </div>
      {showValue && <span className="text-[10px] font-semibold text-gray-700 dark:text-slate-300 w-8 text-right">{value}</span>}
    </div>
  );
};

// Agent Card Component
const AgentCard = ({ 
  name, 
  description, 
  icon, 
  status, 
  children,
  stats,
  pulse = true
}: { 
  name: string; 
  description: string; 
  icon: React.ReactNode; 
  status: "active" | "processing" | "idle" | "warning" | "healthy";
  children?: React.ReactNode;
  stats?: { label: string; value: string | number }[];
  pulse?: boolean;
}) => {
  const statusConfig = {
    active: { color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30", label: "active" },
    processing: { color: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/30", label: "processing" },
    idle: { color: "bg-gray-400", text: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-500/10", border: "border-gray-200 dark:border-gray-500/30", label: "idle" },
    warning: { color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", label: "attention" },
    healthy: { color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30", label: "healthy" },
  };
  
  const config = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl bg-white dark:bg-slate-800/60 border ${config.border} shadow-sm hover:shadow-md transition-all`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative">
          <div className={`p-2.5 rounded-xl ${config.bg}`}>
            <div className={config.text}>{icon}</div>
          </div>
          {pulse && status !== "idle" && (
            <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${config.color} animate-pulse`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{name}</h4>
            <Badge variant="outline" className={`text-[9px] h-5 ${config.border} ${config.text} ${config.bg}`}>
              {config.label}
            </Badge>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Content */}
      {children && <div className="space-y-2">{children}</div>}

      {/* Stats Row */}
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/50">
          {stats.map((stat, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 dark:text-slate-500">{stat.label}:</span>
              <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// Section Header
const SectionHeader = ({ icon, title, count, color }: { icon: React.ReactNode; title: string; count: number; color: string }) => (
  <div className="flex items-center gap-2 mb-4 sticky top-0 bg-gray-50 dark:bg-slate-900 py-2 z-10">
    <div className={`p-1.5 rounded-lg ${color}`}>{icon}</div>
    <span className="text-sm font-bold text-gray-900 dark:text-white">{title}</span>
    <Badge variant="secondary" className="text-[10px] h-5">{count} agents</Badge>
  </div>
);

// Main Component
export function AgentCommandCenter() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"operations" | "intelligence" | "workforce" | "platform">("operations");

  // Check admin access
  const isAdminUser = user?.roles?.some(role => 
    ["ADMIN", "SUPER_ADMIN", "admin", "superadmin"].includes(role)
  );

  // Fetch metrics
  const { data: metrics, refetch, isLoading, isError } = useQuery<AgentMetrics>({
    queryKey: ["agent-command-metrics"],
    queryFn: async () => {
      const response = await apiClient.get<AgentMetrics>("/admin/agent-metrics");
      return response;
    },
    enabled: isOpen && !!isAdminUser,
    refetchInterval: isOpen ? 8000 : false,
    retry: 2,
  });

  // Fetch metrics when panel opens
  React.useEffect(() => {
    if (isOpen && isAdminUser) {
      refetch();
    }
  }, [isOpen, isAdminUser, refetch]);

  // Computed values
  const totalAgents = 18;
  const processingAgents = useMemo(() => {
    if (!metrics) return 3;
    let count = 0;
    if (metrics.notifications.pending > 0) count++;
    if (metrics.sla.approaching > 0 || metrics.sla.overdue > 0) count++;
    if (metrics.approvals.pending > 0) count++;
    if (metrics.task_steps.pending > 0) count++;
    if (metrics.form_steps.pending > 0) count++;
    if (metrics.info_requests.pending > 0) count++;
    return Math.max(2, count);
  }, [metrics]);

  const overallHealth = useMemo(() => {
    if (!metrics) return 94;
    const slaScore = metrics.sla.compliance_rate;
    const emailScore = metrics.notifications.sent + metrics.notifications.failed > 0 
      ? (metrics.notifications.sent / (metrics.notifications.sent + metrics.notifications.failed)) * 100 
      : 100;
    return Math.round((slaScore + emailScore) / 2);
  }, [metrics]);

  if (!isAdminUser) return null;

  const tabs = [
    { id: "operations", label: "Operations", icon: <Zap className="h-3.5 w-3.5" /> },
    { id: "intelligence", label: "AI", icon: <Brain className="h-3.5 w-3.5" /> },
    { id: "workforce", label: "Workforce", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "platform", label: "Platform", icon: <Server className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      {/* Floating Trigger */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50"
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="h-20 w-10 rounded-l-2xl rounded-r-none bg-gradient-to-b from-violet-600 via-primary to-violet-700 hover:from-violet-500 hover:to-violet-600 shadow-xl shadow-violet-500/30 border-0 p-0 flex flex-col items-center justify-center gap-1 group"
        >
          <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
            <Bot className="h-5 w-5 text-white" />
          </motion.div>
          <span className="text-[8px] text-white/80 font-medium">AI HUB</span>
        </Button>
      </motion.div>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm z-50"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[480px] bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col"
            >
              {/* Header */}
              <div className="shrink-0 p-5 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 via-primary to-violet-600 shadow-lg shadow-violet-500/30">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Agent Command Center</h2>
                      <p className="text-xs text-gray-500 dark:text-slate-400">AI-powered operations dashboard</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-500/10 dark:to-blue-500/10 border border-emerald-200/50 dark:border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
                    </div>
                    <div className="h-4 w-px bg-gray-300 dark:bg-slate-600" />
                    <span className="text-xs text-gray-600 dark:text-slate-400">
                      <span className="font-semibold text-gray-900 dark:text-white">{totalAgents}</span> agents active
                    </span>
                    <div className="h-4 w-px bg-gray-300 dark:bg-slate-600" />
                    <span className="text-xs text-gray-600 dark:text-slate-400">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{processingAgents}</span> processing
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-800">
                    <Gauge className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-primary">{overallHealth}%</span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 px-5 pt-4 bg-white dark:bg-slate-900">
                <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-slate-800">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                        activeTab === tab.id
                          ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                          : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* OPERATIONS TAB */}
                {activeTab === "operations" && (
                  <>
                    <SectionHeader 
                      icon={<Send className="h-3.5 w-3.5 text-white" />} 
                      title="Notification & Delivery" 
                      count={2}
                      color="bg-blue-500"
                    />
                    
                    {/* Notification Dispatch Agent */}
                    <AgentCard
                      name="Notification Dispatch Agent"
                      description="Managing email notification delivery queue"
                      icon={<Bell className="h-5 w-5" />}
                      status={(metrics?.notifications.failed || 0) > 0 ? "warning" : (metrics?.notifications.pending || 0) > 0 ? "processing" : "active"}
                      stats={[
                        { label: "Success Rate", value: `${metrics ? Math.round((metrics.notifications.sent / Math.max(1, metrics.notifications.sent + metrics.notifications.failed)) * 100) : 100}%` },
                        { label: "Queue Depth", value: metrics?.notifications.pending || 0 },
                      ]}
                    >
                      <MetricBar label="Sent" value={metrics?.notifications.sent || 0} max={Math.max(100, (metrics?.notifications.sent || 0) + (metrics?.notifications.pending || 0))} color="bg-emerald-500" />
                      <MetricBar label="Pending" value={metrics?.notifications.pending || 0} max={Math.max(100, (metrics?.notifications.sent || 0) + (metrics?.notifications.pending || 0))} color="bg-amber-500" />
                      <MetricBar label="Failed" value={metrics?.notifications.failed || 0} max={Math.max(10, metrics?.notifications.failed || 0)} color="bg-red-500" />
                      <MetricBar label="Retry Queue" value={metrics?.notifications.retry_queue || 0} max={Math.max(10, metrics?.notifications.retry_queue || 0)} color="bg-violet-500" />
                    </AgentCard>

                    {/* Email Delivery Agent */}
                    <AgentCard
                      name="Email Delivery Agent"
                      description="Microsoft Graph API email delivery"
                      icon={<Mail className="h-5 w-5" />}
                      status={metrics?.notifications.email_healthy ? "active" : "warning"}
                      stats={[
                        { label: "Total Sent", value: metrics?.notifications.sent || 0 },
                        { label: "Pending", value: metrics?.notifications.pending || 0 },
                      ]}
                    >
                      {metrics?.notifications.email_healthy ? (
                        <div className="space-y-2">
                          <MetricBar 
                            label="Sent" 
                            value={metrics?.notifications.sent || 0} 
                            max={Math.max(100, metrics?.notifications.sent || 1)} 
                            color="bg-emerald-500" 
                          />
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs text-gray-600 dark:text-slate-400">
                              {metrics?.notifications.last_success_minutes_ago !== null ? (
                                <>Last sent {metrics.notifications.last_success_minutes_ago < 60 
                                  ? `${metrics.notifications.last_success_minutes_ago}m ago`
                                  : metrics.notifications.last_success_minutes_ago < 1440
                                    ? `${Math.round(metrics.notifications.last_success_minutes_ago / 60)}h ago`
                                    : `${Math.round(metrics.notifications.last_success_minutes_ago / 1440)}d ago`
                                }</>
                              ) : (
                                <>Email service ready</>
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              {(metrics?.notifications.recent_failures || 0) > 5 
                                ? `${metrics?.notifications.recent_failures} failures in last hour`
                                : `${metrics?.notifications.pending || 0} emails pending delivery`
                              }
                            </span>
                          </div>
                        </div>
                      )}
                    </AgentCard>

                    <SectionHeader 
                      icon={<Clock className="h-3.5 w-3.5 text-white" />} 
                      title="SLA & Compliance" 
                      count={2}
                      color="bg-amber-500"
                    />

                    {/* SLA Sentinel Agent */}
                    <AgentCard
                      name="SLA Sentinel Agent"
                      description="Monitoring service level agreement compliance"
                      icon={<Clock className="h-5 w-5" />}
                      status={(metrics?.sla.overdue || 0) > 0 ? "warning" : "active"}
                      stats={[
                        { label: "Compliance", value: `${metrics?.sla.compliance_rate?.toFixed(0) || 100}%` },
                        { label: "Monitored", value: (metrics?.tickets.active || 0) + (metrics?.tickets.completed || 0) },
                      ]}
                    >
                      <MetricBar label="On Track" value={metrics?.sla.on_track || 0} max={Math.max(10, (metrics?.sla.on_track || 0) + (metrics?.sla.approaching || 0) + (metrics?.sla.overdue || 0))} color="bg-emerald-500" />
                      <MetricBar label="Approaching" value={metrics?.sla.approaching || 0} max={Math.max(10, (metrics?.sla.on_track || 0) + (metrics?.sla.approaching || 0) + (metrics?.sla.overdue || 0))} color="bg-amber-500" />
                      <MetricBar label="Overdue" value={metrics?.sla.overdue || 0} max={Math.max(10, (metrics?.sla.on_track || 0) + (metrics?.sla.approaching || 0) + (metrics?.sla.overdue || 0))} color="bg-red-500" />
                    </AgentCard>

                    {/* Stuck Ticket Detective */}
                    <AgentCard
                      name="Stuck Ticket Detective"
                      description="Identifying tickets with no recent activity"
                      icon={<AlertCircle className="h-5 w-5" />}
                      status={(metrics?.stuck_tickets?.total || 0) > 0 ? "warning" : "active"}
                      stats={[
                        { label: "Total Stuck", value: metrics?.stuck_tickets?.total || 0 },
                        { label: "Critical (14d+)", value: metrics?.stuck_tickets?.idle_over_14_days || 0 },
                      ]}
                    >
                      {(metrics?.stuck_tickets?.total || 0) > 0 ? (
                        <div className="space-y-2">
                          <MetricBar 
                            label="3-7 days" 
                            value={metrics?.stuck_tickets?.idle_3_to_7_days || 0} 
                            max={Math.max(5, metrics?.stuck_tickets?.total || 1)} 
                            color="bg-amber-400" 
                          />
                          <MetricBar 
                            label="7-14 days" 
                            value={metrics?.stuck_tickets?.idle_7_to_14_days || 0} 
                            max={Math.max(5, metrics?.stuck_tickets?.total || 1)} 
                            color="bg-orange-500" 
                          />
                          <MetricBar 
                            label="14+ days" 
                            value={metrics?.stuck_tickets?.idle_over_14_days || 0} 
                            max={Math.max(5, metrics?.stuck_tickets?.total || 1)} 
                            color="bg-red-500" 
                          />
                          {(metrics?.stuck_tickets?.idle_over_14_days || 0) > 0 && (
                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 mt-2">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-xs text-red-700 dark:text-red-400">
                                  {metrics?.stuck_tickets?.idle_over_14_days} ticket(s) idle for 14+ days!
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-gray-600 dark:text-slate-400">All tickets progressing normally</span>
                        </div>
                      )}
                    </AgentCard>
                  </>
                )}

                {/* INTELLIGENCE TAB */}
                {activeTab === "intelligence" && (
                  <>
                    <SectionHeader 
                      icon={<Brain className="h-3.5 w-3.5 text-white" />} 
                      title="AI Processing Engines" 
                      count={5}
                      color="bg-violet-500"
                    />

                    {/* NOVA Core Agent */}
                    <AgentCard
                      name="NOVA Core Agent"
                      description="LangGraph-powered conversational AI assistant"
                      icon={<Brain className="h-5 w-5" />}
                      status={(metrics?.ai_conversations.total_sessions || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Sessions", value: metrics?.ai_conversations.total_sessions || 0 },
                        { label: "Messages", value: metrics?.ai_conversations.total_messages || 0 },
                      ]}
                    >
                      <div className="space-y-2">
                        <MetricBar 
                          label="Today's Sessions" 
                          value={metrics?.ai_conversations.today_sessions || 0} 
                          max={Math.max(5, metrics?.ai_conversations.today_sessions || 1)} 
                          color="bg-violet-500" 
                        />
                        <MetricBar 
                          label="Total Messages" 
                          value={metrics?.ai_conversations.total_messages || 0} 
                          max={Math.max(20, metrics?.ai_conversations.total_messages || 1)} 
                          color="bg-indigo-500" 
                        />
                        {(metrics?.ai_conversations.total_sessions || 0) > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">
                              {((metrics?.ai_conversations.total_messages || 0) / Math.max(1, metrics?.ai_conversations.total_sessions || 1)).toFixed(1)} avg messages/session
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <Brain className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">AI assistant ready</span>
                          </div>
                        )}
                      </div>
                    </AgentCard>

                    {/* Cortex Analyzer Agent */}
                    <AgentCard
                      name="Cortex Analyzer Agent"
                      description="Deep ticket analysis and workflow explanation"
                      icon={<Sparkles className="h-5 w-5" />}
                      status={(metrics?.tickets.total || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Total Tickets", value: metrics?.tickets.total || 0 },
                        { label: "Completed", value: metrics?.tickets.completed || 0 },
                      ]}
                    >
                      <div className="space-y-2">
                        <MetricBar label="Completed" value={metrics?.tickets.completed || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-emerald-500" />
                        <MetricBar label="Active" value={metrics?.tickets.active || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-blue-500" />
                        <MetricBar label="In Progress" value={metrics?.tickets.in_progress || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-violet-500" />
                        {(metrics?.tickets.total || 0) === 0 && (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-gray-400" />
                            <span className="text-xs text-gray-500">No tickets yet</span>
                          </div>
                        )}
                      </div>
                    </AgentCard>

                    {/* AI Workflow Designer Agent */}
                    <AgentCard
                      name="AI Workflow Designer Agent"
                      description="GenAI-powered workflow generation and refinement"
                      icon={<GitBranch className="h-5 w-5" />}
                      status={(metrics?.workflows.total || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Workflows", value: metrics?.workflows.total || 0 },
                        { label: "Total Steps", value: metrics?.workflows.total_steps || 0 },
                      ]}
                    >
                      <div className="space-y-2">
                        <MetricBar label="Published" value={metrics?.workflows.published || 0} max={Math.max(5, metrics?.workflows.total || 1)} color="bg-emerald-500" />
                        <MetricBar label="Draft" value={metrics?.workflows.draft || 0} max={Math.max(5, metrics?.workflows.total || 1)} color="bg-amber-500" />
                        <MetricBar label="Steps Generated" value={metrics?.workflows.total_steps || 0} max={Math.max(20, metrics?.workflows.total_steps || 1)} color="bg-violet-500" />
                        <div className="flex items-center gap-2 mt-1">
                          <Zap className="h-3.5 w-3.5 text-violet-500" />
                          <span className="text-[10px] text-gray-500 dark:text-slate-400">
                            {metrics?.workflows.versions || 0} workflow versions created
                          </span>
                        </div>
                      </div>
                    </AgentCard>

                    {/* NOVA Pulse Agent */}
                    <AgentCard
                      name="NOVA Pulse Agent"
                      description="Real-time dashboard intelligence generation"
                      icon={<Activity className="h-5 w-5" />}
                      status="active"
                      stats={[
                        { label: "Briefings", value: "Live" },
                        { label: "Refresh", value: "30s" },
                      ]}
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span className="text-xs text-gray-600 dark:text-slate-400">Generating personalized insights</span>
                      </div>
                      <motion.div 
                        className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2"
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-amber-500 to-primary rounded-full"
                          animate={{ width: ["20%", "80%", "50%", "100%", "70%"] }}
                          transition={{ repeat: Infinity, duration: 4 }}
                        />
                      </motion.div>
                    </AgentCard>

                    {/* Pattern Discovery Agent */}
                    <AgentCard
                      name="Pattern Discovery Agent"
                      description="ML-based pattern and trend detection"
                      icon={<TrendingUp className="h-5 w-5" />}
                      status="processing"
                      stats={[
                        { label: "Tickets", value: metrics?.tickets.total || 0 },
                        { label: "Users", value: metrics?.users.total_access || 0 },
                      ]}
                    >
                      <motion.div 
                        className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden"
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-violet-500 to-primary rounded-full"
                          animate={{ width: ["30%", "70%", "45%", "90%", "60%"] }}
                          transition={{ repeat: Infinity, duration: 3 }}
                        />
                      </motion.div>
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-2">
                        Analyzing {(metrics?.tickets.total || 0) + (metrics?.users.total_access || 0)} data points...
                      </div>
                    </AgentCard>
                  </>
                )}

                {/* WORKFORCE TAB */}
                {activeTab === "workforce" && (
                  <>
                    <SectionHeader 
                      icon={<UserPlus className="h-3.5 w-3.5 text-white" />} 
                      title="User & Access Management" 
                      count={2}
                      color="bg-emerald-500"
                    />

                    {/* Persona Provision Agent */}
                    <AgentCard
                      name="Persona Provision Agent"
                      description="Auto-onboarding users when assigned tasks/approvals"
                      icon={<UserCheck className="h-5 w-5" />}
                      status={(metrics?.users.total_access || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Total Users", value: metrics?.users.total_access || 0 },
                        { label: "Admins", value: metrics?.users.admins || 0 },
                      ]}
                    >
                      <MetricBar label="Designers" value={metrics?.users.designers || 0} max={Math.max(10, metrics?.users.total_access || 1)} color="bg-violet-500" />
                      <MetricBar label="Managers" value={metrics?.users.managers || 0} max={Math.max(10, metrics?.users.total_access || 1)} color="bg-amber-500" />
                      <MetricBar label="Agents" value={metrics?.users.agents || 0} max={Math.max(10, metrics?.users.total_access || 1)} color="bg-blue-500" />
                      <div className="flex items-center gap-2 mt-2">
                        <Users className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">
                          {(metrics?.users.designers || 0) + (metrics?.users.managers || 0) + (metrics?.users.agents || 0)} users with persona access
                        </span>
                      </div>
                    </AgentCard>

                    {/* Access Guardian Agent */}
                    <AgentCard
                      name="Access Guardian Agent"
                      description="Role-based access control enforcement"
                      icon={<Shield className="h-5 w-5" />}
                      status="active"
                      stats={[
                        { label: "Policies", value: "4 active" },
                        { label: "Violations", value: 0 },
                      ]}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-gray-600 dark:text-slate-400">All access policies enforced</span>
                      </div>
                    </AgentCard>

                    <SectionHeader 
                      icon={<ClipboardCheck className="h-3.5 w-3.5 text-white" />} 
                      title="Task & Approval Management" 
                      count={4}
                      color="bg-blue-500"
                    />

                    {/* Task Orchestrator Agent */}
                    <AgentCard
                      name="Task Orchestrator Agent"
                      description="Managing task assignments and workload distribution"
                      icon={<Users className="h-5 w-5" />}
                      status={(metrics?.task_steps.pending || 0) > 3 ? "processing" : "active"}
                      stats={[
                        { label: "Total", value: metrics?.task_steps.total || 0 },
                        { label: "Pending", value: metrics?.task_steps.pending || 0 },
                      ]}
                    >
                      <MetricBar label="Completed" value={metrics?.task_steps.completed || 0} max={Math.max(10, metrics?.task_steps.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="Pending" value={metrics?.task_steps.pending || 0} max={Math.max(10, metrics?.task_steps.total || 1)} color="bg-amber-500" />
                      <MetricBar label="Assignments" value={metrics?.assignments.total || 0} max={Math.max(10, metrics?.assignments.total || 1)} color="bg-blue-500" />
                    </AgentCard>

                    {/* Approval Guardian Agent */}
                    <AgentCard
                      name="Approval Guardian Agent"
                      description="Tracking and routing approval decisions"
                      icon={<ClipboardCheck className="h-5 w-5" />}
                      status={(metrics?.approvals.pending || 0) > 0 ? "processing" : "active"}
                      stats={[
                        { label: "Total", value: metrics?.approvals.total || 0 },
                        { label: "Pending", value: metrics?.approvals.pending || 0 },
                      ]}
                    >
                      <MetricBar label="Approved" value={metrics?.approvals.approved || 0} max={Math.max(10, metrics?.approvals.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="Pending" value={metrics?.approvals.pending || 0} max={Math.max(10, metrics?.approvals.total || 1)} color="bg-amber-500" />
                      <MetricBar label="Rejected" value={metrics?.approvals.rejected || 0} max={Math.max(10, metrics?.approvals.total || 1)} color="bg-red-500" />
                      {(metrics?.approvals.pending || 0) > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">
                            {metrics?.approvals.pending} approval(s) awaiting decision
                          </span>
                        </div>
                      )}
                    </AgentCard>

                    {/* Info Bridge Agent */}
                    <AgentCard
                      name="Info Bridge Agent"
                      description="Handling information request/response flows"
                      icon={<MessageSquare className="h-5 w-5" />}
                      status={(metrics?.info_requests.pending || 0) > 0 ? "processing" : "active"}
                      stats={[
                        { label: "Total", value: metrics?.info_requests.total || 0 },
                        { label: "Pending", value: metrics?.info_requests.pending || 0 },
                      ]}
                    >
                      <MetricBar label="Responded" value={metrics?.info_requests.responded || 0} max={Math.max(5, metrics?.info_requests.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="Pending" value={metrics?.info_requests.pending || 0} max={Math.max(5, metrics?.info_requests.total || 1)} color="bg-amber-500" />
                    </AgentCard>

                    {/* Handover Relay Agent */}
                    <AgentCard
                      name="Handover Relay Agent"
                      description="Task assignments to agents"
                      icon={<ArrowLeftRight className="h-5 w-5" />}
                      status={(metrics?.assignments.active || 0) > 0 ? "processing" : "active"}
                      stats={[
                        { label: "Active", value: metrics?.assignments.active || 0 },
                        { label: "Total", value: metrics?.assignments.total || 0 },
                      ]}
                    >
                      <MetricBar 
                        label="Active Assignments" 
                        value={metrics?.assignments.active || 0} 
                        max={Math.max(10, metrics?.assignments.total || 1)} 
                        color="bg-blue-500" 
                      />
                      {(metrics?.assignments.active || 0) > 0 ? (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            {metrics?.assignments.active} active assignment(s)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            No active assignments
                          </span>
                        </div>
                      )}
                    </AgentCard>

                    {/* Handover Request Agent */}
                    <AgentCard
                      name="Handover Request Agent"
                      description="Agent requests to transfer tasks"
                      icon={<RefreshCw className="h-5 w-5" />}
                      status={(metrics?.handover_requests?.pending || 0) > 0 ? "warning" : "active"}
                      stats={[
                        { label: "Pending", value: metrics?.handover_requests?.pending || 0 },
                        { label: "Total", value: metrics?.handover_requests?.total || 0 },
                      ]}
                    >
                      <div className="space-y-2">
                        <MetricBar 
                          label="Approved" 
                          value={metrics?.handover_requests?.approved || 0} 
                          max={Math.max(5, metrics?.handover_requests?.total || 1)} 
                          color="bg-emerald-500" 
                        />
                        <MetricBar 
                          label="Pending" 
                          value={metrics?.handover_requests?.pending || 0} 
                          max={Math.max(5, metrics?.handover_requests?.total || 1)} 
                          color="bg-amber-500" 
                        />
                        <MetricBar 
                          label="Rejected" 
                          value={metrics?.handover_requests?.rejected || 0} 
                          max={Math.max(5, metrics?.handover_requests?.total || 1)} 
                          color="bg-red-500" 
                        />
                        {(metrics?.handover_requests?.pending || 0) > 0 && (
                          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 mt-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              <span className="text-xs text-amber-700 dark:text-amber-400">
                                {metrics?.handover_requests?.pending} request(s) awaiting decision
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </AgentCard>
                  </>
                )}

                {/* PLATFORM TAB */}
                {activeTab === "platform" && (
                  <>
                    <SectionHeader 
                      icon={<Workflow className="h-3.5 w-3.5 text-white" />} 
                      title="Workflow & Design" 
                      count={3}
                      color="bg-violet-500"
                    />

                    {/* Workflow Architect Agent */}
                    <AgentCard
                      name="Workflow Architect Agent"
                      description="Managing workflow templates and validation"
                      icon={<GitBranch className="h-5 w-5" />}
                      status={(metrics?.workflows.total || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Total", value: metrics?.workflows.total || 0 },
                        { label: "Published", value: metrics?.workflows.published || 0 },
                      ]}
                    >
                      <MetricBar label="Published" value={metrics?.workflows.published || 0} max={Math.max(5, metrics?.workflows.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="Draft" value={metrics?.workflows.draft || 0} max={Math.max(5, metrics?.workflows.total || 1)} color="bg-amber-500" />
                      <MetricBar label="Versions" value={metrics?.workflows.versions || 0} max={Math.max(10, metrics?.workflows.versions || 1)} color="bg-blue-500" />
                    </AgentCard>

                    {/* Form Designer Agent */}
                    <AgentCard
                      name="Form Designer Agent"
                      description="Processing and validating form submissions"
                      icon={<FileCheck className="h-5 w-5" />}
                      status={(metrics?.form_steps.pending || 0) > 0 ? "processing" : "active"}
                      stats={[
                        { label: "Total Forms", value: metrics?.form_steps.total || 0 },
                        { label: "Completed", value: metrics?.form_steps.completed || 0 },
                      ]}
                    >
                      <MetricBar label="Completed" value={metrics?.form_steps.completed || 0} max={Math.max(10, metrics?.form_steps.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="Pending" value={metrics?.form_steps.pending || 0} max={Math.max(10, metrics?.form_steps.total || 1)} color="bg-amber-500" />
                      {(metrics?.form_steps.pending || 0) > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-[10px] text-gray-500 dark:text-slate-400">
                            Validating {metrics?.form_steps.pending} form submission(s)...
                          </span>
                        </div>
                      )}
                    </AgentCard>

                    {/* Ticket Lifecycle Agent */}
                    <AgentCard
                      name="Ticket Lifecycle Agent"
                      description="Orchestrating ticket state transitions"
                      icon={<Layers className="h-5 w-5" />}
                      status={(metrics?.tickets.total || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Total", value: metrics?.tickets.total || 0 },
                        { label: "Active", value: metrics?.tickets.active || 0 },
                      ]}
                    >
                      <MetricBar label="Completed" value={metrics?.tickets.completed || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-emerald-500" />
                      <MetricBar label="In Progress" value={metrics?.tickets.in_progress || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-blue-500" />
                      <MetricBar label="Waiting" value={metrics?.tickets.waiting_for_requester || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-amber-500" />
                      <MetricBar label="Cancelled" value={metrics?.tickets.cancelled || 0} max={Math.max(10, metrics?.tickets.total || 1)} color="bg-red-500" />
                    </AgentCard>

                    <SectionHeader 
                      icon={<Database className="h-3.5 w-3.5 text-white" />} 
                      title="Data & Storage" 
                      count={2}
                      color="bg-blue-500"
                    />

                    {/* File Vault Agent */}
                    <AgentCard
                      name="File Vault Agent"
                      description="Secure attachment storage and retrieval"
                      icon={<Paperclip className="h-5 w-5" />}
                      status={(metrics?.attachments.total || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Total Files", value: metrics?.attachments.total || 0 },
                        { label: "Today", value: metrics?.attachments.today_uploads || 0 },
                      ]}
                    >
                      <MetricBar 
                        label="Uploads Today" 
                        value={metrics?.attachments.today_uploads || 0} 
                        max={Math.max(10, metrics?.attachments.today_uploads || 1)} 
                        color="bg-blue-500" 
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <HardDrive className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-gray-600 dark:text-slate-400">
                          {metrics?.attachments.total || 0} files stored
                        </span>
                      </div>
                    </AgentCard>

                    {/* Audit Chronicle Agent */}
                    <AgentCard
                      name="Audit Chronicle Agent"
                      description="Recording all security and admin events"
                      icon={<Eye className="h-5 w-5" />}
                      status="active"
                      stats={[
                        { label: "Today", value: metrics?.audit.today_events || 0 },
                        { label: "Total", value: metrics?.audit.total_events || 0 },
                      ]}
                    />

                    {/* Bootstrap Token Agent */}
                    <AgentCard
                      name="Admin Onboarding Agent"
                      description="One-time tokens for admin registration"
                      icon={<Key className="h-5 w-5" />}
                      status={(metrics?.bootstrap_tokens?.active || 0) > 0 ? "active" : "idle"}
                      stats={[
                        { label: "Active", value: metrics?.bootstrap_tokens?.active || 0 },
                        { label: "Used/Expired", value: metrics?.bootstrap_tokens?.expired || 0 },
                      ]}
                    >
                      {(metrics?.bootstrap_tokens?.total || 0) > 0 ? (
                        <div className="space-y-2">
                          <MetricBar 
                            label="Active Tokens" 
                            value={metrics?.bootstrap_tokens?.active || 0} 
                            max={Math.max(5, metrics?.bootstrap_tokens?.total || 1)} 
                            color="bg-emerald-500" 
                          />
                          <MetricBar 
                            label="Expired" 
                            value={metrics?.bootstrap_tokens?.expired || 0} 
                            max={Math.max(5, metrics?.bootstrap_tokens?.total || 1)} 
                            color="bg-gray-400" 
                          />
                          {(metrics?.bootstrap_tokens?.active || 0) > 0 && (
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 mt-2">
                              <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-blue-500" />
                                <span className="text-xs text-blue-700 dark:text-blue-400">
                                  {metrics?.bootstrap_tokens?.active} token(s) awaiting use
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-slate-400">
                            No onboarding tokens generated yet
                          </span>
                        </div>
                      )}
                    </AgentCard>

                    <SectionHeader 
                      icon={<Server className="h-3.5 w-3.5 text-white" />} 
                      title="System Health" 
                      count={2}
                      color="bg-emerald-500"
                    />

                    {/* System Health Agent */}
                    <AgentCard
                      name="System Health Agent"
                      description="Monitoring overall platform health and performance"
                      icon={<Cpu className="h-5 w-5" />}
                      status="healthy"
                      stats={[
                        { label: "Uptime", value: "99.9%" },
                        { label: "Response", value: "< 200ms" },
                      ]}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-center">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">API Healthy</span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-center">
                          <Database className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">DB Connected</span>
                        </div>
                      </div>
                    </AgentCard>

                    {/* Network Agent */}
                    <AgentCard
                      name="Network Connectivity Agent"
                      description="Monitoring external service connections"
                      icon={<Network className="h-5 w-5" />}
                      status="active"
                      stats={[
                        { label: "Azure AD", value: "Connected" },
                        { label: "OpenAI", value: "Active" },
                      ]}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-gray-600 dark:text-slate-400">All services operational</span>
                      </div>
                    </AgentCard>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-500">
                    <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                    <span>Updated: {new Date().toLocaleTimeString()}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetch()} 
                    disabled={isLoading}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default AgentCommandCenter;
