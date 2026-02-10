/**
 * User Pill Component
 * Displays user avatar and name in a compact pill format
 */
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UserSnapshot } from "@/lib/types";

interface UserPillProps {
  user: UserSnapshot;
  showEmail?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(email: string): string {
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-rose-500",
  ];
  
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export function UserPill({ user, showEmail = false, size = "default", className }: UserPillProps) {
  const initials = getInitials(user.display_name);
  const avatarColor = getAvatarColor(user.email);
  
  const sizeClasses = {
    sm: {
      container: "gap-1.5",
      avatar: "h-5 w-5 text-[10px]",
      name: "text-xs",
      email: "text-[10px]",
    },
    default: {
      container: "gap-2",
      avatar: "h-6 w-6 text-xs",
      name: "text-sm",
      email: "text-xs",
    },
    lg: {
      container: "gap-2.5",
      avatar: "h-8 w-8 text-sm",
      name: "text-base",
      email: "text-sm",
    },
  };
  
  const sizes = sizeClasses[size];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center", sizes.container, className)}>
            <Avatar className={sizes.avatar}>
              <AvatarImage src={undefined} alt={user.display_name} />
              <AvatarFallback className={cn(avatarColor, "text-white font-medium")}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col leading-tight">
              <span className={cn("font-medium text-foreground", sizes.name)}>
                {user.display_name}
              </span>
              {showEmail && (
                <span className={cn("text-muted-foreground", sizes.email)}>
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{user.display_name}</p>
            <p className="text-muted-foreground">{user.email}</p>
            {user.role_at_time && (
              <p className="text-xs text-muted-foreground mt-1">
                Role: {user.role_at_time}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * User Avatar Only
 */
interface UserAvatarProps {
  user: UserSnapshot;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function UserAvatar({ user, size = "default", className }: UserAvatarProps) {
  const initials = getInitials(user.display_name);
  const avatarColor = getAvatarColor(user.email);
  
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    default: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className={cn(sizeClasses[size], className)}>
            <AvatarImage src={undefined} alt={user.display_name} />
            <AvatarFallback className={cn(avatarColor, "text-white font-medium")}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <p>{user.display_name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

