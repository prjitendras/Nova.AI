/**
 * Ticket Hooks
 * React Query hooks for ticket operations
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
  Ticket,
  TicketDetail,
  ActionResponse,
  PaginatedResponse,
} from "@/lib/types";
import { toast } from "sonner";

// Query keys
export const ticketKeys = {
  all: ["tickets"] as const,
  lists: () => [...ticketKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...ticketKeys.lists(), filters] as const,
  details: () => [...ticketKeys.all, "detail"] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
  approvals: (email: string) => [...ticketKeys.all, "approvals", email] as const,
  assignments: (email: string) => [...ticketKeys.all, "assignments", email] as const,
  tasks: (email: string) => [...ticketKeys.all, "tasks", email] as const,
  assignedTasks: () => [...ticketKeys.all, "assignedTasks"] as const,
  handovers: (email: string) => [...ticketKeys.all, "handovers", email] as const,
  dashboard: (email: string) => [...ticketKeys.all, "dashboard", email] as const,
  agentDashboard: (email: string) => [...ticketKeys.all, "agent-dashboard", email] as const,
  agentInfoRequests: (email: string) => [...ticketKeys.all, "agent-info-requests", email] as const,
  agentHandovers: (email: string) => [...ticketKeys.all, "agent-handovers", email] as const,
};

/**
 * Fetch tickets list
 * Auto-refreshes every 30 seconds for real-time updates
 */
export function useTickets(params?: {
  mine?: boolean;
  status?: string;
  statuses?: string; // Comma-separated multiple statuses
  workflowId?: string;
  q?: string;
  dateFrom?: string;  // Format: "YYYY-MM-DD"
  dateTo?: string;    // Format: "YYYY-MM-DD"
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
  hasPendingCR?: boolean;
}) {
  return useQuery({
    queryKey: ticketKeys.list(params || {}),
    queryFn: async () => {
      // Pass dates in ISO format that FastAPI can parse
      // Format: YYYY-MM-DDTHH:MM:SS (without timezone, FastAPI treats as UTC)
      const dateFromISO = params?.dateFrom ? `${params.dateFrom}T00:00:00` : undefined;
      const dateToISO = params?.dateTo ? `${params.dateTo}T23:59:59` : undefined;
      
      const response = await apiClient.get<PaginatedResponse<Ticket>>("/tickets", {
        mine: params?.mine ?? true,
        status: params?.status,
        statuses: params?.statuses,
        workflow_id: params?.workflowId,
        q: params?.q,
        date_from: dateFromISO,
        date_to: dateToISO,
        sort_by: params?.sortBy,
        sort_order: params?.sortOrder,
        page: params?.page || 1,
        page_size: params?.pageSize || 20,
        has_pending_cr: params?.hasPendingCR,
      });
      return response;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Only when page is visible
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

/**
 * Fetch single ticket with details
 * Auto-refreshes every 15 seconds for real-time updates
 */
export function useTicket(ticketId: string, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ticketKeys.detail(ticketId),
    queryFn: async () => {
      const response = await apiClient.get<TicketDetail>(`/tickets/${ticketId}`);
      return response;
    },
    enabled: !!ticketId,
    refetchInterval: options?.refetchInterval ?? 15000, // Poll every 15 seconds by default
    staleTime: 5000, // Consider data fresh for 5 seconds
  });
}

/**
 * Fetch pending approvals
 */
export function usePendingApprovals(approverEmail: string, approverAadId: string = "", page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ticketKeys.approvals(approverEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ 
          approval_task: unknown; 
          ticket: Ticket; 
          step?: unknown;
          has_open_info_request?: boolean;
          open_info_request?: {
            info_request_id: string;
            requested_from?: { display_name?: string; email?: string };
            requested_at?: string;
            subject?: string;
          } | null;
        }>;
        page: number;
        page_size: number;
      }>("/tickets/manager/approvals", { page, page_size: pageSize, aad_id: approverAadId });
      return response;
    },
    enabled: !!approverEmail,
    refetchInterval: 15000, // Auto-refresh every 15 seconds for faster updates
    refetchIntervalInBackground: false, // Only when page is visible
    staleTime: 10000, // Consider data stale after 10 seconds
  });
}

/**
 * Fetch unassigned tasks (for manager)
 */
export function useUnassignedTasks(managerEmail: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ticketKeys.assignments(managerEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ step: unknown; ticket: Ticket }>;
        page: number;
        page_size: number;
      }>("/tickets/manager/assignments", { page, page_size: pageSize });
      return response;
    },
    enabled: !!managerEmail,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Only when page is visible
  });
}

/**
 * Fetch assigned tasks (for agent)
 */
export function useAssignedTasks(agentEmail: string, agentAadId: string = "", page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ticketKeys.tasks(agentEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ step: unknown; ticket: Ticket }>;
        page: number;
        page_size: number;
      }>("/tickets/agent/tasks", { page, page_size: pageSize, aad_id: agentAadId });
      return response;
    },
    enabled: !!agentEmail,
    refetchInterval: 15000, // Auto-refresh every 15 seconds for faster updates
    refetchIntervalInBackground: false, // Only when page is visible
    staleTime: 10000, // Consider data stale after 10 seconds
  });
}

/**
 * Create ticket mutation
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      workflow_id: string;
      title: string;
      description?: string;
      initial_form_values: Record<string, unknown>;
      attachment_ids?: string[];
      initial_form_step_ids?: string[];  // For wizard-style multi-form workflows
    }) => {
      const response = await apiClient.post<{ ticket_id: string }>("/tickets", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Ticket created successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to create ticket: ${error.message}`);
    },
  });
}

/**
 * Submit form mutation
 */
export function useSubmitForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      formValues,
      attachmentIds,
    }: {
      ticketId: string;
      stepId: string;
      formValues: Record<string, unknown>;
      attachmentIds?: string[];
    }) => {
      if (!ticketId || !stepId) {
        throw new Error("Missing required parameters: ticketId or stepId");
      }
      
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/submit-form`,
        { form_values: formValues, attachment_ids: attachmentIds || [] }
      );
      return response;
    },
    // Disable retries - form submission should not retry automatically
    retry: false,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
    },
  });
}

/**
 * Approve mutation
 */
export function useApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      comment,
    }: {
      ticketId: string;
      stepId: string;
      comment?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/approve`,
        { comment }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Approved successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

/**
 * Reject mutation
 */
export function useReject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      comment,
    }: {
      ticketId: string;
      stepId: string;
      comment?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/reject`,
        { comment }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Rejected");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

/**
 * Skip an approval (similar to reject but with SKIPPED status)
 */
export function useSkip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      comment,
    }: {
      ticketId: string;
      stepId: string;
      comment?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/skip`,
        { comment }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Skipped");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to skip: ${error.message}`);
    },
  });
}

/**
 * Reassign an approval to another person
 */
export function useReassignApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      newApproverEmail,
      newApproverAadId,
      newApproverDisplayName,
      reason,
    }: {
      ticketId: string;
      stepId: string;
      newApproverEmail: string;
      newApproverAadId?: string;
      newApproverDisplayName?: string;
      reason?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/reassign-approval`,
        {
          new_approver_email: newApproverEmail,
          new_approver_aad_id: newApproverAadId,
          new_approver_display_name: newApproverDisplayName,
          reason,
        }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ticketKeys.approvals("") });
      toast.success("Approval reassigned successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to reassign: ${error.message}`);
    },
  });
}

/**
 * Complete task mutation
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      executionNotes,
      outputValues,
      attachmentIds,
    }: {
      ticketId: string;
      stepId: string;
      executionNotes?: string;
      outputValues?: Record<string, unknown>;
      attachmentIds?: string[];
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/complete`,
        {
          execution_notes: executionNotes,
          output_values: outputValues || {},
          attachment_ids: attachmentIds || [],
        }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Task completed");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to complete task: ${error.message}`);
    },
  });
}

/**
 * Add note to task mutation
 */
export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      content,
      attachmentIds,
    }: {
      ticketId: string;
      stepId: string;
      content: string;
      attachmentIds?: string[];
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/add-note`,
        { content, attachment_ids: attachmentIds || [] }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["attachments", variables.ticketId] });
      toast.success("Note added");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });
}

/**
 * Add requester note to ticket mutation (ticket-level note from requester)
 */
export function useAddRequesterNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      content,
      attachmentIds,
    }: {
      ticketId: string;
      content: string;
      attachmentIds?: string[];
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/add-requester-note`,
        { content, attachment_ids: attachmentIds || [] }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["attachments", variables.ticketId] });
      toast.success("Note added successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });
}

/**
 * Request info mutation
 */
export function useRequestInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      questionText,
      requestedFromEmail,
      subject,
      attachmentIds,
    }: {
      ticketId: string;
      stepId: string;
      questionText: string;
      requestedFromEmail?: string;
      subject?: string;
      attachmentIds?: string[];
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/request-info`,
        { 
          question_text: questionText,
          requested_from_email: requestedFromEmail,
          subject: subject,
          attachment_ids: attachmentIds || [],
        }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      toast.success("Information requested");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to request info: ${error.message}`);
    },
  });
}

/**
 * Get previous agents who worked on a ticket
 */
export function usePreviousAgents(ticketId: string) {
  return useQuery({
    queryKey: ["tickets", ticketId, "previous-agents"],
    queryFn: async () => {
      const response = await apiClient.get<Array<{
        email: string;
        aad_id?: string;
        display_name: string;
        last_step_name: string;
        completed_at?: string;
      }>>(`/tickets/${ticketId}/previous-agents`);
      return response;
    },
    enabled: !!ticketId,
  });
}

/**
 * Get info requests directed to the current user
 */
export function useMyInfoRequests() {
  return useQuery({
    queryKey: ["tickets", "my-info-requests"],
    queryFn: async () => {
      const response = await apiClient.get<Array<{
        info_request_id: string;
        ticket_id: string;
        ticket_title: string;
        ticket_step_id: string;
        subject?: string;
        question_text: string;
        requested_by: {
          email: string;
          display_name: string;
        };
        requested_from: {
          email: string;
          display_name: string;
        };
        requested_at: string;
        status: string;
        request_attachment_ids: string[];
      }>>(`/tickets/my-info-requests`);
      return response;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

/**
 * Respond to info request mutation
 */
export function useRespondInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      responseText,
      attachmentIds,
    }: {
      ticketId: string;
      stepId: string;
      responseText: string;
      attachmentIds?: string[];
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/respond-info`,
        { response_text: responseText, attachment_ids: attachmentIds || [] }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      toast.success("Response submitted");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to respond: ${error.message}`);
    },
  });
}

/**
 * Assign agent mutation
 */
export function useAssignAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      agentEmail,
      agentAadId,
      agentDisplayName,
    }: {
      ticketId: string;
      stepId: string;
      agentEmail: string;
      agentAadId?: string;
      agentDisplayName?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/assign`,
        { 
          agent_email: agentEmail,
          agent_aad_id: agentAadId,
          agent_display_name: agentDisplayName
        }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      // Also invalidate assignments list so Smart Assignments page updates
      queryClient.invalidateQueries({ queryKey: ["tickets", "assignments"] });
      toast.success("Agent assigned");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to assign agent: ${error.message}`);
    },
  });
}

/**
 * Cancel ticket mutation
 */
export function useCancelTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      reason,
    }: {
      ticketId: string;
      reason?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/cancel`,
        { reason }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Ticket cancelled");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to cancel ticket: ${error.message}`);
    },
  });
}

/**
 * Hold task mutation
 */
export function useHoldTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      reason,
    }: {
      ticketId: string;
      stepId: string;
      reason: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/hold`,
        { reason }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Task put on hold");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to hold task: ${error.message}`);
    },
  });
}

/**
 * Resume task mutation
 */
export function useResumeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
    }: {
      ticketId: string;
      stepId: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/resume`,
        {}
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Task resumed");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to resume task: ${error.message}`);
    },
  });
}

/**
 * Request handover mutation
 */
export function useRequestHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      reason,
      suggestedAgentEmail,
    }: {
      ticketId: string;
      stepId: string;
      reason: string;
      suggestedAgentEmail?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/request-handover`,
        { reason, suggested_agent_email: suggestedAgentEmail }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      toast.success("Handover requested");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to request handover: ${error.message}`);
    },
  });
}

/**
 * Decide handover mutation
 */
export function useDecideHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      handoverRequestId,
      approved,
      newAgentEmail,
      newAgentAadId,
      newAgentDisplayName,
      comment,
    }: {
      ticketId: string;
      stepId: string;
      handoverRequestId: string;
      approved: boolean;
      newAgentEmail?: string;
      newAgentAadId?: string;
      newAgentDisplayName?: string;
      comment?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/decide-handover`,
        {
          handover_request_id: handoverRequestId,
          approved,
          new_agent_email: newAgentEmail,
          new_agent_aad_id: newAgentAadId,
          new_agent_display_name: newAgentDisplayName,
          comment,
        }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success(variables.approved ? "Handover approved" : "Handover rejected");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to decide handover: ${error.message}`);
    },
  });
}

/**
 * Cancel handover request mutation
 */
export function useCancelHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      handoverRequestId,
    }: {
      ticketId: string;
      stepId: string;
      handoverRequestId: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/cancel-handover/${handoverRequestId}`,
        {}
      );
      return response;
    },
    onSuccess: (_, variables) => {
      // Force immediate refetch of assigned tasks
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ticketKeys.assignedTasks() });
      queryClient.refetchQueries({ queryKey: ticketKeys.assignedTasks() });
      toast.success("Handover request cancelled");
    },
    onError: (error: ApiError) => {
      // Handle 409 (Conflict) - handover already cancelled/decided
      if (error.status === 409) {
        toast.info("Handover request was already processed");
        // Still refresh the list to update the UI
        queryClient.invalidateQueries({ queryKey: ticketKeys.assignedTasks() });
        queryClient.refetchQueries({ queryKey: ticketKeys.assignedTasks() });
      } else {
        toast.error(`Failed to cancel handover: ${error.message}`);
      }
    },
  });
}

/**
 * Skip step mutation
 */
export function useSkipStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      reason,
    }: {
      ticketId: string;
      stepId: string;
      reason: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/skip`,
        { reason }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      toast.success("Step skipped");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to skip step: ${error.message}`);
    },
  });
}

/**
 * Acknowledge SLA mutation
 */
export function useAcknowledgeSla() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      notes,
    }: {
      ticketId: string;
      stepId: string;
      notes?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/acknowledge-sla`,
        { notes }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      toast.success("SLA acknowledged");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to acknowledge SLA: ${error.message}`);
    },
  });
}

/**
 * Fetch pending handovers
 */
export function usePendingHandovers(managerEmail: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ticketKeys.handovers(managerEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ handover_request: unknown; ticket: Ticket; step: unknown }>;
        page: number;
        page_size: number;
      }>("/tickets/manager/handovers", { page, page_size: pageSize });
      return response;
    },
    enabled: !!managerEmail,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Fetch team dashboard
 */
export function useTeamDashboard(managerEmail: string) {
  return useQuery({
    queryKey: ticketKeys.dashboard(managerEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        workload: {
          status_counts: Record<string, number>;
          unassigned_tasks: number;
          total_tickets: number;
        };
        agent_workload?: Array<{
          agent_email: string;
          agent_name: string;
          active_tasks: number;
          on_hold_tasks: number;
        }>;
        recent_tickets: Array<unknown>;
        overdue_steps: Array<unknown>;
        on_hold_steps: Array<unknown>;
      }>("/tickets/manager/dashboard");
      return response;
    },
    enabled: !!managerEmail,
  });
}


/**
 * Save draft values for a task (partial save without completing)
 */
export function useSaveTaskDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      stepId,
      draftValues,
      executionNotes,
    }: {
      ticketId: string;
      stepId: string;
      draftValues: Record<string, unknown>;
      executionNotes?: string;
    }) => {
      const response = await apiClient.post<ActionResponse>(
        `/tickets/${ticketId}/steps/${stepId}/save-draft`,
        { draft_values: draftValues, execution_notes: executionNotes }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      // Invalidate to refresh task data with saved draft
      queryClient.invalidateQueries({ queryKey: ticketKeys.assignedTasks() });
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.ticketId) });
      toast.success("Draft saved successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to save draft: ${error.message}`);
    },
  });
}

/**
 * Fetch agent dashboard
 */
export function useAgentDashboard(agentEmail: string) {
  return useQuery({
    queryKey: ticketKeys.agentDashboard(agentEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        summary: {
          total_tasks: number;
          active_tasks: number;
          on_hold_tasks: number;
          waiting_for_info_tasks: number;
          info_requests: number;
          pending_handovers: number;
          overdue_tasks: number;
        };
        overdue_tasks: Array<{ step: unknown; ticket: unknown }>;
        recent_completed: Array<{ step: unknown; ticket: unknown }>;
        pending_handovers: Array<{ handover_request: unknown; ticket: unknown; step: unknown }>;
      }>("/tickets/agent/dashboard");
      return response;
    },
    enabled: !!agentEmail,
    refetchInterval: 30000,
  });
}

/**
 * Fetch agent-specific info requests
 */
export function useAgentInfoRequests(agentEmail: string) {
  return useQuery({
    queryKey: ticketKeys.agentInfoRequests(agentEmail),
    queryFn: async () => {
      const response = await apiClient.get<Array<{
        info_request_id: string;
        ticket_id: string;
        ticket_title: string;
        ticket_step_id: string;
        step_name: string;
        step_type: string;
        subject?: string;
        question_text: string;
        requested_by: {
          email: string;
          display_name: string;
          aad_id?: string;
        };
        requested_from: {
          email: string;
          display_name: string;
          aad_id?: string;
        };
        requested_at: string;
        status: string;
        request_attachment_ids: string[];
        workflow_name: string;
      }>>("/tickets/agent/info-requests");
      return response;
    },
    enabled: !!agentEmail,
    refetchInterval: 30000,
  });
}

/**
 * Fetch agent's pending handovers (submitted by this agent)
 */
export function useAgentPendingHandovers(agentEmail: string) {
  return useQuery({
    queryKey: ticketKeys.agentHandovers(agentEmail),
    queryFn: async () => {
      const response = await apiClient.get<{
        items: Array<{ handover_request: unknown; ticket: unknown; step: unknown }>;
      }>("/tickets/agent/pending-handovers");
      return response;
    },
    enabled: !!agentEmail,
    refetchInterval: 30000,
  });
}
