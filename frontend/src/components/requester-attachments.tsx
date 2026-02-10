/**
 * Requester Attachments Component - Dedicated attachment upload/view for requesters
 * 
 * Features:
 * - Upload attachments with description
 * - View existing attachments uploaded by requester
 * - Persists after refresh
 * - Separate from notes
 */
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Paperclip, 
  Upload, 
  X, 
  FileText, 
  Image as ImageIcon,
  File,
  Download,
  ChevronDown,
  RefreshCw,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/file-upload";
import { apiClient } from "@/lib/api-client";
import { cn, parseUTCDate } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { config } from "@/lib/config";

interface RequesterAttachment {
  attachment_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: {
    email: string;
    display_name: string;
  };
  description?: string;
  context: string;
}

interface RequesterAttachmentsProps {
  ticketId: string;
  /** Query key to invalidate on changes */
  queryKey?: string[];
  /** Whether user can upload (default: true) */
  canUpload?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
}

// Get file icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("pdf") || mimeType.includes("document")) return FileText;
  return File;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function RequesterAttachments({
  ticketId,
  queryKey = ['tickets'],
  canUpload = true,
  defaultExpanded = false
}: RequesterAttachmentsProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showUpload, setShowUpload] = useState(false);
  const [description, setDescription] = useState("");
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch attachments for this ticket filtered by requester_note context
  const { data: attachments, isLoading, refetch } = useQuery({
    queryKey: ['requester-attachments', ticketId],
    queryFn: async () => {
      const response = await apiClient.get<{ attachments: RequesterAttachment[] }>(
        `/attachments/ticket/${ticketId}`
      );
      // Filter to only requester_note attachments
      return response.attachments.filter(att => att.context === 'requester_note');
    },
    enabled: !!ticketId,
    staleTime: 30000,
  });

  // Handle file upload completion - save with description
  const handleSubmitAttachments = async () => {
    if (pendingAttachmentIds.length === 0) return;
    
    setIsSubmitting(true);
    try {
      // Update attachments with description via API
      for (const attachmentId of pendingAttachmentIds) {
        await apiClient.patch(`/attachments/${attachmentId}`, {
          description: description.trim() || undefined,
          context: 'requester_note',
        });
      }
      
      // Clear state and refresh
      setPendingAttachmentIds([]);
      setDescription("");
      setShowUpload(false);
      refetch();
      queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      console.error("Failed to save attachments:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download attachment
  const handleDownload = async (attachment: RequesterAttachment) => {
    try {
      const token = typeof window !== "undefined" ? sessionStorage.getItem("msal.authToken") : null;
      
      const response = await fetch(
        `${config.apiBaseUrl}/attachments/${attachment.attachment_id}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.original_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const attachmentCount = attachments?.length || 0;

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
            <Paperclip className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-foreground">Attachments</span>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Loading...' : attachmentCount === 0 ? 'No files attached' : `${attachmentCount} file${attachmentCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {attachmentCount > 0 && (
            <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
              {attachmentCount}
            </Badge>
          )}
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-emerald-200 dark:border-emerald-700 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Existing Attachments */}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : attachments && attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((att) => {
                const FileIcon = getFileIcon(att.mime_type);
                const uploadDate = parseUTCDate(att.uploaded_at);
                return (
                  <div
                    key={att.attachment_id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800"
                  >
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <FileIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {att.original_filename}
                      </p>
                      {att.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {att.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{formatFileSize(att.size_bytes)}</span>
                        <span>•</span>
                        <span>{att.uploaded_by?.display_name || 'Unknown'}</span>
                        <span>•</span>
                        <span>{uploadDate ? formatDistanceToNow(uploadDate, { addSuffix: true }) : 'Unknown'}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 shrink-0"
                      onClick={() => handleDownload(att)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Download</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-2">
                <Paperclip className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground">No attachments yet</p>
            </div>
          )}
          
          {/* Upload Section */}
          {canUpload && (
            <>
              {!showUpload ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  onClick={() => setShowUpload(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add Attachments
                </Button>
              ) : (
                <div className="space-y-3 p-3 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Upload Files</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setShowUpload(false);
                        setPendingAttachmentIds([]);
                        setDescription("");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  <FileUpload
                    ticketId={ticketId}
                    context="requester_note"
                    multiple={true}
                    maxFiles={5}
                    compact={true}
                    onFilesChange={setPendingAttachmentIds}
                  />
                  
                  {pendingAttachmentIds.length > 0 && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Description (optional)
                        </label>
                        <Textarea
                          placeholder="Add a description for these files..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={2}
                          className="text-sm resize-none"
                        />
                      </div>
                      
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        onClick={handleSubmitAttachments}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Paperclip className="h-4 w-4 mr-2" />
                            Attach {pendingAttachmentIds.length} File{pendingAttachmentIds.length !== 1 ? 's' : ''}
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Refresh Button */}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
