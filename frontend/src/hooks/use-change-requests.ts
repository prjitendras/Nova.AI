"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  ChangeRequest,
  ChangeRequestListResponse,
  ChangeRequestDetailResponse,
  FormDataVersion,
  VersionComparisonResponse,
} from "@/lib/types";

// ============================================================================
// Query Keys
// ============================================================================

export const changeRequestKeys = {
  all: ["change-requests"] as const,
  myPending: () => [...changeRequestKeys.all, "my-pending"] as const,
  count: () => [...changeRequestKeys.all, "count"] as const,
  detail: (crId: string) => [...changeRequestKeys.all, "detail", crId] as const,
  ticketVersions: (ticketId: string) => [...changeRequestKeys.all, "ticket-versions", ticketId] as const,
  ticketHistory: (ticketId: string) => [...changeRequestKeys.all, "ticket-history", ticketId] as const,
  compare: (ticketId: string, v1: number, v2: number) =>
    [...changeRequestKeys.all, "compare", ticketId, v1, v2] as const,
};

// ============================================================================
// Queries
// ============================================================================

/**
 * Get pending change requests assigned to current user
 */
export function useMyPendingChangeRequests(skip = 0, limit = 50) {
  return useQuery({
    queryKey: changeRequestKeys.myPending(),
    queryFn: async () => {
      // apiClient.get expects params as direct object, not { params: {} }
      return await apiClient.get<ChangeRequestListResponse>(
        "/change-requests/my-pending",
        { skip, limit }
      );
    },
    staleTime: 30000,
  });
}

/**
 * Get count of pending CRs for badge display
 */
export function usePendingCRCount() {
  return useQuery({
    queryKey: changeRequestKeys.count(),
    queryFn: async () => {
      const result = await apiClient.get<{ count: number }>("/change-requests/count");
      return result.count;
    },
    staleTime: 30000,
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Get change request details
 */
export function useChangeRequest(crId: string | null) {
  return useQuery({
    queryKey: changeRequestKeys.detail(crId || ""),
    queryFn: async () => {
      if (!crId) return null;
      return await apiClient.get<ChangeRequestDetailResponse>(`/change-requests/${crId}`);
    },
    enabled: !!crId,
  });
}

/**
 * Get all form versions for a ticket
 */
export function useTicketVersions(ticketId: string | null) {
  return useQuery({
    queryKey: changeRequestKeys.ticketVersions(ticketId || ""),
    queryFn: async () => {
      if (!ticketId) return { versions: [], total: 0 };
      return await apiClient.get<{ versions: FormDataVersion[]; total: number }>(
        `/change-requests/tickets/${ticketId}/versions`
      );
    },
    enabled: !!ticketId,
  });
}

/**
 * Get CR history for a ticket
 */
export function useTicketCRHistory(ticketId: string | null) {
  return useQuery({
    queryKey: changeRequestKeys.ticketHistory(ticketId || ""),
    queryFn: async () => {
      if (!ticketId) return { items: [], total: 0 };
      return await apiClient.get<{ items: ChangeRequest[]; total: number }>(
        `/change-requests/tickets/${ticketId}/history`
      );
    },
    enabled: !!ticketId,
  });
}

/**
 * Compare two versions
 */
export function useCompareVersions(ticketId: string | null, version1: number, version2: number) {
  return useQuery({
    queryKey: changeRequestKeys.compare(ticketId || "", version1, version2),
    queryFn: async () => {
      if (!ticketId) return null;
      return await apiClient.get<VersionComparisonResponse>(
        `/change-requests/tickets/${ticketId}/compare`,
        { version_1: version1, version_2: version2 }
      );
    },
    enabled: !!ticketId && version1 > 0 && version2 > 0 && version1 !== version2,
  });
}

// ============================================================================
// Mutations
// ============================================================================

interface CreateCRPayload {
  ticket_id: string;
  proposed_form_values: Record<string, unknown>;
  proposed_attachment_ids: string[];
  reason: string;
}

/**
 * Create a new change request
 */
export function useCreateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCRPayload) => {
      // apiClient.post already returns response.data
      return await apiClient.post<{ success: boolean; change_request: ChangeRequest }>(
        "/change-requests",
        payload
      );
    },
    onSuccess: (data, variables) => {
      // Invalidate all ticket list queries (to show pending CR badge)
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      // Invalidate specific ticket detail
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", variables.ticket_id] });
      // Invalidate CR queries
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}

/**
 * Approve a change request
 */
export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ crId, notes }: { crId: string; notes?: string }) => {
      return await apiClient.post<{ success: boolean; change_request: ChangeRequest }>(
        `/change-requests/${crId}/approve`,
        { action: "APPROVE", notes }
      );
    },
    onSuccess: (data) => {
      const ticketId = data.change_request.ticket_id;
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}

/**
 * Reject a change request
 */
export function useRejectChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ crId, notes }: { crId: string; notes?: string }) => {
      return await apiClient.post<{ success: boolean; change_request: ChangeRequest }>(
        `/change-requests/${crId}/reject`,
        { action: "REJECT", notes }
      );
    },
    onSuccess: (data) => {
      const ticketId = data.change_request.ticket_id;
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}

/**
 * Cancel a change request (by requester)
 */
export function useCancelChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (crId: string) => {
      return await apiClient.delete<{ success: boolean; change_request: ChangeRequest }>(
        `/change-requests/${crId}`
      );
    },
    onSuccess: (data) => {
      const ticketId = data.change_request.ticket_id;
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}
