/**
 * AttachmentChip Component - Compact attachment display with download
 */
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import axios from "axios";
import { config } from "@/lib/config";
import { FileText, Image, File as FileIcon, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttachmentInfo {
  attachment_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
}

interface AttachmentChipProps {
  attachmentId: string;
  compact?: boolean;
  className?: string;
}

// Get file icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return Image;
  if (mimeType?.includes("pdf") || mimeType?.includes("document")) return FileText;
  return FileIcon;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({ attachmentId, compact = false, className }: AttachmentChipProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);

  // Fetch attachment info
  const { data: attachment, isLoading } = useQuery({
    queryKey: ["attachment-info", attachmentId],
    queryFn: async () => {
      const response = await apiClient.get<AttachmentInfo>(
        `/attachments/${attachmentId}/info`
      );
      return response;
    },
    enabled: !!attachmentId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attachment) return;
    
    setIsDownloading(true);
    
    try {
      const token = typeof window !== "undefined" ? sessionStorage.getItem("msal.authToken") : null;
      
      const response = await axios.get(`${config.apiBaseUrl}/attachments/${attachmentId}/download`, {
        responseType: "blob",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 300000,
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
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs",
        className
      )}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!attachment) {
    return null;
  }

  const Icon = getFileIcon(attachment.mime_type);
  const fileName = attachment.original_filename;
  const displayName = compact && fileName.length > 15 
    ? `${fileName.slice(0, 12)}...${fileName.slice(-4)}` 
    : fileName;

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all",
        "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
        "border border-slate-200 dark:border-slate-700",
        "hover:shadow-sm cursor-pointer",
        isDownloading && "opacity-70",
        className
      )}
      title={`${fileName} (${formatFileSize(attachment.size_bytes)}) - Click to download`}
    >
      {isDownloading ? (
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      ) : (
        <Icon className="h-3 w-3 text-blue-500" />
      )}
      <span className="font-medium text-foreground/80 truncate max-w-[120px]">
        {displayName}
      </span>
      {!compact && (
        <span className="text-muted-foreground">
          ({formatFileSize(attachment.size_bytes)})
        </span>
      )}
      <Download className="h-3 w-3 text-muted-foreground ml-0.5" />
    </button>
  );
}

export default AttachmentChip;
