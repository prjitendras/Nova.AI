/**
 * Step Attachments Component - Dedicated attachment upload/view for approval and task steps
 * 
 * Features:
 * - Upload attachments with description
 * - View existing attachments for this step
 * - Persists after refresh
 * - Separate from activity log
 */
"use client";

import { useState, useEffect } from "react";
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

interface StepAttachment {
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
  field_label?: string;
  step_name?: string;
  step_id?: string;
  ticket_step_id?: string;
}

interface StepAttachmentsProps {
  ticketId: string;
  stepId: string;
  stepName: string;
  stepType: 'APPROVAL_STEP' | 'TASK_STEP';
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

export function StepAttachments({
  ticketId,
  stepId,
  stepName,
  stepType,
  queryKey = ['tickets'],
  canUpload = true,
  defaultExpanded = false
}: StepAttachmentsProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showUpload, setShowUpload] = useState(false);
  const [description, setDescription] = useState("");
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const context = stepType === 'APPROVAL_STEP' ? 'approval_note' : 'task_note';

  // Fetch attachments for this specific step
  const { data: attachments, isLoading, refetch } = useQuery({
    queryKey: ['step-attachments', ticketId, stepId],
    queryFn: async () => {
      const response = await apiClient.get<{ attachments: StepAttachment[] }>(
        `/attachments/ticket/${ticketId}`
      );
      // Filter to only this step's attachments
      return response.attachments.filter(att => att.step_id === stepId || att.ticket_step_id === stepId);
    },
    enabled: !!ticketId && !!stepId,
    staleTime: 30000,
  });

  // Handle file upload completion - link to step with description
  const handleSubmitAttachments = async () => {
    if (pendingAttachmentIds.length === 0) return;
    
    setIsSubmitting(true);
    try {
      // Update attachments with description via API
      for (const attachmentId of pendingAttachmentIds) {
        await apiClient.patch(`/attachments/${attachmentId}`, {
          description: description.trim() || undefined,
          ticket_step_id: stepId,
          context,
          step_name: stepName
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
  const handleDownload = async (attachment: StepAttachment) => {
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
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
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
            <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
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
        <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
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
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <FileIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
                <Paperclip className="h-5 w-5 text-muted-foreground" />
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
                  className="w-full"
                  onClick={() => setShowUpload(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add Attachments
                </Button>
              ) : (
                <div className="space-y-3 p-3 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
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
                    stepId={stepId}
                    context={context}
                    stepName={stepName}
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
                        className="w-full bg-amber-600 hover:bg-amber-700"
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
