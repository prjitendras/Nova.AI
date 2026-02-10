/**
 * Lookup Manager Component
 * Beautiful, modern UI for managing workflow lookup tables
 * Features: CRUD for lookups, entries, and user assignments with AD search
 */
"use client";

import { useState, useMemo, Fragment } from "react";
import { 
  useLookups, 
  useCreateLookup, 
  useUpdateLookup, 
  useDeleteLookup, 
  useSaveLookupEntries 
} from "@/hooks/use-lookups";
import { UserSearchSelect } from "@/components/user-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Plus, Trash2, Edit2, Save, X, Users, ChevronDown, ChevronRight, 
  Crown, Star, Loader2, Search, Table2, Link2, AlertCircle, CheckCircle2,
  GripVertical, MoreHorizontal, Copy, FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";
import type { WorkflowLookup, LookupEntry, LookupUser, StepTemplate, FormField } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LookupManagerProps {
  workflowId: string;
  steps: StepTemplate[];
  onClose?: () => void;
}

interface EditingEntry {
  entry_id?: string;
  key: string;
  display_label: string;
  users: Array<{
    aad_id?: string;
    email: string;
    display_name: string;
    is_primary: boolean;
    order: number;
  }>;
  is_active: boolean;
}

export function LookupManager({ workflowId, steps, onClose }: LookupManagerProps) {
  const { data: lookupsData, isLoading } = useLookups(workflowId);
  const createLookup = useCreateLookup(workflowId);
  const updateLookup = useUpdateLookup(workflowId);
  const deleteLookup = useDeleteLookup(workflowId);
  const saveLookupEntries = useSaveLookupEntries(workflowId);
  
  const [selectedLookupId, setSelectedLookupId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingLookup, setEditingLookup] = useState<WorkflowLookup | null>(null);
  
  // New lookup form state
  const [newLookupName, setNewLookupName] = useState("");
  const [newLookupDescription, setNewLookupDescription] = useState("");
  const [newLookupStepId, setNewLookupStepId] = useState<string | undefined>();
  const [newLookupFieldKey, setNewLookupFieldKey] = useState<string | undefined>();
  
  const lookups = lookupsData?.items || [];
  const selectedLookup = lookups.find(l => l.lookup_id === selectedLookupId);
  
  // Get available form steps and their dropdown fields
  const formSteps = useMemo(() => 
    steps.filter(s => s.step_type === "FORM_STEP" && s.fields && s.fields.length > 0), 
    [steps]
  );
  
  const getDropdownFields = (stepId: string): FormField[] => {
    const step = formSteps.find(s => s.step_id === stepId);
    return step?.fields?.filter(f => f.field_type === "SELECT" || f.field_type === "MULTISELECT") || [];
  };
  
  const handleCreateLookup = async () => {
    if (!newLookupName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    
    await createLookup.mutateAsync({
      name: newLookupName.trim(),
      description: newLookupDescription.trim() || undefined,
      source_step_id: newLookupStepId,
      source_field_key: newLookupFieldKey,
    });
    
    setShowCreateDialog(false);
    setNewLookupName("");
    setNewLookupDescription("");
    setNewLookupStepId(undefined);
    setNewLookupFieldKey(undefined);
  };
  
  const handleDeleteLookup = async (lookupId: string) => {
    await deleteLookup.mutateAsync(lookupId);
    if (selectedLookupId === lookupId) {
      setSelectedLookupId(null);
    }
  };
  
  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b bg-muted/30">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Table2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Lookup Tables</h2>
              <p className="text-sm text-muted-foreground">Dynamic user assignments</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 shadow-lg shadow-violet-500/20"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Lookup
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Lookup List Sidebar */}
        <div className="w-72 flex-shrink-0 border-r bg-muted/20 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
              ) : lookups.length === 0 ? (
                <div className="text-center py-12">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No lookup tables yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Create one to manage dynamic user assignments
                  </p>
                </div>
              ) : (
                lookups.map(lookup => (
                  <button
                    key={lookup.lookup_id}
                    onClick={() => setSelectedLookupId(lookup.lookup_id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all duration-200",
                      "border border-transparent",
                      selectedLookupId === lookup.lookup_id
                        ? "bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/30"
                        : "hover:bg-muted hover:border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center",
                        selectedLookupId === lookup.lookup_id
                          ? "bg-violet-200 dark:bg-violet-500/30 text-violet-700 dark:text-violet-300"
                          : "bg-muted text-muted-foreground"
                      )}>
                        <Table2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lookup.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lookup.entries.length} {lookup.entries.length === 1 ? "entry" : "entries"}
                        </p>
                      </div>
                    </div>
                    {lookup.source_field_key && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
                        <Link2 className="h-3 w-3" />
                        <span className="truncate">Linked to: {lookup.source_field_key}</span>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
        
        {/* Lookup Detail Panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {selectedLookup ? (
            <LookupDetailPanel
              lookup={selectedLookup}
              workflowId={workflowId}
              formSteps={formSteps}
              getDropdownFields={getDropdownFields}
              onUpdate={(updates) => updateLookup.mutate({ lookupId: selectedLookup.lookup_id, ...updates })}
              onDelete={() => handleDeleteLookup(selectedLookup.lookup_id)}
              onSaveEntries={async (entries) => { await saveLookupEntries.mutateAsync({ lookupId: selectedLookup.lookup_id, entries }); }}
              isSaving={saveLookupEntries.isPending}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
                  <Table2 className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground">Select a lookup table to view details</p>
                <p className="text-sm text-muted-foreground/70 mt-1">or create a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Create Lookup Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-violet-500" />
              Create Lookup Table
            </DialogTitle>
            <DialogDescription>
              Define a new lookup table for dynamic user assignments.
              Link it to a dropdown field to auto-populate users based on selection.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={newLookupName}
                onChange={(e) => setNewLookupName(e.target.value)}
                placeholder="e.g., IMU Leads, Regional Approvers"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newLookupDescription}
                onChange={(e) => setNewLookupDescription(e.target.value)}
                placeholder="Describe the purpose of this lookup table..."
                className="min-h-[80px]"
              />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link2 className="h-4 w-4" />
                <span>Link to Form Field (Optional)</span>
              </div>
              
              <div className="space-y-2">
                <Label>Form Step</Label>
                <Select value={newLookupStepId} onValueChange={(v) => { 
                  setNewLookupStepId(v);
                  setNewLookupFieldKey(undefined);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a form step..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formSteps.map(step => (
                      <SelectItem key={step.step_id} value={step.step_id}>
                        {step.step_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {newLookupStepId && (
                <div className="space-y-2">
                  <Label>Dropdown Field</Label>
                  <Select value={newLookupFieldKey} onValueChange={setNewLookupFieldKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a dropdown field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getDropdownFields(newLookupStepId).map(field => (
                        <SelectItem key={field.field_key} value={field.field_key}>
                          {field.field_label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateLookup}
              disabled={createLookup.isPending || !newLookupName.trim()}
              className="bg-gradient-to-r from-violet-500 to-purple-600"
            >
              {createLookup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Lookup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Lookup Detail Panel Component
// ============================================================================

interface LookupDetailPanelProps {
  lookup: WorkflowLookup;
  workflowId: string;
  formSteps: StepTemplate[];
  getDropdownFields: (stepId: string) => FormField[];
  onUpdate: (updates: Partial<WorkflowLookup>) => void;
  onDelete: () => void;
  onSaveEntries: (entries: EditingEntry[]) => Promise<void>;
  isSaving: boolean;
}

function LookupDetailPanel({ 
  lookup, 
  workflowId,
  formSteps,
  getDropdownFields,
  onUpdate, 
  onDelete, 
  onSaveEntries,
  isSaving 
}: LookupDetailPanelProps) {
  const [entries, setEntries] = useState<EditingEntry[]>(() => 
    lookup.entries.map(e => ({
      entry_id: e.entry_id,
      key: e.key,
      display_label: e.display_label || "",
      users: e.users.map(u => ({ ...u })),
      is_active: e.is_active,
    }))
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [metadataName, setMetadataName] = useState(lookup.name);
  const [metadataDescription, setMetadataDescription] = useState(lookup.description || "");
  const [metadataStepId, setMetadataStepId] = useState(lookup.source_step_id);
  const [metadataFieldKey, setMetadataFieldKey] = useState(lookup.source_field_key);
  
  // Reset entries when lookup changes
  useMemo(() => {
    setEntries(lookup.entries.map(e => ({
      entry_id: e.entry_id,
      key: e.key,
      display_label: e.display_label || "",
      users: e.users.map(u => ({ ...u })),
      is_active: e.is_active,
    })));
    setHasChanges(false);
  }, [lookup.lookup_id, lookup.version]);
  
  const handleAddEntry = () => {
    const newEntry: EditingEntry = {
      key: "",
      display_label: "",
      users: [],
      is_active: true,
    };
    setEntries([...entries, newEntry]);
    setHasChanges(true);
    setExpandedEntryId(undefined as any); // Will be set properly after render
  };
  
  const handleUpdateEntry = (index: number, updates: Partial<EditingEntry>) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], ...updates };
    setEntries(newEntries);
    setHasChanges(true);
  };
  
  const handleRemoveEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    setHasChanges(true);
  };
  
  const handleAddUser = (entryIndex: number, user: { aad_id?: string; email: string; display_name: string }) => {
    const entry = entries[entryIndex];
    const existingEmails = entry.users.map(u => u.email.toLowerCase());
    if (existingEmails.includes(user.email.toLowerCase())) {
      toast.error("User already added");
      return;
    }
    
    const newUser = {
      ...user,
      is_primary: entry.users.length === 0, // First user is primary
      order: entry.users.length,
    };
    
    const newEntries = [...entries];
    newEntries[entryIndex] = {
      ...entry,
      users: [...entry.users, newUser],
    };
    setEntries(newEntries);
    setHasChanges(true);
  };
  
  const handleRemoveUser = (entryIndex: number, userIndex: number) => {
    const entry = entries[entryIndex];
    const removedUser = entry.users[userIndex];
    let newUsers = entry.users.filter((_, i) => i !== userIndex);
    
    // If removed user was primary and there are other users, make first one primary
    if (removedUser.is_primary && newUsers.length > 0) {
      newUsers = newUsers.map((u, i) => ({ ...u, is_primary: i === 0 }));
    }
    
    const newEntries = [...entries];
    newEntries[entryIndex] = { ...entry, users: newUsers };
    setEntries(newEntries);
    setHasChanges(true);
  };
  
  const handleSetPrimaryUser = (entryIndex: number, userIndex: number) => {
    const entry = entries[entryIndex];
    const newUsers = entry.users.map((u, i) => ({ ...u, is_primary: i === userIndex }));
    
    const newEntries = [...entries];
    newEntries[entryIndex] = { ...entry, users: newUsers };
    setEntries(newEntries);
    setHasChanges(true);
  };
  
  const handleSave = async () => {
    // Validate entries
    const invalidEntries = entries.filter(e => !e.key.trim());
    if (invalidEntries.length > 0) {
      toast.error("All entries must have a key");
      return;
    }
    
    await onSaveEntries(entries);
    setHasChanges(false);
  };
  
  const handleSaveMetadata = () => {
    onUpdate({
      name: metadataName,
      description: metadataDescription || undefined,
      source_step_id: metadataStepId,
      source_field_key: metadataFieldKey,
    });
    setEditingMetadata(false);
  };
  
  // Get linked field options from the workflow
  const linkedFieldOptions = useMemo(() => {
    if (!lookup.source_step_id || !lookup.source_field_key) return null;
    
    const step = formSteps.find(s => s.step_id === lookup.source_step_id);
    const field = step?.fields?.find(f => f.field_key === lookup.source_field_key);
    
    return field?.options || null;
  }, [lookup.source_step_id, lookup.source_field_key, formSteps]);
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Detail Header */}
      <div className="flex-shrink-0 p-4 border-b bg-muted/20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editingMetadata ? (
              <div className="space-y-3">
                <Input
                  value={metadataName}
                  onChange={(e) => setMetadataName(e.target.value)}
                  className="text-lg font-semibold"
                  placeholder="Lookup name"
                />
                <Textarea
                  value={metadataDescription}
                  onChange={(e) => setMetadataDescription(e.target.value)}
                  className="min-h-[60px]"
                  placeholder="Description..."
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <Select 
                    value={metadataStepId || "_none"} 
                    onValueChange={(v) => {
                      setMetadataStepId(v === "_none" ? undefined : v);
                      setMetadataFieldKey(undefined);
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Linked form step" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {formSteps.map(step => (
                        <SelectItem key={step.step_id} value={step.step_id}>
                          {step.step_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {metadataStepId && (
                    <Select value={metadataFieldKey || "_none"} onValueChange={(v) => setMetadataFieldKey(v === "_none" ? undefined : v)}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Linked field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {getDropdownFields(metadataStepId).map(field => (
                          <SelectItem key={field.field_key} value={field.field_key}>
                            {field.field_label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveMetadata} className="bg-violet-600 hover:bg-violet-700 text-white">
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingMetadata(false);
                    setMetadataName(lookup.name);
                    setMetadataDescription(lookup.description || "");
                    setMetadataStepId(lookup.source_step_id);
                    setMetadataFieldKey(lookup.source_field_key);
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold">{lookup.name}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingMetadata(true)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {lookup.description && (
                  <p className="text-sm text-muted-foreground mt-1">{lookup.description}</p>
                )}
                {lookup.source_field_key && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-violet-600 dark:text-violet-400">
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Linked to: {lookup.source_field_key}</span>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Lookup Table?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete "{lookup.name}" and all its entries.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
      
      {/* Entries Section */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {/* Quick Add from Linked Field */}
          {linkedFieldOptions && linkedFieldOptions.length > 0 && (
            <Card className="bg-violet-100 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-violet-700 dark:text-violet-300">
                    Linked field has {linkedFieldOptions.length} options.{" "}
                    <button
                      onClick={() => {
                        const existingKeys = entries.map(e => e.key);
                        const newEntries = linkedFieldOptions
                          .filter(opt => !existingKeys.includes(opt))
                          .map(opt => ({
                            key: opt,
                            display_label: "",
                            users: [],
                            is_active: true,
                          }));
                        
                        if (newEntries.length > 0) {
                          setEntries([...entries, ...newEntries]);
                          setHasChanges(true);
                          toast.success(`Added ${newEntries.length} entries from field options`);
                        } else {
                          toast.info("All options already have entries");
                        }
                      }}
                      className="text-violet-800 dark:text-violet-200 underline hover:no-underline font-medium"
                    >
                      Add missing entries
                    </button>
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Entry List */}
          {entries.map((entry, entryIndex) => (
            <LookupEntryCard
              key={entry.entry_id || `new-${entryIndex}`}
              entry={entry}
              entryIndex={entryIndex}
              isExpanded={expandedEntryId === (entry.entry_id || `new-${entryIndex}`)}
              onToggle={() => setExpandedEntryId(
                expandedEntryId === (entry.entry_id || `new-${entryIndex}`) ? null : (entry.entry_id || `new-${entryIndex}`)
              )}
              onUpdate={(updates) => handleUpdateEntry(entryIndex, updates)}
              onRemove={() => handleRemoveEntry(entryIndex)}
              onAddUser={(user) => handleAddUser(entryIndex, user)}
              onRemoveUser={(userIndex) => handleRemoveUser(entryIndex, userIndex)}
              onSetPrimary={(userIndex) => handleSetPrimaryUser(entryIndex, userIndex)}
            />
          ))}
          
          {/* Add Entry Button */}
          <Button
            variant="outline"
            className="w-full border-dashed text-muted-foreground hover:text-foreground"
            onClick={handleAddEntry}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </ScrollArea>
      
      {/* Save Footer */}
      {hasChanges && (
        <div className="flex-shrink-0 border-t bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              You have unsaved changes
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEntries(lookup.entries.map(e => ({
                    entry_id: e.entry_id,
                    key: e.key,
                    display_label: e.display_label || "",
                    users: e.users.map(u => ({ ...u })),
                    is_active: e.is_active,
                  })));
                  setHasChanges(false);
                }}
              >
                Discard
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gradient-to-r from-violet-500 to-purple-600"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Lookup Entry Card Component
// ============================================================================

interface LookupEntryCardProps {
  entry: EditingEntry;
  entryIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<EditingEntry>) => void;
  onRemove: () => void;
  onAddUser: (user: { aad_id?: string; email: string; display_name: string }) => void;
  onRemoveUser: (userIndex: number) => void;
  onSetPrimary: (userIndex: number) => void;
}

function LookupEntryCard({
  entry,
  entryIndex,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onAddUser,
  onRemoveUser,
  onSetPrimary,
}: LookupEntryCardProps) {
  const primaryUser = entry.users.find(u => u.is_primary);
  // Key to reset the user search input after adding a user
  const [userSearchKey, setUserSearchKey] = useState(0);
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={cn(
        "transition-all",
        isExpanded ? "bg-muted/50" : "hover:bg-muted/30"
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer p-3">
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {entry.key ? (
                    <span className="font-medium">{entry.key}</span>
                  ) : (
                    <span className="text-muted-foreground italic">New entry (click to edit)</span>
                  )}
                  {entry.display_label && (
                    <span className="text-xs text-muted-foreground">({entry.display_label})</span>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {entry.users.length}
                  </Badge>
                  
                  {primaryUser && (
                    <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                      <Crown className="h-3 w-3" />
                      {primaryUser.display_name}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={entry.is_active}
                  onCheckedChange={(checked) => onUpdate({ is_active: checked })}
                  className="data-[state=checked]:bg-violet-600"
                />
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={onRemove}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 space-y-4">
            <Separator />
            
            {/* Entry Key & Label */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Key (matches dropdown value) *</Label>
                <Input
                  value={entry.key}
                  onChange={(e) => onUpdate({ key: e.target.value })}
                  placeholder="e.g., Insurance"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Display Label (optional)</Label>
                <Input
                  value={entry.display_label}
                  onChange={(e) => onUpdate({ display_label: e.target.value })}
                  placeholder="Optional display name"
                  className="text-sm"
                />
              </div>
            </div>
            
            {/* Users Section */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Assigned Users</Label>
              
              {/* User List */}
              {entry.users.length > 0 ? (
                <div className="space-y-1">
                  {entry.users.map((user, userIndex) => (
                    <div
                      key={user.email}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg",
                        user.is_primary ? "bg-violet-100 dark:bg-violet-500/20" : "bg-muted"
                      )}
                    >
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs font-medium text-white">
                        {user.display_name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {user.display_name}
                          </span>
                          {user.is_primary && (
                            <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {!user.is_primary && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
                                onClick={() => onSetPrimary(userIndex)}
                              >
                                <Crown className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Set as primary</TooltipContent>
                          </Tooltip>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => onRemoveUser(userIndex)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">No users assigned yet</p>
              )}
              
              {/* Add User */}
              <div className="pt-2">
                <UserSearchSelect
                  key={`user-search-${entryIndex}-${userSearchKey}`}
                  onChange={(user) => {
                    if (user) {
                      onAddUser({
                        aad_id: user.aad_id,
                        email: user.email,
                        display_name: user.display_name,
                      });
                      // Reset the search input for adding more users
                      setUserSearchKey(prev => prev + 1);
                    }
                  }}
                  value={null}
                  placeholder="Search and add user..."
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
