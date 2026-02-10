/**
 * Manager Assignments Page
 * Unassigned tasks for manager to assign to agents
 * Includes AD user search for agent assignment
 */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUnassignedTasks, useAssignAgent } from "@/hooks/use-tickets";
import { useUserSearch, type DirectoryUser } from "@/hooks/use-directory";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { SlaIndicator } from "@/components/sla-indicator";
import { NoTasksEmpty } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TicketCardSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  UserPlus, 
  ExternalLink, 
  Search, 
  Users, 
  Loader2, 
  User,
  Building,
  Mail,
  Check,
  RefreshCw
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { parseUTCDate } from "@/lib/utils";
import Link from "next/link";

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isFetching: isRefreshing, dataUpdatedAt } = useUnassignedTasks(user?.email || "");
  
  const assignAgent = useAssignAgent();
  
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    ticketId: string;
    stepId: string;
    ticketTitle: string;
    stepName: string;
  }>({
    open: false,
    ticketId: "",
    stepId: "",
    ticketTitle: "",
    stepName: "",
  });
  
  // User search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null as DirectoryUser | null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Debounce search query by 300ms to prevent excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // AD User search hook - uses debounced query
  const { 
    data: searchResults, 
    isLoading: isSearching,
    isFetching 
  } = useUserSearch(debouncedSearchQuery, assignDialog.open && !selectedUser);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAssign = async () => {
    if (!selectedUser?.email) return;
    
    await assignAgent.mutateAsync({
      ticketId: assignDialog.ticketId,
      stepId: assignDialog.stepId,
      agentEmail: selectedUser.email,
      agentAadId: selectedUser.aad_id,
      agentDisplayName: selectedUser.display_name,
    });
    
    closeDialog();
    refetch();
  };

  const openAssignDialog = (
    ticketId: string,
    stepId: string,
    ticketTitle: string,
    stepName: string
  ) => {
    setAssignDialog({
      open: true,
      ticketId,
      stepId,
      ticketTitle,
      stepName,
    });
    setSearchQuery("");
    setSelectedUser(null);
    setShowResults(false);
  };

  const closeDialog = () => {
    setAssignDialog({ ...assignDialog, open: false });
    setSearchQuery("");
    setSelectedUser(null);
    setShowResults(false);
  };

  const selectUser = (user: DirectoryUser) => {
    setSelectedUser(user);
    setSearchQuery(user.display_name);
    setShowResults(false);
  };

  const clearSelection = () => {
    setSelectedUser(null);
    setSearchQuery("");
  };

  const tasks = data?.items || [];
  const users = (searchResults?.items || []) as DirectoryUser[];

  return (
    <PageContainer>
      <PageHeader
        title="Smart Assignments"
        description="Tasks waiting to be assigned to agents"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/30">
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>
              {isRefreshing ? 'Updating...' : dataUpdatedAt ? `Updated ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}` : 'Auto-refresh'}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 px-1.5 text-xs"
              onClick={() => refetch()}
              disabled={isRefreshing}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <TicketCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message="Failed to load unassigned tasks"
          onRetry={() => refetch()}
        />
      ) : !tasks.length ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">All tasks assigned</h3>
          <p className="text-muted-foreground">
            There are no tasks waiting for assignment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(({ step, ticket }: any) => (
            <Card key={step.ticket_step_id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{step.step_name}</CardTitle>
                      <StepTypeBadge type={step.step_type} />
                      <StatusBadge status={step.state} size="sm" />
                    </div>
                    <CardDescription>
                      <Link
                        href={`/tickets/${ticket.ticket_id}`}
                        className="hover:underline"
                      >
                        {ticket.workflow_name} - {ticket.ticket_id}
                      </Link>
                      {" • "}
                      <span className="font-mono text-xs">{ticket.ticket_id}</span>
                    </CardDescription>
                  </div>
                  <SlaIndicator dueAt={step.due_at} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Requester</p>
                    <UserPill user={ticket.requester} size="sm" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Workflow</p>
                    <p className="text-sm">{ticket.workflow_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Created</p>
                    <p className="text-sm">
                      {formatDistanceToNow(parseUTCDate(ticket.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() =>
                      openAssignDialog(
                        ticket.ticket_id,
                        step.ticket_step_id,
                        ticket.title,
                        step.step_name
                      )
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Agent
                  </Button>
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

      {/* Assign Dialog with AD User Search */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Assign Agent
            </DialogTitle>
            <DialogDescription>
              Search and select an agent from the directory to assign this task.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Task Info */}
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm font-medium">{assignDialog.ticketTitle}</p>
              <p className="text-xs text-muted-foreground">
                Task: {assignDialog.stepName}
              </p>
            </div>
            
            {/* AD User Search */}
            <div className="space-y-2">
              <Label htmlFor="agent-search">Search Employee (via AD)</Label>
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="agent-search"
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowResults(true);
                      if (selectedUser && e.target.value !== selectedUser.display_name) {
                        setSelectedUser(null);
                      }
                    }}
                    onFocus={() => setShowResults(true)}
                    className="pl-9 pr-9"
                    autoComplete="off"
                  />
                  {/* Show spinner when typing (pre-debounce) or when fetching */}
                  {((searchQuery.length >= 2 && searchQuery !== debouncedSearchQuery) || isFetching) && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                
                {/* Search Results Dropdown */}
                {showResults && searchQuery.length >= 2 && !selectedUser && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                    <ScrollArea className="max-h-64">
                      {users.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {(isFetching || searchQuery !== debouncedSearchQuery) ? "Searching..." : "No users found"}
                        </div>
                      ) : (
                        <div className="p-1">
                          {users.map((u: DirectoryUser) => (
                            <button
                              key={u.email}
                              type="button"
                              onClick={() => selectUser(u)}
                              className={`w-full flex items-start gap-3 p-2 rounded-sm hover:bg-accent transition-colors text-left ${
                                (selectedUser as DirectoryUser | null)?.email === u.email ? "bg-accent" : ""
                              }`}
                            >
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">
                                    {u.display_name}
                                  </p>
                                  {(selectedUser as DirectoryUser | null)?.email === u.email && (
                                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate">{u.email}</span>
                                </div>
                                {(u.job_title || u.department) && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Building className="h-3 w-3" />
                                    <span className="truncate">
                                      {[u.job_title, u.department].filter(Boolean).join(" • ")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Type at least 2 characters to search the directory
              </p>
            </div>
            
            {/* Selected User Display */}
            {selectedUser && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{selectedUser.display_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                  >
                    Change
                  </Button>
                </div>
                {(selectedUser.job_title || selectedUser.department) && (
                  <div className="mt-2 flex gap-2">
                    {selectedUser.job_title && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedUser.job_title}
                      </Badge>
                    )}
                    {selectedUser.department && (
                      <Badge variant="outline" className="text-xs">
                        {selectedUser.department}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Manual Email Entry (fallback) */}
            <div className="border-t pt-4">
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Can't find the user? Enter email manually
                </summary>
                <div className="mt-2">
                  <Input
                    type="email"
                    placeholder="agent@company.com"
                    value={selectedUser ? "" : searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedUser({
                        email: e.target.value,
                        display_name: e.target.value.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                      });
                      setShowResults(false);
                    }}
                  />
                </div>
              </details>
            </div>
          </div>
          
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedUser?.email || assignAgent.isPending}
            >
              {assignAgent.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign to {selectedUser?.display_name?.split(" ")[0] || "Agent"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
