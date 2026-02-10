/**
 * Lookup Hooks
 * React Query hooks for workflow lookup table operations
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
  WorkflowLookup,
  LookupListResponse,
  LookupEntry,
  LookupUser,
} from "@/lib/types";
import { toast } from "sonner";

// Query keys
export const lookupKeys = {
  all: ["lookups"] as const,
  lists: () => [...lookupKeys.all, "list"] as const,
  list: (workflowId: string) => [...lookupKeys.lists(), workflowId] as const,
  details: () => [...lookupKeys.all, "detail"] as const,
  detail: (workflowId: string, lookupId: string) => [...lookupKeys.details(), workflowId, lookupId] as const,
  resolve: (workflowId: string, stepId: string, fieldKey: string, value: string) => 
    [...lookupKeys.all, "resolve", workflowId, stepId, fieldKey, value] as const,
};

// ============================================================================
// Lookup CRUD Hooks
// ============================================================================

/**
 * Fetch all lookups for a workflow
 */
export function useLookups(workflowId: string, includeInactive = false) {
  return useQuery({
    queryKey: lookupKeys.list(workflowId),
    queryFn: async () => {
      const response = await apiClient.get<LookupListResponse>(`/lookups/${workflowId}`, {
        include_inactive: includeInactive,
      });
      return response;
    },
    enabled: !!workflowId,
  });
}

/**
 * Fetch a single lookup
 */
export function useLookup(workflowId: string, lookupId: string) {
  return useQuery({
    queryKey: lookupKeys.detail(workflowId, lookupId),
    queryFn: async () => {
      const response = await apiClient.get<WorkflowLookup>(`/lookups/${workflowId}/${lookupId}`);
      return response;
    },
    enabled: !!workflowId && !!lookupId,
  });
}

/**
 * Create a new lookup
 */
export function useCreateLookup(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      source_step_id?: string;
      source_field_key?: string;
    }) => {
      const response = await apiClient.post<WorkflowLookup>(`/lookups/${workflowId}`, data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      toast.success(`Lookup "${data.name}" created`);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to create lookup");
    },
  });
}

/**
 * Update lookup metadata
 */
export function useUpdateLookup(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lookupId, ...data }: {
      lookupId: string;
      name?: string;
      description?: string;
      source_step_id?: string;
      source_field_key?: string;
      expected_version?: number;
    }) => {
      const response = await apiClient.patch<WorkflowLookup>(`/lookups/${workflowId}/${lookupId}`, data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: lookupKeys.detail(workflowId, data.lookup_id) });
      toast.success("Lookup updated");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to update lookup");
    },
  });
}

/**
 * Delete lookup
 */
export function useDeleteLookup(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (lookupId: string) => {
      await apiClient.delete(`/lookups/${workflowId}/${lookupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      toast.success("Lookup deleted");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to delete lookup");
    },
  });
}

// ============================================================================
// Entry Management Hooks
// ============================================================================

/**
 * Save all entries for a lookup (bulk update)
 */
export function useSaveLookupEntries(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lookupId, entries }: {
      lookupId: string;
      entries: Array<{
        entry_id?: string;
        key: string;
        display_label?: string;
        users: Array<{
          aad_id?: string;
          email: string;
          display_name: string;
          is_primary?: boolean;
          order?: number;
        }>;
        is_active?: boolean;
      }>;
    }) => {
      const response = await apiClient.put<WorkflowLookup>(
        `/lookups/${workflowId}/${lookupId}/entries`,
        { entries }
      );
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: lookupKeys.detail(workflowId, data.lookup_id) });
      toast.success("Lookup entries saved");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to save lookup entries");
    },
  });
}

/**
 * Add a single entry to a lookup
 */
export function useAddLookupEntry(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lookupId, ...data }: {
      lookupId: string;
      key: string;
      display_label?: string;
      users: Array<{
        aad_id?: string;
        email: string;
        display_name: string;
        is_primary?: boolean;
        order?: number;
      }>;
    }) => {
      const response = await apiClient.post<WorkflowLookup>(
        `/lookups/${workflowId}/${lookupId}/entries`,
        data
      );
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: lookupKeys.detail(workflowId, data.lookup_id) });
      toast.success("Entry added");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to add entry");
    },
  });
}

/**
 * Remove an entry from a lookup
 */
export function useRemoveLookupEntry(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lookupId, entryId }: {
      lookupId: string;
      entryId: string;
    }) => {
      const response = await apiClient.delete<WorkflowLookup>(
        `/lookups/${workflowId}/${lookupId}/entries/${entryId}`
      );
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: lookupKeys.detail(workflowId, data.lookup_id) });
      toast.success("Entry removed");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to remove entry");
    },
  });
}

/**
 * Set users for an entry
 */
export function useSetEntryUsers(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lookupId, entryId, users }: {
      lookupId: string;
      entryId: string;
      users: Array<{
        aad_id?: string;
        email: string;
        display_name: string;
        is_primary?: boolean;
        order?: number;
      }>;
    }) => {
      const response = await apiClient.put<WorkflowLookup>(
        `/lookups/${workflowId}/${lookupId}/entries/${entryId}/users`,
        { users }
      );
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: lookupKeys.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: lookupKeys.detail(workflowId, data.lookup_id) });
      toast.success("Users updated");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to update users");
    },
  });
}

// ============================================================================
// Runtime Resolution Hooks
// ============================================================================

/**
 * Resolve users for a form field value at runtime
 */
export function useResolveLookupUsers(
  workflowId: string,
  stepId: string,
  fieldKey: string,
  fieldValue: string | null | undefined,
  enabled = true
) {
  const isEnabled = enabled && !!workflowId && !!stepId && !!fieldKey && !!fieldValue;
  
  return useQuery({
    queryKey: lookupKeys.resolve(workflowId, stepId, fieldKey, fieldValue || ""),
    queryFn: async () => {
      if (!fieldValue) return { users: [] };
      
      const response = await apiClient.get<{ users: LookupUser[] }>(`/lookups/${workflowId}/resolve`, {
        step_id: stepId,
        field_key: fieldKey,
        field_value: fieldValue,
      });
      return response;
    },
    enabled: isEnabled,
    staleTime: 30000, // Cache for 30 seconds
  });
}

