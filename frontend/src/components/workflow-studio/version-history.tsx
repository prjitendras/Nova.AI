/**
 * Version History - Professional UX
 * Clear, intuitive version control with human-readable diffs
 */
"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { useWorkflowVersions } from "@/hooks/use-workflows";
import { formatDistanceToNow, format } from "date-fns";
import { parseUTCDate, cn } from "@/lib/utils";
import { 
  History, 
  User, 
  Calendar, 
  Eye, 
  RotateCcw, 
  CheckCircle, 
  Loader2,
  FileText,
  Layers,
  AlertCircle,
  ClipboardCheck,
  ListTodo,
  Bell,
  ChevronRight,
  ChevronDown,
  Split,
  Merge,
  ArrowLeft,
  GitCompare,
  Plus,
  Minus,
  ArrowRight,
  Pencil,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { UserPill } from "@/components/user-pill";
import type { WorkflowVersion, WorkflowDefinition } from "@/lib/types";

// Helpers
const getStepName = (step: any): string => step?.step_name || step?.name || "Untitled";
const getStepType = (step: any): string => step?.step_type || "FORM_STEP";

const stepLabels: Record<string, string> = {
  FORM_STEP: "Form",
  APPROVAL_STEP: "Approval",
  TASK_STEP: "Task",
  NOTIFY_STEP: "Notification",
  FORK_STEP: "Parallel Branch",
  JOIN_STEP: "Join",
};

const stepIcons: Record<string, any> = {
  FORM_STEP: FileText,
  APPROVAL_STEP: ClipboardCheck,
  TASK_STEP: ListTodo,
  NOTIFY_STEP: Bell,
  FORK_STEP: Split,
  JOIN_STEP: Merge,
};

const stepColors: Record<string, { text: string; bg: string }> = {
  FORM_STEP: { text: "text-blue-600", bg: "bg-blue-50" },
  APPROVAL_STEP: { text: "text-emerald-600", bg: "bg-emerald-50" },
  TASK_STEP: { text: "text-amber-600", bg: "bg-amber-50" },
  NOTIFY_STEP: { text: "text-purple-600", bg: "bg-purple-50" },
  FORK_STEP: { text: "text-rose-600", bg: "bg-rose-50" },
  JOIN_STEP: { text: "text-cyan-600", bg: "bg-cyan-50" },
};

interface VersionHistoryProps {
  workflowId: string;
  currentVersion: number | null;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion: (definition: WorkflowDefinition) => void;
}

export function VersionHistory({ 
  workflowId, 
  currentVersion, 
  isOpen, 
  onClose,
  onRestoreVersion 
}: VersionHistoryProps) {
  const { data: versions, isLoading, error } = useWorkflowVersions(workflowId);
  const [selectedVersion, setSelectedVersion] = useState<WorkflowVersion | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [activeView, setActiveView] = useState<"list" | "detail" | "compare">("list");
  
  const sortedVersions = useMemo(() => {
    if (!versions) return [];
    return [...versions].sort((a, b) => b.version_number - a.version_number);
  }, [versions]);
  
  const currentVersionData = useMemo(() => 
    sortedVersions.find(v => v.version_number === currentVersion),
    [sortedVersions, currentVersion]
  );
  
  const handleViewDetails = useCallback((v: WorkflowVersion) => {
    setSelectedVersion(v);
    setActiveView("detail");
  }, []);
  
  const handleCompareWithCurrent = useCallback((v: WorkflowVersion) => {
    setSelectedVersion(v);
    setActiveView("compare");
  }, []);
  
  const handleRestore = useCallback(() => {
    if (selectedVersion?.definition) {
      onRestoreVersion(selectedVersion.definition);
      setShowRestore(false);
      setActiveView("list");
      onClose();
    }
  }, [selectedVersion, onRestoreVersion, onClose]);
  
  const handleBack = useCallback(() => {
    setActiveView("list");
    setSelectedVersion(null);
  }, []);

  // Close detail/compare view when sheet closes
  const handleSheetClose = useCallback((open: boolean) => {
    if (!open) {
      setActiveView("list");
      setSelectedVersion(null);
    }
    onClose();
  }, [onClose]);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetClose}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          {activeView === "list" && (
            <VersionList 
              versions={sortedVersions}
              currentVersion={currentVersion}
              isLoading={isLoading}
              error={error}
              onView={handleViewDetails}
              onCompare={handleCompareWithCurrent}
              onRestore={(v) => { setSelectedVersion(v); setShowRestore(true); }}
            />
          )}
          
          {activeView === "detail" && selectedVersion && (
            <VersionDetail 
              version={selectedVersion}
              isCurrent={selectedVersion.version_number === currentVersion}
              onBack={handleBack}
              onCompare={() => setActiveView("compare")}
              onRestore={() => setShowRestore(true)}
            />
          )}
          
          {activeView === "compare" && selectedVersion && currentVersionData && (
            <VersionCompare
              olderVersion={selectedVersion}
              newerVersion={currentVersionData}
              onBack={handleBack}
              onRestore={() => setShowRestore(true)}
            />
          )}
        </SheetContent>
      </Sheet>
      
      <AlertDialog open={showRestore} onOpenChange={setShowRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-500" />
              Restore to Version {selectedVersion?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will replace your current draft with the content from version {selectedVersion?.version_number}.</p>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
                  ⚠️ Any unsaved changes in your current draft will be lost.
                </div>
                <p className="text-sm">After restoring, save and publish to make it the active version.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} className="bg-orange-500 hover:bg-orange-600">
              <RotateCcw className="h-4 w-4 mr-2" />Yes, Restore This Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Version List View
 */
const VersionList = memo(function VersionList({
  versions,
  currentVersion,
  isLoading,
  error,
  onView,
  onCompare,
  onRestore
}: {
  versions: WorkflowVersion[];
  currentVersion: number | null;
  isLoading: boolean;
  error: any;
  onView: (v: WorkflowVersion) => void;
  onCompare: (v: WorkflowVersion) => void;
  onRestore: (v: WorkflowVersion) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-3" />
        <p className="text-muted-foreground">Loading version history...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <p className="font-medium">Failed to load versions</p>
      </div>
    );
  }

  return (
    <>
      <SheetHeader className="p-4 border-b bg-gradient-to-r from-slate-50 to-gray-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white">
            <History className="h-5 w-5" />
          </div>
          <div>
            <SheetTitle className="text-lg">Version History</SheetTitle>
            <p className="text-sm text-muted-foreground">{versions.length} published version{versions.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </SheetHeader>
      
      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <History className="h-8 w-8 text-gray-400" />
            </div>
            <p className="font-medium text-lg mb-1">No versions yet</p>
            <p className="text-sm text-muted-foreground text-center">
              Publish your workflow to create the first version
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {versions.map((version, index) => {
              const isCurrent = version.version_number === currentVersion;
              const isPrevious = index === 1 && currentVersion === versions[0]?.version_number;
              
              return (
                <VersionCard
                  key={version.version_number}
                  version={version}
                  isCurrent={isCurrent}
                  isPrevious={isPrevious}
                  onView={() => onView(version)}
                  onCompare={() => onCompare(version)}
                  onRestore={() => onRestore(version)}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});

/**
 * Version Card
 */
const VersionCard = memo(function VersionCard({
  version,
  isCurrent,
  isPrevious,
  onView,
  onCompare,
  onRestore
}: {
  version: WorkflowVersion;
  isCurrent: boolean;
  isPrevious: boolean;
  onView: () => void;
  onCompare: () => void;
  onRestore: () => void;
}) {
  const date = parseUTCDate(version.published_at);
  const stepCount = version.definition?.steps?.length || 0;
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md overflow-hidden",
      isCurrent && "ring-2 ring-green-500 bg-green-50/30"
    )}>
      {isCurrent && <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />}
      
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn(
              "font-mono text-sm px-2.5",
              isCurrent ? "bg-green-600" : "bg-slate-600"
            )}>
              v{version.version_number}
            </Badge>
            {isCurrent && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                <CheckCircle className="h-3 w-3 mr-1" />
                Current Live Version
              </Badge>
            )}
            {isPrevious && !isCurrent && (
              <Badge variant="outline" className="text-slate-600">
                Previous
              </Badge>
            )}
          </div>
        </div>
        
        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{format(date, "MMMM d, yyyy")} at {format(date, "h:mm a")}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatDistanceToNow(date, { addSuffix: true })}</span>
          </div>
          {version.published_by && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Published by</span>
              <UserPill user={version.published_by} size="sm" />
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4 shrink-0" />
            <span>{stepCount} workflow step{stepCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onView}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            View Steps
          </Button>
          
          {!isCurrent && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={onCompare}
              >
                <GitCompare className="h-4 w-4 mr-1.5" />
                Compare
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={onRestore}
                className="hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Version Detail View
 */
function VersionDetail({
  version,
  isCurrent,
  onBack,
  onCompare,
  onRestore
}: {
  version: WorkflowVersion;
  isCurrent: boolean;
  onBack: () => void;
  onCompare: () => void;
  onRestore: () => void;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  
  const steps = useMemo(() => {
    if (!version.definition?.steps) return [];
    return [...version.definition.steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [version.definition?.steps]);
  
  const toggleStep = useCallback((id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b bg-slate-50 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Badge className={cn("font-mono", isCurrent ? "bg-green-600" : "bg-slate-600")}>
            v{version.version_number}
          </Badge>
          {isCurrent && <Badge variant="outline" className="text-green-700">Current</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Published {format(parseUTCDate(version.published_at), "MMMM d, yyyy")}
          {version.published_by && ` by ${version.published_by.display_name}`}
        </p>
        
        {!isCurrent && (
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={onCompare} className="flex-1">
              <GitCompare className="h-4 w-4 mr-1.5" />Compare with Current
            </Button>
            <Button size="sm" onClick={onRestore} className="bg-orange-500 hover:bg-orange-600">
              <RotateCcw className="h-4 w-4 mr-1.5" />Restore
            </Button>
          </div>
        )}
      </div>
      
      {/* Steps List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
          Workflow Steps ({steps.length})
        </h3>
        <div className="space-y-2">
          {steps.map((step) => (
            <StepAccordion
              key={step.step_id}
              step={step}
              isExpanded={expandedSteps.has(step.step_id)}
              onToggle={() => toggleStep(step.step_id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Version Compare View - Human Readable
 */
function VersionCompare({
  olderVersion,
  newerVersion,
  onBack,
  onRestore
}: {
  olderVersion: WorkflowVersion;
  newerVersion: WorkflowVersion;
  onBack: () => void;
  onRestore: () => void;
}) {
  // Compute human-readable changes
  const changes = useMemo(() => {
    const olderSteps = olderVersion.definition?.steps || [];
    const newerSteps = newerVersion.definition?.steps || [];
    
    const olderMap = new Map(olderSteps.map(s => [s.step_id, s]));
    const newerMap = new Map(newerSteps.map(s => [s.step_id, s]));
    
    const result: ChangeItem[] = [];
    
    // Find what's in newer but not in older (added in current)
    newerSteps.forEach(step => {
      if (!olderMap.has(step.step_id)) {
        result.push({
          type: "added",
          stepName: getStepName(step),
          stepType: getStepType(step),
          description: `Added "${getStepName(step)}" ${stepLabels[getStepType(step)] || "step"}`
        });
      }
    });
    
    // Find what's in older but not in newer (removed from current)
    olderSteps.forEach(step => {
      if (!newerMap.has(step.step_id)) {
        result.push({
          type: "removed",
          stepName: getStepName(step),
          stepType: getStepType(step),
          description: `"${getStepName(step)}" ${stepLabels[getStepType(step)] || "step"} was removed`
        });
      }
    });
    
    // Find modifications
    olderSteps.forEach(olderStep => {
      const newerStep = newerMap.get(olderStep.step_id);
      if (newerStep) {
        const stepChanges = getHumanReadableChanges(olderStep, newerStep);
        stepChanges.forEach(change => {
          result.push({
            type: "modified",
            stepName: getStepName(newerStep),
            stepType: getStepType(newerStep),
            description: change
          });
        });
      }
    });
    
    return result;
  }, [olderVersion, newerVersion]);

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b bg-blue-50 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <GitCompare className="h-5 w-5 text-blue-600" />
          <span className="font-semibold">Comparing Versions</span>
        </div>
        
        {/* Version Comparison Labels */}
        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
          <div className="flex-1 text-center">
            <Badge className="bg-slate-600 mb-1">v{olderVersion.version_number}</Badge>
            <p className="text-xs text-muted-foreground">Selected Version</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 text-center">
            <Badge className="bg-green-600 mb-1">v{newerVersion.version_number}</Badge>
            <p className="text-xs text-muted-foreground">Current Live</p>
          </div>
        </div>
        
        <Button size="sm" onClick={onRestore} className="w-full mt-3 bg-orange-500 hover:bg-orange-600">
          <RotateCcw className="h-4 w-4 mr-2" />
          Restore to v{olderVersion.version_number}
        </Button>
      </div>
      
      {/* Changes */}
      <div className="flex-1 overflow-y-auto p-4">
        {changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-semibold text-lg mb-1">No Differences Found</p>
            <p className="text-sm text-muted-foreground">
              Both versions have the same workflow configuration
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                {changes.length} Change{changes.length !== 1 ? "s" : ""} Found
              </h3>
              <div className="flex gap-2 text-xs">
                <Badge className="bg-green-100 text-green-700">
                  +{changes.filter(c => c.type === "added").length}
                </Badge>
                <Badge className="bg-red-100 text-red-700">
                  -{changes.filter(c => c.type === "removed").length}
                </Badge>
                <Badge className="bg-amber-100 text-amber-700">
                  ~{changes.filter(c => c.type === "modified").length}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              {changes.map((change, i) => (
                <ChangeCard key={i} change={change} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

interface ChangeItem {
  type: "added" | "removed" | "modified";
  stepName: string;
  stepType: string;
  description: string;
}

function ChangeCard({ change }: { change: ChangeItem }) {
  const Icon = stepIcons[change.stepType] || FileText;
  const colors = stepColors[change.stepType] || stepColors.FORM_STEP;
  
  const typeStyles = {
    added: {
      bg: "bg-green-50",
      border: "border-green-200",
      icon: <Plus className="h-4 w-4 text-green-600" />,
      label: "Added"
    },
    removed: {
      bg: "bg-red-50",
      border: "border-red-200",
      icon: <Minus className="h-4 w-4 text-red-600" />,
      label: "Removed"
    },
    modified: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: <Pencil className="h-4 w-4 text-amber-600" />,
      label: "Changed"
    }
  };
  
  const style = typeStyles[change.type];
  
  return (
    <div className={cn("rounded-lg border p-3", style.bg, style.border)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", colors.bg)}>
          <Icon className={cn("h-4 w-4", colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {style.icon}
            <span className="font-medium text-sm">{style.label}</span>
          </div>
          <p className="text-sm text-gray-700">{change.description}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Get human-readable changes between two steps
 */
function getHumanReadableChanges(older: any, newer: any): string[] {
  const changes: string[] = [];
  const stepName = getStepName(newer);
  
  // Name change
  if (getStepName(older) !== getStepName(newer)) {
    changes.push(`Renamed from "${getStepName(older)}" to "${getStepName(newer)}"`);
  }
  
  // Description change
  if ((older.description || "") !== (newer.description || "")) {
    if (!older.description && newer.description) {
      changes.push(`Added description to "${stepName}"`);
    } else if (older.description && !newer.description) {
      changes.push(`Removed description from "${stepName}"`);
    } else {
      changes.push(`Updated description in "${stepName}"`);
    }
  }
  
  // Form fields
  const olderFields = older.fields?.length || 0;
  const newerFields = newer.fields?.length || 0;
  if (olderFields !== newerFields) {
    const diff = newerFields - olderFields;
    if (diff > 0) {
      changes.push(`Added ${diff} form field${diff !== 1 ? "s" : ""} to "${stepName}"`);
    } else {
      changes.push(`Removed ${Math.abs(diff)} form field${Math.abs(diff) !== 1 ? "s" : ""} from "${stepName}"`);
    }
  } else if (olderFields > 0 && JSON.stringify(older.fields) !== JSON.stringify(newer.fields)) {
    changes.push(`Modified form fields in "${stepName}"`);
  }
  
  // Approver changes
  if (older.approver_resolution !== newer.approver_resolution) {
    const oldRes = formatApproverResolution(older.approver_resolution);
    const newRes = formatApproverResolution(newer.approver_resolution);
    changes.push(`Changed approver from "${oldRes}" to "${newRes}" in "${stepName}"`);
  }
  
  if (older.specific_approver_email !== newer.specific_approver_email) {
    const oldName = older.specific_approver_display_name || older.specific_approver_email || "none";
    const newName = newer.specific_approver_display_name || newer.specific_approver_email || "none";
    changes.push(`Changed specific approver from "${oldName}" to "${newName}" in "${stepName}"`);
  }
  
  // Instructions
  if ((older.instructions || "") !== (newer.instructions || "")) {
    changes.push(`Updated task instructions in "${stepName}"`);
  }
  
  // Recipients
  const oldRecipients = (older.recipients || []).join(", ");
  const newRecipients = (newer.recipients || []).join(", ");
  if (oldRecipients !== newRecipients) {
    changes.push(`Changed notification recipients in "${stepName}"`);
  }
  
  // Branches
  const olderBranches = older.branches?.length || 0;
  const newerBranches = newer.branches?.length || 0;
  if (olderBranches !== newerBranches) {
    const diff = newerBranches - olderBranches;
    if (diff > 0) {
      changes.push(`Added ${diff} branch${diff !== 1 ? "es" : ""} to "${stepName}"`);
    } else {
      changes.push(`Removed ${Math.abs(diff)} branch${Math.abs(diff) !== 1 ? "es" : ""} from "${stepName}"`);
    }
  }
  
  // Join mode
  if (older.join_mode !== newer.join_mode) {
    changes.push(`Changed join mode from "${older.join_mode || "ALL"}" to "${newer.join_mode || "ALL"}" in "${stepName}"`);
  }
  
  // Start/End flags
  if (older.is_start !== newer.is_start) {
    changes.push(newer.is_start ? `Set "${stepName}" as start step` : `Removed start flag from "${stepName}"`);
  }
  if (older.is_terminal !== newer.is_terminal) {
    changes.push(newer.is_terminal ? `Set "${stepName}" as end step` : `Removed end flag from "${stepName}"`);
  }
  
  return changes;
}

function formatApproverResolution(resolution: string | undefined): string {
  if (!resolution) return "Not set";
  const labels: Record<string, string> = {
    REQUESTER_MANAGER: "Requester's Manager",
    SPECIFIC_EMAIL: "Specific Person",
    SPOC_EMAIL: "SPOC (Legacy)",
    CONDITIONAL: "Conditional",
    STEP_ASSIGNEE: "Previous Step Assignee"
  };
  return labels[resolution] || resolution.replace(/_/g, " ");
}

/**
 * Step Accordion
 */
function StepAccordion({ step, isExpanded, onToggle }: { step: any; isExpanded: boolean; onToggle: () => void }) {
  const stepType = getStepType(step);
  const Icon = stepIcons[stepType] || FileText;
  const colors = stepColors[stepType] || stepColors.FORM_STEP;
  
  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", colors.bg)}>
          <Icon className={cn("h-5 w-5", colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{getStepName(step)}</span>
            {step.is_start && <Badge className="bg-green-500 text-white text-xs">Start</Badge>}
            {step.is_terminal && <Badge className="bg-red-500 text-white text-xs">End</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{stepLabels[stepType] || stepType}</p>
        </div>
        {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
      </button>
      
      {isExpanded && (
        <div className="border-t p-3 bg-gray-50 space-y-3 text-sm">
          {step.description && (
            <div>
              <span className="font-medium text-gray-600">Description:</span>
              <p className="text-gray-700">{step.description}</p>
            </div>
          )}
          
          {stepType === "FORM_STEP" && step.fields?.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">Form Fields ({step.fields.length}):</span>
              <div className="mt-1 space-y-1">
                {step.fields.map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border text-xs">
                    <Badge variant="outline" className="font-mono">{f.field_type}</Badge>
                    <span>{f.field_label}</span>
                    {f.required && <Badge className="bg-red-100 text-red-600 ml-auto">Required</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {stepType === "APPROVAL_STEP" && (
            <div className="space-y-1">
              <div>
                <span className="font-medium text-gray-600">Approver: </span>
                <span>{formatApproverResolution(step.approver_resolution)}</span>
              </div>
              {step.specific_approver_email && (
                <div>
                  <span className="font-medium text-gray-600">Specific: </span>
                  <span>{step.specific_approver_display_name || step.specific_approver_email}</span>
                </div>
              )}
            </div>
          )}
          
          {stepType === "TASK_STEP" && step.instructions && (
            <div>
              <span className="font-medium text-gray-600">Instructions:</span>
              <p className="text-gray-700 mt-1 p-2 bg-white rounded border">{step.instructions}</p>
            </div>
          )}
          
          {stepType === "NOTIFY_STEP" && step.recipients?.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">Recipients: </span>
              <span className="capitalize">{step.recipients.join(", ")}</span>
            </div>
          )}
          
          {stepType === "FORK_STEP" && step.branches?.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">Branches ({step.branches.length}):</span>
              <div className="mt-1 space-y-1">
                {step.branches.map((b: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color || "#8b5cf6" }} />
                    <span className="text-sm">{b.branch_name || b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {stepType === "JOIN_STEP" && (
            <div>
              <span className="font-medium text-gray-600">Join Mode: </span>
              <span>{step.join_mode || "ALL"}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
