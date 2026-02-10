/**
 * User Settings Page
 * User preferences and notification settings
 */
"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Bell,
  Mail,
  Moon,
  Sun,
  Monitor,
  Globe,
  Clock,
  Shield,
  Sparkles,
  CheckCircle2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  
  // Local state for settings (would typically be stored in backend)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [approvalReminders, setApprovalReminders] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  const handleSave = () => {
    // In a real app, this would save to backend
    toast.success("Settings saved successfully!");
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Settings"
        description="Manage your preferences and notifications"
      />

      <div className="space-y-6">
        {/* Appearance */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sun className="h-5 w-5 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>Customize how the app looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                    theme === "light" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="p-3 rounded-lg bg-amber-100">
                    <Sun className="h-6 w-6 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium">Light</span>
                  {theme === "light" && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </button>
                
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                    theme === "dark" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="p-3 rounded-lg bg-slate-800">
                    <Moon className="h-6 w-6 text-slate-200" />
                  </div>
                  <span className="text-sm font-medium">Dark</span>
                  {theme === "dark" && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </button>
                
                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                    theme === "system" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="p-3 rounded-lg bg-gradient-to-br from-amber-100 to-slate-800">
                    <Monitor className="h-6 w-6 text-slate-600" />
                  </div>
                  <span className="text-sm font-medium">System</span>
                  {theme === "system" && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>Configure how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email Notifications */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Email Notifications</Label>
              </div>
              
              <div className="space-y-3 pl-6">
                <SettingRow
                  label="Email notifications"
                  description="Receive email notifications for important updates"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
                <SettingRow
                  label="Approval reminders"
                  description="Get reminders for pending approvals"
                  checked={approvalReminders}
                  onCheckedChange={setApprovalReminders}
                  disabled={!emailNotifications}
                />
                <SettingRow
                  label="Task reminders"
                  description="Get reminders for assigned tasks"
                  checked={taskReminders}
                  onCheckedChange={setTaskReminders}
                  disabled={!emailNotifications}
                />
                <SettingRow
                  label="Weekly digest"
                  description="Receive a weekly summary of your activity"
                  checked={weeklyDigest}
                  onCheckedChange={setWeeklyDigest}
                  disabled={!emailNotifications}
                />
              </div>
            </div>
            
            <Separator />
            
            {/* In-App Notifications */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">In-App Notifications</Label>
              </div>
              
              <div className="space-y-3 pl-6">
                <SettingRow
                  label="In-app notifications"
                  description="Show notifications within the application"
                  checked={inAppNotifications}
                  onCheckedChange={setInAppNotifications}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regional */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" />
              Regional Settings
            </CardTitle>
            <CardDescription>Time zone and language preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Time Zone</p>
                <p className="text-xs text-muted-foreground">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
              <Badge variant="secondary">Auto-detected</Badge>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Language</p>
                <p className="text-xs text-muted-foreground">English (US)</p>
              </div>
              <Badge variant="secondary">Default</Badge>
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
              <Info className="h-4 w-4 flex-shrink-0" />
              <p className="text-xs">
                Regional settings are automatically detected from your browser. Contact support to change these settings.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Your account is secured by Microsoft Entra ID</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <div className="p-3 rounded-xl bg-emerald-500">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  Your account is protected
                </p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Authentication is managed through Microsoft Entra ID (Azure AD)
                </p>
              </div>
            </div>
            
            <div className="mt-4 text-xs text-muted-foreground">
              <p>To update your password or security settings, please use your organization's Microsoft account portal.</p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button variant="outline">Cancel</Button>
          <Button onClick={handleSave} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

// Setting Row Component
function SettingRow({ 
  label, 
  description, 
  checked, 
  onCheckedChange,
  disabled = false
}: { 
  label: string; 
  description: string; 
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-3 rounded-xl transition-colors",
      disabled ? "opacity-50" : "hover:bg-muted/50"
    )}>
      <div className="space-y-0.5">
        <Label className={cn("text-sm", disabled && "text-muted-foreground")}>
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
