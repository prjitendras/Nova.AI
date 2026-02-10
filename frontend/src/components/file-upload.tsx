/**
 * FileUpload Component
 * Reusable file upload with drag-and-drop, preview, and progress
 */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  X,
  FileText,
  Image,
  File as FileIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UploadedFile {
  attachment_id: string;
  original_filename: string;
  size_bytes: number;
  mime_type: string;
}

interface FileUploadProps {
  ticketId?: string;
  stepId?: string;
  context?: "ticket" | "form" | "info_request" | "form_field" | "requester_note" | "approval_note" | "task_note";
  fieldLabel?: string;
  stepName?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string[];
  onUploadComplete?: (files: UploadedFile[]) => void;
  onFilesChange?: (attachmentIds: string[]) => void;
  existingAttachments?: UploadedFile[];
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

interface FileWithProgress {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  attachmentId?: string;
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

export function FileUpload({
  ticketId,
  stepId,
  context = "ticket",
  fieldLabel,
  stepName,
  multiple = true,
  maxFiles = 10,
  maxSizeMB = 50,
  accept = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
  onUploadComplete,
  onFilesChange,
  existingAttachments = [],
  disabled = false,
  compact = false,
  className,
}: FileUploadProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(existingAttachments);
  
  // Track if this is the initial mount to avoid overwriting parent state
  const isInitialMount = useRef(true);
  const initialAttachmentCount = useRef(existingAttachments.length);
  
  // Refs to track callbacks and avoid stale closures
  const onFilesChangeRef = useRef(onFilesChange);
  const onUploadCompleteRef = useRef(onUploadComplete);
  
  // Keep refs updated
  useEffect(() => {
    onFilesChangeRef.current = onFilesChange;
    onUploadCompleteRef.current = onUploadComplete;
  }, [onFilesChange, onUploadComplete]);
  
  // Notify parent when uploadedFiles changes
  useEffect(() => {
    const attachmentIds = uploadedFiles.map((f) => f.attachment_id);
    
    // Skip the initial mount notification if we started with existing attachments or empty
    // This prevents overwriting parent state when component mounts
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Only skip if count matches what we were initialized with
      if (uploadedFiles.length === initialAttachmentCount.current) {
        return;
      }
    }
    
    onFilesChangeRef.current?.(attachmentIds);
  }, [uploadedFiles]);
  
  // Track if any uploads are in progress
  const isUploading = files.some((f) => f.status === "uploading" || f.status === "pending");
  
  // Warn user before navigating away during upload
  useEffect(() => {
    if (!isUploading) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Files are still uploading. Are you sure you want to leave?";
      return e.returnValue;
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUploading]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (fileItem: FileWithProgress) => {
      const formData = new FormData();
      formData.append("file", fileItem.file);
      
      // Build URL with query params
      const params = new URLSearchParams();
      if (ticketId) params.append("ticket_id", ticketId);
      if (stepId) params.append("ticket_step_id", stepId);
      params.append("context", context);
      if (fieldLabel) params.append("field_label", fieldLabel);
      if (stepName) params.append("step_name", stepName);

      // Use apiClient.upload which handles auth and base URL
      const result = await apiClient.upload<UploadedFile>(
        `/attachments/upload?${params.toString()}`,
        formData
      );
      return result;
    },
    onSuccess: (data, variables) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === variables.id
            ? { ...f, status: "success" as const, progress: 100, attachmentId: data.attachment_id }
            : f
        )
      );

      // Use functional update to avoid stale closure issues with concurrent uploads
      setUploadedFiles((prev) => [...prev, data]);
      
      onUploadCompleteRef.current?.([data]);
      
      // Remove from upload queue after a brief delay (so user sees "Uploaded" status)
      setTimeout(() => {
        setFiles((prev) => prev.filter((f) => f.id !== variables.id));
      }, 1500);
    },
    onError: (error: unknown, variables) => {
      let errorMessage = "Upload failed";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const axiosError = error as { response?: { data?: { detail?: { error?: { message?: string } } } } };
      if (axiosError?.response?.data?.detail?.error?.message) {
        errorMessage = axiosError.response.data.detail.error.message;
      }
      
      setFiles((prev) =>
        prev.map((f) =>
          f.id === variables.id
            ? { ...f, status: "error" as const, error: errorMessage }
            : f
        )
      );
      toast.error(`Failed to upload ${variables.file.name}: ${errorMessage}`);
    },
  });

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (disabled) return;

      // Check max files
      const totalFiles = uploadedFiles.length + files.length + acceptedFiles.length;
      if (totalFiles > maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Add files to queue
      const newFiles: FileWithProgress[] = acceptedFiles.map((file) => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        progress: 0,
        status: "pending" as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Start upload
      setTimeout(() => {
        newFiles.forEach((fileItem) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, status: "uploading" as const, progress: 30 } : f
            )
          );
          uploadMutation.mutate(fileItem);
        });
      }, 100);
    },
    [disabled, maxFiles, uploadedFiles.length, files.length, uploadMutation]
  );

  // Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxSizeMB * 1024 * 1024,
    multiple,
    disabled,
  });

  // Remove file from queue
  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Remove uploaded file
  const removeUploadedFile = (attachmentId: string) => {
    // Use functional update - the useEffect will notify parent
    setUploadedFiles((prev) => prev.filter((f) => f.attachment_id !== attachmentId));
    setFiles((prev) => prev.filter((f) => f.attachmentId !== attachmentId));
  };

  // Calculate upload progress
  const uploadingFiles = files.filter((f) => f.status === "uploading" || f.status === "pending");
  const totalUploadProgress = uploadingFiles.length > 0
    ? Math.round(uploadingFiles.reduce((sum, f) => sum + (f.status === "success" ? 100 : f.progress), 0) / uploadingFiles.length)
    : 0;
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Upload in progress banner */}
      {isUploading && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Uploading {uploadingFiles.length} file(s)...
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Please don&apos;t leave this page until upload completes
            </p>
          </div>
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
            {totalUploadProgress}%
          </span>
        </div>
      )}
      
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg transition-colors cursor-pointer",
          compact ? "p-4" : "p-6",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          <Upload
            className={cn(
              "mx-auto text-muted-foreground mb-2",
              compact ? "h-6 w-6" : "h-8 w-8"
            )}
          />
          <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            {isDragActive
              ? "Drop files here..."
              : "Click to upload or drag and drop"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, DOC, XLSX, PNG, JPG up to {maxSizeMB}MB
          </p>
        </div>
      </div>

      {/* Upload queue */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileItem) => {
            const Icon = getFileIcon(fileItem.file.type);
            return (
              <div
                key={fileItem.id}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg overflow-hidden"
              >
                <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium truncate max-w-full" title={fileItem.file.name}>
                    {fileItem.file.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatFileSize(fileItem.file.size)}
                    </span>
                    {fileItem.status === "uploading" && (
                      <Progress value={fileItem.progress} className="h-1 flex-1 max-w-[100px]" />
                    )}
                    {fileItem.status === "success" && (
                      <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0">
                        <CheckCircle className="h-3 w-3" />
                        Uploaded
                      </span>
                    )}
                    {fileItem.status === "error" && (
                      <span className="flex items-center gap-1 text-xs text-destructive flex-shrink-0">
                        <AlertCircle className="h-3 w-3" />
                        {fileItem.error || "Failed"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {fileItem.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(fileItem.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Already uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            {uploadedFiles.length} file(s) attached
          </p>
          {uploadedFiles.map((file) => {
            const Icon = getFileIcon(file.mime_type);
            return (
              <div
                key={file.attachment_id}
                className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg overflow-hidden"
              >
                <Icon className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium truncate max-w-full" title={file.original_filename}>
                    {file.original_filename}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(file.size_bytes)}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeUploadedFile(file.attachment_id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
