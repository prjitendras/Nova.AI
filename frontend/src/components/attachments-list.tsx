/**
 * AttachmentsList Component
 * Display and download attachments for a ticket
 */
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import axios from "axios";
import { config } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Paperclip,
  Download,
  FileText,
  Image,
  File as FileIcon,
  User,
  Calendar,
  MessageSquare,
  FormInput,
  Folder,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface AttachmentData {
  attachment_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: {
    email: string;
    display_name: string;
  };
  context: string;
  field_label?: string;
  step_id?: string;
  ticket_step_id?: string;
  step_name?: string;
  description?: string;
}

interface AttachmentsResponse {
  ticket_id: string;
  total_count: number;
  attachments: AttachmentData[];
  grouped: Record<string, AttachmentData[]>;
}

// Get file icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf") || mimeType.includes("document")) return FileText;
  return FileIcon;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Parse group key to extract step name and base context
// Group keys can be: "step_name::context" or just "context"
function parseGroupKey(groupKey: string): { stepName?: string; context: string } {
  if (groupKey.includes('::')) {
    const [stepName, context] = groupKey.split('::');
    return { stepName, context };
  }
  return { context: groupKey };
}

// Get context label and icon with detailed description
function getContextInfo(groupKey: string, fieldLabel?: string, uploaderName?: string): { 
  label: string; 
  description: string;
  icon: typeof Paperclip; 
  color: string;
  bgColor: string;
  emoji: string;
} {
  const { stepName, context } = parseGroupKey(groupKey);
  
  switch (context) {
    case "form":
      return { 
        label: "Form Submission", 
        description: uploaderName ? `Submitted with form by ${uploaderName}` : "Submitted with form",
        icon: FormInput, 
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        emoji: "📋"
      };
    case "info_request":
      return { 
        label: "Info Request", 
        description: uploaderName ? `Attached by ${uploaderName} in response to info request` : "Attached in info request response",
        icon: MessageSquare, 
        color: "text-purple-600 dark:text-purple-400",
        bgColor: "bg-purple-100 dark:bg-purple-900/30",
        emoji: "💬"
      };
    case "form_field":
      return { 
        label: "Ticket Attachments", 
        description: uploaderName ? `Uploaded during ticket creation by ${uploaderName}` : "Uploaded during ticket creation",
        icon: FormInput, 
        color: "text-cyan-600 dark:text-cyan-400",
        bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
        emoji: "📝"
      };
    case "requester_note":
      return { 
        label: "Requester Attachments", 
        description: uploaderName ? `Attached by ${uploaderName} (Requester)` : "Attached by requester",
        icon: User, 
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
        emoji: "👤"
      };
    case "approval_note":
      return { 
        label: stepName ? `${stepName}` : "Approval Note", 
        description: uploaderName ? `Attached by ${uploaderName} (Approver)` : "Attached by approver",
        icon: Paperclip, 
        color: "text-orange-600 dark:text-orange-400",
        bgColor: "bg-orange-100 dark:bg-orange-900/30",
        emoji: "✓"
      };
    case "task_note":
      return { 
        label: stepName ? `${stepName}` : "Task Note", 
        description: uploaderName ? `Attached by ${uploaderName} (Agent)` : "Attached by agent",
        icon: Paperclip, 
        color: "text-indigo-600 dark:text-indigo-400",
        bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
        emoji: "📋"
      };
    case "ticket":
    default:
      return { 
        label: "Ticket Attachments", 
        description: uploaderName ? `Uploaded during ticket creation by ${uploaderName}` : "Uploaded during ticket creation",
        icon: Folder, 
        color: "text-slate-600 dark:text-slate-400",
        bgColor: "bg-slate-100 dark:bg-slate-800/50",
        emoji: "📁"
      };
  }
}

// Helper to parse UTC timestamps safely - handles multiple date formats
function parseUTCDate(dateString: string | undefined | null): Date | null {
  if (!dateString) return null;
  try {
    // Try parsing as-is first (handles ISO format with timezone)
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) return date;
    
    // Try adding Z suffix for UTC
    if (!dateString.endsWith("Z") && !dateString.includes("+")) {
      date = new Date(`${dateString}Z`);
      if (!isNaN(date.getTime())) return date;
    }
    
    // Try replacing space with T for non-standard formats
    const normalizedString = dateString.replace(" ", "T");
    date = new Date(normalizedString);
    if (!isNaN(date.getTime())) return date;
    
    // Try with Z suffix on normalized string
    date = new Date(`${normalizedString}Z`);
    if (!isNaN(date.getTime())) return date;
    
    return null;
  } catch {
    return null;
  }
}

// Format date safely
function formatUploadDate(dateString: string | undefined | null): string {
  const date = parseUTCDate(dateString);
  if (!date) {
    // Debug log to understand the issue
    if (dateString) {
      console.warn("[attachments-list] Could not parse date:", dateString);
    }
    return "Unknown";
  }
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (err) {
    console.warn("[attachments-list] formatDistanceToNow failed:", err, dateString);
    return "Unknown";
  }
}

interface AttachmentItemProps {
  attachment: AttachmentData;
  showContext?: boolean;
}

function AttachmentItem({ attachment, showContext = false }: AttachmentItemProps) {
  const Icon = getFileIcon(attachment.mime_type);
  // Build group key for context info
  const groupKey = (attachment.context === 'approval_note' || attachment.context === 'task_note') && attachment.step_name
    ? `${attachment.step_name}::${attachment.context}`
    : attachment.context;
  const contextInfo = getContextInfo(
    groupKey, 
    attachment.field_label, 
    attachment.uploaded_by?.display_name
  );

  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  
  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      const token = typeof window !== "undefined" ? sessionStorage.getItem("msal.authToken") : null;
      
      // For large files (>5MB), use fetch with streaming for better memory handling
      const isLargeFile = attachment.size_bytes > 5 * 1024 * 1024;
      
      if (isLargeFile) {
        // Use fetch API with streaming for large files
        const response = await fetch(`${config.apiBaseUrl}/attachments/${attachment.attachment_id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : attachment.size_bytes;
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');
        
        const chunks: Uint8Array[] = [];
        let received = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          received += value.length;
          setDownloadProgress(Math.round((received / total) * 100));
        }
        
        const blob = new Blob(chunks as BlobPart[], { type: attachment.mime_type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.original_filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For smaller files, use axios (simpler)
        const response = await axios.get(`${config.apiBaseUrl}/attachments/${attachment.attachment_id}/download`, {
          responseType: "blob",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 300000, // 5 minutes
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setDownloadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
            }
          },
        });
        
        const blob = new Blob([response.data], { type: attachment.mime_type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.original_filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error: unknown) {
      console.error("Download error:", error);
      const axiosErr = error as { code?: string; message?: string; response?: { status?: number } };
      if (axiosErr.code === "ERR_NETWORK") {
        alert(`Download failed: Network error. Please check your connection and try again.`);
      } else if (axiosErr.response?.status === 404) {
        alert(`Download failed: File not found on server.`);
      } else {
        alert(`Download failed: ${attachment.original_filename}. Please try again.`);
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const ContextIcon = contextInfo.icon;
  
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-accent/30 transition-colors outline-none overflow-hidden">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 outline-none ring-0", contextInfo.bgColor)}>
        <Icon className={cn("h-5 w-5", contextInfo.color)} />
      </div>
      
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 overflow-hidden">
          <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-[300px]" title={attachment.original_filename}>
            {attachment.original_filename}
          </p>
          <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">({formatFileSize(attachment.size_bytes)})</span>
        </div>
        
        {showContext && (
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className={cn("text-xs", contextInfo.color)}>
              <ContextIcon className="h-3 w-3 mr-1" />
              {contextInfo.label}
            </Badge>
          </div>
        )}
        
        {/* User-provided description */}
        {attachment.description && (
          <p className="text-xs text-foreground/80 mt-1 italic truncate max-w-full" title={attachment.description}>
            "{attachment.description}"
          </p>
        )}
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 overflow-hidden">
          <span className="flex items-center gap-1 truncate max-w-[150px]" title={attachment.uploaded_by?.email || "Unknown"}>
            <User className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{attachment.uploaded_by?.display_name || "Unknown"}</span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
            <Calendar className="h-3 w-3" />
            {formatUploadDate(attachment.uploaded_at)}
          </span>
        </div>
      </div>

      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleDownload}
        disabled={isDownloading}
        className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            {downloadProgress > 0 ? `${downloadProgress}%` : "..."}
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-1" />
            Download
          </>
        )}
      </Button>
    </div>
  );
}

interface AttachmentsListProps {
  ticketId: string;
  className?: string;
}

export function AttachmentsList({ ticketId, className }: AttachmentsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["attachments", ticketId],
    queryFn: async () => {
      const response = await apiClient.get<AttachmentsResponse>(
        `/attachments/ticket/${ticketId}`
      );
      return response;
    },
    enabled: !!ticketId,
  });

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("text-center py-8", className)}>
        <Paperclip className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Failed to load attachments</p>
      </div>
    );
  }

  if (data.total_count === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <Paperclip className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No attachments</p>
      </div>
    );
  }

  const groupKeys = Object.keys(data.grouped);
  
  // Define the order of categories for display
  const categoryOrder = [
    'form', 'form_field', 'info_request', 
    'requester_note', 'approval_note', 'task_note', 'ticket'
  ];
  
  // Sort group keys by their base context, then by step name
  const sortedContexts = [...groupKeys].sort((a, b) => {
    const { context: ctxA } = parseGroupKey(a);
    const { context: ctxB } = parseGroupKey(b);
    const indexA = categoryOrder.indexOf(ctxA);
    const indexB = categoryOrder.indexOf(ctxB);
    const orderDiff = (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    if (orderDiff !== 0) return orderDiff;
    // Same context type, sort by step name (alphabetically)
    return a.localeCompare(b);
  });

  // Render a category card
  const renderCategoryCard = (groupKey: string, attachments: AttachmentData[]) => {
    const info = getContextInfo(groupKey, attachments[0]?.field_label);
    const ContextIcon = info.icon;
    const { context } = parseGroupKey(groupKey);
    
    return (
      <div 
        key={groupKey}
        className={cn(
          "rounded-lg overflow-hidden transition-all bg-card",
          context === 'requester_note' && "ring-1 ring-emerald-200 dark:ring-emerald-800",
          context === 'approval_note' && "ring-1 ring-orange-200 dark:ring-orange-800",
          context === 'task_note' && "ring-1 ring-indigo-200 dark:ring-indigo-800",
          context === 'info_request' && "ring-1 ring-purple-200 dark:ring-purple-800",
          context === 'form' && "ring-1 ring-blue-200 dark:ring-blue-800",
          context === 'form_field' && "ring-1 ring-cyan-200 dark:ring-cyan-800",
          context === 'ticket' && "ring-1 ring-slate-200 dark:ring-slate-700"
        )}
      >
        {/* Category Header */}
        <div className={cn(
          "px-4 py-3 flex items-center justify-between",
          context === 'requester_note' && "bg-emerald-50 dark:bg-emerald-950/30",
          context === 'approval_note' && "bg-orange-50 dark:bg-orange-950/30",
          context === 'task_note' && "bg-indigo-50 dark:bg-indigo-950/30",
          context === 'info_request' && "bg-purple-50 dark:bg-purple-950/30",
          context === 'form' && "bg-blue-50 dark:bg-blue-950/30",
          context === 'form_field' && "bg-cyan-50 dark:bg-cyan-950/30",
          context === 'ticket' && "bg-slate-50 dark:bg-slate-900/50"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", info.bgColor)}>
              <span className="text-sm">{info.emoji}</span>
            </div>
            <div>
              <span className={cn("font-semibold text-sm", info.color)}>{info.label}</span>
              <p className="text-[10px] text-muted-foreground">
                {attachments.length} file{attachments.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={cn("text-xs", info.color)}>
            <ContextIcon className="h-3 w-3 mr-1" />
            {attachments.length}
          </Badge>
        </div>
        
        {/* Attachments List - scrollable if many files (more than 3) */}
        {attachments.length > 3 ? (
          <div className="max-h-[250px] overflow-y-auto">
            {attachments.map((attachment, idx) => (
              <div 
                key={attachment.attachment_id}
                className={cn(
                  "outline-none ring-0 overflow-hidden",
                  idx !== attachments.length - 1 && "border-b border-slate-100 dark:border-slate-800"
                )}
              >
                <AttachmentItem 
                  attachment={attachment} 
                  showContext={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {attachments.map((attachment, idx) => (
              <div 
                key={attachment.attachment_id}
                className={cn(
                  "outline-none ring-0 overflow-hidden",
                  idx !== attachments.length - 1 && "border-b border-slate-100 dark:border-slate-800"
                )}
              >
                <AttachmentItem 
                  attachment={attachment} 
                  showContext={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      {/* Summary Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Paperclip className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Attachments</h3>
            <p className="text-xs text-muted-foreground">
              {data.total_count} file{data.total_count !== 1 ? 's' : ''} across {sortedContexts.length} {sortedContexts.length !== 1 ? 'categories' : 'category'}
            </p>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="flex items-center gap-2">
          {sortedContexts.slice(0, 3).map((ctx) => {
            const info = getContextInfo(ctx);
            return (
              <Badge 
                key={ctx} 
                variant="secondary" 
                className={cn("text-[10px] h-6", info.bgColor, info.color)}
              >
                {info.emoji} {data.grouped[ctx].length}
              </Badge>
            );
          })}
          {sortedContexts.length > 3 && (
            <Badge variant="outline" className="text-[10px] h-6">
              +{sortedContexts.length - 3} more
            </Badge>
          )}
        </div>
      </div>

      {/* Categories - scrollable list */}
      <div className="max-h-[calc(100vh-350px)] min-h-[300px] overflow-y-auto pr-2">
        <div className="space-y-4">
          {sortedContexts.map((ctx) => 
            renderCategoryCard(ctx, data.grouped[ctx])
          )}
        </div>
      </div>
    </div>
  );
}

export default AttachmentsList;
