/**
 * Workflow Hooks
 * React Query hooks for workflow operations
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
  Workflow,
  WorkflowVersion,
  WorkflowDefinition,
  PaginatedResponse,
  ValidationResult,
} from "@/lib/types";
import { toast } from "sonner";

// Query keys
export const workflowKeys = {
  all: ["workflows"] as const,
  lists: () => [...workflowKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...workflowKeys.lists(), filters] as const,
  catalog: (filters: Record<string, unknown>) => [...workflowKeys.all, "catalog", filters] as const,
  publishedForEmbedding: (excludeId?: string) => [...workflowKeys.all, "published-for-embedding", excludeId] as const,
  details: () => [...workflowKeys.all, "detail"] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  versions: (id: string) => [...workflowKeys.all, "versions", id] as const,
  version: (id: string, version: number) => [...workflowKeys.all, "version", id, version] as const,
};

/**
 * Fetch workflows list
 */
export function useWorkflows(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: workflowKeys.list(params || {}),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Workflow>>("/workflows", {
        status: params?.status,
        page: params?.page || 1,
        page_size: params?.pageSize || 20,
      });
      return response;
    },
  });
}

/**
 * Published workflow info for embedding as sub-workflow
 */
export interface PublishedWorkflowForEmbedding {
  workflow_id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  current_version: number;
  step_count: number;
  step_counts: Record<string, number>;
  published_at: string | null;
  published_by: string | null;
}

/**
 * Fetch published workflows available for embedding as sub-workflows
 * Used by the Step Library in Workflow Studio
 */
export function usePublishedWorkflowsForEmbedding(excludeWorkflowId?: string) {
  return useQuery({
    queryKey: workflowKeys.publishedForEmbedding(excludeWorkflowId),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (excludeWorkflowId) {
        params.exclude_workflow_id = excludeWorkflowId;
      }
      const response = await apiClient.get<{
        items: PublishedWorkflowForEmbedding[];
        total: number;
      }>("/workflows/published-for-embedding", params);
      return response;
    },
  });
}

/**
 * Fetch workflow catalog (published workflows)
 */
export function useCatalog(params?: {
  category?: string;
  tags?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: workflowKeys.catalog(params || {}),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Workflow>>("/workflows/catalog", {
        category: params?.category,
        tags: params?.tags,
        q: params?.q,
        page: params?.page || 1,
        page_size: params?.pageSize || 20,
      });
      return response;
    },
  });
}

/**
 * Fetch single workflow
 */
export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.detail(workflowId),
    queryFn: async () => {
      const response = await apiClient.get<Workflow>(`/workflows/${workflowId}`);
      return response;
    },
    enabled: !!workflowId,
  });
}

/**
 * Fetch workflow versions
 */
export function useWorkflowVersions(workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.versions(workflowId),
    queryFn: async () => {
      const response = await apiClient.get<{ items: WorkflowVersion[] }>(
        `/workflows/${workflowId}/versions`
      );
      return response.items;
    },
    enabled: !!workflowId,
  });
}

/**
 * Fetch initial form chain for wizard-style ticket creation
 */
export interface InitialFormChain {
  initial_forms: Array<{
    step_id: string;
    step_name: string;
    step_type: string;
    fields?: Array<{
      field_key: string;
      field_label: string;
      field_type: string;
      required?: boolean;
      placeholder?: string;
      help_text?: string;
      options?: string[];
      validation?: Record<string, unknown>;
    }>;
  }>;
  first_non_form_step_id: string | null;
  total_form_count: number;
}

export function useInitialFormChain(workflowId: string) {
  return useQuery({
    queryKey: [...workflowKeys.detail(workflowId), "initial-forms"],
    queryFn: async () => {
      const response = await apiClient.get<InitialFormChain>(
        `/workflows/${workflowId}/initial-forms`
      );
      return response;
    },
    enabled: !!workflowId,
    // Always fetch fresh data to ensure latest workflow configuration
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Fetch consecutive form chain from a specific step
 * Used for mid-workflow forms where multiple forms need to be filled in sequence
 */
export interface ConsecutiveFormChain {
  consecutive_forms: Array<{
    step_id: string;
    step_name: string;
    step_type: string;
    fields?: Array<{
      field_key: string;
      field_label: string;
      field_type: string;
      required?: boolean;
      placeholder?: string;
      help_text?: string;
      options?: string[];
      validation?: Record<string, unknown>;
    }>;
  }>;
  next_non_form_step_id: string | null;
  total_form_count: number;
}

export function useConsecutiveFormChain(
  workflowId: string, 
  versionNumber: number, 
  stepId: string
) {
  return useQuery({
    queryKey: [...workflowKeys.detail(workflowId), "consecutive-forms", versionNumber, stepId],
    queryFn: async () => {
      const response = await apiClient.get<ConsecutiveFormChain>(
        `/workflows/${workflowId}/versions/${versionNumber}/consecutive-forms/${stepId}`
      );
      return response;
    },
    enabled: !!workflowId && !!versionNumber && !!stepId,
  });
}

/**
 * Create workflow mutation
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
    }) => {
      const response = await apiClient.post<{ workflow_id: string }>("/workflows", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success("Workflow created successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to create workflow: ${error.message}`);
    },
  });
}

/**
 * Save workflow draft mutation
 */
export function useSaveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workflowId,
      definition,
      changeSummary,
    }: {
      workflowId: string;
      definition: WorkflowDefinition;
      changeSummary?: string;
    }) => {
      const response = await apiClient.put<{
        workflow_id: string;
        validation: ValidationResult;
        draft_updated_at: string;
      }>(`/workflows/${workflowId}/draft`, {
        definition,
        change_summary: changeSummary,
      });
      return response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(variables.workflowId) });
      if (data.validation.is_valid) {
        toast.success("Draft saved successfully");
      } else {
        toast.warning("Draft saved with validation errors");
      }
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to save draft: ${error.message}`);
    },
  });
}

/**
 * Validate workflow mutation
 */
export function useValidateWorkflow() {
  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await apiClient.post<ValidationResult>(
        `/workflows/${workflowId}/validate`
      );
      return response;
    },
  });
}

/**
 * Publish workflow mutation
 */
export function usePublishWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await apiClient.post<{
        workflow_version_id: string;
        version: number;
      }>(`/workflows/${workflowId}/publish`);
      return response;
    },
    onSuccess: (data, workflowId) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workflowKeys.versions(workflowId) });
      toast.success(`Published version ${data.version}`);
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to publish: ${error.message}`);
    },
  });
}

/**
 * Update workflow metadata mutation
 */
export function useUpdateMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workflowId,
      name,
      description,
      category,
      tags,
    }: {
      workflowId: string;
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
    }) => {
      const response = await apiClient.patch<Workflow>(
        `/workflows/${workflowId}/metadata`,
        { name, description, category, tags }
      );
      return response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success("Workflow metadata updated");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

/**
 * Delete workflow mutation
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflowId: string) => {
      await apiClient.delete(`/workflows/${workflowId}`);
      return workflowId;
    },
    onSuccess: (workflowId) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      queryClient.removeQueries({ queryKey: workflowKeys.detail(workflowId) });
      toast.success("Workflow deleted successfully");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}