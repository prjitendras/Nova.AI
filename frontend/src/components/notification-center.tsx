/**
 * Notification Center Component
 * Beautiful dropdown for in-app notifications bell
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ClipboardCheck,
  UserCheck,
  MessageSquare,
  Ticket,
  Info,
  Loader2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
} from "@/hooks/use-notifications";
import type { InAppNotification, InAppNotificationCategory } from "@/lib/types";

// Category configuration
const categoryConfig: Record<
  InAppNotificationCategory,
  { icon: typeof Bell; color: string; bgColor: string }
> = {
  APPROVAL: {
    icon: UserCheck,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  TASK: {
    icon: ClipboardCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  INFO_REQUEST: {
    icon: MessageSquare,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  TICKET: {
    icon: Ticket,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  SYSTEM: {
    icon: Info,
    color: "text-slate-600",
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
  },
};

interface NotificationItemProps {
  notification: InAppNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (notification: InAppNotification) => void;
  isMarkingRead?: boolean;
  isDeleting?: boolean;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
  isMarkingRead,
  isDeleting,
}: NotificationItemProps) {
  const config = categoryConfig[notification.category] || categoryConfig.SYSTEM;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group relative p-3 transition-all hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-0",
        !notification.is_read && "bg-primary/5"
      )}
      onClick={() => onClick(notification)}
    >
      {/* Unread indicator */}
      {!notification.is_read && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      )}

      <div className="flex gap-3 pl-2">
        {/* Icon */}
        <div className={cn("p-2 rounded-lg shrink-0", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-sm font-medium leading-tight",
                notification.is_read && "text-muted-foreground"
              )}
            >
              {notification.title}
            </p>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
              {formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          {notification.actor_display_name && (
            <p className="text-[10px] text-muted-foreground mt-1">
              by {notification.actor_display_name}
            </p>
          )}
        </div>
      </div>

      {/* Actions (shown on hover) */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.notification_id);
            }}
            disabled={isMarkingRead}
          >
            {isMarkingRead ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.notification_id);
          }}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Queries and mutations - apiClient handles auth automatically
  const { data: unreadData } = useUnreadCount({
    pollingInterval: 30000, // Poll every 30 seconds
  });

  const { data: notificationsData, isLoading } = useNotifications({
    limit: 20,
    enabled: open, // Only fetch when popover is open
  });

  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteNotification = useDeleteNotification();

  const unreadCount = unreadData?.unread_count ?? 0;
  const notifications = notificationsData?.items ?? [];

  const handleMarkAsRead = (id: string) => {
    setActioningId(id);
    markAsRead.mutate(id, {
      onSettled: () => setActioningId(null),
    });
  };

  const handleDelete = (id: string) => {
    setActioningId(id);
    deleteNotification.mutate(id, {
      onSettled: () => setActioningId(null),
    });
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const handleNotificationClick = (notification: InAppNotification) => {
    // Mark as read if not already
    if (!notification.is_read) {
      markAsRead.mutate(notification.notification_id);
    }

    // Navigate to action URL
    if (notification.action_url) {
      setOpen(false);
      router.push(notification.action_url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-96 p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications list */}
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted mb-3">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll notify you when something happens
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.notification_id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDelete={handleDelete}
                onClick={handleNotificationClick}
                isMarkingRead={
                  actioningId === notification.notification_id &&
                  markAsRead.isPending
                }
                isDeleting={
                  actioningId === notification.notification_id &&
                  deleteNotification.isPending
                }
              />
            ))
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
            >
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
