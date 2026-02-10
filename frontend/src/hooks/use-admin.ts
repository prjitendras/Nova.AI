/**
 * Admin API hooks - Complete admin panel functionality
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface HealthResponse {
  status: string;
  mongo: { status: string; database?: string };
  scheduler: { status: string; running: boolean };
  email: { status: string; last_send: string | null };
}

interface SystemConfig {
  default_sla_minutes: Record<string, number>;
  allowed_mime_types: string[];
  max_attachment_size_mb: number;
  notification_retry_max: number;
}

interface FailedNotification {
  notification_id: string;
  template_key: string;
  recipients: string[];
  status: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

interface AdminUser {
  admin_user_id: string;
  aad_id: string | null;
  email: string;
  display_name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DESIGNER";
  granted_by: string | null;
  granted_at: string;
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_by: string | null;
}

interface AdminAccessCheck {
  is_super_admin: boolean;
  is_admin: boolean;
  is_designer: boolean;
  role: string | null;
}

interface AdminAuditEvent {
  audit_id: string;
  action: string;
  actor_email: string;
  actor_display_name: string;
  target_email: string | null;
  target_display_name: string | null;
  details: Record<string, unknown>;
  timestamp: string;
  ip_address: string | null;
}

interface SetupStatus {
  super_admin_exists: boolean;
  requires_setup: boolean;
}

interface BootstrapLoginResponse {
  success: boolean;
  token: string | null;
  expires_in_minutes: number;
  message: string;
}

interface AdminDashboardStats {
  users: {
    super_admins: number;
    admins: number;
    designers: number;
    total: number;
  };
  recent_activity: AdminAuditEvent[];
}

interface EmailTemplate {
  key: string;
  name: string;
  subject_preview: string;
  has_override: boolean;
}

interface EmailTemplateOverride {
  template_id: string;
  template_key: string;
  workflow_id: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

interface EmailTemplatePreview {
  template_key: string;
  subject: string;
  body: string;
}

// Source types for how access was granted
export type OnboardSourceType = 
  | "MANUAL"               // Admin manually granted
  | "TASK_ASSIGNMENT"      // Auto: First-time task assignment
  | "REASSIGN_AGENT"       // Auto: Task reassignment
  | "HANDOVER_ASSIGNMENT"  // Auto: Handover approval
  | "APPROVAL_ASSIGNMENT"  // Auto: First-time approval assignment
  | "APPROVAL_REASSIGNMENT" // Auto: Approval reassignment
  | "LOOKUP_ASSIGNMENT";   // Auto: Lookup table assignment

export interface UserAccess {
  user_access_id: string;
  aad_id: string | null;
  email: string;
  display_name: string;
  has_designer_access: boolean;
  has_manager_access: boolean;
  has_agent_access: boolean;
  
  // Per-persona source tracking (how each persona was granted)
  designer_source?: OnboardSourceType | null;
  designer_granted_by?: string | null;
  designer_granted_at?: string | null;
  
  manager_source?: OnboardSourceType | null;
  manager_granted_by?: string | null;
  manager_granted_at?: string | null;
  
  agent_source?: OnboardSourceType | null;
  agent_granted_by?: string | null;
  agent_granted_at?: string | null;
  
  // Legacy: Original onboard source (kept for backward compatibility)
  onboard_source?: OnboardSourceType;
  onboarded_by?: string;
  onboarded_by_display_name?: string;
  
  // Tracking
  granted_by: string;
  granted_at: string;
  updated_at: string | null;
  updated_by: string | null;
  is_active: boolean;
}

export interface MyAccess {
  email: string;
  has_designer_access: boolean;
  has_manager_access: boolean;
  has_agent_access: boolean;
  is_admin: boolean;
  admin_role: string | null;
}

// ============================================================================
// Query Keys
// ============================================================================

export const adminKeys = {
  health: ["admin", "health"] as const,
  config: ["admin", "config"] as const,
  failedNotifications: ["admin", "notifications", "failed"] as const,
  notificationStats: ["admin", "notifications", "stats"] as const,
  access: ["admin", "access"] as const,
  setupStatus: ["admin", "setup-status"] as const,
  dashboard: ["admin", "dashboard"] as const,
  designers: (params?: { skip?: number; limit?: number; includeInactive?: boolean }) => 
    ["admin", "designers", params] as const,
  admins: (params?: { skip?: number; limit?: number; includeInactive?: boolean }) => 
    ["admin", "admins", params] as const,
  auditLog: (params?: Record<string, unknown>) => ["admin", "audit-log", params] as const,
  emailTemplates: ["admin", "email-templates"] as const,
  emailTemplatePreview: (key: string) => ["admin", "email-templates", "preview", key] as const,
  userAccess: (params?: { skip?: number; limit?: number }) => 
    ["admin", "user-access", params] as const,
  myAccess: ["admin", "my-access"] as const,
};

// ============================================================================
// Setup & Access
// ============================================================================

/**
 * Check if super admin setup is required
 * This is a PUBLIC endpoint - no authentication needed
 */
export function useSetupStatus() {
  return useQuery({
    queryKey: adminKeys.setupStatus,
    queryFn: async () => {
      // Use fetch directly - this is a public endpoint, no auth needed
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1"}/admin/setup-status`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        throw new Error("Failed to check setup status");
      }
      
      return await response.json() as SetupStatus;
    },
    retry: 2,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Bootstrap login - uses hardcoded credentials for initial setup
 * Only works when no super admin exists yet
 */
export function useBootstrapLogin() {
  return useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      // Use fetch directly to avoid auth header issues
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1"}/admin/bootstrap/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.message || error.detail || "Login failed");
      }
      
      return await response.json() as BootstrapLoginResponse;
    },
    onError: (error: Error) => {
      toast.error(error.message || "Login failed");
    },
  });
}

/**
 * Set up super admin using bootstrap token
 * The bootstrap token must be passed as a header
 */
export function useSetupSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      email: string; 
      display_name: string; 
      aad_id?: string;
      bootstrapToken: string; // Required bootstrap token
    }) => {
      const { bootstrapToken, ...body } = data;
      
      // Use fetch directly to pass the bootstrap token header
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1"}/admin/bootstrap/setup`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Bootstrap-Token": bootstrapToken,
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.message || error.detail || "Setup failed");
      }
      
      return await response.json() as { message: string; admin: AdminUser };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.setupStatus });
      queryClient.invalidateQueries({ queryKey: adminKeys.access });
      toast.success("Super admin created successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create super admin");
    },
  });
}

export function useAdminAccess() {
  return useQuery({
    queryKey: adminKeys.access,
    queryFn: async () => {
      try {
        return await apiClient.get<AdminAccessCheck>("/admin/access");
      } catch {
        // Return default access if authentication fails
        return {
          is_super_admin: false,
          is_admin: false,
          is_designer: false,
          role: null
        } as AdminAccessCheck;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on auth failures
  });
}

// ============================================================================
// Dashboard
// ============================================================================

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: async () => {
      return await apiClient.get<AdminDashboardStats>("/admin/dashboard");
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

// ============================================================================
// Health & Config
// ============================================================================

export function useSystemHealth() {
  return useQuery({
    queryKey: adminKeys.health,
    queryFn: async () => {
      return await apiClient.get<HealthResponse>("/admin/health");
    },
    refetchInterval: 30000,
  });
}

export function useSystemConfig() {
  return useQuery({
    queryKey: adminKeys.config,
    queryFn: async () => {
      return await apiClient.get<SystemConfig>("/admin/config");
    },
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<SystemConfig>) => {
      return await apiClient.put<SystemConfig>("/admin/config", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.config });
      toast.success("Configuration updated");
    },
    onError: () => {
      toast.error("Failed to update configuration");
    },
  });
}

// ============================================================================
// Designer Management
// ============================================================================

export function useDesigners(params?: { skip?: number; limit?: number; includeInactive?: boolean }) {
  return useQuery({
    queryKey: adminKeys.designers(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.skip) queryParams.set("skip", params.skip.toString());
      if (params?.limit) queryParams.set("limit", params.limit.toString());
      if (params?.includeInactive) queryParams.set("include_inactive", "true");
      
      return await apiClient.get<{
        items: AdminUser[];
        total: number;
        skip: number;
        limit: number;
      }>(`/admin/designers?${queryParams.toString()}`);
    },
  });
}

export function useGrantDesignerAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; display_name: string; aad_id?: string }) => {
      return await apiClient.post<{ message: string; admin: AdminUser }>("/admin/designers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "designers"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard });
      toast.success("Designer access granted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to grant designer access");
    },
  });
}

export function useRevokeDesignerAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) => {
      return await apiClient.delete<{ message: string }>(`/admin/designers/${encodeURIComponent(email)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "designers"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard });
      toast.success("Designer access revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke designer access");
    },
  });
}

// ============================================================================
// Admin Management
// ============================================================================

export function useAdmins(params?: { skip?: number; limit?: number; includeInactive?: boolean }) {
  return useQuery({
    queryKey: adminKeys.admins(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.skip) queryParams.set("skip", params.skip.toString());
      if (params?.limit) queryParams.set("limit", params.limit.toString());
      if (params?.includeInactive) queryParams.set("include_inactive", "true");
      
      return await apiClient.get<{
        items: AdminUser[];
        total: number;
        skip: number;
        limit: number;
      }>(`/admin/admins?${queryParams.toString()}`);
    },
  });
}

export function useGrantAdminAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; display_name: string; aad_id?: string }) => {
      return await apiClient.post<{ message: string; admin: AdminUser }>("/admin/admins", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard });
      toast.success("Admin access granted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to grant admin access");
    },
  });
}

export function useRevokeAdminAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) => {
      return await apiClient.delete<{ message: string }>(`/admin/admins/${encodeURIComponent(email)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard });
      toast.success("Admin access revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke admin access");
    },
  });
}

// ============================================================================
// Audit Log
// ============================================================================

export function useAdminAuditLog(params?: {
  action?: string;
  actor_email?: string;
  target_email?: string;
  from_date?: string;
  to_date?: string;
  skip?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: adminKeys.auditLog(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.action) queryParams.set("action", params.action);
      if (params?.actor_email) queryParams.set("actor_email", params.actor_email);
      if (params?.target_email) queryParams.set("target_email", params.target_email);
      if (params?.from_date) queryParams.set("from_date", params.from_date);
      if (params?.to_date) queryParams.set("to_date", params.to_date);
      if (params?.skip) queryParams.set("skip", params.skip.toString());
      if (params?.limit) queryParams.set("limit", params.limit.toString());
      
      return await apiClient.get<{
        items: AdminAuditEvent[];
        total: number;
        skip: number;
        limit: number;
      }>(`/admin/audit-log?${queryParams.toString()}`);
    },
  });
}

// ============================================================================
// Email Templates
// ============================================================================

export function useEmailTemplates() {
  return useQuery({
    queryKey: adminKeys.emailTemplates,
    queryFn: async () => {
      return await apiClient.get<{
        templates: EmailTemplate[];
        overrides: EmailTemplateOverride[];
      }>("/admin/email-templates");
    },
  });
}

export function useEmailTemplatePreview() {
  return useMutation({
    mutationFn: async (data: { template_key: string; payload?: Record<string, unknown> }) => {
      return await apiClient.post<EmailTemplatePreview>("/admin/email-templates/preview", data);
    },
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      template_key: string;
      workflow_id?: string;
      custom_subject?: string;
      custom_body?: string;
    }) => {
      return await apiClient.put<{ message: string; template: EmailTemplateOverride }>(
        "/admin/email-templates",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.emailTemplates });
      toast.success("Email template updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update email template");
    },
  });
}

export function useDeleteEmailTemplateOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      return await apiClient.delete<{ message: string }>(`/admin/email-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.emailTemplates });
      toast.success("Template override removed, reverted to default");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove template override");
    },
  });
}

// ============================================================================
// Notifications - Comprehensive Dashboard API
// ============================================================================

interface NotificationItem {
  notification_id: string;
  ticket_id: string | null;
  template_key: string;
  template_name: string;
  recipients: string[];
  status: string;
  retry_count: number;
  last_error: string | null;
  created_at: string | null;
  sent_at: string | null;
  next_retry_at: string | null;
  locked_by: string | null;
  locked_until: string | null;
  preview: {
    ticket_title: string;
    requester_name: string;
    step_name: string;
    workflow_name: string;
    workflow_id: string;
  };
}

interface NotificationDetail {
  notification_id: string;
  ticket_id: string | null;
  notification_type: string;
  template_key: string;
  template_name: string;
  recipients: string[];
  status: string;
  retry_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  locked_until: string | null;
  locked_by: string | null;
  created_at: string;
  sent_at: string | null;
  payload: Record<string, unknown>;
  email_content: {
    subject: string;
    body: string;
  } | null;
}

interface NotificationDashboardStats {
  status_counts: {
    pending: number;
    sent: number;
    failed: number;
    total: number;
  };
  template_counts: Record<string, number>;
  retry_distribution: Record<string, number>;
  common_errors: Array<{ error: string; count: number }>;
  currently_locked: number;
  success_rate: number;
  failure_rate: number;
  last_24_hours: {
    pending: number;
    sent: number;
    failed: number;
    total: number;
  };
}

interface NotificationListParams {
  status?: string;
  ticket_id?: string;
  template_key?: string;
  recipient?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
}

export const notificationKeys = {
  list: (params?: NotificationListParams) => ["admin", "notifications", "list", params] as const,
  detail: (id: string) => ["admin", "notifications", "detail", id] as const,
  dashboard: (params?: { from_date?: string; to_date?: string }) => 
    ["admin", "notifications", "dashboard", params] as const,
  ticketNotifications: (ticketId: string) => ["admin", "notifications", "ticket", ticketId] as const,
};

export function useNotificationStats() {
  return useQuery({
    queryKey: adminKeys.notificationStats,
    queryFn: async () => {
      return await apiClient.get<{
        pending: number;
        sent: number;
        failed: number;
        total: number;
      }>("/admin/notifications/stats");
    },
    refetchInterval: 30000,
  });
}

/**
 * Comprehensive notification dashboard statistics
 */
export function useNotificationDashboard(params?: { from_date?: string; to_date?: string }) {
  return useQuery({
    queryKey: notificationKeys.dashboard(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.from_date) queryParams.set("from_date", params.from_date);
      if (params?.to_date) queryParams.set("to_date", params.to_date);
      
      const url = `/admin/notifications/dashboard${queryParams.toString() ? `?${queryParams}` : ""}`;
      return await apiClient.get<NotificationDashboardStats>(url);
    },
    refetchInterval: 30000,
  });
}

/**
 * List notifications with comprehensive filtering
 */
export function useNotificationsList(params?: NotificationListParams) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.set("status", params.status);
      if (params?.ticket_id) queryParams.set("ticket_id", params.ticket_id);
      if (params?.template_key) queryParams.set("template_key", params.template_key);
      if (params?.recipient) queryParams.set("recipient", params.recipient);
      if (params?.from_date) queryParams.set("from_date", params.from_date);
      if (params?.to_date) queryParams.set("to_date", params.to_date);
      if (params?.page) queryParams.set("page", params.page.toString());
      if (params?.page_size) queryParams.set("page_size", params.page_size.toString());
      if (params?.sort_by) queryParams.set("sort_by", params.sort_by);
      if (params?.sort_order) queryParams.set("sort_order", params.sort_order);
      
      const url = `/admin/notifications${queryParams.toString() ? `?${queryParams}` : ""}`;
      return await apiClient.get<{
        items: NotificationItem[];
        total: number;
        page: number;
        page_size: number;
        total_pages: number;
      }>(url);
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

/**
 * Get full notification details including email content
 */
export function useNotificationDetail(notificationId: string) {
  return useQuery({
    queryKey: notificationKeys.detail(notificationId),
    queryFn: async () => {
      return await apiClient.get<NotificationDetail>(`/admin/notifications/${notificationId}`);
    },
    enabled: !!notificationId,
  });
}

/**
 * Get all notifications for a specific ticket
 */
export function useTicketNotifications(ticketId: string) {
  return useQuery({
    queryKey: notificationKeys.ticketNotifications(ticketId),
    queryFn: async () => {
      return await apiClient.get<{
        ticket_id: string;
        notifications: Array<{
          notification_id: string;
          template_key: string;
          template_name: string;
          recipients: string[];
          status: string;
          retry_count: number;
          last_error: string | null;
          created_at: string;
          sent_at: string | null;
          email_subject: string | null;
          email_body: string | null;
        }>;
        total: number;
      }>(`/admin/notifications/ticket/${ticketId}`);
    },
    enabled: !!ticketId,
  });
}

export function useFailedNotifications(page: number = 1, pageSize: number = 20) {
  return useQuery({
    queryKey: [...adminKeys.failedNotifications, page, pageSize],
    queryFn: async () => {
      return await apiClient.get<{
        items: FailedNotification[];
        total: number;
        page: number;
        page_size: number;
      }>(`/admin/notifications/failed?page=${page}&page_size=${pageSize}`);
    },
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiClient.post<{ success: boolean }>(
        `/admin/notifications/${notificationId}/retry`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
      toast.success("Notification queued for retry");
    },
    onError: () => {
      toast.error("Failed to retry notification");
    },
  });
}

/**
 * Bulk retry multiple notifications
 */
export function useBulkRetryNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      return await apiClient.post<{
        message: string;
        retried_count: number;
        requested_count: number;
      }>("/admin/notifications/bulk-retry", { notification_ids: notificationIds });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
      toast.success(`${data.retried_count} notifications queued for retry`);
    },
    onError: () => {
      toast.error("Failed to retry notifications");
    },
  });
}

/**
 * Cancel a pending notification
 */
export function useCancelNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiClient.post<{ message: string }>(
        `/admin/notifications/${notificationId}/cancel`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
      toast.success("Notification cancelled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel notification");
    },
  });
}

// ============================================================================
// User Access Management
// ============================================================================

/**
 * Get current user's persona access (for sidebar visibility)
 */
export function useMyAccess() {
  return useQuery({
    queryKey: adminKeys.myAccess,
    queryFn: async () => {
      return await apiClient.get<MyAccess>("/admin/my-access");
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: false,
  });
}

/**
 * List all users with persona access
 */
export function useUserAccessList(params?: { skip?: number; limit?: number }) {
  return useQuery({
    queryKey: adminKeys.userAccess(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.skip) queryParams.set("skip", String(params.skip));
      if (params?.limit) queryParams.set("limit", String(params.limit));
      
      const url = `/admin/user-access${queryParams.toString() ? `?${queryParams}` : ""}`;
      return await apiClient.get<{
        items: UserAccess[];
        total: number;
        skip: number;
        limit: number;
      }>(url);
    },
  });
}

/**
 * Grant persona access to a user
 */
export function useGrantUserAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      display_name: string;
      aad_id?: string;
      has_designer_access: boolean;
      has_manager_access: boolean;
      has_agent_access: boolean;
    }) => {
      return await apiClient.post<{ message: string; user_access: UserAccess }>(
        "/admin/user-access",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-access"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.myAccess });
      toast.success("Access granted successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to grant access");
    },
  });
}

/**
 * Update user's persona access
 */
export function useUpdateUserAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      has_designer_access?: boolean;
      has_manager_access?: boolean;
      has_agent_access?: boolean;
    }) => {
      const { email, ...body } = data;
      return await apiClient.put<{ message: string; user_access: UserAccess }>(
        `/admin/user-access/${encodeURIComponent(email)}`,
        body
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-access"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.myAccess });
      toast.success("Access updated successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update access");
    },
  });
}

/**
 * Revoke all persona access from a user
 */
export function useRevokeUserAccess() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (email: string) => {
      return await apiClient.delete<{ message: string }>(
        `/admin/user-access/${encodeURIComponent(email)}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-access"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.myAccess });
      toast.success("Access revoked successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke access");
    },
  });
}