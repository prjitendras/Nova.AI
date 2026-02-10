/**
 * Designer Access Management Page
 * Grant and revoke designer access to users
 */
"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useDesigners,
  useGrantDesignerAccess,
  useRevokeDesignerAccess,
} from "@/hooks/use-admin";
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
  Palette,
  Trash2,
  Search,
  Calendar,
  Shield,
  Loader2,
  UserCircle,
} from "lucide-react";

export default function DesignersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);

  const { data: designersData, isLoading } = useDesigners();
  const grantMutation = useGrantDesignerAccess();
  const revokeMutation = useRevokeDesignerAccess();

  const designers = designersData?.items || [];
  const filteredDesigners = designers.filter((d) => {
    const searchLower = searchQuery.toLowerCase();
    const nameMatch = (d.display_name || "").toLowerCase().includes(searchLower);
    const emailMatch = (d.email || "").toLowerCase().includes(searchLower);
    return nameMatch || emailMatch;
  });

  const handleGrantAccess = async () => {
    if (!selectedUser || !selectedUser.email) return;

    await grantMutation.mutateAsync({
      email: selectedUser.email,
      display_name: selectedUser.display_name || selectedUser.email.split("@")[0],
      aad_id: selectedUser.aad_id || undefined,
    });

    setSelectedUser(null);
    setIsAddDialogOpen(false);
  };

  const handleRevokeAccess = async () => {
    if (!revokeEmail) return;
    await revokeMutation.mutateAsync(revokeEmail);
    setRevokeEmail(null);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Designer Access</h1>
          <p className="text-muted-foreground mt-1">
            Manage who can create and edit workflows
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              Grant Access
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-white" />
                </div>
                Grant Designer Access
              </DialogTitle>
              <DialogDescription>
                Search for a user to grant them access to the workflow designer.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <UserSearchSelect
                value={selectedUser}
                onChange={setSelectedUser}
                label="Search User"
                placeholder="Search by name or email..."
                showManualEntry={true}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGrantAccess}
                disabled={!selectedUser || grantMutation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              >
                {grantMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Granting...
                  </>
                ) : (
                  "Grant Access"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Palette className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{designersData?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Active Designers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">Workflow</p>
                <p className="text-sm text-muted-foreground">Access Level</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">Managed</p>
                <p className="text-sm text-muted-foreground">By Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Designers List */}
      <Card className="border-0 shadow-md bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">All Designers</CardTitle>
              <CardDescription>Users with workflow design permissions</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search designers..."
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
              {[...Array(5)].map((_, i) => (
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
          ) : filteredDesigners.length === 0 ? (
            <div className="text-center py-12">
              <UserCircle className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No designers found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try a different search term" : "Grant access to your first designer"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Designer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDesigners.map((designer) => (
                <div
                  key={designer.admin_user_id}
                  className="flex items-center gap-4 p-4 border rounded-xl hover:border-emerald-200 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all group"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {(designer.display_name || designer.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{designer.display_name || designer.email}</p>
                      <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                        Designer
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{designer.email}</p>
                    {designer.granted_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Granted {formatDistanceToNow(new Date(designer.granted_at), { addSuffix: true })}
                        {designer.granted_by && ` by ${designer.granted_by}`}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setRevokeEmail(designer.email)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Revoke
                  </Button>
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
            <AlertDialogTitle>Revoke Designer Access?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke designer access for <strong>{revokeEmail}</strong>?
              They will no longer be able to create or edit workflows.
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
