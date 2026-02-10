/**
 * Admin Audit Log Page
 * Comprehensive view of all admin actions with beautiful formatting
 */
"use client";

import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { useAdminAuditLog } from "@/hooks/use-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Filter,
  Calendar,
  User,
  Shield,
  Activity,
  Mail,
  Crown,
  Palette,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  Settings,
  Eye,
  Check,
  X,
  ArrowRight,
  Clock,
  AlertCircle,
  Loader2,
  Bot,
  ArrowRightLeft,
} from "lucide-react";
import { parseUTCDate } from "@/lib/utils";

// ============================================================================
// Debounce Hook
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

// ============================================================================
// Action Configuration
// ============================================================================

const actionConfig: Record<string, { 
  icon: React.ElementType; 
  color: string; 
  bg: string;
  label: string;
  description?: string;
}> = {
  // Designer Access
  GRANT_DESIGNER_ACCESS: { 
    icon: Palette, 
    color: "text-emerald-600 dark:text-emerald-400", 
    bg: "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800",
    label: "Granted Designer Access",
    description: "Designer role was granted to a user"
  },
  REVOKE_DESIGNER_ACCESS: { 
    icon: Palette, 
    color: "text-red-600 dark:text-red-400", 
    bg: "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800",
    label: "Revoked Designer Access",
    description: "Designer role was revoked from a user"
  },
  // Manager Access
  GRANT_MANAGER_ACCESS: { 
    icon: Users, 
    color: "text-blue-600 dark:text-blue-400", 
    bg: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
    label: "Granted Manager Access",
    description: "Manager role was granted to a user"
  },
  REVOKE_MANAGER_ACCESS: { 
    icon: Users, 
    color: "text-orange-600 dark:text-orange-400", 
    bg: "bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800",
    label: "Revoked Manager Access",
    description: "Manager role was revoked from a user"
  },
  // Agent Access
  GRANT_AGENT_ACCESS: { 
    icon: UserCheck, 
    color: "text-teal-600 dark:text-teal-400", 
    bg: "bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800",
    label: "Granted Agent Access",
    description: "Agent role was granted to a user"
  },
  REVOKE_AGENT_ACCESS: { 
    icon: UserX, 
    color: "text-rose-600 dark:text-rose-400", 
    bg: "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800",
    label: "Revoked Agent Access",
    description: "Agent role was revoked from a user"
  },
  // Admin Access
  GRANT_ADMIN_ACCESS: { 
    icon: Shield, 
    color: "text-blue-600 dark:text-blue-400", 
    bg: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
    label: "Granted Admin Access",
    description: "Admin role was granted to a user"
  },
  REVOKE_ADMIN_ACCESS: { 
    icon: Shield, 
    color: "text-amber-600 dark:text-amber-400", 
    bg: "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800",
    label: "Revoked Admin Access",
    description: "Admin role was revoked from a user"
  },
  // User Access (Combined)
  UPDATE_USER_ACCESS: { 
    icon: Users, 
    color: "text-violet-600 dark:text-violet-400", 
    bg: "bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800",
    label: "Updated User Access",
    description: "User access permissions were modified"
  },
  UPDATE_SYSTEM_CONFIG: { 
    icon: Settings, 
    color: "text-purple-600 dark:text-purple-400", 
    bg: "bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800",
    label: "Updated System Config",
    description: "System configuration was changed"
  },
  UPDATE_EMAIL_TEMPLATE: { 
    icon: Mail, 
    color: "text-cyan-600 dark:text-cyan-400", 
    bg: "bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800",
    label: "Updated Email Template",
    description: "Email template was customized"
  },
  VIEW_AUDIT_LOG: { 
    icon: Eye, 
    color: "text-slate-500 dark:text-slate-400", 
    bg: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    label: "Viewed Audit Log",
    description: "Audit log was accessed"
  },
  RETRY_NOTIFICATION: { 
    icon: RefreshCw, 
    color: "text-indigo-600 dark:text-indigo-400", 
    bg: "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800",
    label: "Retried Notification",
    description: "Failed notification was retried"
  },
  SUPER_ADMIN_CREATED: { 
    icon: Crown, 
    color: "text-amber-500 dark:text-amber-400", 
    bg: "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800",
    label: "Super Admin Created",
    description: "Initial super admin was set up"
  },
  // Reassign Agent features
  AUTO_ONBOARD_MANAGER: { 
    icon: Bot, 
    color: "text-cyan-600 dark:text-cyan-400", 
    bg: "bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/50 dark:to-blue-950/50 border-cyan-200 dark:border-cyan-800",
    label: "Auto-Onboarded Manager",
    description: "User was auto-onboarded as Manager via Reassign Agent"
  },
  AUTO_ONBOARD_AGENT: { 
    icon: Bot, 
    color: "text-teal-600 dark:text-teal-400", 
    bg: "bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/50 border-teal-200 dark:border-teal-800",
    label: "Auto-Onboarded Agent",
    description: "User was auto-onboarded as Agent via Reassign Agent"
  },
  REASSIGN_APPROVAL: { 
    icon: ArrowRightLeft, 
    color: "text-blue-600 dark:text-blue-400", 
    bg: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
    label: "Reassigned Approval",
    description: "Approval was reassigned to another person"
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatDetailValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">Not set</span>;
  }
  
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <Check className="h-3.5 w-3.5" />
        Yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-slate-400">
        <X className="h-3.5 w-3.5" />
        No
      </span>
    );
  }
  
  if (typeof value === "object") {
    return (
      <div className="space-y-1 mt-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 capitalize">{formatKeyLabel(k)}:</span>
            <span className="text-slate-700 dark:text-slate-300">{formatDetailValue(k, v)}</span>
          </div>
        ))}
      </div>
    );
  }
  
  if (key === "template_key" || key === "templateKey") {
    return <Badge variant="secondary" className="font-mono text-xs">{String(value)}</Badge>;
  }
  
  if (key === "setup_type" || key === "setupType") {
    return <Badge variant="outline" className="text-xs">{String(value).replace(/_/g, " ")}</Badge>;
  }
  
  return <span className="text-slate-700 dark:text-slate-300">{String(value)}</span>;
}

function formatKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    designer: "Designer Access",
    manager: "Manager Access", 
    agent: "Agent Access",
    template_key: "Template",
    workflow_id: "Workflow ID",
    setup_type: "Setup Type",
    from_date: "From Date",
    to_date: "To Date",
    action: "Action",
    actor_email: "Actor",
    target_email: "Target",
    filters: "Applied Filters",
  };
  
  return labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function renderDetails(details: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return null;
  
  const filteredDetails = Object.entries(details).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      return Object.values(obj).some(v => v !== null && v !== undefined);
    }
    return true;
  });
  
  if (filteredDetails.length === 0) return null;
  
  const isAccessUpdate = details.hasOwnProperty("designer") || 
                         details.hasOwnProperty("manager") || 
                         details.hasOwnProperty("agent");
  
  if (isAccessUpdate) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {details.designer !== undefined && (
          <Badge 
            variant={details.designer ? "default" : "secondary"}
            className={details.designer 
              ? "bg-violet-100 text-violet-700 hover:bg-violet-100 border border-violet-200" 
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            }
          >
            <Palette className="h-3 w-3 mr-1" />
            Designer {details.designer ? "✓" : "✗"}
          </Badge>
        )}
        {details.manager !== undefined && (
          <Badge 
            variant={details.manager ? "default" : "secondary"}
            className={details.manager 
              ? "bg-blue-100 text-blue-700 hover:bg-blue-100 border border-blue-200" 
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            }
          >
            <Users className="h-3 w-3 mr-1" />
            Manager {details.manager ? "✓" : "✗"}
          </Badge>
        )}
        {details.agent !== undefined && (
          <Badge 
            variant={details.agent ? "default" : "secondary"}
            className={details.agent 
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200" 
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            }
          >
            <UserCheck className="h-3 w-3 mr-1" />
            Agent {details.agent ? "✓" : "✗"}
          </Badge>
        )}
      </div>
    );
  }
  
  if (details.filters && typeof details.filters === "object") {
    const filters = details.filters as Record<string, unknown>;
    const activeFilters = Object.entries(filters).filter(([, v]) => v !== null && v !== undefined);
    
    if (activeFilters.length === 0) {
      return (
        <div className="mt-2 text-xs text-slate-400 italic">
          No filters applied
        </div>
      );
    }
    
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {activeFilters.map(([key, value]) => (
          <Badge key={key} variant="outline" className="text-xs font-normal">
            {formatKeyLabel(key)}: {String(value)}
          </Badge>
        ))}
      </div>
    );
  }
  
  return (
    <div className="mt-3 grid gap-2 p-3 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
      {filteredDetails.map(([key, value]) => (
        <div key={key} className="flex items-start gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400 min-w-[100px] text-xs uppercase tracking-wide font-medium">
            {formatKeyLabel(key)}
          </span>
          <span className="text-slate-700 dark:text-slate-300">
            {formatDetailValue(key, value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 20;
const DEBOUNCE_DELAY = 400; // 400ms debounce for typing

// ============================================================================
// Main Component
// ============================================================================

export default function AuditLogPage() {
  // Raw input state (for immediate UI feedback)
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorInput, setActorInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [page, setPage] = useState(0);
  
  // Debounced values (for API calls)
  const debouncedActorInput = useDebounce(actorInput.trim(), DEBOUNCE_DELAY);
  const debouncedTargetInput = useDebounce(targetInput.trim(), DEBOUNCE_DELAY);
  
  // Show loading indicator when inputs are being debounced
  const isTyping = actorInput.trim() !== debouncedActorInput || 
                   targetInput.trim() !== debouncedTargetInput;

  // Build query params with debounced values
  const queryParams = useMemo(() => ({
    action: actionFilter === "all" ? undefined : actionFilter,
    actor_email: debouncedActorInput || undefined,
    target_email: debouncedTargetInput || undefined,
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  }), [actionFilter, debouncedActorInput, debouncedTargetInput, page]);

  const { 
    data: auditData, 
    isLoading, 
    isFetching,
    isError,
    error,
    refetch 
  } = useAdminAuditLog(queryParams);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedActorInput, debouncedTargetInput, actionFilter]);

  const events = auditData?.items || [];
  const totalPages = Math.ceil((auditData?.total || 0) / PAGE_SIZE);

  const handleClearFilters = () => {
    setActionFilter("all");
    setActorInput("");
    setTargetInput("");
    setPage(0);
  };

  const hasActiveFilters = actionFilter !== "all" || actorInput || targetInput;

  const getConfig = (action: string) => {
    return actionConfig[action] || { 
      icon: Activity, 
      color: "text-slate-600 dark:text-slate-400", 
      bg: "bg-slate-50 border-slate-200 dark:border-slate-700",
      label: action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
    };
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Complete history of all administrative actions
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 hover:bg-slate-50"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load audit log. Please try again."}
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card className="border shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Filter className="h-4 w-4 text-white" />
              </div>
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            {(isTyping || isFetching) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching...</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Action Type
              </Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="bg-white dark:bg-slate-800">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {Object.entries(actionConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Actor Email
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Filter by actor email..."
                  value={actorInput}
                  onChange={(e) => setActorInput(e.target.value)}
                  className="pl-9 pr-9 bg-white dark:bg-slate-800"
                />
                {actorInput && (
                  <button
                    type="button"
                    onClick={() => setActorInput("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Type at least 2 characters to search
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Target Email
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Filter by target email..."
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="pl-9 pr-9 bg-white dark:bg-slate-800"
                />
                {targetInput && (
                  <button
                    type="button"
                    onClick={() => setTargetInput("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Type at least 2 characters to search
              </p>
            </div>
            
            <div className="flex items-end">
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                onClick={handleClearFilters}
                className="w-full"
                disabled={!hasActiveFilters}
              >
                {hasActiveFilters ? (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </>
                ) : (
                  "No Filters Applied"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Events */}
      <Card className="border shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Activity Timeline</CardTitle>
                <CardDescription>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    `${auditData?.total || 0} total events`
                  )}
                </CardDescription>
              </div>
            </div>
            {hasActiveFilters && !isLoading && (
              <Badge variant="secondary" className="font-normal">
                Filtered results
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-4 border rounded-xl">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-64 mb-3" />
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No events found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {hasActiveFilters
                  ? "Try adjusting your filters to see more results"
                  : "Admin actions will appear here as they occur"}
              </p>
              {hasActiveFilters && (
                <Button 
                  variant="outline" 
                  onClick={handleClearFilters}
                  className="mt-4"
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-violet-200 via-slate-200 to-transparent" />
              
              {/* Loading overlay when fetching new data */}
              {isFetching && (
                <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 z-10 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-lg shadow-lg border dark:border-slate-700">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                    <span className="text-sm font-medium">Loading...</span>
                  </div>
                </div>
              )}
              
              <div className="space-y-1">
                {events.map((event) => {
                  const config = getConfig(event.action);
                  const Icon = config.icon;

                  return (
                    <div
                      key={event.audit_id}
                      className="relative flex items-start gap-4 p-4 ml-2 rounded-xl hover:bg-slate-50/80 transition-all duration-200 group"
                    >
                      {/* Icon with timeline dot */}
                      <div className="relative z-10">
                        <div className={`h-12 w-12 rounded-xl border-2 ${config.bg} flex items-center justify-center transition-transform group-hover:scale-105`}>
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 pt-1">
                        {/* Action title and target */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900 dark:text-white">
                            {config.label}
                          </h4>
                          {event.target_email && (
                            <>
                              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                              <Badge 
                                variant="secondary" 
                                className="font-normal bg-slate-100 dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              >
                                {event.target_display_name || event.target_email}
                              </Badge>
                            </>
                          )}
                        </div>
                        
                        {/* Actor */}
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>by</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {event.actor_display_name || event.actor_email}
                          </span>
                        </p>
                        
                        {/* Timestamp */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(parseUTCDate(event.timestamp), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(parseUTCDate(event.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        
                        {/* Details - beautifully formatted */}
                        {renderDetails(event.details)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                Showing page <span className="font-medium text-slate-900 dark:text-white">{page + 1}</span> of{" "}
                <span className="font-medium text-slate-900 dark:text-white">{totalPages}</span>
                {auditData?.total && (
                  <span className="ml-2">
                    ({Math.min((page + 1) * PAGE_SIZE, auditData.total)} of {auditData.total} events)
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage(page - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || isFetching}
                  onClick={() => setPage(page + 1)}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
