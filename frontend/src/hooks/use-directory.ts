/**
 * Directory Hooks
 * React Query hooks for AD user search and directory operations
 */
"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Types for directory operations
export interface DirectoryUser {
  aad_id?: string;
  email: string;
  display_name: string;
  job_title?: string;
  department?: string;
}

export interface ManagerInfo {
  aad_id?: string;
  email: string;
  display_name: string;
}

// Query keys
export const directoryKeys = {
  all: ["directory"] as const,
  me: () => [...directoryKeys.all, "me"] as const,
  manager: () => [...directoryKeys.all, "manager"] as const,
  search: (query: string) => [...directoryKeys.all, "search", query] as const,
  user: (email: string) => [...directoryKeys.all, "user", email] as const,
};

/**
 * Get current user info
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: directoryKeys.me(),
    queryFn: async () => {
      const response = await apiClient.get<DirectoryUser>("/directory/me");
      return response;
    },
  });
}

/**
 * Get current user's manager
 */
export function useMyManager() {
  return useQuery({
    queryKey: directoryKeys.manager(),
    queryFn: async () => {
      const response = await apiClient.get<ManagerInfo | null>("/directory/me/manager");
      return response;
    },
  });
}

/**
 * Search users in AD directory
 * Uses delegated permissions to search via Microsoft Graph
 * Has built-in debounce via staleTime and gcTime
 */
export function useUserSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: directoryKeys.search(query),
    queryFn: async () => {
      if (!query || query.length < 2) return { items: [] };
      const response = await apiClient.get<{ items: DirectoryUser[] }>("/directory/users/search", {
        q: query,
        limit: 15,
      });
      return response;
    },
    enabled: enabled && query.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}

/**
 * Get user by email
 */
export function useUserByEmail(email: string) {
  return useQuery({
    queryKey: directoryKeys.user(email),
    queryFn: async () => {
      const response = await apiClient.get<DirectoryUser>(`/directory/users/${encodeURIComponent(email)}`);
      return response;
    },
    enabled: !!email,
  });
}

