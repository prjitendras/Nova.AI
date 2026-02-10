/**
 * Admin Layout - Premium sidebar navigation for admin panel
 */
"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAdminAccess, useSetupStatus } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import {
  Shield,
  Users,
  Loader2,
  Mail,
  Activity,
  Settings,
  FileText,
  LayoutDashboard,
  ChevronRight,
  Lock,
  AlertTriangle,
  Bell,
} from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    exact: true,
    requiredRole: "admin",
  },
  {
    title: "Access Control",
    href: "/admin/access-control",
    icon: Users,
    requiredRole: "admin",
  },
  {
    title: "Admin Users",
    href: "/admin/admins",
    icon: Shield,
    requiredRole: "super_admin",
  },
  {
    title: "Notification Center",
    href: "/admin/notifications",
    icon: Bell,
    requiredRole: "admin",
  },
  {
    title: "Email Templates",
    href: "/admin/email-templates",
    icon: Mail,
    requiredRole: "admin",
  },
  {
    title: "Audit Log",
    href: "/admin/audit-log",
    icon: FileText,
    requiredRole: "admin",
  },
  {
    title: "System Health",
    href: "/admin/health",
    icon: Activity,
    requiredRole: "admin",
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
    requiredRole: "super_admin",
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: accessData, isLoading: accessLoading, error: accessError } = useAdminAccess();
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();

  // Show loading only for setup status check initially
  if (setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // PRIORITY: If no super admin exists, redirect to bootstrap setup page
  if (setupStatus?.requires_setup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
            <div className="text-center mb-6">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Admin Setup Required</h1>
              <p className="text-white/70 mb-2">
                No super admin has been configured yet.
              </p>
              <p className="text-white/50 text-sm">
                Use the bootstrap login to set up the initial super admin.
              </p>
            </div>
            <Link
              href="/admin-setup"
              className="block w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl text-center hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
            >
              Go to Admin Setup
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while checking access
  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Check if user has admin access
  if (!accessData?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-xl border dark:border-slate-700">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
              <p className="text-slate-600 mb-6">
                You don&apos;t have permission to access the admin panel.
                Contact a Super Admin to get access.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center py-2 px-4 bg-slate-900 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Filter nav items based on role
  const visibleNavItems = navItems.filter((item) => {
    if (item.requiredRole === "super_admin") {
      return accessData?.is_super_admin;
    }
    return accessData?.is_admin;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Compact Header */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
        <div className="max-w-full mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight">Admin Console</h1>
                <p className="text-xs text-slate-400">System Administration</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium">{user?.display_name}</p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {accessData?.role?.replace("_", " ")}
                </p>
              </div>
              <Link
                href="/"
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
              >
                ← Back
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-full mx-auto flex">
        {/* Compact Sidebar */}
        <aside className="w-48 min-h-[calc(100vh-56px)] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col">
          <nav className="p-2 space-y-0.5 flex-1">
            {visibleNavItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 group",
                    isActive
                      ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-white" : "text-slate-400 dark:text-slate-500"
                    )}
                  />
                  <span className="text-xs font-medium truncate">{item.title}</span>
                  {isActive && (
                    <ChevronRight className="h-3 w-3 ml-auto shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Role Badge - Compact */}
          <div className="p-2 border-t border-slate-200 dark:border-slate-700">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                  accessData?.is_super_admin
                    ? "bg-gradient-to-br from-amber-500 to-orange-600"
                    : "bg-gradient-to-br from-blue-500 to-cyan-600"
                )}>
                  {user?.display_name?.charAt(0) || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user?.display_name?.split(" ")[0]}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize truncate">
                    {accessData?.role?.toLowerCase().replace("_", " ")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 min-h-[calc(100vh-56px)] overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
