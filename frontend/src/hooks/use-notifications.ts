/**
 * Notification Hooks
 * React Query hooks for in-app notifications
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { InAppNotification, NotificationListResponse, UnreadCountResponse, InAppNotificationCategory } from "@/lib/types";

// Query keys
export const notificationKeys = {
  all: ["notifications"] as const,
  list: (filters?: { unreadOnly?: boolean; category?: InAppNotificationCategory }) => 
    [...notificationKeys.all, "list", filters] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
};

// ============================================================================
// Hooks
// ============================================================================

interface UseNotificationsOptions {
  skip?: number;
  limit?: number;
  unreadOnly?: boolean;
  category?: InAppNotificationCategory;
  enabled?: boolean;
}

/**
 * Hook to fetch notifications list
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const { skip = 0, limit = 20, unreadOnly = false, category, enabled = true } = options;

  return useQuery({
    queryKey: notificationKeys.list({ unreadOnly, category }),
    queryFn: async () => {
      const params: Record<string, unknown> = {
        skip,
        limit,
      };
      if (unreadOnly) params.unread_only = true;
      if (category) params.category = category;
      
      return apiClient.get<NotificationListResponse>("/notifications", params);
    },
    enabled,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider fresh for 10 seconds
    retry: false, // Don't retry if auth fails
  });
}

/**
 * Hook to fetch just the unread count (lightweight polling)
 */
export function useUnreadCount(options: { enabled?: boolean; pollingInterval?: number } = {}) {
  const { enabled = true, pollingInterval = 30000 } = options;

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      return apiClient.get<UnreadCountResponse>("/notifications/unread-count");
    },
    enabled,
    refetchInterval: pollingInterval, // Poll for updates
    staleTime: 5000, // Consider fresh for 5 seconds
    retry: false, // Don't retry if auth fails
  });
}

/**
 * Hook to mark a single notification as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return apiClient.post<InAppNotification>(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      // Invalidate both list and count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiClient.post<{ success: boolean; marked_count: number }>("/notifications/read-all");
    },
    onSuccess: () => {
      // Invalidate both list and count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Hook to delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return apiClient.delete(`/notifications/${notificationId}`);
    },
    onSuccess: () => {
      // Invalidate both list and count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
