/**
 * User Profile Page
 * Displays user information and account settings
 */
"use client";

import { useAuth } from "@/hooks/use-auth";
import { useMyAccess } from "@/hooks/use-admin";
import { PageContainer, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Mail,
  Building2,
  Shield,
  CheckCircle2,
  Clock,
  Sparkles,
  Fingerprint,
  CalendarDays,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: myAccess, isLoading: accessLoading } = useMyAccess();

  const isLoading = authLoading || accessLoading;

  // Get initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get roles/access badges
  const accessBadges = [];
  if (myAccess?.is_admin) accessBadges.push({ label: "Super Admin", color: "bg-rose-500" });
  if (myAccess?.has_designer_access) accessBadges.push({ label: "Designer", color: "bg-fuchsia-500" });
  if (myAccess?.has_manager_access) accessBadges.push({ label: "Manager", color: "bg-amber-500" });
  if (myAccess?.has_agent_access) accessBadges.push({ label: "Agent", color: "bg-cyan-500" });
  if (accessBadges.length === 0) accessBadges.push({ label: "Requester", color: "bg-slate-500" });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-4xl">
      {/* Hero Section */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 p-8 text-white">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-white/20 blur" />
            <Avatar className="relative h-24 w-24 border-4 border-white/30 shadow-2xl">
              <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
                {getInitials(user?.display_name)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 border-2 border-white">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          </div>
          
          {/* User Info */}
          <div className="text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <h1 className="text-2xl font-bold">{user?.display_name || "User"}</h1>
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <p className="text-white/80 mb-4">{user?.email}</p>
            
            {/* Access Badges */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {accessBadges.map((badge) => (
                <Badge
                  key={badge.label}
                  className={cn(
                    "text-white border-white/30 shadow-lg",
                    badge.color
                  )}
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>
          
          {/* AI Badge */}
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
            <Bot className="h-5 w-5" />
            <span className="text-sm font-medium">AI Verified</span>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Account Information
            </CardTitle>
            <CardDescription>Your personal account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Display Name</p>
                <p className="text-sm font-semibold truncate">{user?.display_name || "Not set"}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Email Address</p>
                <p className="text-sm font-semibold truncate">{user?.email || "Not set"}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Fingerprint className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Account ID</p>
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {user?.aad_id || "Azure AD"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access & Permissions */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Access & Permissions
            </CardTitle>
            <CardDescription>Your system access levels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <AccessItem 
                label="Designer Access" 
                description="Create and manage workflows"
                hasAccess={myAccess?.has_designer_access || myAccess?.is_admin} 
              />
              <AccessItem 
                label="Manager Access" 
                description="Approve requests and assign tasks"
                hasAccess={myAccess?.has_manager_access || myAccess?.is_admin} 
              />
              <AccessItem 
                label="Agent Access" 
                description="Execute assigned tasks"
                hasAccess={myAccess?.has_agent_access || myAccess?.is_admin} 
              />
              <AccessItem 
                label="Admin Access" 
                description="Full system administration"
                hasAccess={myAccess?.is_admin} 
              />
            </div>
            
            <Separator />
            
            <div className="text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Access managed by system administrators
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Organization */}
        <Card className="border-border/50 shadow-lg md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Organization
            </CardTitle>
            <CardDescription>Your organization and authentication details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Organization</p>
                  <p className="text-sm font-semibold">EXL Service</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Auth Provider</p>
                  <p className="text-sm font-semibold">Microsoft Entra ID</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                  <CheckCircle2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Account Status</p>
                  <p className="text-sm font-semibold text-emerald-600">Active</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

// Access Item Component
function AccessItem({ 
  label, 
  description, 
  hasAccess 
}: { 
  label: string; 
  description: string; 
  hasAccess?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl transition-colors",
      hasAccess ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-muted/30"
    )}>
      <div className={cn(
        "p-1.5 rounded-full",
        hasAccess ? "bg-emerald-500" : "bg-muted"
      )}>
        <CheckCircle2 className={cn(
          "h-3.5 w-3.5",
          hasAccess ? "text-white" : "text-muted-foreground"
        )} />
      </div>
      <div className="flex-1">
        <p className={cn(
          "text-sm font-medium",
          hasAccess ? "text-foreground" : "text-muted-foreground"
        )}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant={hasAccess ? "default" : "secondary"} className="text-xs">
        {hasAccess ? "Enabled" : "Disabled"}
      </Badge>
    </div>
  );
}
