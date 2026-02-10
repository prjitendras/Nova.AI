/**
 * Admin Users Management Page
 * Super Admin only - Manage admin access
 */
"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useAdminAccess,
} from "@/hooks/use-admin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { type DirectoryUser } from "@/hooks/use-directory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Users,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Search,
  Calendar,
  Crown,
  Loader2,
  UserCircle,
  AlertTriangle,
} from "lucide-react";

interface AdminUser {
  admin_user_id: string;
  aad_id: string | null;
  email: string;
  display_name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DESIGNER";
  granted_by: string | null;
  granted_at: string;
  is_active: boolean;
}

// Custom hooks for admin management
function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const response = await apiClient.get<{ items: AdminUser[]; total: number }>("/admin/admins");
      return response;
    },
  });
}

function useGrantAdminAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; display_name: string; aad_id?: string; role?: string }) => {
      return apiClient.post<{ message: string; admin: AdminUser }>("/admin/admins", data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(data.message || "Admin access granted successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to grant admin access");
    },
  });
}

function useRevokeAdminAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      return apiClient.delete(`/admin/admins/${encodeURIComponent(email)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Admin access revoked successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke admin access");
    },
  });
}

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "SUPER_ADMIN">("ADMIN");
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);
  const [promoteAdmin, setPromoteAdmin] = useState<AdminUser | null>(null);

  const { data: accessData } = useAdminAccess();
  const { data: adminsData, isLoading } = useAdminUsers();
  const grantMutation = useGrantAdminAccess();
  const revokeMutation = useRevokeAdminAccess();

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
            Only Super Admins can manage admin users.
          </p>
        </div>
      </div>
    );
  }

  const admins = adminsData?.items || [];
  
  // Only show Super Admins and Admins (not Designers - they have their own page)
  const adminUsersOnly = admins.filter((a) => a.role === "SUPER_ADMIN" || a.role === "ADMIN");
  
  const filteredAdmins = adminUsersOnly.filter((a) => {
    const searchLower = searchQuery.toLowerCase();
    const nameMatch = (a.display_name || "").toLowerCase().includes(searchLower);
    const emailMatch = (a.email || "").toLowerCase().includes(searchLower);
    return nameMatch || emailMatch;
  });

  // Separate by role
  const superAdmins = filteredAdmins.filter((a) => a.role === "SUPER_ADMIN");
  const regularAdmins = filteredAdmins.filter((a) => a.role === "ADMIN");

  const handleGrantAccess = async () => {
    if (!selectedUser || !selectedUser.email) return;

    await grantMutation.mutateAsync({
      email: selectedUser.email,
      display_name: selectedUser.display_name || selectedUser.email.split("@")[0],
      aad_id: selectedUser.aad_id || undefined,
      role: selectedRole,
    });

    // Reset form
    setSelectedUser(null);
    setSelectedRole("ADMIN");
    setIsAddDialogOpen(false);
  };

  const handleRevokeAccess = async () => {
    if (!revokeEmail) return;
    await revokeMutation.mutateAsync(revokeEmail);
    setRevokeEmail(null);
  };

  const handlePromoteToSuperAdmin = async () => {
    if (!promoteAdmin) return;
    await grantMutation.mutateAsync({
      email: promoteAdmin.email,
      display_name: promoteAdmin.display_name,
      aad_id: promoteAdmin.aad_id || undefined,
      role: "SUPER_ADMIN",
    });
    setPromoteAdmin(null);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return (
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
            <Crown className="h-3 w-3 mr-1" />
            Super Admin
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Users</h1>
          <p className="text-muted-foreground mt-1">
            Manage system administrators
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  selectedRole === "SUPER_ADMIN" 
                    ? "bg-gradient-to-br from-amber-500 to-orange-600" 
                    : "bg-gradient-to-br from-blue-500 to-cyan-600"
                }`}>
                  {selectedRole === "SUPER_ADMIN" ? (
                    <Crown className="h-4 w-4 text-white" />
                  ) : (
                    <Shield className="h-4 w-4 text-white" />
                  )}
                </div>
                Grant {selectedRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"} Access
              </DialogTitle>
              <DialogDescription>
                {selectedRole === "SUPER_ADMIN" 
                  ? "Super Admins have full system access including managing other admins."
                  : "Admins can manage designers, view audit logs, and configure email templates."
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Role Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Role</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("ADMIN")}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedRole === "ADMIN"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400"
                        : "border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        selectedRole === "ADMIN"
                          ? "bg-gradient-to-br from-blue-500 to-cyan-600"
                          : "bg-blue-100 dark:bg-blue-800/50"
                      }`}>
                        <ShieldCheck className={`h-5 w-5 ${
                          selectedRole === "ADMIN" ? "text-white" : "text-blue-600 dark:text-blue-300"
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Admin</p>
                        <p className="text-xs text-muted-foreground">Standard access</p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole("SUPER_ADMIN")}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedRole === "SUPER_ADMIN"
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-400"
                        : "border-slate-200 dark:border-slate-600 hover:border-amber-300 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        selectedRole === "SUPER_ADMIN"
                          ? "bg-gradient-to-br from-amber-500 to-orange-600"
                          : "bg-amber-100 dark:bg-amber-800/50"
                      }`}>
                        <Crown className={`h-5 w-5 ${
                          selectedRole === "SUPER_ADMIN" ? "text-white" : "text-amber-600 dark:text-amber-300"
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Super Admin</p>
                        <p className="text-xs text-muted-foreground">Full access</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* User Search */}
              <UserSearchSelect
                value={selectedUser}
                onChange={setSelectedUser}
                label="Search User"
                placeholder="Search by name or email..."
                showManualEntry={true}
              />
              
              {/* Warning for Super Admin */}
              {selectedRole === "SUPER_ADMIN" && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">Super Admin Privileges</p>
                    <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                      This user will have full system access including the ability to create/remove other admins.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                setSelectedUser(null);
                setSelectedRole("ADMIN");
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleGrantAccess}
                disabled={!selectedUser || grantMutation.isPending}
                className={selectedRole === "SUPER_ADMIN" 
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                  : "bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                }
              >
                {grantMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Granting...
                  </>
                ) : (
                  <>
                    {selectedRole === "SUPER_ADMIN" ? <Crown className="h-4 w-4 mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                    Grant {selectedRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"} Access
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-slate-200 dark:border-slate-700/50 shadow-sm bg-white dark:bg-slate-800/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Crown className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{superAdmins.length}</p>
                <p className="text-sm text-muted-foreground">Super Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-slate-700/50 shadow-sm bg-white dark:bg-slate-800/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{regularAdmins.length}</p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-slate-700/50 shadow-sm bg-white dark:bg-slate-800/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{superAdmins.length + regularAdmins.length}</p>
                <p className="text-sm text-muted-foreground">Total Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin List */}
      <Card className="border border-slate-200 dark:border-slate-700/50 shadow-sm bg-white dark:bg-slate-800/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">All Administrators</CardTitle>
              <CardDescription>Users with admin privileges</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search admins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-xl">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              ))}
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="text-center py-12">
              <UserCircle className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No admins found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try a different search term" : "Add your first admin"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Admin
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAdmins.map((admin) => (
                <div
                  key={admin.admin_user_id}
                  className="flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-700/50 rounded-xl hover:border-blue-300 dark:hover:border-blue-600/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all group"
                >
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${
                    admin.role === "SUPER_ADMIN" 
                      ? "bg-gradient-to-br from-amber-500 to-orange-600" 
                      : "bg-gradient-to-br from-blue-500 to-cyan-600"
                  }`}>
                    {(admin.display_name || admin.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{admin.display_name || admin.email}</p>
                      {getRoleBadge(admin.role)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{admin.email}</p>
                    {admin.granted_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Granted {formatDistanceToNow(new Date(admin.granted_at), { addSuffix: true })}
                        {admin.granted_by && ` by ${admin.granted_by}`}
                      </p>
                    )}
                  </div>
                  {admin.role === "ADMIN" && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                        onClick={() => setPromoteAdmin(admin)}
                      >
                        <Crown className="h-4 w-4 mr-1" />
                        Promote
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                        onClick={() => setRevokeEmail(admin.email)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={!!revokeEmail} onOpenChange={() => setRevokeEmail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Admin Access?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke admin access for <strong>{revokeEmail}</strong>?
              They will no longer be able to manage designers or access the admin panel.
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

      {/* Promote to Super Admin Confirmation Dialog */}
      <AlertDialog open={!!promoteAdmin} onOpenChange={() => setPromoteAdmin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <AlertDialogTitle>Promote to Super Admin?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="sr-only">
              Confirm promoting user to Super Admin role
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Content moved outside AlertDialogDescription to avoid hydration error */}
          <div className="space-y-3 text-muted-foreground text-sm">
            <p>
              Are you sure you want to promote <strong className="text-foreground">{promoteAdmin?.display_name || promoteAdmin?.email}</strong> to Super Admin?
            </p>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
              <span className="text-sm text-amber-800 dark:text-amber-200 font-semibold">
                Super Admin privileges include:
              </span>
              <ul className="text-xs text-amber-700 dark:text-amber-300 mt-2 space-y-1 list-disc list-inside">
                <li>Create and remove other admins</li>
                <li>Create other super admins</li>
                <li>Full system access</li>
              </ul>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePromoteToSuperAdmin}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              {grantMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Promoting...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Promote to Super Admin
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
