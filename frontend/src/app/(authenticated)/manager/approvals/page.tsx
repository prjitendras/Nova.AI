/**
 * Manager Approvals Page
 * Pending approvals for manager/approver role
 */
"use client";

import { useRouter } from "next/navigation";
import { usePendingApprovals, useApprove, useReject, useSkip, useRequestInfo, useReassignApproval, usePreviousAgents, useAddNote, useAssignAgent } from "@/hooks/use-tickets";
import { apiClient } from "@/lib/api-client";
import { ActivityLog } from "@/components/activity-log";
import { StepAttachments } from "@/components/step-attachments";
import { UserSearchSelect } from "@/components/user-search-select";
import type { DirectoryUser } from "@/hooks/use-directory";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { SlaIndicator } from "@/components/sla-indicator";
import { NoApprovalsEmpty } from "@/components/empty-state";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, SkipForward, ExternalLink, MessageSquare, GitBranch, HelpCircle, Paperclip, Users, User, UserCheck, ArrowRightLeft, Loader2, RefreshCw, Clock } from "lucide-react";
import { FileUpload } from "@/components/file-upload";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { parseUTCDate } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export default function ApprovalsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = usePendingApprovals(user?.email || "", user?.aad_id || "");
  
  const approve = useApprove();
  const reject = useReject();
  const skip = useSkip();
  const requestInfo = useRequestInfo();
  const reassignApproval = useReassignApproval();
  const assignAgent = useAssignAgent();
  
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: "approve" | "reject" | "skip" | null;
    ticketId: string;
    stepId: string;
    ticketTitle: string;
    requesterName: string;
  }>({
    open: false,
    type: null,
    ticketId: "",
    stepId: "",
    ticketTitle: "",
    requesterName: "",
  });
  const [comment, setComment] = useState("");
  
  // Request Info Dialog State
  const [infoDialog, setInfoDialog] = useState<{
    open: boolean;
    ticketId: string;
    stepId: string;
    ticketTitle: string;
    requester: { email: string; display_name: string } | null;
    manager: { email: string; display_name: string } | null;
  }>({
    open: false,
    ticketId: "",
    stepId: "",
    ticketTitle: "",
    requester: null,
    manager: null,
  });
  const [infoSubject, setInfoSubject] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [infoAttachmentIds, setInfoAttachmentIds] = useState<string[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("requester");
  const [customRecipientEmail, setCustomRecipientEmail] = useState<string>("");
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>(""); // Tracks which specific card was clicked
  
  // Fetch previous agents when dialog is open
  const { data: previousAgents } = usePreviousAgents(infoDialog.ticketId);
  
  // Reassign Dialog State
  const [reassignDialog, setReassignDialog] = useState<{
    open: boolean;
    ticketId: string;
    stepId: string;
    ticketTitle: string;
  }>({
    open: false,
    ticketId: "",
    stepId: "",
    ticketTitle: "",
  });
  const [reassignReason, setReassignReason] = useState("");
  const [newApprover, setNewApprover] = useState<DirectoryUser | null>(null);

  // Post-Accept Assignment Dialog State
  const [postAcceptAssignDialog, setPostAcceptAssignDialog] = useState<{
    open: boolean;
    ticketId: string;
    ticketTitle: string;
    requesterName: string;
    tasksToAssign: Array<{
      stepId: string;
      stepName: string;
    }>;
    currentTaskIndex: number;
  }>({
    open: false,
    ticketId: "",
    ticketTitle: "",
    requesterName: "",
    tasksToAssign: [],
    currentTaskIndex: 0,
  });
  const [postAcceptAgent, setPostAcceptAgent] = useState<DirectoryUser | null>(null);
  const [isCheckingTasks, setIsCheckingTasks] = useState(false);

  const handleAction = async () => {
    if (!actionDialog.type) return;
    
    const isApproveAction = actionDialog.type === "approve";
    const mutationFn = isApproveAction 
      ? approve 
      : actionDialog.type === "reject" 
        ? reject 
        : skip;
    
    await mutationFn.mutateAsync({
      ticketId: actionDialog.ticketId,
      stepId: actionDialog.stepId,
      comment: comment || undefined,
    });
    
    const savedTicketId = actionDialog.ticketId;
    const savedTicketTitle = actionDialog.ticketTitle;
    const savedRequesterName = actionDialog.requesterName || "";
    
    setActionDialog({ ...actionDialog, open: false });
    setComment("");
    
    // After approval, check if there are unassigned task steps
    if (isApproveAction) {
      setIsCheckingTasks(true);
      try {
        // Fetch the updated ticket to check for active unassigned tasks
        const ticketData = await apiClient.get<{
          ticket: any;
          steps: any[];
        }>(`/tickets/${savedTicketId}`);
        
        // Find ACTIVE task steps that have no assigned agent
        const steps = ticketData.steps || [];
        const unassignedTasks = steps.filter((step: any) => 
          step.step_type === "TASK_STEP" &&
          (step.state === "ACTIVE" || step.state === "WAITING_FOR_ASSIGNMENT") &&
          !step.assigned_to
        );
        
        if (unassignedTasks.length > 0) {
          // Show assignment dialog for these tasks
          setPostAcceptAssignDialog({
            open: true,
            ticketId: savedTicketId,
            ticketTitle: savedTicketTitle,
            requesterName: savedRequesterName,
            tasksToAssign: unassignedTasks.map((task: any) => ({
              stepId: task.ticket_step_id,
              stepName: task.step_name,
            })),
            currentTaskIndex: 0,
          });
          setPostAcceptAgent(null);
        }
      } catch (error) {
        console.error("Failed to check for unassigned tasks:", error);
      } finally {
        setIsCheckingTasks(false);
      }
    }
    
    refetch();
  };

  const openActionDialog = (
    type: "approve" | "reject" | "skip",
    ticketId: string,
    stepId: string,
    ticketTitle: string,
    requesterName?: string
  ) => {
    setActionDialog({
      open: true,
      type,
      ticketId,
      stepId,
      ticketTitle,
      requesterName: requesterName || "",
    });
  };
  
  // Handle post-accept agent assignment
  const handlePostAcceptAssign = async () => {
    if (!postAcceptAgent) return;
    
    const currentTask = postAcceptAssignDialog.tasksToAssign[postAcceptAssignDialog.currentTaskIndex];
    if (!currentTask) return;
    
    try {
      await assignAgent.mutateAsync({
        ticketId: postAcceptAssignDialog.ticketId,
        stepId: currentTask.stepId,
        agentEmail: postAcceptAgent.email,
        agentAadId: postAcceptAgent.aad_id,
        agentDisplayName: postAcceptAgent.display_name,
      });
      
      // Check if there are more tasks to assign
      const nextIndex = postAcceptAssignDialog.currentTaskIndex + 1;
      if (nextIndex < postAcceptAssignDialog.tasksToAssign.length) {
        // Move to next task
        setPostAcceptAssignDialog({
          ...postAcceptAssignDialog,
          currentTaskIndex: nextIndex,
        });
        setPostAcceptAgent(null);
      } else {
        // All tasks assigned, close dialog without nudge
        // Note: useAssignAgent hook already shows "Agent assigned" toast
        closePostAcceptDialog(false);
      }
    } catch (error) {
      console.error("Failed to assign agent:", error);
    }
  };
  
  const closePostAcceptDialog = (showNudge: boolean = true) => {
    // Check if there are unassigned tasks remaining
    const remainingTasks = postAcceptAssignDialog.tasksToAssign.length - postAcceptAssignDialog.currentTaskIndex;
    
    if (showNudge && remainingTasks > 0) {
      toast.info(
        `${remainingTasks} task${remainingTasks > 1 ? 's' : ''} still need${remainingTasks === 1 ? 's' : ''} assignment`,
        {
          description: "You can assign agents later from Smart Assignments",
          action: {
            label: "Go to Smart Assignments",
            onClick: () => router.push("/manager/assignments"),
          },
          duration: 6000,
        }
      );
    }
    
    setPostAcceptAssignDialog({
      open: false,
      ticketId: "",
      ticketTitle: "",
      requesterName: "",
      tasksToAssign: [],
      currentTaskIndex: 0,
    });
    setPostAcceptAgent(null);
    refetch();
  };
  
  const skipCurrentTaskAssignment = () => {
    // Skip current task and move to next, or close if no more
    const currentTaskName = postAcceptAssignDialog.tasksToAssign[postAcceptAssignDialog.currentTaskIndex]?.stepName || "Task";
    const nextIndex = postAcceptAssignDialog.currentTaskIndex + 1;
    
    if (nextIndex < postAcceptAssignDialog.tasksToAssign.length) {
      toast.info(`Skipped: ${currentTaskName}`, {
        description: "You can assign this task later from Smart Assignments",
        duration: 3000,
      });
      setPostAcceptAssignDialog({
        ...postAcceptAssignDialog,
        currentTaskIndex: nextIndex,
      });
      setPostAcceptAgent(null);
    } else {
      closePostAcceptDialog();
    }
  };
  
  const openReassignDialog = (
    ticketId: string,
    stepId: string,
    ticketTitle: string
  ) => {
    setReassignDialog({
      open: true,
      ticketId,
      stepId,
      ticketTitle,
    });
    setNewApprover(null);
    setReassignReason("");
  };
  
  const handleReassign = async () => {
    if (!newApprover) return;
    
    await reassignApproval.mutateAsync({
      ticketId: reassignDialog.ticketId,
      stepId: reassignDialog.stepId,
      newApproverEmail: newApprover.email,
      newApproverAadId: newApprover.aad_id,
      newApproverDisplayName: newApprover.display_name,
      reason: reassignReason || undefined,
    });
    
    setReassignDialog({ ...reassignDialog, open: false });
    setNewApprover(null);
    setReassignReason("");
    refetch();
  };
  
  const openInfoDialog = (
    ticketId: string,
    stepId: string,
    ticketTitle: string,
    requester: { email: string; display_name: string } | null,
    manager: { email: string; display_name: string } | null
  ) => {
    setInfoDialog({
      open: true,
      ticketId,
      stepId,
      ticketTitle,
      requester,
      manager,
    });
    setSelectedRecipient("requester");
    setCustomRecipientEmail("");
    setSelectedAgentKey("");
  };
  
  const handleRequestInfo = async () => {
    if (!infoMessage.trim()) return;
    
    // Determine recipient email based on selection
    let recipientEmail: string | undefined;
    if (selectedRecipient === "requester" && infoDialog.requester) {
      recipientEmail = infoDialog.requester.email;
    } else if (selectedRecipient === "manager" && infoDialog.manager) {
      recipientEmail = infoDialog.manager.email;
    } else if (selectedRecipient === "agent" && customRecipientEmail) {
      recipientEmail = customRecipientEmail;
    }
    
    await requestInfo.mutateAsync({
      ticketId: infoDialog.ticketId,
      stepId: infoDialog.stepId,
      questionText: infoMessage.trim(),
      requestedFromEmail: recipientEmail,
      subject: infoSubject.trim() || undefined,
      attachmentIds: infoAttachmentIds.length > 0 ? infoAttachmentIds : undefined,
    });
    
    setInfoDialog({ ...infoDialog, open: false });
    setInfoSubject("");
    setInfoMessage("");
    setInfoAttachmentIds([]);
    setSelectedRecipient("requester");
    setCustomRecipientEmail("");
    setSelectedAgentKey("");
    refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Intelligent Approvals"
        description="Review and approve requests waiting for your action"
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
          message="Failed to load approvals"
          onRetry={() => refetch()}
        />
      ) : !data?.items.length ? (
        <NoApprovalsEmpty />
      ) : (
        <div className="space-y-4">
          {data.items.map(({ approval_task, ticket, step, has_open_info_request, open_info_request, is_waiting_for_cr, pending_cr_info }: any) => {
            // Only disable actions if THIS SPECIFIC STEP has an open info request
            const isWaitingForInfo = has_open_info_request === true;
            // Check if step is waiting for CR (workflow paused)
            const isWaitingForCR = is_waiting_for_cr === true || step?.state === "WAITING_FOR_CR";
            // Actions should be disabled for both info request and CR waiting
            const isActionsDisabled = isWaitingForInfo || isWaitingForCR;
            return (
            <Card 
              key={approval_task.approval_task_id} 
              className={`transition-colors ${
                isWaitingForCR
                  ? "border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 opacity-75"
                  : isWaitingForInfo 
                    ? "border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 opacity-75" 
                    : "hover:border-primary/50"
              }`}
            >
              {/* Change Request Pending Banner */}
              {isWaitingForCR && (
                <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-500 dark:from-purple-600 dark:to-violet-600 text-white rounded-t-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 relative">
                        <Clock className="h-5 w-5" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">Workflow Paused - Change Request Pending</p>
                        <p className="text-xs text-white/90">
                          {pending_cr_info?.change_request_id || "A change request"} is awaiting approval
                          {pending_cr_info?.requested_at && ` • ${formatDistanceToNow(parseUTCDate(pending_cr_info.requested_at), { addSuffix: true })}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-white/80">Actions Paused</p>
                      <p className="text-sm font-medium">Notes still enabled</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Info Request Pending Banner */}
              {isWaitingForInfo && !isWaitingForCR && (
                <div className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-600 dark:to-orange-600 text-white rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Waiting for Info Response
                    </span>
                    {open_info_request?.requested_from?.display_name && (
                      <span className="text-xs text-white/80">
                        from {open_info_request.requested_from.display_name}
                      </span>
                    )}
                    {open_info_request?.requested_at && (
                      <span className="text-xs text-white/80 ml-auto">
                        {formatDistanceToNow(parseUTCDate(open_info_request.requested_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <CardHeader className={`pb-2 ${isActionsDisabled ? "pt-3" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className={`text-base ${isActionsDisabled ? "text-muted-foreground" : ""}`}>
                        {ticket.workflow_name} - {ticket.ticket_id}
                      </CardTitle>
                      {/* Only show step-specific status, not ticket status which affects all steps */}
                      {isWaitingForCR ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500 text-white">
                          <Clock className="h-3 w-3" />
                          Waiting for CR
                        </span>
                      ) : has_open_info_request ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white">
                          <MessageSquare className="h-3 w-3" />
                          Info Requested
                        </span>
                      ) : (
                        <StatusBadge status={step?.state || ticket.status} size="sm" />
                      )}
                    </div>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{ticket.ticket_id}</span>
                      {" • "}
                      {ticket.workflow_name}
                      {step?.branch_name && (
                        <>
                          {" • "}
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            <GitBranch className="h-3 w-3" />
                            {step.branch_name}
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <SlaIndicator dueAt={ticket.due_at} size="sm" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Requested by</p>
                      <UserPill user={ticket.requester} size="sm" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Created</p>
                      <p className="text-sm">
                        {formatDistanceToNow(parseUTCDate(ticket.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Attachments Section - Separate from notes */}
                <StepAttachments
                  ticketId={ticket.ticket_id}
                  stepId={approval_task.ticket_step_id}
                  stepName={step?.step_name || "Approval"}
                  stepType="APPROVAL_STEP"
                  queryKey={['manager-approvals']}
                  canUpload={!isActionsDisabled}
                  defaultExpanded={false}
                />
                
                {/* Activity Log - Notes only */}
                <ActivityLog
                  ticketId={ticket.ticket_id}
                  stepId={approval_task.ticket_step_id}
                  notes={step?.data?.notes || []}
                  queryKey={['manager-approvals']}
                  title="Approval Notes"
                  defaultExpanded={false}
                />
                
                <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                  <Button
                    size="sm"
                    className={isActionsDisabled 
                      ? "bg-gray-400 hover:bg-gray-400 cursor-not-allowed" 
                      : "bg-emerald-600 hover:bg-emerald-700"
                    }
                    disabled={isActionsDisabled}
                    onClick={() =>
                      openActionDialog(
                        "approve",
                        ticket.ticket_id,
                        approval_task.ticket_step_id,
                        ticket.title,
                        ticket.requester?.display_name || ticket.requester?.email || "Unknown"
                      )
                    }
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isWaitingForCR ? "Paused for CR" : isWaitingForInfo ? "Waiting for Info" : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isActionsDisabled}
                    className={isActionsDisabled ? "opacity-50 cursor-not-allowed" : ""}
                    onClick={() =>
                      openActionDialog(
                        "reject",
                        ticket.ticket_id,
                        approval_task.ticket_step_id,
                        ticket.title,
                        ticket.requester?.display_name || ticket.requester?.email || "Unknown"
                      )
                    }
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isActionsDisabled}
                    className={`${isActionsDisabled ? "opacity-50 cursor-not-allowed" : "border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"}`}
                    onClick={() =>
                      openActionDialog(
                        "skip",
                        ticket.ticket_id,
                        approval_task.ticket_step_id,
                        ticket.title,
                        ticket.requester?.display_name || ticket.requester?.email || "Unknown"
                      )
                    }
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isActionsDisabled}
                    className={isActionsDisabled ? "opacity-50 cursor-not-allowed" : ""}
                    onClick={() =>
                      openInfoDialog(
                        ticket.ticket_id,
                        approval_task.ticket_step_id,
                        ticket.title,
                        ticket.requester ? { email: ticket.requester.email || "", display_name: ticket.requester.display_name || ticket.requester.email || "Requester" } : null,
                        ticket.manager ? { email: ticket.manager.email || "", display_name: ticket.manager.display_name || ticket.manager.email || "Manager" } : null
                      )
                    }
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Request Info
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isActionsDisabled}
                    className={isActionsDisabled ? "opacity-50 cursor-not-allowed" : ""}
                    onClick={() =>
                      openReassignDialog(
                        ticket.ticket_id,
                        approval_task.ticket_step_id,
                        ticket.title
                      )
                    }
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Reassign Agent
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/tickets/${ticket.ticket_id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {actionDialog.type === "approve" 
                ? "Accept Request" 
                : actionDialog.type === "reject" 
                  ? "Reject Request" 
                  : "Skip Request"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.type === "approve"
                ? "This will accept the request and move it to the next step."
                : actionDialog.type === "reject"
                  ? "This will reject the request. Please provide a reason."
                  : "This will skip the request. The workflow will end with SKIPPED status."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <p className="text-sm">
              <strong>Request:</strong> {actionDialog.ticketTitle}
            </p>
            <div className="space-y-2">
              <Label htmlFor="comment">
                Comment {(actionDialog.type === "reject" || actionDialog.type === "skip") ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="comment"
                placeholder="Add a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setActionDialog({ ...actionDialog, open: false })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={
                ((actionDialog.type === "reject" || actionDialog.type === "skip") && !comment.trim()) ||
                approve.isPending ||
                reject.isPending ||
                skip.isPending
              }
              className={
                actionDialog.type === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : actionDialog.type === "skip"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : ""
              }
              variant={actionDialog.type === "reject" ? "destructive" : "default"}
            >
              {actionDialog.type === "approve" ? "Accept" : actionDialog.type === "reject" ? "Reject" : "Skip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Request Info Dialog - Enhanced with attachments */}
      <Dialog
        open={infoDialog.open}
        onOpenChange={(open) => {
          setInfoDialog({ ...infoDialog, open });
          if (!open) {
            setInfoSubject("");
            setInfoMessage("");
            setInfoAttachmentIds([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              Request Additional Information
            </DialogTitle>
            <DialogDescription>
              Request more details from the requester before making a decision. 
              You can attach files like templates or reference documents.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Request Details */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm">
                <strong>Request:</strong> {infoDialog.ticketTitle}
              </p>
            </div>
            
            <Separator />
            
            {/* Recipient Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Send Request To <span className="text-destructive">*</span>
              </Label>
              <div className="grid gap-3">
                {/* Requester Option */}
                {infoDialog.requester && (
                  <div 
                    className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                      selectedRecipient === "requester" 
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedRecipient("requester");
                      setCustomRecipientEmail("");
                      setSelectedAgentKey("");
                    }}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRecipient === "requester" ? "border-blue-500" : "border-muted-foreground"
                    }`}>
                      {selectedRecipient === "requester" && (
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Requester</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {infoDialog.requester.display_name} ({infoDialog.requester.email})
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Manager Option */}
                {infoDialog.manager && infoDialog.manager.email !== infoDialog.requester?.email && (
                  <div 
                    className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                      selectedRecipient === "manager" 
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" 
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedRecipient("manager");
                      setCustomRecipientEmail("");
                    }}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRecipient === "manager" ? "border-purple-500" : "border-muted-foreground"
                    }`}>
                      {selectedRecipient === "manager" && (
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-purple-600" />
                        <span className="font-medium">Manager</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {infoDialog.manager.display_name} ({infoDialog.manager.email})
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Previous Agent Option */}
                <div 
                  className={`rounded-lg border p-4 transition-colors ${
                    selectedRecipient === "agent" 
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" 
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div 
                    className="flex items-center space-x-3 cursor-pointer"
                    onClick={() => setSelectedRecipient("agent")}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRecipient === "agent" ? "border-emerald-500" : "border-muted-foreground"
                    }`}>
                      {selectedRecipient === "agent" && (
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">Previous Agent / Other Participant</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Select from previous task agents or enter an email
                      </p>
                    </div>
                  </div>
                  
                  {selectedRecipient === "agent" && (
                    <div className="mt-3 pl-7 space-y-3">
                      {previousAgents && previousAgents.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground mb-2">
                            Select a participant:
                          </div>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto border rounded-md p-2">
                            {previousAgents.map((agent: any, index) => {
                              const stepName = agent.step_name || agent.last_step_name || "Unknown Step";
                              const stepType = agent.step_type || (agent.role === 'Approver' ? 'APPROVAL_STEP' : 'TASK_STEP');
                              const isApproval = stepType === 'APPROVAL_STEP' || agent.role === 'Approver';
                              const uniqueKey = `${agent.email}::${stepName}::${index}`;
                              const isSelected = selectedAgentKey === uniqueKey;
                              
                              return (
                                <div
                                  key={uniqueKey}
                                  onClick={() => {
                                    // Include step_name so backend knows the recipient's context
                                    setCustomRecipientEmail(`${agent.email}::${stepName}`);
                                    setSelectedAgentKey(uniqueKey);
                                  }}
                                  className={`p-3 rounded-md cursor-pointer transition-colors ${
                                    isSelected 
                                      ? 'bg-primary/10 border-2 border-primary' 
                                      : 'hover:bg-muted border border-border'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{agent.display_name}</span>
                                    <span 
                                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                        isApproval
                                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                      }`}
                                    >
                                      {isApproval ? 'Approval' : 'Task'}
                                    </span>
                                  </div>
                                  <div className="text-sm text-foreground/80 mt-1">
                                    📋 {stepName}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {agent.email}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="relative">
                        <Input
                          placeholder="Or enter email address..."
                          value={customRecipientEmail}
                          onChange={(e) => setCustomRecipientEmail(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="info-subject">
                Subject <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="info-subject"
                placeholder="e.g., Need clarification on budget details"
                value={infoSubject}
                onChange={(e) => setInfoSubject(e.target.value)}
              />
            </div>
            
            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="info-message">
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="info-message"
                placeholder="Please provide detailed information about what you need from the requester..."
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Be specific about what information you need and why.
              </p>
            </div>
            
            {/* Attachments */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Attachments <span className="text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Attach templates, forms, or reference documents for the requester
              </p>
              <FileUpload
                context="info_request"
                multiple={true}
                compact={true}
                onFilesChange={setInfoAttachmentIds}
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setInfoDialog({ ...infoDialog, open: false });
                setInfoSubject("");
                setInfoMessage("");
                setInfoAttachmentIds([]);
                setSelectedRecipient("requester");
                setCustomRecipientEmail("");
                setSelectedAgentKey("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestInfo}
              disabled={
                !infoMessage.trim() || 
                requestInfo.isPending ||
                (selectedRecipient === "agent" && !customRecipientEmail.trim())
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {requestInfo.isPending ? (
                <>
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Reassign Approval Dialog */}
      <Dialog
        open={reassignDialog.open}
        onOpenChange={(open) => setReassignDialog({ ...reassignDialog, open })}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Reassign Agent
            </DialogTitle>
            <DialogDescription>
              Transfer this approval to another person. They will become the new approver
              and handle all future actions on this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <p className="text-sm">
              <strong>Request:</strong> {reassignDialog.ticketTitle}
            </p>
            
            <div className="space-y-1">
              <UserSearchSelect
                value={newApprover}
                onChange={setNewApprover}
                label="New Approver *"
                placeholder="Search by name or email..."
                showManualEntry={true}
              />
              <p className="text-xs text-muted-foreground pl-1">
                💡 If the person is not onboarded, they will be automatically added to the system.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>
                Reason <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="Why are you reassigning this approval?"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setReassignDialog({ ...reassignDialog, open: false });
                setNewApprover(null);
                setReassignReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!newApprover || reassignApproval.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {reassignApproval.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reassigning...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Reassign Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Accept Assignment Dialog - Shows after approving if task needs agent */}
      <Dialog
        open={postAcceptAssignDialog.open}
        onOpenChange={(open) => {
          // Prevent closing while assignment is in progress
          if (!open && !assignAgent.isPending) {
            closePostAcceptDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Assign Agent for Task
            </DialogTitle>
            <DialogDescription>
              The request has been accepted. The next step requires an agent to be assigned.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Ticket Context */}
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  Request Accepted
                </span>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {postAcceptAssignDialog.ticketTitle}
              </p>
              {postAcceptAssignDialog.requesterName && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Requested by: {postAcceptAssignDialog.requesterName}
                </p>
              )}
            </div>
            
            {/* Task Info */}
            {postAcceptAssignDialog.tasksToAssign.length > 0 && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {postAcceptAssignDialog.tasksToAssign.length > 1 
                      ? `Task ${postAcceptAssignDialog.currentTaskIndex + 1} of ${postAcceptAssignDialog.tasksToAssign.length}`
                      : "Next Task"
                    }
                  </span>
                </div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  {postAcceptAssignDialog.tasksToAssign[postAcceptAssignDialog.currentTaskIndex]?.stepName || "Task"}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  This task needs an agent to be assigned
                </p>
              </div>
            )}
            
            {/* Agent Selection */}
            <div className="space-y-1">
              <UserSearchSelect
                value={postAcceptAgent}
                onChange={setPostAcceptAgent}
                label="Assign to Agent *"
                placeholder="Search by name or email..."
                showManualEntry={true}
              />
              <p className="text-xs text-muted-foreground pl-1">
                💡 The selected agent will be notified and can start working on this task.
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap flex-shrink-0 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => closePostAcceptDialog()}
              disabled={assignAgent.isPending}
              className="text-muted-foreground"
            >
              Assign Later
            </Button>
            {postAcceptAssignDialog.tasksToAssign.length > 1 && 
             postAcceptAssignDialog.currentTaskIndex < postAcceptAssignDialog.tasksToAssign.length - 1 && (
              <Button
                variant="outline"
                onClick={skipCurrentTaskAssignment}
                disabled={assignAgent.isPending}
              >
                Skip This Task
              </Button>
            )}
            <Button
              onClick={handlePostAcceptAssign}
              disabled={!postAcceptAgent || assignAgent.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {assignAgent.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Assign Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading indicator when checking for tasks */}
      {isCheckingTasks && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-xl flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm font-medium">Checking for tasks...</span>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

