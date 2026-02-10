/**
 * GenAI Hooks
 * React Query hooks for AI workflow generation
 */
"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import type { WorkflowDefinition, ValidationResult } from "@/lib/types";
import { toast } from "sonner";

interface GenerateWorkflowResponse {
  draft_definition: WorkflowDefinition;
  validation: ValidationResult;
  ai_metadata: {
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    note?: string;
  };
}

/**
 * Generate workflow draft with AI
 */
export function useGenerateWorkflow() {
  return useMutation({
    mutationFn: async ({
      promptText,
      constraints,
      examples,
    }: {
      promptText: string;
      constraints?: Record<string, unknown>;
      examples?: Array<{
        description: string;
        definition: WorkflowDefinition;
      }>;
    }) => {
      const response = await apiClient.post<GenerateWorkflowResponse>(
        "/genai/workflow-draft",
        {
          prompt_text: promptText,
          constraints,
          examples,
        }
      );
      return response;
    },
    // Remove onSuccess toast - let the caller handle success messaging
    // based on whether definition has valid steps
    onError: (error: ApiError) => {
      // Don't show generic toast here - let caller handle it with more context
      console.error("AI workflow generation error:", error);
    },
  });
}

/**
 * Refine workflow with AI
 */
export function useRefineWorkflow() {
  return useMutation({
    mutationFn: async ({
      currentDefinition,
      refinementPrompt,
    }: {
      currentDefinition: WorkflowDefinition;
      refinementPrompt: string;
    }) => {
      const response = await apiClient.post<GenerateWorkflowResponse>(
        "/genai/workflow-draft/refine",
        {
          current_definition: currentDefinition,
          refinement_prompt: refinementPrompt,
        }
      );
      return response;
    },
    onSuccess: () => {
      toast.success("Workflow refined");
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to refine workflow: ${error.message}`);
    },
  });
}

/**
 * Get AI suggestions for next steps
 */
export function useSuggestSteps() {
  return useMutation({
    mutationFn: async ({
      context,
      currentSteps,
    }: {
      context: Record<string, unknown>;
      currentSteps: unknown[];
    }) => {
      const response = await apiClient.post<{
        suggestions: Array<{
          type: string;
          name: string;
          description: string;
        }>;
      }>("/genai/suggest-steps", {
        context,
        current_steps: currentSteps,
      });
      return response.suggestions;
    },
  });
}

/**
 * Validate description for workflow generation
 */
export function useValidateDescription() {
  return useMutation({
    mutationFn: async (description: string) => {
      const response = await apiClient.post<{
        is_valid: boolean;
        message: string;
        suggestions: string[];
      }>("/genai/validate-description", { description });
      return response;
    },
  });
}

