/**
 * Authenticated Layout
 * Shows the main app layout for authenticated users
 * Authentication is already handled by MsalAuthenticationTemplate in providers.tsx
 */
"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, LogOut, User, Settings, ChevronDown, Shield, Mail, Palette, Users, ClipboardList, LayoutDashboard, Cog } from "lucide-react";
import { NotificationCenter } from "@/components/notification-center";
import { GlobalSearch } from "@/components/global-search";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AIChatbot } from "@/components/ai-chatbot";
import { AgentCommandCenter } from "@/components/agent-command-center";
import { ProtectedRoute } from "@/components/protected-route";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Persona configuration based on route
const personaConfig: Record<string, { name: string; color: string; bgColor: string; icon: typeof User }> = {
  designer: { 
    name: "AI Designer", 
    color: "text-violet-700 dark:text-violet-300", 
    bgColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800",
    icon: Palette
  },
  manager: { 
    name: "Agent Supervisor", 
    color: "text-amber-700 dark:text-amber-300", 
    bgColor: "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800",
    icon: Users
  },
  agent: { 
    name: "Smart Agent", 
    color: "text-emerald-700 dark:text-emerald-300", 
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800",
    icon: ClipboardList
  },
  admin: { 
    name: "Administrator", 
    color: "text-rose-700 dark:text-rose-300", 
    bgColor: "bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800",
    icon: Cog
  },
  requester: { 
    name: "Requester", 
    color: "text-blue-700 dark:text-blue-300", 
    bgColor: "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800",
    icon: LayoutDashboard
  },
};

function getCurrentPersona(pathname: string): { name: string; color: string; bgColor: string; icon: typeof User } {
  if (pathname.startsWith("/studio")) return personaConfig.designer;
  if (pathname.startsWith("/manager")) return personaConfig.manager;
  if (pathname.startsWith("/agent")) return personaConfig.agent;
  if (pathname.startsWith("/admin")) return personaConfig.admin;
  // Default to requester for catalog, tickets, dashboard
  return personaConfig.requester;
}

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

function getInitials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const { user, isLoading, logout, roles } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  // Show loading while checking auth (brief)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const initials = getInitials(user?.display_name || "");
  const primaryRole = roles[0] || "user";
  const currentPersona = getCurrentPersona(pathname);

  // User is authenticated (MsalAuthenticationTemplate ensures this)
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-4">
          <SidebarTrigger className="-ml-1" />
          
          {/* Current Persona Badge */}
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${currentPersona.bgColor} transition-all duration-300`}>
            <currentPersona.icon className={`h-3.5 w-3.5 ${currentPersona.color}`} />
            <span className={`font-semibold ${currentPersona.color}`}>
              {currentPersona.name}
            </span>
          </div>
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* Global Search */}
            <GlobalSearch />

            {/* Notifications */}
            <NotificationCenter />

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-accent">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" align="end" sideOffset={8}>
                {/* User Info Section */}
                <div className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-semibold truncate">{user?.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user?.email}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="secondary" className="h-5 text-[10px] px-1.5 capitalize">
                          <Shield className="h-2.5 w-2.5 mr-1" />
                          {primaryRole}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/profile" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    <span>My Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={logout} 
                  className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        
        {/* Main Content - Protected by route-level access control */}
        <div className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <ProtectedRoute>
            {children}
          </ProtectedRoute>
        </div>
      </SidebarInset>
      
      {/* AI Chatbot - Available on all pages */}
      <AIChatbot />
      
      {/* Agent Command Center - Admin/SuperAdmin only */}
      <AgentCommandCenter />
    </SidebarProvider>
  );
}
