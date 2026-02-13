/**
 * App Sidebar Component - Premium Edition
 * Main navigation sidebar with enhanced UI/UX
 */
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  FileText,
  ClipboardList,
  CheckSquare,
  Users,
  Settings,
  PlusCircle,
  BarChart3,
  ArrowRightLeft,
  History,
  type LucideIcon,
  Sparkles,
  Bot,
  Brain,
  Zap,
  Shield,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyAccess, useAdminAccess } from "@/hooks/use-admin";
import type { UserRole } from "@/lib/types";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { EXLLogo } from "@/components/exl-logo";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
  badge?: string | number;
  gradient?: string;
  description?: string;
}

const mainNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutGrid,
    roles: ["requester", "designer", "manager", "agent", "admin"],
    gradient: "from-violet-500 to-purple-500",
    description: "Overview & insights",
  },
  {
    title: "Catalog",
    href: "/catalog",
    icon: PlusCircle,
    roles: ["requester", "designer", "manager", "agent", "admin"],
    gradient: "from-emerald-500 to-green-500",
    description: "Browse services",
  },
  {
    title: "My Tickets",
    href: "/tickets",
    icon: ClipboardList,
    roles: ["requester", "designer", "manager", "agent", "admin"],
    gradient: "from-blue-500 to-cyan-500",
    description: "Track requests",
  },
];

const designerNavItems: NavItem[] = [
  {
    title: "Workflow Studio Agent",
    href: "/studio",
    icon: FileText,
    roles: ["designer", "admin"],
    gradient: "from-fuchsia-500 to-pink-500",
    description: "Design workflows",
  },
];

const managerNavItems: NavItem[] = [
  {
    title: "Team Dashboard",
    href: "/manager/dashboard",
    icon: BarChart3,
    roles: ["manager", "admin"],
    gradient: "from-amber-500 to-orange-500",
    description: "Team analytics",
  },
  {
    title: "Intelligent Approvals",
    href: "/manager/approvals",
    icon: CheckSquare,
    roles: ["manager", "admin"],
    gradient: "from-green-500 to-emerald-500",
    description: "Review & approve",
  },
  {
    title: "Smart Assignments",
    href: "/manager/assignments",
    icon: Users,
    roles: ["manager", "admin"],
    gradient: "from-blue-500 to-indigo-500",
    description: "Assign tasks",
  },
  {
    title: "Agent Handoff",
    href: "/manager/handovers",
    icon: ArrowRightLeft,
    roles: ["manager", "admin"],
    gradient: "from-purple-500 to-violet-500",
    description: "Transfer requests",
  },
  {
    title: "Change Request Agent",
    href: "/manager/change-requests",
    icon: FileText,
    roles: ["manager", "admin"],
    gradient: "from-teal-500 to-cyan-500",
    description: "Form change reviews",
  },
];

const agentNavItems: NavItem[] = [
  {
    title: "Agent Dashboard",
    href: "/agent/dashboard",
    icon: BarChart3,
    roles: ["agent", "admin"],
    gradient: "from-cyan-500 to-blue-500",
    description: "Your workspace",
  },
  {
    title: "My Tasks",
    href: "/agent/tasks",
    icon: CheckSquare,
    roles: ["agent", "admin"],
    gradient: "from-teal-500 to-green-500",
    description: "Pending tasks",
  },
  {
    title: "Task History",
    href: "/agent/history",
    icon: History,
    roles: ["agent", "admin"],
    gradient: "from-slate-500 to-gray-500",
    description: "Completed work",
  },
];

const adminNavItems: NavItem[] = [
  {
    title: "Admin Console",
    href: "/admin",
    icon: Settings,
    roles: ["admin"],
    gradient: "from-rose-500 to-red-500",
    description: "System settings",
  },
];

// Section icons for group headers
const sectionIcons: Record<string, LucideIcon> = {
  Main: Zap,
  "AI Designer": Brain,
  "Agent Supervisor": Shield,
  "Smart Agent": Bot,
  Administration: Settings,
};

// Section gradients
const sectionGradients: Record<string, string> = {
  Main: "from-violet-500 to-purple-500",
  "AI Designer": "from-fuchsia-500 to-pink-500",
  "Agent Supervisor": "from-amber-500 to-orange-500",
  "Smart Agent": "from-cyan-500 to-blue-500",
  Administration: "from-rose-500 to-red-500",
};

export function AppSidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const { data: myAccess } = useMyAccess();
  const { data: adminAccess } = useAdminAccess();

  const hasDesignerAccess = myAccess?.has_designer_access || myAccess?.is_admin || false;
  const hasManagerAccess = myAccess?.has_manager_access || myAccess?.is_admin || false;
  const hasAgentAccess = myAccess?.has_agent_access || myAccess?.is_admin || false;
  const hasAdminAccess = myAccess?.is_admin || adminAccess?.is_admin || false;

  const filterByRole = (
    items: NavItem[], 
    options: { 
      requiresDesigner?: boolean; 
      requiresManager?: boolean;
      requiresAgent?: boolean;
      requiresAdmin?: boolean;
    } = {}
  ) => {
    const { requiresDesigner, requiresManager, requiresAgent, requiresAdmin } = options;
    
    return items.filter((item) => {
      if (requiresDesigner && !hasDesignerAccess) return false;
      if (requiresManager && !hasManagerAccess) return false;
      if (requiresAgent && !hasAgentAccess) return false;
      if (requiresAdmin && !hasAdminAccess) return false;
      if (!item.roles) return true;
      return item.roles.some((role) => hasRole(role));
    });
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    return pathname.startsWith(href);
  };

  const renderNavGroup = (
    label: string,
    items: NavItem[],
    options: { requiresDesigner?: boolean; requiresManager?: boolean; requiresAgent?: boolean; requiresAdmin?: boolean } = {}
  ) => {
    const filteredItems = filterByRole(items, options);
    if (filteredItems.length === 0) return null;

    const SectionIcon = sectionIcons[label] || Zap;
    const gradient = sectionGradients[label] || "from-gray-500 to-gray-600";

    return (
      <SidebarGroup className="py-2">
        <SidebarGroupLabel className="px-3 mb-1">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded-md",
              "bg-gradient-to-br",
              gradient
            )}>
              <SectionIcon className="h-3 w-3 text-white" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              {label}
            </span>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="space-y-1 px-2 group-data-[collapsible=icon]:px-1">
            {filteredItems.map((item, index) => {
              const active = isActive(item.href);
              return (
                <SidebarMenuItem 
                  key={item.href}
                  className="animate-in fade-in slide-in-from-left-2"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: "backwards" }}
                >
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.title}
                    className={cn(
                      "relative group/item h-10 rounded-lg transition-all duration-200",
                      "hover:bg-accent/80",
                      // Expanded mode: show background styling
                      "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-0",
                      active && [
                        "bg-gradient-to-r from-primary/10 to-primary/5",
                        "border border-primary/20",
                        "hover:from-primary/15 hover:to-primary/10",
                        // Collapsed mode: no background, let the icon box stand alone
                        "group-data-[collapsible=icon]:from-transparent group-data-[collapsible=icon]:to-transparent"
                      ]
                    )}
                  >
                    <Link href={item.href} className="flex items-center gap-2.5 px-2.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
                      {/* Icon with gradient background when active */}
                      <div className={cn(
                        "relative flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-all duration-200",
                        // Collapsed mode: slightly larger icon box for visibility
                        "group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:rounded-lg",
                        active 
                          ? `bg-gradient-to-br ${item.gradient} shadow-sm` 
                          : "bg-muted/50 group-hover/item:bg-muted"
                      )}>
                        <item.icon className={cn(
                          "h-4 w-4 transition-all duration-200",
                          active ? "text-white" : "text-muted-foreground group-hover/item:text-foreground"
                        )} />
                      </div>
                      
                      {/* Text content */}
                      <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                        <span className={cn(
                          "block text-[13px] font-medium leading-tight whitespace-nowrap transition-colors duration-200",
                          active ? "text-foreground" : "text-muted-foreground group-hover/item:text-foreground"
                        )}>
                          {item.title}
                        </span>
                      </div>
                      
                      {/* Badge or arrow indicator */}
                      {item.badge ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "ml-auto text-[9px] h-4 px-1 font-bold",
                            "group-data-[collapsible=icon]:hidden",
                            active && "bg-primary/20 text-primary"
                          )}
                        >
                          {item.badge}
                        </Badge>
                      ) : (
                        <ChevronRight className={cn(
                          "h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-all duration-200",
                          "group-hover/item:opacity-100 group-hover/item:text-muted-foreground",
                          "group-data-[collapsible=icon]:hidden",
                          active && "opacity-100 text-primary"
                        )} />
                      )}
                      
                      {/* Active indicator line - only show when expanded */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar 
      collapsible="icon" 
      className={cn(
        "border-r border-border/50",
        "bg-gradient-to-b from-background via-background to-muted/20"
      )}
    >
      {/* Header - h-12 matches the main content header height */}
      <SidebarHeader className="h-12 shrink-0 px-2 py-1.5 border-b border-border/50 justify-center">
        <Link href="/dashboard" className="block">
          <div className="flex items-center justify-center gap-2.5 px-3 cursor-pointer group/brand hover:bg-accent/50 rounded-lg mx-1 transition-all duration-300 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:justify-center">
            {/* Logo - always visible, centered when collapsed */}
            <div className="relative flex-shrink-0">
              <EXLLogo size="sm" variant="icon" />
            </div>
            {/* Text - hidden when collapsed */}
            <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
              <div className="flex items-baseline gap-0.5">
                <span className="font-bold text-sm leading-tight text-[#FF6600]">
                  NOVA
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">.ai</span>
                <span className="text-[10px] font-medium text-muted-foreground ml-1">Workflow</span>
              </div>
              <span className="text-[9px] text-muted-foreground leading-tight font-medium">
                Intelligent Automation Platform
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      {/* Navigation Content */}
      <SidebarContent className="px-1 py-2">
        {renderNavGroup("Main", mainNavItems)}
        {renderNavGroup("AI Designer", designerNavItems, { requiresDesigner: true })}
        {renderNavGroup("Agent Supervisor", managerNavItems, { requiresManager: true })}
        {renderNavGroup("Smart Agent", agentNavItems, { requiresAgent: true })}
        {renderNavGroup("Administration", adminNavItems, { requiresAdmin: true })}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-border/50 bg-gradient-to-r from-muted/30 to-background">
        <div className="px-4 py-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <Bot className="h-3.5 w-3.5" />
              <span>Powered by AI</span>
            </div>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-bold border-primary/30 text-primary">
              v1.0.0
            </Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
