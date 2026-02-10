/**
 * Manager Handovers Page
 * Review and decide on handover requests from agents
 */
"use client";

import { useState } from "react";
import { usePendingHandovers, useDecideHandover } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { type DirectoryUser } from "@/hooks/use-directory";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge, StepTypeBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { UserSearchSelect } from "@/components/user-search-select";
import { ErrorState } from "@/components/error-state";
import { TicketCardSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  User,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { parseUTCDate } from "@/lib/utils";
import Link from "next/link";

interface DialogState {
  open: boolean;
  type: "approve" | "reject" | null;
  handoverRequestId: string;
  ticketId: string;
  stepId: string;
  agentName: string;
  suggestedEmail?: string;
}

const initialDialogState: DialogState = {
  open: false,
  type: null,
  handoverRequestId: "",
  ticketId: "",
  stepId: "",
  agentName: "",
};

export default function ManagerHandoversPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = usePendingHandovers(user?.email || "");
  const decideHandover = useDecideHandover();
  
  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [selectedAgent, setSelectedAgent] = useState<DirectoryUser | null>(null);
  const [comment, setComment] = useState("");

  const openDialog = (
    type: "approve" | "reject",
    handoverRequestId: string,
    ticketId: string,
    stepId: string,
    agentName: string,
    suggestedEmail?: string
  ) => {
    setDialog({
      open: true,
      type,
      handoverRequestId,
      ticketId,
      stepId,
      agentName,
      suggestedEmail,
    });
    // Pre-populate with suggested agent if available
    if (suggestedEmail) {
      setSelectedAgent({
        email: suggestedEmail,
        display_name: suggestedEmail.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      });
    } else {
      setSelectedAgent(null);
    }
    setComment("");
  };

  const closeDialog = () => {
    setDialog(initialDialogState);
    setSelectedAgent(null);
    setComment("");
  };

  const handleDecision = async () => {
    if (!dialog.type) return;
    
    await decideHandover.mutateAsync({
      ticketId: dialog.ticketId,
      stepId: dialog.stepId,
      handoverRequestId: dialog.handoverRequestId,
      approved: dialog.type === "approve",
      newAgentEmail: dialog.type === "approve" ? selectedAgent?.email : undefined,
      newAgentAadId: dialog.type === "approve" ? selectedAgent?.aad_id : undefined,
      newAgentDisplayName: dialog.type === "approve" ? selectedAgent?.display_name : undefined,
      comment: comment || undefined,
    });
    
    closeDialog();
    refetch();
  };

  const handovers = data?.items || [];

  return (
    <PageContainer>
      <PageHeader
        title="Agent Handoff"
        description="Review and decide on task handover requests from your team"
        breadcrumbs={[
          { label: "Manager", href: "/manager/dashboard" },
          { label: "Handovers" },
        ]}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/30">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            <span>
              {isFetching ? 'Updating...' : dataUpdatedAt ? `Updated ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}` : 'Auto-refresh'}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 px-1.5 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
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
          message="Failed to load handover requests"
          onRetry={() => refetch()}
        />
      ) : !handovers.length ? (
        <div className="text-center py-12">
          <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No pending handovers</h3>
          <p className="text-muted-foreground">
            Handover requests from your team will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {handovers.map(({ handover_request, ticket, step }: any) => (
            <Card key={handover_request.handover_request_id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{step?.step_name || "Task"}</CardTitle>
                      {step && <StepTypeBadge type={step.step_type} />}
                      <Badge variant="outline" className="text-purple-600 border-purple-300">
                        <ArrowRightLeft className="h-3 w-3 mr-1" />
                        Handover Pending
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
                {/* Handover reason */}
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">Reason for handover:</p>
                  <p className="text-sm">{handover_request.reason}</p>
                </div>

                {/* Agent notes if available */}
                {step?.data?.notes && step.data.notes.length > 0 && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-2 font-medium">Agent Notes ({step.data.notes.length})</p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {step.data.notes.map((note: any, idx: number) => (
                        <div key={idx} className="text-sm border-l-2 border-blue-300 pl-2">
                          <p>{note.content}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {note.actor?.display_name || 'Agent'} • {note.timestamp ? new Date(note.timestamp).toLocaleString() : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Requested by</p>
                    <UserPill user={handover_request.requested_by} size="sm" />
                  </div>
                  {handover_request.requested_to && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Suggested agent</p>
                      <UserPill user={handover_request.requested_to} size="sm" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Requested</p>
                    <p className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(parseUTCDate(handover_request.requested_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => openDialog(
                      "approve",
                      handover_request.handover_request_id,
                      ticket.ticket_id,
                      step?.ticket_step_id || "",
                      handover_request.requested_by.display_name,
                      handover_request.requested_to?.email
                    )}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openDialog(
                      "reject",
                      handover_request.handover_request_id,
                      ticket.ticket_id,
                      step?.ticket_step_id || "",
                      handover_request.requested_by.display_name
                    )}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
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

      {/* Decision Dialog */}
      <Dialog open={dialog.open} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {dialog.type === "approve" ? "Approve Handover" : "Reject Handover"}
            </DialogTitle>
            <DialogDescription>
              {dialog.type === "approve"
                ? `Approve ${dialog.agentName}'s request to hand over this task. Specify the new assignee.`
                : `Reject ${dialog.agentName}'s request. The task will remain with them.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {dialog.type === "approve" && (
              <UserSearchSelect
                value={selectedAgent}
                onChange={setSelectedAgent}
                label="New Agent *"
                placeholder="Search for agent by name or email..."
                showManualEntry={true}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Textarea
                id="comment"
                placeholder="Add a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleDecision}
              disabled={
                decideHandover.isPending ||
                (dialog.type === "approve" && !selectedAgent?.email)
              }
              variant={dialog.type === "reject" ? "destructive" : "default"}
              className={dialog.type === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {decideHandover.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : dialog.type === "approve" ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve & Reassign
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

