"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
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
  Filter,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, parseUTCDate } from "@/lib/utils";
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
  { icon: typeof Bell; color: string; bgColor: string; label: string }
> = {
  APPROVAL: {
    icon: UserCheck,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Approvals",
  },
  TASK: {
    icon: ClipboardCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    label: "Tasks",
  },
  INFO_REQUEST: {
    icon: MessageSquare,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Info Requests",
  },
  TICKET: {
    icon: Ticket,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    label: "Tickets",
  },
  SYSTEM: {
    icon: Info,
    color: "text-slate-600",
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    label: "System",
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
        "group relative p-4 transition-all hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-0 rounded-lg",
        !notification.is_read && "bg-primary/5 border-l-2 border-l-primary"
      )}
      onClick={() => onClick(notification)}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div className={cn("p-3 rounded-xl shrink-0 h-fit", config.bgColor)}>
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p
                  className={cn(
                    "text-base font-semibold leading-tight",
                    notification.is_read && "text-muted-foreground"
                  )}
                >
                  {notification.title}
                </p>
                <Badge variant="outline" className="text-[10px] h-5">
                  {config.label}
                </Badge>
                {!notification.is_read && (
                  <Badge className="h-5 text-[10px] bg-primary">New</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {notification.message}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {notification.actor_display_name && (
                  <span>by {notification.actor_display_name}</span>
                )}
                <span>•</span>
                <span title={format(parseUTCDate(notification.created_at), "PPpp")}>
                  {formatDistanceToNow(parseUTCDate(notification.created_at), {
                    addSuffix: true,
                  })}
                </span>
                {notification.ticket_id && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{notification.ticket_id}</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 shrink-0">
              {!notification.is_read && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead(notification.notification_id);
                  }}
                  disabled={isMarkingRead}
                  title="Mark as read"
                >
                  {isMarkingRead ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.notification_id);
                }}
                disabled={isDeleting}
                title="Delete"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [categoryFilter, setCategoryFilter] = useState<InAppNotificationCategory | "ALL">("ALL");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: unreadData } = useUnreadCount();
  const { data: notificationsData, isLoading } = useNotifications({
    limit: 100,
    unreadOnly: filter === "unread",
    category: categoryFilter !== "ALL" ? categoryFilter : undefined,
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
    if (!notification.is_read) {
      markAsRead.mutate(notification.notification_id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {unreadCount} unread
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Stay updated with all your activities
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as "all" | "unread")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread only</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={categoryFilter}
                onValueChange={(v) =>
                  setCategoryFilter(v as InAppNotificationCategory | "ALL")
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={markAllAsRead.isPending}
                className="gap-2"
              >
                {markAllAsRead.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                Mark all as read
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            {filter === "unread" ? "Unread Notifications" : "All Notifications"}
          </CardTitle>
          <CardDescription>
            {notificationsData?.total ?? 0} total notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">
                No notifications
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "unread"
                  ? "You've read all your notifications!"
                  : "You don't have any notifications yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notification) => (
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
