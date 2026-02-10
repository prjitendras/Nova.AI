"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileEdit,
  Clock,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  GitCompare,
  Paperclip,
  User,
  Calendar,
  MessageSquare,
  ArrowRight,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, parseUTCDate } from "@/lib/utils";

import type {
  ChangeRequest,
  FieldChange,
  AttachmentChange,
  FormDataVersion,
  Ticket,
  UserSnapshot,
} from "@/lib/types";

// ============================================================================
// Pending CR Banner Component
// ============================================================================

interface PendingCRBannerProps {
  changeRequestId: string;
  assignedTo: UserSnapshot;
  requestedAt: string;
  onViewDetails: () => void;
  onCancel: () => void;
  canCancel: boolean;
}

export function PendingCRBanner({
  changeRequestId,
  assignedTo,
  requestedAt,
  onViewDetails,
  onCancel,
  canCancel,
}: PendingCRBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-lg border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-amber-50 dark:from-purple-950/40 dark:to-amber-950/30 dark:border-purple-800/50 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-purple-100 dark:bg-purple-900/50 p-2 relative">
          <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          {/* Pulsing indicator */}
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-purple-800 dark:text-purple-200">
              Change Request Pending
            </h4>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200">
              Workflow Paused
            </span>
          </div>
          <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
            {changeRequestId} submitted on{" "}
            {parseUTCDate(requestedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-sm text-purple-600 dark:text-purple-400 mt-0.5">
            Waiting for approval from: <span className="font-medium">{assignedTo.display_name}</span>
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            All workflow actions are paused until the change request is approved or rejected. Notes can still be added.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            View Details
          </Button>
          {canCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-red-600 hover:text-red-700">
              Cancel
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Version Selector Component
// ============================================================================

interface VersionSelectorProps {
  versions: FormDataVersion[];
  currentVersion: number;
  onVersionSelect: (version: number) => void;
  onCompare: () => void;
}

export function VersionSelector({
  versions,
  currentVersion,
  onVersionSelect,
  onCompare,
}: VersionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const latestVersion = Math.max(...versions.map((v) => v.version));
  const hasMultipleVersions = versions.length > 1;

  // Handle outside clicks to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
        >
          <History className="h-4 w-4" />
          Version {currentVersion}
          {currentVersion === latestVersion && (
            <Badge variant="secondary" className="ml-1 text-xs">
              Current
            </Badge>
          )}
          {hasMultipleVersions && <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>

        <AnimatePresence>
          {isOpen && hasMultipleVersions && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full left-0 mt-1 w-64 rounded-lg border bg-card shadow-lg z-50"
            >
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Version History
                </div>
                {versions
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <button
                      key={v.version}
                      onClick={() => {
                        onVersionSelect(v.version);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors",
                        currentVersion === v.version && "bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          Version {v.version}
                          {v.version === latestVersion && " (Current)"}
                        </span>
                        {v.source === "CHANGE_REQUEST" && (
                          <Badge variant="outline" className="text-xs">
                            CR
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {parseUTCDate(v.created_at).toLocaleDateString()} by {v.created_by.display_name}
                      </div>
                    </button>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hasMultipleVersions && (
        <Button variant="ghost" size="sm" onClick={onCompare} className="flex items-center gap-1">
          <GitCompare className="h-4 w-4" />
          Compare
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Change Summary Card
// ============================================================================

interface ChangeSummaryProps {
  fieldChanges: FieldChange[];
  attachmentChanges: AttachmentChange[];
  compact?: boolean;
}

export function ChangeSummary({ fieldChanges, attachmentChanges, compact = false }: ChangeSummaryProps) {
  if (fieldChanges.length === 0 && attachmentChanges.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">No changes detected</div>
    );
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {fieldChanges.length > 0 && (
        <div>
          {!compact && <div className="text-xs font-medium text-muted-foreground mb-2">Field Changes</div>}
          <div className="space-y-2">
            {fieldChanges.map((change, idx) => (
              <div
                key={idx}
                className={cn(
                  "text-sm rounded-md p-2 bg-muted/30",
                  compact ? "py-1" : "py-2"
                )}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-blue-500 flex-shrink-0">•</span>
                  <span className="font-medium">{change.field_label}</span>
                </div>
                <div className="ml-4 space-y-1">
                  <div className="text-muted-foreground line-through break-all text-xs">
                    {formatValue(change.old_value)}
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-green-600 flex-shrink-0" />
                    <span className="text-green-600 dark:text-green-400 font-medium break-all">
                      {formatValue(change.new_value)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachmentChanges.length > 0 && (
        <div>
          {!compact && <div className="text-xs font-medium text-muted-foreground mb-2">Attachment Changes</div>}
          <div className="space-y-1">
            {attachmentChanges.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm py-0.5">
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span>{change.filename}</span>
                <Badge
                  variant={change.action === "ADDED" ? "default" : change.action === "REMOVED" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {change.action}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CR Review Dialog
// ============================================================================

interface CRReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeRequest: ChangeRequest;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
  isSubmitting: boolean;
}

export function CRReviewDialog({
  open,
  onOpenChange,
  changeRequest,
  onApprove,
  onReject,
  isSubmitting,
}: CRReviewDialogProps) {
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState("summary");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5 text-primary" />
            Review Change Request
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex-shrink-0">{changeRequest.change_request_id}</span>
            <span className="flex-shrink-0">for ticket</span>
            <span className="font-medium break-words">{changeRequest.ticket_title}</span>
            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
              {changeRequest.ticket_id}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* Request Info */}
          <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{changeRequest.requested_by.display_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {parseUTCDate(changeRequest.requested_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Reason */}
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-1">
              <MessageSquare className="h-4 w-4" />
              Reason for Change
            </div>
            <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
              {changeRequest.reason}
            </p>
          </div>

          {/* Changes */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="comparison">Side-by-Side</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-3">
              <ScrollArea className="h-48">
                <ChangeSummary
                  fieldChanges={changeRequest.field_changes}
                  attachmentChanges={changeRequest.attachment_changes}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="comparison" className="mt-3">
              <ScrollArea className="h-48">
                <ComparisonView
                  original={changeRequest.original_data}
                  proposed={changeRequest.proposed_data}
                  fieldChanges={changeRequest.field_changes}
                />
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          {/* Notes */}
          <div>
            <Label htmlFor="review-notes" className="text-sm font-medium">
              Notes / Comments (Optional)
            </Label>
            <Textarea
              id="review-notes"
              placeholder="Add any notes for your decision..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onReject(notes)}
            disabled={isSubmitting}
            className="flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Reject
          </Button>
          <Button
            onClick={() => onApprove(notes)}
            disabled={isSubmitting}
            className="flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Comparison View
// ============================================================================

interface ComparisonViewProps {
  original: { form_values: Record<string, unknown>; attachment_ids: string[] };
  proposed: { form_values: Record<string, unknown>; attachment_ids: string[] };
  fieldChanges: FieldChange[];
}

function ComparisonView({ original, proposed, fieldChanges }: ComparisonViewProps) {
  // Build a map of changed fields for quick lookup
  const changedFieldMap = new Map(
    fieldChanges.map((fc) => [`${fc.step_id || 'root'}.${fc.field_key}`, fc])
  );

  // Flatten form values if nested
  const flattenFormValues = (formValues: Record<string, unknown>): Array<{ key: string; value: unknown; stepId: string }> => {
    const result: Array<{ key: string; value: unknown; stepId: string }> = [];
    
    for (const [key, value] of Object.entries(formValues || {})) {
      // Check if this is a step_id with nested fields
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Could be nested step data OR could be a complex field value
        const objValue = value as Record<string, unknown>;
        
        // If it looks like step data (has form field keys), expand it
        const keys = Object.keys(objValue);
        const looksLikeStepData = keys.length > 0 && keys.every(k => 
          typeof objValue[k] !== "function" && 
          !k.startsWith("__") // Skip internal keys
        );
        
        if (looksLikeStepData && !key.startsWith("__section_")) {
          // Treat as nested step data
          for (const [fieldKey, fieldValue] of Object.entries(objValue)) {
            result.push({ key: fieldKey, value: fieldValue, stepId: key });
          }
        } else {
          // Treat as a complex field value at root level
          result.push({ key, value, stepId: 'root' });
        }
      } else {
        // Simple value at root level
        result.push({ key, value, stepId: 'root' });
      }
    }
    
    return result;
  };

  const originalFields = flattenFormValues(original?.form_values || {});
  const proposedFields = flattenFormValues(proposed?.form_values || {});

  // Get all unique field keys
  const allKeys = new Set([
    ...originalFields.map(f => `${f.stepId}.${f.key}`),
    ...proposedFields.map(f => `${f.stepId}.${f.key}`)
  ]);

  // Build lookup maps
  const originalMap = new Map(originalFields.map(f => [`${f.stepId}.${f.key}`, f.value]));
  const proposedMap = new Map(proposedFields.map(f => [`${f.stepId}.${f.key}`, f.value]));

  // If we have no data to show, display a message
  if (allKeys.size === 0 && fieldChanges.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        No form data available for comparison
      </div>
    );
  }

  // Use fieldChanges as the primary source if available
  if (fieldChanges.length > 0) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0 overflow-hidden">
          <div className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
            Original (v1)
          </div>
          <div className="space-y-1 text-sm">
            {fieldChanges.map((change, idx) => (
              <div
                key={idx}
                className="py-1 px-2 rounded bg-red-50 dark:bg-red-950/30"
              >
                <div className="text-muted-foreground mb-0.5">{change.field_label}:</div>
                <div className="line-through break-all">
                  {formatValue(change.old_value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden">
          <div className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
            Proposed (v2)
          </div>
          <div className="space-y-1 text-sm">
            {fieldChanges.map((change, idx) => (
              <div
                key={idx}
                className="py-1 px-2 rounded bg-green-50 dark:bg-green-950/30"
              >
                <div className="text-muted-foreground mb-0.5">{change.field_label}:</div>
                <div className="font-medium text-green-600 dark:text-green-400 break-all">
                  {formatValue(change.new_value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Fallback to raw comparison
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0 overflow-hidden">
        <div className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
          Original (v1)
        </div>
        <div className="space-y-1 text-sm">
          {Array.from(allKeys).map((fullKey) => {
            const value = originalMap.get(fullKey);
            const isChanged = changedFieldMap.has(fullKey);
            const displayKey = fullKey.split('.').pop() || fullKey;
            return (
              <div
                key={fullKey}
                className={cn(
                  "py-1 px-2 rounded",
                  isChanged && "bg-red-50 dark:bg-red-950/30"
                )}
              >
                <div className="text-muted-foreground mb-0.5">{displayKey}:</div>
                <div className={cn(isChanged ? "line-through" : "", "break-all")}>
                  {formatValue(value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden">
        <div className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
          Proposed (v2)
        </div>
        <div className="space-y-1 text-sm">
          {Array.from(allKeys).map((fullKey) => {
            const value = proposedMap.get(fullKey);
            const isChanged = changedFieldMap.has(fullKey);
            const displayKey = fullKey.split('.').pop() || fullKey;
            return (
              <div
                key={fullKey}
                className={cn(
                  "py-1 px-2 rounded",
                  isChanged && "bg-green-50 dark:bg-green-950/30"
                )}
              >
                <div className="text-muted-foreground mb-0.5">{displayKey}:</div>
                <div className={cn(isChanged ? "font-medium text-green-600 dark:text-green-400" : "", "break-all")}>
                  {formatValue(value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CR Status Badge
// ============================================================================

export function CRStatusBadge({ status }: { status: string }) {
  const config = {
    PENDING: { variant: "outline" as const, className: "border-amber-500 text-amber-600" },
    APPROVED: { variant: "default" as const, className: "bg-green-500" },
    REJECTED: { variant: "destructive" as const, className: "" },
    CANCELLED: { variant: "secondary" as const, className: "" },
  };

  const { variant, className } = config[status as keyof typeof config] || config.PENDING;

  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}

// ============================================================================
// Version Update Indicator
// ============================================================================

interface VersionUpdateIndicatorProps {
  currentVersion: number;
  approvedBy?: UserSnapshot;
  approvedAt?: string;
  changeRequestId?: string;
}

export function VersionUpdateIndicator({
  currentVersion,
  approvedBy,
  approvedAt,
  changeRequestId,
}: VersionUpdateIndicatorProps) {
  if (currentVersion <= 1 || !approvedBy) return null;

  return (
    <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50">
      <Check className="h-4 w-4 text-green-600" />
      <span className="text-green-700 dark:text-green-300">
        Updated via Change Request on{" "}
        {approvedAt && parseUTCDate(approvedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
      <span className="text-green-600 dark:text-green-400">
        Approved by: {approvedBy.display_name}
      </span>
    </div>
  );
}

// ============================================================================
// Utilities
// ============================================================================

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  
  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    // If array of objects (like repeating section rows), summarize
    if (typeof value[0] === "object" && value[0] !== null) {
      return `${value.length} row(s)`;
    }
    return value.map(v => formatValue(v)).join(", ");
  }
  
  // Handle objects
  if (typeof value === "object") {
    // Try to extract meaningful display values
    const obj = value as Record<string, unknown>;
    
    // If it has a "rows" property (repeating section format), summarize
    if (obj.rows && Array.isArray(obj.rows)) {
      return `${obj.rows.length} row(s)`;
    }
    
    // If it's a simple key-value object, try to show values
    const keys = Object.keys(obj);
    if (keys.length === 0) return "-";
    if (keys.length <= 3) {
      // Show a few key values
      const values = keys
        .map(k => {
          const v = obj[k];
          if (v === null || v === undefined || v === "") return null;
          if (typeof v === "object") return null; // Skip nested objects
          return String(v);
        })
        .filter(Boolean);
      if (values.length > 0) return values.join(", ");
    }
    
    // Fallback: show number of properties
    return `${keys.length} field(s)`;
  }
  
  return String(value);
}

// ============================================================================
// Version Compare Dialog
// ============================================================================

interface VersionCompareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  versions: FormDataVersion[];
  ticketId: string;
  comparisonData?: {
    version_1: FormDataVersion;
    version_2: FormDataVersion;
    field_changes: FieldChange[];
    attachment_changes: AttachmentChange[];
  } | null;
  isLoading?: boolean;
  error?: Error | null;
  selectedVersion1: number;
  selectedVersion2: number;
  onVersionChange: (v1: number, v2: number) => void;
}

export function VersionCompareDialog({
  isOpen,
  onClose,
  versions,
  ticketId,
  comparisonData,
  isLoading,
  error,
  selectedVersion1,
  selectedVersion2,
  onVersionChange,
}: VersionCompareDialogProps) {
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Compare Versions - {ticketId}
          </DialogTitle>
          <DialogDescription>
            View changes between different versions of this ticket&apos;s form data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Version Selectors */}
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">From Version</Label>
              <select
                value={selectedVersion1}
                onChange={(e) => onVersionChange(Number(e.target.value), selectedVersion2)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                {sortedVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    Version {v.version} - {parseUTCDate(v.created_at).toLocaleDateString()}
                    {v.source === "ORIGINAL" ? " (Original)" : v.source === "CHANGE_REQUEST" ? " (CR)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mt-5" />
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">To Version</Label>
              <select
                value={selectedVersion2}
                onChange={(e) => onVersionChange(selectedVersion1, Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                {sortedVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    Version {v.version} - {parseUTCDate(v.created_at).toLocaleDateString()}
                    {v.source === "ORIGINAL" ? " (Original)" : v.source === "CHANGE_REQUEST" ? " (CR)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Comparison Content */}
          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading comparison...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-500">
                <AlertCircle className="h-12 w-12 mb-3" />
                <p className="font-medium mb-1">Failed to load comparison</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {error.message || "An error occurred while loading the version comparison. Please try again."}
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => onVersionChange(selectedVersion1, selectedVersion2)}
                >
                  Retry
                </Button>
              </div>
            ) : selectedVersion1 === selectedVersion2 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-5 w-5 mr-2" />
                Select different versions to compare
              </div>
            ) : comparisonData ? (
              <div className="space-y-6">
                {/* Version Info Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                      <History className="h-4 w-4" />
                      Version {comparisonData.version_1.version}
                      {comparisonData.version_1.source === "ORIGINAL" && (
                        <Badge variant="outline" className="text-xs">Original</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(comparisonData.version_1.created_at).toLocaleString()} by{" "}
                      {comparisonData.version_1.created_by?.display_name || "Unknown"}
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                      <History className="h-4 w-4" />
                      Version {comparisonData.version_2.version}
                      {comparisonData.version_2.source === "CHANGE_REQUEST" && (
                        <Badge variant="outline" className="text-xs">CR</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(comparisonData.version_2.created_at).toLocaleString()} by{" "}
                      {comparisonData.version_2.created_by?.display_name || "Unknown"}
                    </div>
                    {comparisonData.version_2.approved_by && (
                      <div className="text-xs text-muted-foreground">
                        Approved by: {comparisonData.version_2.approved_by.display_name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Changes Summary */}
                {comparisonData.field_changes.length === 0 && comparisonData.attachment_changes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Check className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    <p>No differences found between these versions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Field Changes */}
                    {comparisonData.field_changes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <FileEdit className="h-4 w-4" />
                          Field Changes ({comparisonData.field_changes.length})
                        </h4>
                        <div className="space-y-2">
                          {comparisonData.field_changes.map((change, idx) => (
                            <div key={idx} className="p-3 border rounded-lg bg-card">
                              <div className="font-medium text-sm mb-2">
                                {change.field_label}
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({change.step_name || change.step_id})
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm">
                                  <div className="text-xs text-muted-foreground mb-1">Before</div>
                                  <div className="text-red-700 dark:text-red-400">
                                    {formatValue(change.old_value) || <span className="italic">Empty</span>}
                                  </div>
                                </div>
                                <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded text-sm">
                                  <div className="text-xs text-muted-foreground mb-1">After</div>
                                  <div className="text-green-700 dark:text-green-400">
                                    {formatValue(change.new_value) || <span className="italic">Empty</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attachment Changes */}
                    {comparisonData.attachment_changes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Paperclip className="h-4 w-4" />
                          Attachment Changes ({comparisonData.attachment_changes.length})
                        </h4>
                        <div className="space-y-2">
                          {comparisonData.attachment_changes.map((change, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "p-3 border rounded-lg flex items-center gap-3",
                                change.action === "ADDED" && "bg-green-50 dark:bg-green-950/30 border-green-200",
                                change.action === "REMOVED" && "bg-red-50 dark:bg-red-950/30 border-red-200"
                              )}
                            >
                              <Paperclip className="h-4 w-4" />
                              <span className="flex-1">{change.filename}</span>
                              <Badge
                                variant={change.action === "ADDED" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {change.action}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Select versions above to compare
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Export all components
export {
  formatValue,
  ComparisonView,
};
