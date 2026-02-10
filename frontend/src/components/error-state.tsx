/**
 * Error State Component
 * Displays error messages with retry functionality
 */
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title = "Something went wrong",
  message = "An error occurred while loading the data. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
        <Icon className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Preset error states
 */
export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon={WifiOff}
      title="Connection Error"
      message="Unable to connect to the server. Please check your internet connection and try again."
      onRetry={onRetry}
    />
  );
}

export function ServerError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon={ServerCrash}
      title="Server Error"
      message="The server encountered an error. Our team has been notified. Please try again later."
      onRetry={onRetry}
    />
  );
}

export function UnauthorizedError({ onLogin }: { onLogin?: () => void }) {
  return (
    <ErrorState
      icon={Lock}
      title="Access Denied"
      message="You don't have permission to access this resource. Please log in with an authorized account."
      onRetry={onLogin}
    />
  );
}

export function NotFoundError({ onGoBack }: { onGoBack?: () => void }) {
  return (
    <ErrorState
      title="Not Found"
      message="The resource you're looking for doesn't exist or has been removed."
      onRetry={onGoBack}
    />
  );
}

/**
 * Inline Error
 */
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md",
        className
      )}
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

