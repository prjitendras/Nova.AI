/**
 * Access Control Page - Manage persona-based access for users
 * Premium UI with checkboxes for Designer, Manager, Agent access
 */
"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useUserAccessList,
  useGrantUserAccess,
  useUpdateUserAccess,
  useRevokeUserAccess,
  type UserAccess,
} from "@/hooks/use-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserSearchSelect } from "@/components/user-search-select";
import { type DirectoryUser } from "@/hooks/use-directory";
import {
  Plus,
  Search,
  Shield,
  Users,
  Palette,
  ClipboardList,
  UserCog,
  Trash2,
  Edit3,
  Loader2,
  UserCircle,
  Check,
  Calendar,
  Sparkles,
  Lock,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Persona configuration
const personas = [
  {
    id: "designer",
    key: "has_designer_access" as const,
    label: "Designer",
    description: "Can access Workflow Studio to create and edit workflows",
    icon: Palette,
    color: "from-purple-500 to-pink-600",
    bg: "bg-purple-100 dark:bg-purple-900/40",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-300 dark:border-purple-700",
  },
  {
    id: "manager",
    key: "has_manager_access" as const,
    label: "Manager",
    description: "Can access Team Dashboard, Approvals, Assignments, Handovers",
    icon: ClipboardList,
    color: "from-blue-500 to-cyan-600",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-300 dark:border-blue-700",
  },
  {
    id: "agent",
    key: "has_agent_access" as const,
    label: "Agent",
    description: "Can access Agent Dashboard, My Tasks, Task History",
    icon: UserCog,
    color: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-300 dark:border-emerald-700",
  },
];

export default function AccessControlPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [revokeUser, setRevokeUser] = useState<UserAccess | null>(null);
  
  // New user form state
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [accessFlags, setAccessFlags] = useState({
    has_designer_access: false,
    has_manager_access: false,
    has_agent_access: false,
  });

  // Edit user form state
  const [editAccessFlags, setEditAccessFlags] = useState({
    has_designer_access: false,
    has_manager_access: false,
    has_agent_access: false,
  });

  const { data: usersData, isLoading } = useUserAccessList({ limit: 100 });
  const grantMutation = useGrantUserAccess();
  const updateMutation = useUpdateUserAccess();
  const revokeMutation = useRevokeUserAccess();

  const users = usersData?.items || [];
  const filteredUsers = users.filter((u) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (u.display_name || "").toLowerCase().includes(searchLower) ||
      (u.email || "").toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const designerCount = users.filter((u) => u.has_designer_access).length;
  const managerCount = users.filter((u) => u.has_manager_access).length;
  const agentCount = users.filter((u) => u.has_agent_access).length;

  // Reset form when dialog closes
  useEffect(() => {
    if (!isAddDialogOpen) {
      setSelectedUser(null);
      setAccessFlags({
        has_designer_access: false,
        has_manager_access: false,
        has_agent_access: false,
      });
    }
  }, [isAddDialogOpen]);

  // Set edit flags when editing user changes
  useEffect(() => {
    if (editingUser) {
      setEditAccessFlags({
        has_designer_access: editingUser.has_designer_access,
        has_manager_access: editingUser.has_manager_access,
        has_agent_access: editingUser.has_agent_access,
      });
    }
  }, [editingUser]);

  const handleGrantAccess = async () => {
    if (!selectedUser) return;
    
    await grantMutation.mutateAsync({
      email: selectedUser.email,
      display_name: selectedUser.display_name || selectedUser.email,
      aad_id: selectedUser.aad_id,
      has_designer_access: accessFlags.has_designer_access,
      has_manager_access: accessFlags.has_manager_access,
      has_agent_access: accessFlags.has_agent_access,
    });
    
    setIsAddDialogOpen(false);
  };

  const handleUpdateAccess = async () => {
    if (!editingUser) return;
    
    await updateMutation.mutateAsync({
      email: editingUser.email,
      has_designer_access: editAccessFlags.has_designer_access,
      has_manager_access: editAccessFlags.has_manager_access,
      has_agent_access: editAccessFlags.has_agent_access,
    });
    
    setEditingUser(null);
  };

  const handleRevokeAccess = async () => {
    if (!revokeUser) return;
    
    await revokeMutation.mutateAsync(revokeUser.email);
    setRevokeUser(null);
  };

  const hasAnyAccess = Object.values(accessFlags).some(Boolean);
  const hasAnyEditAccess = Object.values(editAccessFlags).some(Boolean);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Access Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage persona-based access for users across the application
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30">
              <Plus className="h-4 w-4 mr-2" />
              Grant Access
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                Grant Persona Access
              </DialogTitle>
              <DialogDescription className="text-base">
                Select a user and choose which personas they should have access to.
                By default, all users have access to Dashboard, Catalog, and My Tickets.
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-6">
              {/* User Search */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Search User</Label>
                <UserSearchSelect
                  value={selectedUser}
                  onChange={setSelectedUser}
                  placeholder="Search by name or email..."
                  showManualEntry={true}
                />
              </div>

              {/* Selected User Preview */}
              {selectedUser && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                      {(selectedUser.display_name || selectedUser.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {selectedUser.display_name || selectedUser.email}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{selectedUser.email}</p>
                    </div>
                    <Check className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              )}

              {/* Persona Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Select Personas</Label>
                <div className="grid gap-3">
                  {personas.map((persona) => {
                    const Icon = persona.icon;
                    const isSelected = accessFlags[persona.key];
                    
                    return (
                      <label
                        key={persona.id}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                          isSelected
                            ? `${persona.borderColor} ${persona.bg}`
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            setAccessFlags((prev) => ({
                              ...prev,
                              [persona.key]: Boolean(checked),
                            }))
                          }
                          className="h-5 w-5"
                        />
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
                          isSelected
                            ? `bg-gradient-to-br ${persona.color} shadow-lg`
                            : "bg-slate-100"
                        )}>
                          <Icon className={cn(
                            "h-6 w-6 transition-colors",
                            isSelected ? "text-white" : "text-slate-400 dark:text-slate-500"
                          )} />
                        </div>
                        <div className="flex-1">
                          <p className={cn(
                            "font-semibold transition-colors",
                            isSelected ? persona.textColor : "text-slate-700 dark:text-slate-300"
                          )}>
                            {persona.label}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{persona.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <Lock className="h-5 w-5 text-slate-400 mt-0.5" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <strong>Note:</strong> Users without any persona access will only see the 
                  main Dashboard, Service Catalog, and their own tickets.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGrantAccess}
                disabled={!selectedUser || !hasAnyAccess || grantMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-w-[140px]"
              >
                {grantMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Granting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Grant Access
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
                <Users className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{usersData?.total || 0}</p>
                <p className="text-sm text-white/70">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {personas.map((persona) => {
          const Icon = persona.icon;
          const count = persona.id === "designer" 
            ? designerCount 
            : persona.id === "manager" 
              ? managerCount 
              : agentCount;
          
          return (
            <Card key={persona.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                    persona.color
                  )}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{count}</p>
                    <p className="text-sm text-muted-foreground">{persona.label}s</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Users List */}
      <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">User Access List</CardTitle>
              <CardDescription>
                Users with one or more persona access grants
              </CardDescription>
            </div>
            <div className="relative w-80">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-700 transition-colors"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-5 border rounded-xl">
                  <Skeleton className="h-14 w-14 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-10 w-24" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mx-auto mb-4">
                <UserCircle className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No users found</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {searchQuery 
                  ? "Try adjusting your search query" 
                  : "Grant access to users to allow them to use specific personas in the application."}
              </p>
              {!searchQuery && (
                <Button 
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-to-r from-blue-600 to-purple-600"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Grant First Access
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.user_access_id}
                  className="flex items-center gap-4 p-5 border dark:border-slate-700 rounded-xl hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/30 transition-all group"
                >
                  {/* Avatar */}
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-lg shadow-md">
                    {(user.display_name || user.email || "?").charAt(0).toUpperCase()}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-semibold truncate">{user.display_name || user.email}</p>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-2">{user.email}</p>
                    
                    {/* Access Badges with Per-Persona Sources */}
                    <div className="flex flex-wrap gap-2">
                      {user.has_designer_access && (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-0 gap-1.5">
                            <Palette className="h-3 w-3" />
                            Designer
                          </Badge>
                          {user.designer_source && user.designer_source !== "MANUAL" && (
                            <span className="text-[10px] text-purple-500 dark:text-purple-400 font-medium">
                              (Auto)
                            </span>
                          )}
                        </div>
                      )}
                      {user.has_manager_access && (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-0 gap-1.5">
                            <ClipboardList className="h-3 w-3" />
                            Manager
                          </Badge>
                          {user.manager_source && user.manager_source !== "MANUAL" && (
                            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">
                              ({user.manager_source === "APPROVAL_ASSIGNMENT" ? "Auto: Approval" : 
                                user.manager_source === "APPROVAL_REASSIGNMENT" ? "Auto: Reassign" :
                                user.manager_source === "LOOKUP_ASSIGNMENT" ? "Auto: Lookup" : "Auto"})
                            </span>
                          )}
                        </div>
                      )}
                      {user.has_agent_access && (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-0 gap-1.5">
                            <UserCog className="h-3 w-3" />
                            Agent
                          </Badge>
                          {user.agent_source && user.agent_source !== "MANUAL" && (
                            <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">
                              ({user.agent_source === "TASK_ASSIGNMENT" ? "Auto: Task" : 
                                user.agent_source === "REASSIGN_AGENT" ? "Auto: Reassign" :
                                user.agent_source === "HANDOVER_ASSIGNMENT" ? "Auto: Handover" :
                                user.agent_source === "LOOKUP_ASSIGNMENT" ? "Auto: Lookup" : "Auto"})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="text-right hidden lg:block">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-end">
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(new Date(user.granted_at), { addSuffix: true })}
                    </p>
                    {/* Show who granted access - check per-persona sources first */}
                    {(() => {
                      // Find any auto-onboard source
                      const autoSources = [
                        user.manager_source && user.manager_source !== "MANUAL" ? user.manager_granted_by : null,
                        user.agent_source && user.agent_source !== "MANUAL" ? user.agent_granted_by : null,
                        user.designer_source && user.designer_source !== "MANUAL" ? user.designer_granted_by : null,
                      ].filter(Boolean);
                      
                      if (autoSources.length > 0) {
                        return (
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                            Auto-onboarded by {autoSources[0]}
                          </p>
                        );
                      }
                      // Fallback to legacy field
                      if (user.onboard_source && user.onboard_source !== "MANUAL" && user.onboarded_by_display_name) {
                        return (
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                            Auto-onboarded by {user.onboarded_by_display_name}
                          </p>
                        );
                      }
                      // Manual grant
                      if (user.granted_by) {
                        return (
                          <p className="text-xs text-muted-foreground mt-1">
                            by {user.granted_by}
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingUser(user)}
                      className="rounded-lg"
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeUser(user)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Edit3 className="h-5 w-5 text-white" />
              </div>
              Edit Access
            </DialogTitle>
            <DialogDescription>
              Update persona access for <strong>{editingUser?.display_name || editingUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            {personas.map((persona) => {
              const Icon = persona.icon;
              const isSelected = editAccessFlags[persona.key];
              
              return (
                <label
                  key={persona.id}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    isSelected
                      ? `${persona.borderColor} ${persona.bg}`
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      setEditAccessFlags((prev) => ({
                        ...prev,
                        [persona.key]: Boolean(checked),
                      }))
                    }
                    className="h-5 w-5"
                  />
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
                    isSelected
                      ? `bg-gradient-to-br ${persona.color} shadow-lg`
                      : "bg-slate-100"
                  )}>
                    <Icon className={cn(
                      "h-6 w-6 transition-colors",
                      isSelected ? "text-white" : "text-slate-400 dark:text-slate-500"
                    )} />
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "font-semibold transition-colors",
                      isSelected ? persona.textColor : "text-slate-700 dark:text-slate-300"
                    )}>
                      {persona.label}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{persona.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateAccess}
              disabled={!hasAnyEditAccess || updateMutation.isPending}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 min-w-[140px]"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeUser} onOpenChange={(open) => !open && setRevokeUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all persona access for <strong>{revokeUser?.display_name || revokeUser?.email}</strong>.
              They will only be able to access the main Dashboard, Catalog, and their own tickets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAccess}
              className="bg-red-600 hover:bg-red-700"
            >
              {revokeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                "Revoke Access"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
