/**
 * Admin Settings Page
 * System configuration for super admins
 */
"use client";

import { useState, useEffect } from "react";
import {
  useAdminAccess,
  useSystemConfig,
} from "@/hooks/use-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  Save,
  AlertTriangle,
  Clock,
  HardDrive,
  Mail,
  RefreshCw,
  Loader2,
  Shield,
  Info,
} from "lucide-react";

interface SystemConfig {
  default_sla_minutes: Record<string, number>;
  allowed_mime_types: string[];
  max_attachment_size_mb: number;
  notification_retry_max: number;
}

function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<SystemConfig>) => {
      return apiClient.put<SystemConfig>("/admin/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "config"] });
      toast.success("Configuration updated successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update configuration");
    },
  });
}

export default function SettingsPage() {
  const { data: accessData } = useAdminAccess();
  const { data: config, isLoading } = useSystemConfig();
  const updateConfig = useUpdateConfig();

  const [formData, setFormData] = useState<Partial<SystemConfig>>({
    default_sla_minutes: {
      FORM_STEP: 1440,
      APPROVAL_STEP: 2880,
      TASK_STEP: 4320,
    },
    max_attachment_size_mb: 50,
    notification_retry_max: 3,
  });

  // Sync form data with loaded config
  useEffect(() => {
    if (config) {
      setFormData({
        default_sla_minutes: config.default_sla_minutes,
        max_attachment_size_mb: config.max_attachment_size_mb,
        notification_retry_max: config.notification_retry_max,
      });
    }
  }, [config]);

  // Check if user is super admin
  if (!accessData?.is_super_admin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Super Admin Required</h2>
          <p className="text-muted-foreground">
            Only Super Admins can modify system settings.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    await updateConfig.mutateAsync(formData);
  };

  const updateSLA = (stepType: string, minutes: number) => {
    setFormData((prev) => ({
      ...prev,
      default_sla_minutes: {
        ...prev.default_sla_minutes,
        [stepType]: minutes,
      },
    }));
  };

  const minutesToHours = (minutes: number) => Math.round(minutes / 60);
  const hoursToMinutes = (hours: number) => hours * 60;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure system-wide settings
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          {updateConfig.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="border-0 shadow-md bg-white dark:bg-slate-900">
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* SLA Configuration */}
          <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                SLA Configuration
              </CardTitle>
              <CardDescription>
                Default SLA times for different step types. These can be overridden per workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="form-sla">Form Step SLA (hours)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="form-sla"
                      type="number"
                      min={1}
                      value={minutesToHours(formData.default_sla_minutes?.FORM_STEP || 1440)}
                      onChange={(e) => updateSLA("FORM_STEP", hoursToMinutes(parseInt(e.target.value) || 24))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: 24 hours (1 day)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approval-sla">Approval Step SLA (hours)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="approval-sla"
                      type="number"
                      min={1}
                      value={minutesToHours(formData.default_sla_minutes?.APPROVAL_STEP || 2880)}
                      onChange={(e) => updateSLA("APPROVAL_STEP", hoursToMinutes(parseInt(e.target.value) || 48))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: 48 hours (2 days)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-sla">Task Step SLA (hours)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="task-sla"
                      type="number"
                      min={1}
                      value={minutesToHours(formData.default_sla_minutes?.TASK_STEP || 4320)}
                      onChange={(e) => updateSLA("TASK_STEP", hoursToMinutes(parseInt(e.target.value) || 72))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: 72 hours (3 days)
                  </p>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      About SLA Times
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      SLA times determine when reminders are sent and when escalations occur.
                      Reminders are sent at 75% of the SLA time, and escalations happen when the SLA is breached.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File Upload Settings */}
          <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <HardDrive className="h-4 w-4 text-white" />
                </div>
                File Upload Settings
              </CardTitle>
              <CardDescription>
                Configure file upload limits and allowed file types.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="max-size">Maximum Attachment Size (MB)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="max-size"
                    type="number"
                    min={1}
                    max={100}
                    value={formData.max_attachment_size_mb}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      max_attachment_size_mb: parseInt(e.target.value) || 50,
                    }))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">MB</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum file size for ticket attachments. Default: 50 MB
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Allowed File Types</Label>
                <div className="flex flex-wrap gap-2">
                  {config?.allowed_mime_types?.map((type) => (
                    <span
                      key={type}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-mono"
                    >
                      {type}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  File types that can be uploaded as attachments. Contact support to modify.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-white" />
                </div>
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure email notification behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="retry-max">Maximum Retry Attempts</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="retry-max"
                    type="number"
                    min={1}
                    max={10}
                    value={formData.notification_retry_max}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      notification_retry_max: parseInt(e.target.value) || 3,
                    }))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">attempts</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Number of times to retry failed email notifications. Default: 3
                </p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <RefreshCw className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Automatic Retry
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Failed notifications are automatically retried every 5 minutes until the maximum
                      retry count is reached. You can also manually retry from the System Health page.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Info */}
          <Card className="border-0 shadow-md bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                Security Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl">
                  <p className="text-sm font-medium mb-1">Authentication</p>
                  <p className="text-xs text-muted-foreground">Azure AD with MSAL</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl">
                  <p className="text-sm font-medium mb-1">Session Duration</p>
                  <p className="text-xs text-muted-foreground">Managed by Azure AD</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl">
                  <p className="text-sm font-medium mb-1">API Security</p>
                  <p className="text-xs text-muted-foreground">JWT Token Validation</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl">
                  <p className="text-sm font-medium mb-1">Audit Logging</p>
                  <p className="text-xs text-muted-foreground">All admin actions logged</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
