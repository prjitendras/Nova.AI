/**
 * Protected Route Component
 * Enforces access control at the route level.
 * Even if sidebar hides links, users cannot access protected routes via URL.
 */
"use client";

import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMyAccess, useAdminAccess } from "@/hooks/use-admin";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route access configuration.
 * Maps route prefixes to the access check required.
 * Routes not listed here are accessible to all authenticated users.
 */
interface RouteRule {
  pathPrefix: string;
  requiredAccess: "designer" | "manager" | "agent" | "admin";
}

const protectedRoutes: RouteRule[] = [
  // Designer routes
  { pathPrefix: "/studio", requiredAccess: "designer" },

  // Manager routes
  { pathPrefix: "/manager", requiredAccess: "manager" },

  // Agent routes
  { pathPrefix: "/agent", requiredAccess: "agent" },

  // Admin routes
  { pathPrefix: "/admin", requiredAccess: "admin" },
];

function AccessDenied() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-6 max-w-md text-center px-4">
        {/* Icon */}
        <div className="relative">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/20">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
            <span className="text-destructive-foreground text-xs font-bold">!</span>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You don&apos;t have the required permissions to access this page. 
            If you believe this is a mistake, please contact your administrator to request access.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const pathname = usePathname();
  const { data: myAccess, isLoading: isMyAccessLoading } = useMyAccess();
  const { data: adminAccess, isLoading: isAdminAccessLoading } = useAdminAccess();

  // Determine which access is required for the current route
  const matchedRule = protectedRoutes.find((rule) =>
    pathname.startsWith(rule.pathPrefix)
  );

  // If no rule matches, the route is open to all authenticated users
  if (!matchedRule) {
    return <>{children}</>;
  }

  // While access data is loading, show a brief loader
  if (isMyAccessLoading || isAdminAccessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Check access based on the required role
  const hasDesignerAccess = myAccess?.has_designer_access || myAccess?.is_admin || false;
  const hasManagerAccess = myAccess?.has_manager_access || myAccess?.is_admin || false;
  const hasAgentAccess = myAccess?.has_agent_access || myAccess?.is_admin || false;
  const hasAdminAccess = myAccess?.is_admin || adminAccess?.is_admin || false;

  let hasAccess = false;

  switch (matchedRule.requiredAccess) {
    case "designer":
      hasAccess = hasDesignerAccess;
      break;
    case "manager":
      hasAccess = hasManagerAccess;
      break;
    case "agent":
      hasAccess = hasAgentAccess;
      break;
    case "admin":
      hasAccess = hasAdminAccess;
      break;
  }

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
