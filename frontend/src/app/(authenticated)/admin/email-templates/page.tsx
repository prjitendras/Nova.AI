/**
 * Email Templates Page - Complete Editor with Preview
 * Allows admins to customize email templates sent by the system
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useEmailTemplates,
  useEmailTemplatePreview,
} from "@/hooks/use-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Mail,
  Eye,
  CheckCircle,
  Sparkles,
  FileText,
  Bell,
  AlertTriangle,
  Clock,
  Send,
  CheckCheck,
  XCircle,
  HelpCircle,
  UserPlus,
  RefreshCw,
  Loader2,
  X,
  Edit3,
  Save,
  RotateCcw,
  Code,
  Variable,
  Palette,
  Info,
  Copy,
  Check,
} from "lucide-react";

// Template metadata
const templateMeta: Record<string, { 
  icon: React.ElementType; 
  color: string; 
  bg: string;
  description: string;
  variables: string[];
}> = {
  TICKET_CREATED: { 
    icon: CheckCircle, 
    color: "text-emerald-600", 
    bg: "bg-emerald-100",
    description: "Sent to requester when their ticket is created",
    variables: ["ticket_id", "ticket_title", "workflow_name"]
  },
  APPROVAL_PENDING: { 
    icon: Clock, 
    color: "text-amber-600", 
    bg: "bg-amber-100",
    description: "Sent to approver when approval is needed",
    variables: ["ticket_id", "ticket_title", "requester_name", "step_name"]
  },
  APPROVED: { 
    icon: CheckCheck, 
    color: "text-emerald-600", 
    bg: "bg-emerald-100",
    description: "Sent to requester when their request is approved",
    variables: ["ticket_id", "ticket_title", "approver_name", "comment"]
  },
  REJECTED: { 
    icon: XCircle, 
    color: "text-red-600", 
    bg: "bg-red-100",
    description: "Sent to requester when their request is rejected",
    variables: ["ticket_id", "ticket_title", "approver_name", "reason"]
  },
  INFO_REQUESTED: { 
    icon: HelpCircle, 
    color: "text-blue-600", 
    bg: "bg-blue-100",
    description: "Sent when someone requests additional information",
    variables: ["ticket_id", "ticket_title", "requestor_name", "subject", "question"]
  },
  INFO_RESPONDED: { 
    icon: Send, 
    color: "text-cyan-600", 
    bg: "bg-cyan-100",
    description: "Sent when information request is answered",
    variables: ["ticket_id", "ticket_title", "responder_name"]
  },
  FORM_PENDING: { 
    icon: FileText, 
    color: "text-purple-600", 
    bg: "bg-purple-100",
    description: "Sent when a form needs to be filled",
    variables: ["ticket_id", "ticket_title", "form_name"]
  },
  TASK_ASSIGNED: { 
    icon: UserPlus, 
    color: "text-blue-600", 
    bg: "bg-blue-100",
    description: "Sent to agent when a task is assigned to them",
    variables: ["ticket_id", "ticket_title", "assigned_by_name", "step_name", "due_date"]
  },
  TASK_REASSIGNED: { 
    icon: RefreshCw, 
    color: "text-indigo-600", 
    bg: "bg-indigo-100",
    description: "Sent when a task is reassigned to a different agent",
    variables: ["ticket_id", "ticket_title", "previous_agent", "new_agent", "reassigned_by"]
  },
  TASK_COMPLETED: { 
    icon: CheckCircle, 
    color: "text-emerald-600", 
    bg: "bg-emerald-100",
    description: "Sent when a task step is completed",
    variables: ["ticket_id", "ticket_title", "step_name", "completed_by"]
  },
  SLA_REMINDER: { 
    icon: Clock, 
    color: "text-amber-600", 
    bg: "bg-amber-100",
    description: "Sent as a reminder before SLA breach",
    variables: ["ticket_id", "ticket_title", "step_name", "time_remaining", "due_at"]
  },
  SLA_ESCALATION: { 
    icon: AlertTriangle, 
    color: "text-red-600", 
    bg: "bg-red-100",
    description: "Sent when SLA is breached",
    variables: ["ticket_id", "ticket_title", "step_name", "overdue_hours", "assigned_to"]
  },
  TICKET_CANCELLED: { 
    icon: XCircle, 
    color: "text-slate-600", 
    bg: "bg-slate-100",
    description: "Sent when a ticket is cancelled",
    variables: ["ticket_id", "ticket_title", "cancelled_by", "reason"]
  },
  TICKET_COMPLETED: { 
    icon: Sparkles, 
    color: "text-emerald-600", 
    bg: "bg-emerald-100",
    description: "Sent when the entire ticket workflow is completed",
    variables: ["ticket_id", "ticket_title", "completion_time"]
  },
};

interface EmailTemplateOverride {
  template_id: string;
  template_key: string;
  workflow_id: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

// Hooks
function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      template_key: string;
      custom_subject?: string;
      custom_body?: string;
      workflow_id?: string;
    }) => {
      return await apiClient.put<{ message: string; template: EmailTemplateOverride }>(
        "/admin/email-templates",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "emailTemplates"] });
      toast.success("Template saved successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save template");
    },
  });
}

function useDeleteEmailTemplateOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      return await apiClient.delete(`/admin/email-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "emailTemplates"] });
      toast.success("Reverted to default template");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revert template");
    },
  });
}

export default function EmailTemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const { data: templatesData, isLoading } = useEmailTemplates();
  const previewMutation = useEmailTemplatePreview();
  const updateMutation = useUpdateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplateOverride();

  const templates = templatesData?.templates || [];
  const overrides = templatesData?.overrides || [];

  // Get override for a template
  const getOverride = (templateKey: string): EmailTemplateOverride | undefined => {
    return overrides.find((o: EmailTemplateOverride) => o.template_key === templateKey && !o.workflow_id);
  };

  // Handle preview
  const handlePreview = async (templateKey: string) => {
    setSelectedTemplate(templateKey);
    await previewMutation.mutateAsync({ template_key: templateKey });
  };

  // Handle edit - pre-populate with default template for easy editing
  const handleEdit = async (templateKey: string) => {
    const override = getOverride(templateKey);
    setEditingTemplate(templateKey);
    setActiveTab("edit");
    
    // Load the default template first
    const previewData = await previewMutation.mutateAsync({ template_key: templateKey });
    
    // If user has an override, use that; otherwise pre-populate with default
    if (override?.custom_subject) {
      setEditSubject(override.custom_subject);
    } else {
      // Pre-populate with default subject for easy editing
      setEditSubject(previewData.subject);
    }
    
    if (override?.custom_body) {
      setEditBody(override.custom_body);
    } else {
      // Pre-populate with default body HTML for easy editing
      setEditBody(previewData.body);
    }
  };
  
  // Load default template into editor
  const loadDefaultTemplate = () => {
    if (previewMutation.data) {
      setEditSubject(previewMutation.data.subject);
      setEditBody(previewMutation.data.body);
      toast.success("Default template loaded into editor");
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!editingTemplate) return;
    
    await updateMutation.mutateAsync({
      template_key: editingTemplate,
      custom_subject: editSubject || undefined,
      custom_body: editBody || undefined,
    });
    
    setEditingTemplate(null);
  };

  // Handle revert
  const handleRevert = async (templateKey: string) => {
    const override = getOverride(templateKey);
    if (override) {
      await deleteMutation.mutateAsync(override.template_id);
    }
    setRevertConfirm(null);
  };

  // Copy variable to clipboard
  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(`{{${variable}}}`);
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  // Close modals
  const closePreview = () => setSelectedTemplate(null);
  const closeEditor = () => {
    setEditingTemplate(null);
    setEditSubject("");
    setEditBody("");
  };

  // Get template metadata
  const getMeta = (key: string) => {
    return templateMeta[key] || { 
      icon: Mail, 
      color: "text-slate-600", 
      bg: "bg-slate-100",
      description: "Email notification template",
      variables: []
    };
  };

  // Preview with custom content
  const getPreviewHtml = useCallback(() => {
    if (!previewMutation.data) return "";
    
    // If editing and have custom body, use that
    if (editBody) {
      return editBody;
    }
    
    return previewMutation.data.body;
  }, [previewMutation.data, editBody]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Email Templates</h1>
          <p className="text-muted-foreground mt-1">
            Customize email notifications sent by the system
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Palette className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Customize Your Email Templates</h3>
              <p className="text-sm text-blue-700 mt-1">
                All emails have beautiful default templates. You can customize the subject line and body HTML 
                for any template. Use variables like <code className="bg-blue-100 px-1 rounded">{"{{ticket_title}}"}</code> to 
                include dynamic content. Changes apply immediately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(9)].map((_, i) => (
            <Card key={i} className="border-0 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          templates.map((template) => {
            const meta = getMeta(template.key);
            const Icon = meta.icon;
            const hasOverride = template.has_override;

            return (
              <Card
                key={template.key}
                className="border-0 shadow-md hover:shadow-lg transition-all group"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`h-12 w-12 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-6 w-6 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold truncate">{template.name}</p>
                        {hasOverride && (
                          <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">
                            Customized
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handlePreview(template.key)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                      onClick={() => handleEdit(template.key)}
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    {hasOverride && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => setRevertConfirm(template.key)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Preview Modal */}
      {selectedTemplate && !editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePreview} />
          <div className="relative w-[95vw] h-[90vh] max-w-5xl bg-white dark:bg-slate-900 dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-white shrink-0">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${getMeta(selectedTemplate).bg} flex items-center justify-center`}>
                  {(() => {
                    const Icon = getMeta(selectedTemplate).icon;
                    return <Icon className={`h-5 w-5 ${getMeta(selectedTemplate).color}`} />;
                  })()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">Email Preview</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    closePreview();
                    handleEdit(selectedTemplate);
                  }}
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Template
                </Button>
                <Button variant="ghost" size="icon" onClick={closePreview}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {previewMutation.isPending ? (
                <div className="flex-1 flex items-center justify-center bg-slate-50">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-muted-foreground">Loading preview...</p>
                  </div>
                </div>
              ) : previewMutation.data ? (
                <>
                  <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b shrink-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Mail className="h-4 w-4" />
                      Subject Line
                    </div>
                    <p className="text-lg font-semibold">{previewMutation.data.subject}</p>
                  </div>
                  <div className="flex-1 bg-slate-100 p-6 overflow-auto">
                    <div className="max-w-[700px] mx-auto">
                      <div 
                        className="bg-white dark:bg-slate-900 rounded-xl shadow-lg overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: previewMutation.data.body }}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeEditor} />
          <div className="relative w-full h-full bg-white dark:bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-900 to-slate-800 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900/10 flex items-center justify-center">
                  <Code className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Edit Email Template</h2>
                  <p className="text-sm text-white/70">
                    {editingTemplate.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  className="text-white/70 hover:text-white hover:bg-white dark:bg-slate-900/10"
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left: Editor */}
              <div className="w-1/2 flex flex-col border-r overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    {/* Info Banner */}
                    <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-emerald-900">Default Template Pre-loaded</p>
                          <p className="text-sm text-emerald-700 mt-0.5">
                            The default template is shown below. Make your changes directly - no need to start from scratch!
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={loadDefaultTemplate}
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 shrink-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Reset to Default
                        </Button>
                      </div>
                    </div>

                    {/* Subject Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Subject Line</Label>
                        <Badge variant="outline" className="text-xs font-normal">
                          {editSubject.length} characters
                        </Badge>
                      </div>
                      <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="Enter email subject..."
                        className="font-mono text-sm h-11"
                      />
                      <p className="text-xs text-muted-foreground">
                        Edit the subject line above. Use variables like <code className="bg-slate-100 px-1 rounded">{"{{ticket_title}}"}</code> for dynamic content.
                      </p>
                    </div>

                    {/* Body Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Email Body (HTML)</Label>
                        <Badge variant="outline" className="text-xs font-normal">
                          {editBody.length.toLocaleString()} characters
                        </Badge>
                      </div>
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        placeholder="Loading template..."
                        className="h-[400px] font-mono text-xs resize-y leading-relaxed"
                      />
                      <p className="text-xs text-muted-foreground">
                        Edit the HTML template above. The default template is professionally designed - make small tweaks as needed.
                      </p>
                    </div>

                    {/* Tips */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium mb-1">Tips for Editing:</p>
                          <ul className="list-disc list-inside space-y-1 text-blue-700">
                            <li>Variables like <code className="bg-blue-100 px-1 rounded">{"{{ticket_title}}"}</code> will be replaced with actual values</li>
                            <li>Keep inline CSS for email client compatibility</li>
                            <li>Keep the design responsive for mobile devices</li>
                            <li>Include a plain text fallback if possible</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview + Variables */}
              <div className="w-1/2 flex flex-col bg-slate-50 overflow-hidden">
                <Tabs defaultValue="preview" className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-6 py-3 border-b bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-center gap-3">
                      <TabsList className="bg-gradient-to-r from-violet-100 to-blue-100 p-1 border border-violet-200">
                        <TabsTrigger 
                          value="preview" 
                          className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg animate-pulse data-[state=active]:animate-none"
                        >
                          <Eye className="h-4 w-4" />
                          Live Preview
                        </TabsTrigger>
                        <TabsTrigger 
                          value="variables" 
                          className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
                        >
                          <Variable className="h-4 w-4" />
                          Variables
                        </TabsTrigger>
                      </TabsList>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-full animate-bounce">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-medium text-amber-700">New!</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Live Preview Tab */}
                  <TabsContent value="preview" className="flex-1 m-0 overflow-hidden flex flex-col">
                    <div className="px-6 py-3 border-b bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-medium text-slate-700">Real-time Preview</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Updates as you type
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-1 bg-slate-100 p-4 overflow-auto">
                      <div className="max-w-[600px] mx-auto space-y-4">
                        {/* Subject Preview */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md overflow-hidden">
                          <div className="px-4 py-2 bg-gradient-to-r from-slate-50 to-white border-b flex items-center gap-2">
                            <Mail className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Subject</span>
                          </div>
                          <div className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {editSubject || previewMutation.data?.subject || "Loading..."}
                            </p>
                          </div>
                        </div>
                        
                        {/* Body Preview */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md overflow-hidden">
                          <div className="px-4 py-2 bg-gradient-to-r from-slate-50 to-white border-b flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email Body</span>
                          </div>
                          <div 
                            className="email-preview-container"
                            dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                          />
                        </div>
                        
                        {/* Preview Info */}
                        <div className="text-center text-xs text-muted-foreground py-2">
                          <p>Variables like {"{{ticket_title}}"} will show sample values in actual emails</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Variables Tab */}
                  <TabsContent value="variables" className="flex-1 m-0 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b bg-white dark:bg-slate-900 shrink-0">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Variable className="h-5 w-5 text-purple-600" />
                        Available Variables
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Click to copy. Use in subject or body.
                      </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6">
                      <div className="space-y-3">
                        {getMeta(editingTemplate).variables.map((variable) => (
                          <button
                            key={variable}
                            onClick={() => copyVariable(variable)}
                            className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <code className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-mono">
                                {`{{${variable}}}`}
                              </code>
                              <span className="text-sm text-muted-foreground capitalize">
                                {variable.replace(/_/g, " ")}
                              </span>
                            </div>
                            {copiedVar === variable ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Common Variables */}
                      <div className="mt-8">
                        <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Common Variables (All Templates)</h4>
                        <div className="space-y-2">
                          {["app_url", "current_year", "company_name"].map((variable) => (
                            <button
                              key={variable}
                              onClick={() => copyVariable(variable)}
                              className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border hover:border-slate-300 transition-colors group"
                            >
                              <code className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-sm font-mono">
                                {`{{${variable}}}`}
                              </code>
                              {copiedVar === variable ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Default Template Preview */}
                      <div className="mt-8 p-4 bg-white dark:bg-slate-900 rounded-xl border">
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          Default Template
                        </h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          The default template is professionally designed. Only customize if you need specific branding.
                        </p>
                        {getOverride(editingTemplate) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
                            onClick={() => setRevertConfirm(editingTemplate)}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Revert to Default
                          </Button>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revert Confirmation */}
      <AlertDialog open={!!revertConfirm} onOpenChange={() => setRevertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Default Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your custom template and restore the original default. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revertConfirm && handleRevert(revertConfirm)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Revert to Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
