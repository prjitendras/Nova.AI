/**
 * Premium Workflow Studio
 * Modern listing page with stunning cards
 */
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkflows, useCreateWorkflow, useSaveDraft, useDeleteWorkflow, useWorkflow } from "@/hooks/use-workflows";
import { useGenerateWorkflow } from "@/hooks/use-genai";
import { PageContainer } from "@/components/page-header";
import { WorkflowStatusBadge } from "@/components/status-badge";
import { UserPill } from "@/components/user-pill";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Sparkles, FileText, Loader2, Workflow, Search, ArrowRight, MoreHorizontal, Edit, Trash2, Archive, Clock, GitBranch, Users, LayoutGrid, List, Wand2, Copy, Upload, History, Brain, Zap, X } from "lucide-react";
import { formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays, format } from "date-fns";

// Compact time format helper
function formatCompactTime(date: Date): string {
  const now = new Date();
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = differenceInHours(now, date);
  if (hours < 24) return `${hours}h ago`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return format(date, "MMM d");
}
import { toast } from "sonner";
import { parseUTCDate } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Workflow as WorkflowType, WorkflowDefinition } from "@/lib/types";
import { VersionHistory } from "@/components/workflow-studio/version-history";

export default function WorkflowStudioPage() {
  const router = useRouter();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"blank" | "ai" | "copy" | "import">("blank");
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterStatus, setFilterStatus] = useState<"all" | "DRAFT" | "PUBLISHED" | "ARCHIVED">("all");
  const [newWorkflow, setNewWorkflow] = useState({ name: "", description: "", category: "", tags: "" });
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedFileData, setImportedFileData] = useState<{ definition: any; name?: string; description?: string; category?: string; tags?: string[] } | null>(null);
  const [importWorkflowName, setImportWorkflowName] = useState("");

  const { data, isLoading, error, refetch } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const generateWorkflow = useGenerateWorkflow();
  const saveDraft = useSaveDraft();
  const { data: sourceWorkflow, isLoading: isLoadingSource } = useWorkflow(selectedWorkflowId);

  const filteredWorkflows = (data?.items || []).filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || w.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const importedData = JSON.parse(text);
          
          // Validate imported data structure
          if (!importedData.definition || !importedData.definition.steps || !Array.isArray(importedData.definition.steps)) {
            toast.error("Invalid workflow file format");
            return;
          }
          
          // Store imported data and show name dialog
          setImportedFileData(importedData);
          setImportWorkflowName(importedData.name || "");
          setImportDialogOpen(true);
        } catch (error) {
          console.error("Import error:", error);
          toast.error("Failed to parse workflow file. Please check the file format.");
        }
      };
      reader.readAsText(file);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!importWorkflowName.trim()) {
      toast.error("Please enter a workflow name");
      return;
    }
    
    if (!importedFileData) {
      toast.error("No workflow data to import");
      return;
    }
    
    try {
      // Create workflow with user-provided name and imported metadata
      const workflowData = {
        name: importWorkflowName.trim(),
        description: importedFileData.description || "",
        category: importedFileData.category || "",
        tags: importedFileData.tags || []
      };
      
      const result = await createWorkflow.mutateAsync(workflowData);
      
      // Save the imported definition
      if (result.workflow_id) {
        // Store imported definition in sessionStorage to load it in the editor
        sessionStorage.setItem(`import_workflow_${result.workflow_id}`, JSON.stringify(importedFileData.definition));
        
        // Navigate to editor
        router.push(`/studio/${result.workflow_id}?import=true`);
        
        toast.success("Workflow imported successfully");
        setCreateDialogOpen(false);
        setImportDialogOpen(false);
        setNewWorkflow({ name: "", description: "", category: "", tags: "" });
        setImportedFileData(null);
        setImportWorkflowName("");
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import workflow. Please try again.");
    }
  };

  const handleCreate = async () => {
    if (!newWorkflow.name.trim()) return;
    if (createMode === "copy" && !selectedWorkflowId) {
      toast.error("Please select a workflow to copy from");
      return;
    }
    if (createMode === "copy" && isLoadingSource) {
      toast.error("Please wait for workflow to load");
      return;
    }
    if (createMode === "copy" && !sourceWorkflow?.definition) {
      toast.error("Selected workflow has no definition to copy");
      return;
    }
    try {
      // Parse tags from comma-separated string
      const tagsArray = newWorkflow.tags 
        ? newWorkflow.tags.split(",").map(t => t.trim()).filter(t => t.length > 0)
        : [];
      const result = await createWorkflow.mutateAsync({ 
        name: newWorkflow.name, 
        description: newWorkflow.description || undefined, 
        category: newWorkflow.category || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined
      });
      
      if (createMode === "ai" && newWorkflow.description.trim().length >= 10) {
        setIsGenerating(true);
        toast.info("Generating with AI...", { duration: 10000 });
        try {
          const aiResult = await generateWorkflow.mutateAsync({ promptText: newWorkflow.description });
          
          // Validate that we have a proper definition with steps
          const hasValidDefinition = aiResult.draft_definition && 
            aiResult.draft_definition.steps && 
            Array.isArray(aiResult.draft_definition.steps) && 
            aiResult.draft_definition.steps.length > 0;
          
          if (hasValidDefinition) {
            await saveDraft.mutateAsync({ workflowId: result.workflow_id, definition: aiResult.draft_definition });
            
            // Show appropriate message based on validation
            if (aiResult.validation?.is_valid) {
              toast.success("AI workflow generated successfully!");
            } else {
              const errorCount = aiResult.validation?.errors?.length || 0;
              const warningCount = aiResult.validation?.warnings?.length || 0;
              toast.success(`Workflow generated with ${errorCount} error(s) and ${warningCount} warning(s). Please review in editor.`);
            }
          } else {
            // AI returned empty or invalid definition
            toast.error("AI could not generate a valid workflow. Please try with a more detailed description.");
          }
        } catch (err: any) {
          const errorMessage = err?.message || "AI generation failed. Please try again.";
          toast.error(errorMessage);
        }
        setIsGenerating(false);
      } else if (createMode === "copy" && sourceWorkflow?.definition) {
        setIsGenerating(true);
        toast.info("Copying workflow...", { duration: 2000 });
        try {
          await saveDraft.mutateAsync({ workflowId: result.workflow_id, definition: sourceWorkflow.definition });
          toast.success("Workflow copied successfully!");
        } catch (err) {
          toast.error("Failed to copy workflow definition");
        }
        setIsGenerating(false);
      }
      
      setCreateDialogOpen(false);
      setNewWorkflow({ name: "", description: "", category: "", tags: "" });
      setSelectedWorkflowId("");
      router.push(`/studio/${result.workflow_id}`);
    } catch { setIsGenerating(false); }
  };

  const isCreating = createWorkflow.isPending || isGenerating;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[300px] bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {/* Premium Header with Stats */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-purple-600 blur-lg opacity-40" />
              <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary to-purple-600 shadow-lg">
                <Workflow className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Workflow Studio Agent</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                Design, build, and manage your intelligent workflows
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-2">
            <QuickStat 
              label="Total" 
              count={data?.items?.length || 0} 
              color="slate"
            />
            <QuickStat 
              label="Published" 
              count={data?.items?.filter(w => w.status === "PUBLISHED").length || 0} 
              color="emerald"
            />
            <QuickStat 
              label="Drafts" 
              count={data?.items?.filter(w => w.status === "DRAFT").length || 0} 
              color="amber"
            />
          </div>

          {/* Hidden file input */}
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            id="workflow-import-input"
          />

          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            if (isCreating && !open) return;
            setCreateDialogOpen(open);
            if (!open) {
              setNewWorkflow({ name: "", description: "", category: "", tags: "" });
              setSelectedWorkflowId("");
              setCreateMode("blank");
            }
          }}>
            <DialogTrigger asChild>
              <Button className="group relative rounded-xl px-5 h-10 overflow-hidden bg-gradient-to-r from-primary via-orange-500 to-primary bg-[length:200%_100%] animate-gradient-x text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.02]">
                {/* Sparkle effects */}
                <span className="absolute inset-0 overflow-hidden rounded-xl">
                  <span className="absolute top-0 left-1/4 w-1 h-1 bg-white/60 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                  <span className="absolute top-1/2 right-1/4 w-0.5 h-0.5 bg-white/60 rounded-full animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
                  <span className="absolute bottom-1 left-1/2 w-0.5 h-0.5 bg-white/60 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }} />
                </span>
                {/* Shine effect on hover */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {/* Content */}
                <span className="relative flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4" />
                  Create Workflow
                  <Sparkles className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="sm:max-w-lg max-h-[85vh] flex flex-col bg-card border-border shadow-2xl overflow-hidden"
              onPointerDownOutside={(e) => {
                // Prevent closing on outside click during generation
                if (isCreating) {
                  e.preventDefault();
                }
              }}
              onEscapeKeyDown={(e) => {
                // Prevent closing on Escape during generation
                if (isCreating) {
                  e.preventDefault();
                }
              }}
            >
              {/* Loading Overlay */}
              {isCreating && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-lg">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-full blur-xl animate-pulse opacity-50" />
                    <div className="relative p-4 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-xl shadow-violet-500/30">
                      {createMode === "ai" ? (
                        <Brain className="h-8 w-8 text-white animate-pulse" />
                      ) : (
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      )}
                    </div>
                  </div>
                  <div className="mt-6 text-center">
                    <p className="text-lg font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">
                      {createMode === "ai" ? "NOVA Design Agent is working..." : createMode === "copy" ? "Copying workflow..." : "Creating workflow..."}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {createMode === "ai" ? "Crafting your workflow with AI intelligence" : "Please wait..."}
                    </p>
                  </div>
                  {createMode === "ai" && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-violet-500 animate-pulse" />
                        <span>Analyzing your description</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="h-4 w-4 text-fuchsia-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
                        <span>Building intelligent workflow structure</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>Choose how to start</DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="space-y-6 py-4">
                {/* Mode Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setCreateMode("blank")} className={`p-4 rounded-xl text-left transition-all ${createMode === "blank" ? "bg-primary/10 border-2 border-primary" : "bg-muted/50 border-2 border-transparent hover:border-primary/30"}`}>
                    <div className="p-2 rounded-lg bg-muted w-fit mb-3"><FileText className="h-5 w-5" /></div>
                    <p className="font-semibold text-sm">Blank</p>
                    <p className="text-xs text-muted-foreground">Start from scratch</p>
                  </button>
                  <button onClick={() => setCreateMode("ai")} className={`p-4 rounded-xl text-left transition-all relative overflow-hidden group ${createMode === "ai" ? "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border-2 border-violet-500" : "bg-muted/50 border-2 border-transparent hover:border-violet-500/50 hover:bg-gradient-to-br hover:from-violet-500/5 hover:to-fuchsia-500/5"}`}>
                    {/* Animated background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-fuchsia-500/10 to-violet-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="relative">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 w-fit mb-3 shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-shadow">
                        <Brain className="h-5 w-5 text-white" />
                      </div>
                      <p className="font-semibold text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">NOVA Design Agent</p>
                      <p className="text-xs text-muted-foreground">AI-powered workflow creation</p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">Recommended</span>
                      </div>
                    </div>
                  </button>
                  <button onClick={() => setCreateMode("copy")} className={`p-4 rounded-xl text-left transition-all ${createMode === "copy" ? "bg-primary/10 border-2 border-primary" : "bg-muted/50 border-2 border-transparent hover:border-primary/30"}`}>
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 w-fit mb-3"><Copy className="h-5 w-5 text-white" /></div>
                    <p className="font-semibold text-sm">Copy Existing</p>
                    <p className="text-xs text-muted-foreground">Start from template</p>
                  </button>
                  <button 
                    onClick={() => {
                      setCreateMode("import");
                      fileInputRef.current?.click();
                    }} 
                    className={`p-4 rounded-xl text-left transition-all ${createMode === "import" ? "bg-primary/10 border-2 border-primary" : "bg-muted/50 border-2 border-transparent hover:border-primary/30"}`}
                  >
                    <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 w-fit mb-3"><Upload className="h-5 w-5 text-white" /></div>
                    <p className="font-semibold text-sm">Import</p>
                    <p className="text-xs text-muted-foreground">Upload JSON file</p>
                  </button>
                </div>
                
                {/* Workflow Selector for Copy Mode */}
                {createMode === "copy" && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Select Workflow to Copy *</Label>
                    <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose a workflow..." />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-[200px]">
                          {filteredWorkflows.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground text-center">No workflows available</div>
                          ) : (
                            filteredWorkflows.map((w) => (
                              <SelectItem key={w.workflow_id} value={w.workflow_id}>
                                {w.name} {w.category && `(${w.category})`} - {w.status}
                              </SelectItem>
                            ))
                          )}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                    {selectedWorkflowId && sourceWorkflow && (
                      <p className="text-xs text-muted-foreground">
                        Will copy from: <span className="font-medium">{sourceWorkflow.name}</span>
                        {sourceWorkflow.description && <span className="block mt-1">{sourceWorkflow.description}</span>}
                      </p>
                    )}
                  </div>
                )}
                {/* Form */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Name *</Label>
                    <Input placeholder="e.g., Employee Onboarding" value={newWorkflow.name} onChange={e => setNewWorkflow({ ...newWorkflow, name: e.target.value })} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Description {createMode === "ai" && <span className="text-primary">* (for AI)</span>}</Label>
                    <Textarea placeholder={createMode === "ai" ? "Describe your workflow in detail..." : "Brief description..."} value={newWorkflow.description} onChange={e => setNewWorkflow({ ...newWorkflow, description: e.target.value })} rows={createMode === "ai" ? 5 : 3} className="rounded-xl resize-none" />
                    {createMode === "ai" && newWorkflow.description.length > 0 && newWorkflow.description.length < 10 && <p className="text-xs text-destructive">At least 10 characters for AI</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Category</Label>
                    <Input placeholder="e.g., HR, IT, Finance" value={newWorkflow.category} onChange={e => setNewWorkflow({ ...newWorkflow, category: e.target.value })} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Tags</Label>
                    <div className="flex flex-wrap gap-1.5 p-2 border rounded-xl bg-background/50 min-h-[42px]">
                      {newWorkflow.tags.split(",").filter(t => t.trim()).map((tag, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          {tag.trim()}
                          <button
                            type="button"
                            onClick={() => {
                              const tags = newWorkflow.tags.split(",").map(t => t.trim()).filter(t => t);
                              tags.splice(idx, 1);
                              setNewWorkflow({ ...newWorkflow, tags: tags.join(", ") });
                            }}
                            className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        ref={tagInputRef}
                        type="text"
                        placeholder={newWorkflow.tags ? "Add more..." : "Type and press Enter..."}
                        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const existingTags = newWorkflow.tags.split(",").map(t => t.trim()).filter(t => t);
                              if (!existingTags.includes(value)) {
                                setNewWorkflow({ ...newWorkflow, tags: [...existingTags, value].join(", ") });
                              }
                              input.value = "";
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tagInputRef.current && tagInputRef.current.value.trim()) {
                            const existingTags = newWorkflow.tags.split(",").map(t => t.trim()).filter(t => t);
                            const newTag = tagInputRef.current.value.trim();
                            if (!existingTags.includes(newTag)) {
                              setNewWorkflow({ ...newWorkflow, tags: [...existingTags, newTag].join(", ") });
                            }
                            tagInputRef.current.value = "";
                            tagInputRef.current.focus();
                          }
                        }}
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                        title="Add tag"
                      >
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Press Enter or click + to add tags</p>
                  </div>
                </div>
              </div>
              </div>
              <DialogFooter className="flex-shrink-0 pt-4 border-t">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isCreating} className="rounded-xl">Cancel</Button>
                <Button onClick={handleCreate} disabled={!newWorkflow.name.trim() || isCreating || (createMode === "ai" && newWorkflow.description.length < 10) || (createMode === "copy" && (!selectedWorkflowId || isLoadingSource))} className="rounded-xl btn-premium text-white">
                  {isCreating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isGenerating ? (createMode === "copy" ? "Copying..." : "Generating...") : "Creating..."}</> : createMode === "ai" ? <><Wand2 className="h-4 w-4 mr-2" />Generate</> : createMode === "copy" ? <><Copy className="h-4 w-4 mr-2" />Copy</> : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Import Name Dialog */}
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col bg-card border-border shadow-2xl">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Import Workflow</DialogTitle>
                <DialogDescription>Enter a name for the imported workflow</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 overflow-y-auto">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Workflow Name *</Label>
                  <Input 
                    placeholder="e.g., Employee Onboarding" 
                    value={importWorkflowName} 
                    onChange={(e) => setImportWorkflowName(e.target.value)} 
                    className="rounded-xl"
                    autoFocus
                  />
                </div>
                {importedFileData && (
                  <>
                    {importedFileData.description && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Description</Label>
                        <Textarea 
                          value={importedFileData.description} 
                          readOnly
                          className="rounded-xl resize-none bg-muted/50"
                          rows={3}
                        />
                      </div>
                    )}
                    {importedFileData.category && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Category</Label>
                        <Input 
                          value={importedFileData.category} 
                          readOnly
                          className="rounded-xl bg-muted/50"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              </ScrollArea>
              <DialogFooter className="flex-shrink-0 pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  setImportDialogOpen(false);
                  setImportedFileData(null);
                  setImportWorkflowName("");
                }} disabled={createWorkflow.isPending} className="rounded-xl">
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmImport} 
                  disabled={!importWorkflowName.trim() || createWorkflow.isPending} 
                  className="rounded-xl btn-premium text-white"
                >
                  {createWorkflow.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Compact Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search workflows..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-lg h-9 bg-card/50 text-sm" />
          </div>
          <div className="flex rounded-lg p-0.5 bg-muted/50 border">
            {["all", "DRAFT", "PUBLISHED", "ARCHIVED"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s as any)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filterStatus === s ? "bg-background shadow-sm" : "hover:bg-background/50"}`}>
                {s === "all" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg p-0.5 bg-muted/50 border">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md ${viewMode === "grid" ? "bg-background shadow-sm" : ""}`}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md ${viewMode === "list" ? "bg-background shadow-sm" : ""}`}><List className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <ErrorState message="Failed to load workflows" onRetry={refetch} />
        ) : isLoading ? (
          <div className={viewMode === "grid" ? "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-2"}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="rounded-xl"><CardContent className="p-4"><Skeleton className="h-4 w-1/2 mb-2" /><Skeleton className="h-3 w-full mb-1.5" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
            ))}
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 blur-2xl rounded-full" />
              <div className="relative p-4 rounded-2xl bg-muted/50 border"><Workflow className="h-10 w-10 text-muted-foreground" /></div>
            </div>
            <h3 className="text-lg font-bold mb-1">{searchQuery || filterStatus !== "all" ? "No workflows found" : "No workflows yet"}</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">{searchQuery || filterStatus !== "all" ? "Try adjusting your search or filters" : "Create your first workflow to get started"}</p>
            {!searchQuery && filterStatus === "all" && (
              <Button 
                onClick={() => setCreateDialogOpen(true)} 
                className="group relative rounded-xl px-5 h-10 overflow-hidden bg-gradient-to-r from-primary via-orange-500 to-primary bg-[length:200%_100%] animate-gradient-x text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300"
              >
                <span className="relative flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4" />
                  Create Workflow
                  <Sparkles className="h-3.5 w-3.5 opacity-70" />
                </span>
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWorkflows.map((w, i) => (
              <WorkflowCard key={w.workflow_id} workflow={w} index={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWorkflows.map((w, i) => (
              <WorkflowListItem key={w.workflow_id} workflow={w} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Quick stat pill for header
function QuickStat({ label, count, color }: { label: string; count: number; color: "slate" | "emerald" | "amber" }) {
  const colors = {
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
    emerald: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
  };
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors[color]}`}>
      <span className="font-bold">{count}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function WorkflowCard({ workflow: w, index }: { workflow: WorkflowType; index: number }) {
  const router = useRouter();
  const deleteWorkflow = useDeleteWorkflow();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
    await deleteWorkflow.mutateAsync(w.workflow_id);
  };
  
  const handleRestoreVersion = (definition: WorkflowDefinition) => {
    sessionStorage.setItem(`restore_version_${w.workflow_id}`, JSON.stringify(definition));
    router.push(`/studio/${w.workflow_id}?restore=true`);
  };

  // Get step count from definition
  const stepCount = w.definition?.steps?.length || 0;

  // Status colors with hover glow
  const statusConfig = {
    PUBLISHED: { bg: "from-emerald-500/15 to-emerald-600/5", top: "bg-emerald-500", glow: "group-hover:shadow-emerald-500/20" },
    DRAFT: { bg: "from-amber-500/15 to-amber-600/5", top: "bg-amber-500", glow: "group-hover:shadow-amber-500/20" },
    ARCHIVED: { bg: "from-gray-500/15 to-gray-600/5", top: "bg-gray-400", glow: "group-hover:shadow-gray-500/20" },
  };
  const config = statusConfig[w.status as keyof typeof statusConfig] || statusConfig.DRAFT;
  
  return (
    <>
      <Card 
        onClick={() => router.push(`/studio/${w.workflow_id}`)} 
        className={`group relative rounded-xl cursor-pointer overflow-hidden border shadow-sm hover:shadow-lg transition-all duration-300 animate-fade-in bg-gradient-to-br ${config.bg} ${config.glow}`}
        style={{ animationDelay: `${index * 30}ms` }}
      >
        {/* Top color bar with gradient */}
        <div className={`h-1 ${config.top}`} />
        
        <CardContent className="p-4">
          {/* Header: Title + Menu */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold leading-snug break-all flex-1 group-hover:text-primary transition-colors" title={w.name}>
              {w.name}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 flex-shrink-0 -mr-1 -mt-1 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/studio/${w.workflow_id}`); }}>
                  <Edit className="h-4 w-4 mr-2" />Edit
                </DropdownMenuItem>
                {w.published_version && w.published_version > 0 && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); setShowVersionHistory(true); }}>
                    <History className="h-4 w-4 mr-2" />Version History
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true); }} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Status + Category + Steps */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <WorkflowStatusBadge status={w.status} />
            {w.category && (
              <Badge variant="outline" className="text-[10px] font-medium bg-background/50" title={w.category}>
                {w.category}
              </Badge>
            )}
            {stepCount > 0 && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                {stepCount} step{stepCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          
          {/* Tags */}
          {w.tags && w.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {w.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-[9px] font-normal px-1.5 py-0.5 bg-primary/5 border-primary/20 text-primary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Description */}
          <div className="min-h-[32px] mb-3">
            {w.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2" title={w.description}>{w.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No description</p>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              {w.published_version ? (
                <button onClick={e => { e.stopPropagation(); setShowVersionHistory(true); }} className="flex items-center gap-1 hover:text-primary transition-colors">
                  <GitBranch className="h-3 w-3" />v{w.published_version}
                </button>
              ) : null}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatCompactTime(parseUTCDate(w.updated_at))}
              </span>
            </div>
            {w.created_by && <UserPill user={w.created_by} size="sm" />}
          </div>
        </CardContent>
      </Card>
      
      {/* Version History Sheet */}
      <VersionHistory
        workflowId={w.workflow_id}
        currentVersion={w.published_version || null}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestoreVersion={handleRestoreVersion}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Are you sure you want to delete "{w.name}"? This action cannot be undone.</span>
              {w.status === "PUBLISHED" && (
                <span className="block text-destructive font-medium">
                  ⚠️ Warning: This is a published workflow. Deleting it may affect existing tickets!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={e => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteWorkflow.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WorkflowListItem({ workflow: w, index }: { workflow: WorkflowType; index: number }) {
  const router = useRouter();
  const deleteWorkflow = useDeleteWorkflow();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
    await deleteWorkflow.mutateAsync(w.workflow_id);
  };
  
  const handleRestoreVersion = (definition: WorkflowDefinition) => {
    sessionStorage.setItem(`restore_version_${w.workflow_id}`, JSON.stringify(definition));
    router.push(`/studio/${w.workflow_id}?restore=true`);
  };

  // Get step count from definition
  const stepCount = w.definition?.steps?.length || 0;

  const statusColors = {
    PUBLISHED: "border-l-emerald-500 hover:shadow-emerald-500/10",
    DRAFT: "border-l-amber-500 hover:shadow-amber-500/10",
    ARCHIVED: "border-l-gray-400 hover:shadow-gray-500/10",
  };
  const accentBorder = statusColors[w.status as keyof typeof statusColors] || statusColors.DRAFT;
  
  return (
    <>
      <div 
        onClick={() => router.push(`/studio/${w.workflow_id}`)} 
        className={`group flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all duration-200 animate-fade-in border-l-2 ${accentBorder}`}
        style={{ animationDelay: `${index * 20}ms` }}
      >
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-violet-500/10 group-hover:from-primary/20 group-hover:to-violet-500/20 transition-colors flex-shrink-0">
          <Workflow className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate group-hover:text-primary transition-colors" title={w.name}>{w.name}</span>
            <WorkflowStatusBadge status={w.status} />
            {w.category && (
              <Badge variant="outline" className="text-[10px] truncate max-w-[70px]" title={w.category}>{w.category}</Badge>
            )}
            {stepCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{stepCount} steps</Badge>
            )}
          </div>
          {w.description ? (
            <p className="text-xs text-muted-foreground truncate" title={w.description}>{w.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No description</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
          {w.published_version ? (
            <button onClick={e => { e.stopPropagation(); setShowVersionHistory(true); }} className="flex items-center gap-1 hover:text-primary transition-colors">
              <GitBranch className="h-3 w-3" />v{w.published_version}
            </button>
          ) : null}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatCompactTime(parseUTCDate(w.updated_at))}
          </span>
          {w.created_by && <UserPill user={w.created_by} size="sm" />}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/studio/${w.workflow_id}`); }}>
              <Edit className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
            {w.published_version && w.published_version > 0 && (
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setShowVersionHistory(true); }}>
                <History className="h-4 w-4 mr-2" />Version History
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true); }} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Version History Sheet */}
      <VersionHistory
        workflowId={w.workflow_id}
        currentVersion={w.published_version || null}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestoreVersion={handleRestoreVersion}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Are you sure you want to delete "{w.name}"? This action cannot be undone.</span>
              {w.status === "PUBLISHED" && (
                <span className="block text-destructive font-medium">
                  ⚠️ Warning: This is a published workflow. Deleting it may affect existing tickets!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={e => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteWorkflow.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
