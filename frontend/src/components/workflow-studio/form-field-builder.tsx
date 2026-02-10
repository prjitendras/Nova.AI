/**
 * Modern Form Field Builder Component
 * Professional form field configuration for workflow steps
 */
"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  GripVertical,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  ListFilter,
  CheckSquare,
  Upload,
  List,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
  Settings2,
  Asterisk,
  FolderPlus,
  Folder,
  Edit2,
  Users,
  Search,
  Zap,
  Table2,
} from "lucide-react";
import type { FormSection, ConditionalRequirement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConditionalRulesBuilder } from "./conditional-rules-builder";

export type FormFieldType = 
  | "TEXT" 
  | "TEXTAREA" 
  | "NUMBER" 
  | "DATE" 
  | "SELECT" 
  | "MULTISELECT" 
  | "CHECKBOX" 
  | "FILE"
  | "USER_SELECT"
  | "LOOKUP_USER_SELECT";

// Date validation options for DATE fields
export interface DateValidationConfig {
  allow_past_dates?: boolean;    // Allow dates before today (default: true)
  allow_today?: boolean;         // Allow today's date (default: true)
  allow_future_dates?: boolean;  // Allow dates after today (default: true)
}

export interface FormFieldValidation {
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  regex_pattern?: string;
  allowed_values?: string[];
  // Lookup display field configuration
  lookup_step_id?: string;      // Form step containing the source dropdown
  lookup_field_key?: string;    // Field key of the source dropdown
  // Date validation - for DATE fields
  date_validation?: DateValidationConfig;
}

export interface FormField {
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  required: boolean;
  placeholder?: string;
  default_value?: any;
  help_text?: string;
  options?: string[];
  validation?: FormFieldValidation;
  order: number;
  section_id?: string; // Optional: field belongs to a section
  conditional_requirements?: ConditionalRequirement[];
}

const fieldTypeConfig: Record<FormFieldType, { 
  icon: any; 
  label: string; 
  description: string; 
  color: string;
  gradient: string;
}> = {
  TEXT: { 
    icon: Type, 
    label: "Text", 
    description: "Single line text", 
    color: "text-sky-400",
    gradient: "from-sky-500 to-blue-600"
  },
  TEXTAREA: { 
    icon: AlignLeft, 
    label: "Long Text", 
    description: "Multi-line text", 
    color: "text-indigo-400",
    gradient: "from-indigo-500 to-blue-600"
  },
  NUMBER: { 
    icon: Hash, 
    label: "Number", 
    description: "Numeric input", 
    color: "text-emerald-400",
    gradient: "from-emerald-500 to-green-600"
  },
  DATE: { 
    icon: Calendar, 
    label: "Date", 
    description: "Date picker", 
    color: "text-amber-400",
    gradient: "from-amber-500 to-orange-600"
  },
  SELECT: { 
    icon: ListFilter, 
    label: "Dropdown", 
    description: "Single selection", 
    color: "text-purple-400",
    gradient: "from-purple-500 to-violet-600"
  },
  MULTISELECT: { 
    icon: List, 
    label: "Multi-select", 
    description: "Multiple selection", 
    color: "text-pink-400",
    gradient: "from-pink-500 to-rose-600"
  },
  CHECKBOX: { 
    icon: CheckSquare, 
    label: "Checkbox", 
    description: "Yes/No toggle", 
    color: "text-cyan-400",
    gradient: "from-cyan-500 to-blue-600"
  },
  FILE: { 
    icon: Upload, 
    label: "File Upload", 
    description: "File attachment", 
    color: "text-orange-400",
    gradient: "from-orange-500 to-red-600"
  },
  USER_SELECT: { 
    icon: Users, 
    label: "User Search", 
    description: "Search and select EXL user", 
    color: "text-blue-400",
    gradient: "from-blue-500 to-cyan-600"
  },
  LOOKUP_USER_SELECT: { 
    icon: Users, 
    label: "Lookup User Select", 
    description: "Select user from lookup table", 
    color: "text-violet-400",
    gradient: "from-violet-500 to-purple-600"
  },
};

// Other forms' fields for cross-form conditional requirements
export interface OtherFormFields {
  stepId: string;
  stepName: string;
  fields: FormField[];
}

interface FormFieldBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  sections?: FormSection[];
  onSectionsChange?: (sections: FormSection[]) => void;
  otherFormsFields?: OtherFormFields[];  // Fields from other forms in the workflow
  currentStepId?: string;  // Current step ID for LOOKUP_USER_SELECT field config
}

export function FormFieldBuilder({ fields, onChange, sections: externalSections, onSectionsChange, otherFormsFields = [], currentStepId }: FormFieldBuilderProps) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAddSectionDialogOpen, setIsAddSectionDialogOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState<string>("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionDescription, setNewSectionDescription] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null); // For adding field to specific section
  
  // Internal sections state if not provided externally
  const [internalSections, setInternalSections] = useState<FormSection[]>([]);
  
  // Use external sections if provided, otherwise use internal
  const sections = externalSections || internalSections;
  const setSections = onSectionsChange || setInternalSections;

  // Use ref to access current fields without causing re-renders
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addField = useCallback((type: FormFieldType, sectionId?: string) => {
    const currentFields = fieldsRef.current;
    
    // Calculate order based on the target section's fields, not all fields
    const sectionFields = sectionId 
      ? currentFields.filter(f => f.section_id === sectionId)
      : currentFields.filter(f => !f.section_id);
    const maxOrder = sectionFields.length > 0 
      ? Math.max(...sectionFields.map(f => f.order)) + 1 
      : 0;
    
    const newField: FormField = {
      field_key: `field_${Date.now()}`,
      field_label: `New ${fieldTypeConfig[type].label} Field`,
      field_type: type,
      required: false,
      order: maxOrder,
      section_id: sectionId,
    };
    
    if (type === "SELECT" || type === "MULTISELECT") {
      newField.options = ["Option 1", "Option 2", "Option 3"];
    }
    
    onChange([...currentFields, newField]);
    setEditingFieldKey(newField.field_key);
    setIsAddDialogOpen(false);
    setTargetSectionId(null);
    
    // Expand the section if field is added to it
    if (sectionId) {
      setExpandedSections(prev => new Set([...prev, sectionId]));
    }
  }, [onChange]);

  const updateField = useCallback((fieldKey: string, updates: Partial<FormField>) => {
    // Use ref to get current fields without depending on fields in the dependency array
    const currentFields = fieldsRef.current;
    onChange(
      currentFields.map((f) =>
        f.field_key === fieldKey ? { ...f, ...updates } : f
      )
    );
  }, [onChange]);

  const deleteField = useCallback((fieldKey: string) => {
    const currentFields = fieldsRef.current;
    onChange(currentFields.filter((f: FormField) => f.field_key !== fieldKey));
    if (editingFieldKey === fieldKey) {
      setEditingFieldKey(null);
    }
  }, [onChange, editingFieldKey]);

  const duplicateField = useCallback((field: FormField) => {
    const currentFields = fieldsRef.current;
    
    // Calculate order based on the same section as the duplicated field
    const sectionFields = field.section_id 
      ? currentFields.filter(f => f.section_id === field.section_id)
      : currentFields.filter(f => !f.section_id);
    const maxOrder = sectionFields.length > 0 
      ? Math.max(...sectionFields.map(f => f.order)) + 1 
      : 0;
    
    const newField: FormField = {
      ...field,
      field_key: `field_${Date.now()}`,
      field_label: `${field.field_label} (copy)`,
      order: maxOrder,
    };
    onChange([...currentFields, newField]);
  }, [onChange]);

  const changeFieldType = useCallback((fieldKey: string, newType: FormFieldType) => {
    const currentFields = fieldsRef.current;
    const updates: Partial<FormField> = { field_type: newType };
    
    if (newType === "SELECT" || newType === "MULTISELECT") {
      const field = currentFields.find((f: FormField) => f.field_key === fieldKey);
      if (!field?.options || field.options.length === 0) {
        updates.options = ["Option 1", "Option 2", "Option 3"];
      }
    }
    
    if (newType !== "SELECT" && newType !== "MULTISELECT") {
      updates.options = undefined;
    }
    
    updateField(fieldKey, updates);
  }, [updateField]);

  // Section management functions
  const addSection = () => {
    if (!newSectionTitle.trim()) return;
    
    const newSection: FormSection = {
      section_id: `section_${Date.now()}`,
      section_title: newSectionTitle.trim(),
      section_description: newSectionDescription.trim() || undefined,
      order: sections.length,
    };
    
    setSections([...sections, newSection]);
    setNewSectionTitle("");
    setNewSectionDescription("");
    setIsAddSectionDialogOpen(false);
    setExpandedSections(prev => new Set([...prev, newSection.section_id]));
  };

  const updateSection = (sectionId: string, updates: Partial<FormSection>) => {
    setSections(
      sections.map((s) =>
        s.section_id === sectionId ? { ...s, ...updates } : s
      )
    );
  };

  const deleteSection = (sectionId: string) => {
    const section = sections.find(s => s.section_id === sectionId);
    const sectionFields = fields.filter(f => f.section_id === sectionId);
    
    // If section has fields, confirm deletion
    if (sectionFields.length > 0) {
      const confirmDelete = window.confirm(
        `Delete "${section?.section_title || 'Section'}" and its ${sectionFields.length} field(s)?\n\nThis action cannot be undone.`
      );
      if (!confirmDelete) return;
    }
    
    // Delete all fields in this section
    const updatedFields = fields.filter(f => f.section_id !== sectionId);
    onChange(updatedFields);
    
    // Remove the section
    setSections(sections.filter((s) => s.section_id !== sectionId));
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
  };

  const assignFieldToSection = (fieldKey: string, sectionId: string | undefined) => {
    const currentFields = fieldsRef.current;
    
    // Calculate the new order based on the target section's fields
    const targetSectionFields = sectionId 
      ? currentFields.filter(f => f.section_id === sectionId)
      : currentFields.filter(f => !f.section_id);
    const maxOrder = targetSectionFields.length > 0 
      ? Math.max(...targetSectionFields.map(f => f.order)) + 1 
      : 0;
    
    updateField(fieldKey, { section_id: sectionId, order: maxOrder });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Group fields by section
  const fieldsBySection = sections.reduce((acc, section) => {
    acc[section.section_id] = fields.filter(f => f.section_id === section.section_id);
    return acc;
  }, {} as Record<string, FormField[]>);
  
  const ungroupedFields = fields.filter(f => !f.section_id);
  
  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dragging a field
    const draggedField = fields.find(f => f.field_key === activeId);
    if (!draggedField) return;

    // Check if dropped on a section
    if (overId.startsWith('section-')) {
      const sectionId = overId.replace('section-', '');
      assignFieldToSection(activeId, sectionId);
      setExpandedSections(prev => new Set([...prev, sectionId]));
      return;
    }

    // Check if dropped on "ungrouped" zone
    if (overId === 'ungrouped-fields') {
      assignFieldToSection(activeId, undefined);
      return;
    }

    // Check if dropped on another field (reordering within same section)
    const targetField = fields.find(f => f.field_key === overId);
    if (targetField && draggedField.section_id === targetField.section_id) {
      // IMPORTANT: Sort fields by order before finding indices
      // This ensures we reorder based on visual position, not array position
      const sectionFields = fields
        .filter(f => f.section_id === draggedField.section_id)
        .sort((a, b) => a.order - b.order);
      
      const oldIndex = sectionFields.findIndex(f => f.field_key === activeId);
      const newIndex = sectionFields.findIndex(f => f.field_key === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sectionFields, oldIndex, newIndex);
        const updatedFields = fields.map(f => {
          if (f.section_id === draggedField.section_id) {
            const reorderedIndex = reordered.findIndex(rf => rf.field_key === f.field_key);
            return reorderedIndex !== -1 ? { ...f, order: reorderedIndex } : f;
          }
          return f;
        });
        onChange(updatedFields);
      }
    }
  };

  // Draggable field card component
  const DraggableFieldCard = ({ field, idx, isEditing, onEditChange, onDuplicate, onDelete, onUpdate, onChangeType, sections, onSectionChange, allFields, otherFormsFields, currentStepId }: {
    field: FormField;
    idx: number;
    isEditing: boolean;
    onEditChange: (open: boolean) => void;
    onDuplicate: (field: FormField) => void;
    onDelete: (fieldKey: string) => void;
    onUpdate: (updates: Partial<FormField>) => void;
    onChangeType: (newType: FormFieldType) => void;
    sections: FormSection[];
    onSectionChange: (sectionId: string | undefined) => void;
    allFields: FormField[];  // All fields for conditional rules
    otherFormsFields: OtherFormFields[];  // Fields from other forms
    currentStepId?: string;  // Current step ID for LOOKUP_USER_SELECT config
  }) => {
              const config = fieldTypeConfig[field.field_type];
              const TypeIcon = config?.icon || Type;
    
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: field.field_key });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
              
              return (
      <div ref={setNodeRef} style={style}>
                <Card 
                  className={`transition-all border hover:border-primary/30 ${
                    isEditing ? "ring-1 ring-primary/30 border-primary/30" : ""
          } ${isDragging ? "shadow-lg" : ""}`}
                >
          <Collapsible open={isEditing} onOpenChange={onEditChange}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                  <div 
                    {...attributes} 
                    {...listeners}
                    className="cursor-move text-muted-foreground hover:text-foreground touch-none"
                  >
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div className={`p-1.5 rounded-lg bg-gradient-to-br ${config?.gradient}`}>
                            <TypeIcon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {field.field_label}
                              </span>
                              {field.required && (
                                <Asterisk className="h-3 w-3 text-red-500" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {config?.label}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                        onDuplicate(field);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                        onDelete(field.field_key);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {isEditing ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4 border-t">
                        <FieldEditor
                          field={field}
                          allFields={allFields}
                          otherFormsFields={otherFormsFields}
                  onUpdate={onUpdate}
                  onChangeType={onChangeType}
                  sections={sections}
                  onSectionChange={onSectionChange}
                  currentStepId={currentStepId}
                        />
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
      </div>
    );
  };

  // Droppable section wrapper component
  const SectionDroppable = ({ sectionId, children }: { sectionId: string; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: `section-${sectionId}`,
    });

    return (
      <div
        ref={setNodeRef}
        className={isOver ? "bg-primary/10 border-2 border-dashed border-primary rounded-lg" : ""}
      >
        {children}
      </div>
    );
  };

  // Droppable ungrouped fields wrapper
  const UngroupedDroppable = ({ children }: { children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: "ungrouped-fields",
    });

    return (
      <div
        ref={setNodeRef}
        className={isOver ? "bg-muted border-2 border-dashed border-border rounded-lg" : ""}
      >
        {children}
      </div>
    );
  };

  // Memoized update handler for each field to prevent re-renders
  const getFieldUpdateHandler = useCallback((fieldKey: string) => {
    return (updates: Partial<FormField>) => {
      updateField(fieldKey, updates);
    };
  }, [updateField]);

  // Helper function to render a field card - memoized to prevent re-renders
  const renderFieldCard = useCallback((field: FormField, idx: number) => {
    return (
      <DraggableFieldCard
        key={field.field_key}
        field={field}
        idx={idx}
        isEditing={editingFieldKey === field.field_key}
        onEditChange={(open) => setEditingFieldKey(open ? field.field_key : null)}
        onDuplicate={duplicateField}
        onDelete={deleteField}
        onUpdate={getFieldUpdateHandler(field.field_key)}
        onChangeType={(newType) => changeFieldType(field.field_key, newType)}
        sections={sections}
        onSectionChange={(sectionId) => assignFieldToSection(field.field_key, sectionId)}
        allFields={fields}
        otherFormsFields={otherFormsFields}
        currentStepId={currentStepId}
      />
    );
  }, [editingFieldKey, duplicateField, deleteField, getFieldUpdateHandler, changeFieldType, sections, assignFieldToSection, fields, otherFormsFields, currentStepId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {fields.length} field{fields.length !== 1 ? "s" : ""}, {sections.length} section{sections.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isAddSectionDialogOpen} onOpenChange={setIsAddSectionDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2 rounded-lg">
                <FolderPlus className="h-3.5 w-3.5" />
                Add Section
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Section</DialogTitle>
                <DialogDescription>
                  Create a new section to organize your form fields
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Section Title</Label>
                  <Input
                    value={newSectionTitle}
                    onChange={(e) => setNewSectionTitle(e.target.value)}
                    placeholder="e.g., Personal Information"
                    className="h-9 rounded-lg"
                    onKeyDown={(e) => e.key === "Enter" && addSection()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={newSectionDescription}
                    onChange={(e) => setNewSectionDescription(e.target.value)}
                    placeholder="Brief description of this section..."
                    rows={2}
                    className="resize-none rounded-lg"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddSectionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addSection} disabled={!newSectionTitle.trim()}>
                  Add Section
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" />
                Add Field
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Form Field</DialogTitle>
                <DialogDescription>
                  Choose a field type to add
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 py-4">
                {Object.entries(fieldTypeConfig).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => addField(type as FormFieldType, targetSectionId || undefined)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 bg-muted/50 hover:bg-muted transition-all text-left group"
                    >
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${config.gradient} shadow-lg`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </button>
              );
            })}
        </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {fields.length === 0 && sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border bg-muted/30">
          <Type className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No fields or sections yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add a section or field to get started</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-4">
            {/* Render sections with their fields */}
            {sortedSections.map((section) => {
            const sectionFields = fieldsBySection[section.section_id] || [];
            const isExpanded = expandedSections.has(section.section_id);
            const isEditing = editingSectionId === section.section_id;
            
            return (
              <Card key={section.section_id} className="border-2 border-primary/20">
                <CardHeader className="p-3 overflow-hidden">
                  {/* Row 1: Section name and controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => toggleSection(section.section_id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <Input
                          value={editingSectionTitle}
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          className="h-7 text-sm font-medium"
                          onBlur={() => {
                            if (editingSectionTitle.trim()) {
                              updateSection(section.section_id, { section_title: editingSectionTitle.trim() });
                            }
                            setEditingSectionId(null);
                            setEditingSectionTitle("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editingSectionTitle.trim()) {
                                updateSection(section.section_id, { section_title: editingSectionTitle.trim() });
                              }
                              setEditingSectionId(null);
                              setEditingSectionTitle("");
                            }
                            if (e.key === "Escape") {
                              setEditingSectionId(null);
                              setEditingSectionTitle("");
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <h3 
                          className="font-medium text-sm cursor-pointer hover:text-primary truncate"
                          onClick={() => {
                            setEditingSectionId(section.section_id);
                            setEditingSectionTitle(section.section_title);
                          }}
                          title={section.section_title}
                        >
                          {section.section_title}
                        </h3>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {sectionFields.length}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => deleteSection(section.section_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  {/* Row 2: Section options */}
                  <div className="flex items-center gap-2 mt-2 pl-8">
                    {/* Repeating toggle */}
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${
                      section.is_repeating 
                        ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700" 
                        : "bg-muted/30 border-muted"
                    }`}>
                      <Switch
                        checked={section.is_repeating || false}
                        onCheckedChange={(checked) => updateSection(section.section_id, { 
                          is_repeating: checked,
                          min_rows: checked ? section.min_rows : undefined
                        })}
                        className="h-3.5 w-6"
                      />
                      <span className={section.is_repeating ? "text-orange-700 dark:text-orange-400 font-medium" : "text-muted-foreground"}>
                        Repeating
                      </span>
                    </div>
                    
                    {/* Min rows toggle - only when repeating */}
                    {section.is_repeating && (
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${
                        (section.min_rows || 0) >= 1
                          ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
                          : "bg-muted/30 border-muted"
                      }`}>
                        <Switch
                          checked={(section.min_rows || 0) >= 1}
                          onCheckedChange={(checked) => updateSection(section.section_id, { 
                            min_rows: checked ? 1 : 0 
                          })}
                          className="h-3.5 w-6"
                        />
                        <span className={(section.min_rows || 0) >= 1 ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}>
                          Min 1 row
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {section.section_description && (
                    <p className="text-xs text-muted-foreground mt-1 pl-8">
                      {section.section_description}
                    </p>
                  )}
                </CardHeader>
                {isExpanded && (
                  <SectionDroppable sectionId={section.section_id}>
                    <CardContent className="pt-0 pb-4 px-4 space-y-2">
                      {/* Add Field button inside section */}
                      <Dialog open={isAddDialogOpen && targetSectionId === section.section_id} onOpenChange={(open) => {
                        setIsAddDialogOpen(open);
                        if (!open) setTargetSectionId(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 border-dashed"
                            onClick={() => setTargetSectionId(section.section_id)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Field to Section
                          </Button>
                        </DialogTrigger>
                      </Dialog>
                      
                      {/* Droppable section content */}
                      <div className="min-h-[60px] rounded-lg">
                        {sectionFields.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
                            No fields in this section. Drag fields here or click "Add Field to Section" above.
                          </div>
                        ) : (
                          <SortableContext
                            items={[...sectionFields].sort((a, b) => a.order - b.order).map(f => f.field_key)}
                            strategy={verticalListSortingStrategy}
                          >
                            {[...sectionFields]
                              .sort((a, b) => a.order - b.order)
                              .map((field, idx) => renderFieldCard(field, idx))}
                          </SortableContext>
                        )}
                      </div>
                    </CardContent>
                  </SectionDroppable>
                )}
              </Card>
            );
          })}
          
          {/* Render ungrouped fields */}
          {ungroupedFields.length > 0 && (
            <div className="space-y-2">
              {sortedSections.length > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground font-medium">Ungrouped Fields</span>
                  <Separator className="flex-1" />
                </div>
              )}
              <UngroupedDroppable>
                <div className="min-h-[60px] rounded-lg">
                  <SortableContext
                    items={[...ungroupedFields].sort((a, b) => a.order - b.order).map(f => f.field_key)}
                    strategy={verticalListSortingStrategy}
                  >
                    {[...ungroupedFields]
                      .sort((a, b) => a.order - b.order)
                      .map((field, idx) => renderFieldCard(field, idx))}
                  </SortableContext>
                </div>
              </UngroupedDroppable>
            </div>
          )}
          </div>
          <DragOverlay>
            {activeId ? (
              <div className="opacity-50">
                {(() => {
                  const field = fields.find(f => f.field_key === activeId);
                  if (!field) return null;
                  const config = fieldTypeConfig[field.field_type];
                  const TypeIcon = config?.icon || Type;
                  return (
                    <Card className="border-2 border-primary shadow-lg">
                      <CardHeader className="p-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg bg-gradient-to-br ${config?.gradient}`}>
                            <TypeIcon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{field.field_label}</span>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })()}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

interface FieldEditorProps {
  field: FormField;
  allFields: FormField[];  // All fields in the form (for conditional rules)
  otherFormsFields?: OtherFormFields[];  // Fields from other forms
  onUpdate: (updates: Partial<FormField>) => void;
  onChangeType: (newType: FormFieldType) => void;
  sections?: FormSection[];
  onSectionChange?: (sectionId: string | undefined) => void;
  currentStepId?: string;  // Current step ID for LOOKUP_USER_SELECT config
}

const FieldEditor = memo(function FieldEditor({ field, allFields, otherFormsFields = [], onUpdate, onChangeType, sections = [], onSectionChange, currentStepId }: FieldEditorProps) {
  const [newOption, setNewOption] = useState("");
  // Local state for text inputs to prevent re-renders on every keystroke
  const [localFieldLabel, setLocalFieldLabel] = useState(field.field_label);
  const [localFieldKey, setLocalFieldKey] = useState(field.field_key);
  const [localPlaceholder, setLocalPlaceholder] = useState(field.placeholder || "");
  const [localHelpText, setLocalHelpText] = useState(field.help_text || "");
  const [localDefaultValue, setLocalDefaultValue] = useState(field.default_value || "");
  // Local state for options to prevent focus loss on typing
  const [localOptions, setLocalOptions] = useState<string[]>(field.options || []);
  // Local state for validation fields
  const [localMinLength, setLocalMinLength] = useState(field.validation?.min_length?.toString() || "");
  const [localMaxLength, setLocalMaxLength] = useState(field.validation?.max_length?.toString() || "");
  const [localRegexPattern, setLocalRegexPattern] = useState(field.validation?.regex_pattern || "");
  const [localMinValue, setLocalMinValue] = useState(field.validation?.min_value?.toString() || "");
  const [localMaxValue, setLocalMaxValue] = useState(field.validation?.max_value?.toString() || "");

  // Sync local state when field prop changes (from external updates)
  useEffect(() => {
    setLocalFieldLabel(field.field_label);
    setLocalFieldKey(field.field_key);
    setLocalPlaceholder(field.placeholder || "");
    setLocalHelpText(field.help_text || "");
    setLocalDefaultValue(field.default_value || "");
    setLocalMinLength(field.validation?.min_length?.toString() || "");
    setLocalMaxLength(field.validation?.max_length?.toString() || "");
    setLocalRegexPattern(field.validation?.regex_pattern || "");
    setLocalMinValue(field.validation?.min_value?.toString() || "");
    setLocalMaxValue(field.validation?.max_value?.toString() || "");
  }, [field.field_label, field.field_key, field.placeholder, field.help_text, field.default_value, field.validation]);

  // Sync options separately to avoid overwriting during typing
  useEffect(() => {
    // Only sync if the arrays are actually different (external change)
    const currentOptionsStr = JSON.stringify(localOptions);
    const fieldOptionsStr = JSON.stringify(field.options || []);
    if (currentOptionsStr !== fieldOptionsStr) {
      // Check if this is an add/remove operation (length changed)
      if ((field.options?.length || 0) !== localOptions.length) {
        setLocalOptions(field.options || []);
      }
    }
  }, [field.options]);

  const addOption = () => {
    if (!newOption.trim()) return;
    const newOptions = [...localOptions, newOption.trim()];
    setLocalOptions(newOptions);
    onUpdate({ options: newOptions });
    setNewOption("");
  };

  const removeOption = (index: number) => {
    const newOptions = localOptions.filter((_, i) => i !== index);
    setLocalOptions(newOptions);
    onUpdate({ options: newOptions });
  };

  // Update local state only - don't trigger parent update
  const updateOptionLocal = (index: number, value: string) => {
    const newOptions = [...localOptions];
    newOptions[index] = value;
    setLocalOptions(newOptions);
  };

  // Commit option changes to parent on blur
  const commitOptionChange = (index: number) => {
    if (JSON.stringify(localOptions) !== JSON.stringify(field.options)) {
      onUpdate({ options: localOptions });
    }
  };

  return (
    <div className="space-y-5 pt-4">
      {/* Basic Settings */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Label</Label>
          <Input
            value={localFieldLabel}
            onChange={(e) => setLocalFieldLabel(e.target.value)}
            onBlur={() => {
              if (localFieldLabel !== field.field_label) {
                onUpdate({ field_label: localFieldLabel });
              }
            }}
            placeholder="Field label"
            className="h-9 rounded-lg"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Field Type</Label>
          <Select
            value={field.field_type}
            onValueChange={(value) => onChangeType(value as FormFieldType)}
          >
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fieldTypeConfig).map(([type, config]) => (
                <SelectItem key={`type-${type}`} value={type}>
                  <div className="flex items-center gap-2">
                    <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                    {config.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Field Key</Label>
          <Input
            value={localFieldKey}
            onChange={(e) => {
              const newValue = e.target.value.replace(/\s/g, "_").toLowerCase();
              setLocalFieldKey(newValue);
            }}
            onBlur={() => {
              if (localFieldKey !== field.field_key) {
                onUpdate({ field_key: localFieldKey });
              }
            }}
            placeholder="field_key"
            className="font-mono text-sm h-9 rounded-lg"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Placeholder</Label>
          <Input
            value={localPlaceholder}
            onChange={(e) => setLocalPlaceholder(e.target.value)}
            onBlur={() => {
              if (localPlaceholder !== (field.placeholder || "")) {
                onUpdate({ placeholder: localPlaceholder });
              }
            }}
            placeholder="Placeholder text..."
            className="h-9 rounded-lg"
          />
        </div>
      </div>

      {/* Section Assignment */}
      {sections.length > 0 && onSectionChange && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Section</Label>
          <Select
            value={field.section_id || "__none__"}
            onValueChange={(value) => onSectionChange(value === "__none__" ? undefined : value)}
          >
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue placeholder="No section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No section (ungrouped)</SelectItem>
              {sections.map((section) => (
                <SelectItem key={section.section_id} value={section.section_id}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-3.5 w-3.5 text-primary" />
                    {section.section_title}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Help Text</Label>
        <Textarea
          value={localHelpText}
          onChange={(e) => setLocalHelpText(e.target.value)}
          onBlur={() => {
            if (localHelpText !== (field.help_text || "")) {
              onUpdate({ help_text: localHelpText });
            }
          }}
          placeholder="Additional instructions..."
          rows={2}
          className="resize-none rounded-lg"
        />
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
        <div>
          <Label className="text-sm">Required</Label>
          <p className="text-xs text-muted-foreground">User must fill this field</p>
        </div>
        <Switch
          checked={field.required}
          onCheckedChange={(checked) => onUpdate({ required: checked })}
        />
      </div>

      {/* Conditional Requirements */}
      <Collapsible className="border rounded-lg">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Conditional Requirements</span>
            {(field.conditional_requirements?.length || 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {field.conditional_requirements?.length} rule{(field.conditional_requirements?.length || 0) > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3">
          <ConditionalRulesBuilder
            field={field}
            allFields={allFields}
            allFormsFields={otherFormsFields}
            value={field.conditional_requirements || []}
            onChange={(rules) => onUpdate({ conditional_requirements: rules })}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Options for Select/MultiSelect */}
      {(field.field_type === "SELECT" || field.field_type === "MULTISELECT") && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Options</Label>
          <div className="space-y-2">
            {localOptions.map((option, index) => (
              <div key={`opt-${field.field_key}-${index}`} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={option}
                    onChange={(e) => updateOptionLocal(index, e.target.value)}
                    onBlur={() => commitOptionChange(index)}
                    className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-sm"
                    placeholder="Option value"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => removeOption(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Add new option..."
                className="h-9 rounded-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={addOption} className="shrink-0">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lookup Display Configuration */}
      {field.field_type === "LOOKUP_USER_SELECT" && (() => {
        // Combine current form's dropdown fields with other forms' fields
        const currentFormDropdowns = allFields
          .filter(f => (f.field_type === "SELECT" || f.field_type === "MULTISELECT") && f.field_key !== field.field_key);
        
        // Use actual step ID for current form, not "__current__"
        const currentFormStepId = currentStepId || "__current__";
        
        const allSourceOptions = [
          // Current form (if it has dropdowns)
          ...(currentFormDropdowns.length > 0 ? [{
            stepId: currentFormStepId,
            stepName: "Current Form",
            fields: currentFormDropdowns,
            isCurrentForm: true
          }] : []),
          // Other forms
          ...otherFormsFields
            .filter(f => f.fields.some(fld => fld.field_type === "SELECT" || fld.field_type === "MULTISELECT"))
            .map(f => ({ ...f, isCurrentForm: false }))
        ];
        
        const selectedSource = allSourceOptions.find(s => s.stepId === field.validation?.lookup_step_id);
        
        return (
          <div className="space-y-4 p-4 rounded-lg bg-violet-50/50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
              <Table2 className="h-4 w-4" />
              <span>Lookup Source Configuration</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure which dropdown field this lookup display should watch. When users select a value from that dropdown, 
              the assigned users from the linked lookup table will be shown here.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Source Form Step</Label>
                <Select
                  value={field.validation?.lookup_step_id || "__none__"}
                  onValueChange={(value) => {
                    const newStepId = value === "__none__" ? undefined : value;
                    onUpdate({
                      validation: {
                        ...field.validation,
                        lookup_step_id: newStepId,
                        lookup_field_key: undefined, // Reset field when step changes
                      },
                    });
                  }}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="Select form step..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No step selected</SelectItem>
                    {allSourceOptions.map((form) => (
                      <SelectItem key={form.stepId} value={form.stepId}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-3.5 w-3.5 text-primary" />
                          {form.stepName}
                          {form.isCurrentForm && (
                            <Badge variant="outline" className="text-[10px] py-0">This Form</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {field.validation?.lookup_step_id && selectedSource && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Source Dropdown Field</Label>
                  <Select
                    value={field.validation?.lookup_field_key || "__none__"}
                    onValueChange={(value) => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          lookup_field_key: value === "__none__" ? undefined : value,
                        },
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue placeholder="Select dropdown field..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No field selected</SelectItem>
                      {selectedSource.fields
                        .filter(f => f.field_type === "SELECT" || f.field_type === "MULTISELECT")
                        .map((dropdownField) => (
                          <SelectItem key={dropdownField.field_key} value={dropdownField.field_key}>
                            <div className="flex items-center gap-2">
                              <ListFilter className="h-3.5 w-3.5 text-primary" />
                              {dropdownField.field_label}
                            </div>
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {field.validation?.lookup_step_id && field.validation?.lookup_field_key && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                  <span>✓</span>
                  Configured! Make sure a lookup table is linked to this dropdown in the Lookups manager.
                </p>
              )}
              
              {!field.validation?.lookup_step_id && allSourceOptions.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                  ⚠️ No dropdown fields available. Add a Select or MultiSelect field first, then link it to a lookup table.
                </p>
              )}
              
              {!field.validation?.lookup_step_id && allSourceOptions.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                  ⚠️ Select a form step and dropdown field to enable lookup display functionality.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Validation Rules */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span>Validation Rules</span>
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(field.field_type === "TEXT" || field.field_type === "TEXTAREA") && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Min Length</Label>
                  <Input
                    type="number"
                    value={localMinLength}
                    onChange={(e) => setLocalMinLength(e.target.value)}
                    onBlur={() => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          min_length: localMinLength ? parseInt(localMinLength) : undefined,
                        },
                      });
                    }}
                    placeholder="0"
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Max Length</Label>
                  <Input
                    type="number"
                    value={localMaxLength}
                    onChange={(e) => setLocalMaxLength(e.target.value)}
                    onBlur={() => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          max_length: localMaxLength ? parseInt(localMaxLength) : undefined,
                        },
                      });
                    }}
                    placeholder="No limit"
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Regex Pattern</Label>
                  <Input
                    value={localRegexPattern}
                    onChange={(e) => setLocalRegexPattern(e.target.value)}
                    onBlur={() => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          regex_pattern: localRegexPattern || undefined,
                        },
                      });
                    }}
                    placeholder="^[a-zA-Z]+$"
                    className="font-mono text-sm h-9 rounded-lg"
                  />
                </div>
              </>
            )}
            {field.field_type === "NUMBER" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Min Value</Label>
                  <Input
                    type="number"
                    value={localMinValue}
                    onChange={(e) => setLocalMinValue(e.target.value)}
                    onBlur={() => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          min_value: localMinValue ? parseFloat(localMinValue) : undefined,
                        },
                      });
                    }}
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Max Value</Label>
                  <Input
                    type="number"
                    value={localMaxValue}
                    onChange={(e) => setLocalMaxValue(e.target.value)}
                    onBlur={() => {
                      onUpdate({
                        validation: {
                          ...field.validation,
                          max_value: localMaxValue ? parseFloat(localMaxValue) : undefined,
                        },
                      });
                    }}
                    className="h-9 rounded-lg"
                  />
                </div>
              </>
            )}
            {field.field_type === "DATE" && (
              <div className="sm:col-span-2 space-y-4">
                <Label className="text-xs text-muted-foreground font-medium">Allowed Date Range</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div 
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                      field.validation?.date_validation?.allow_past_dates !== false
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                        : "bg-muted/50 border-border hover:border-muted-foreground/50"
                    )}
                    onClick={() => {
                      const current = field.validation?.date_validation?.allow_past_dates !== false;
                      onUpdate({
                        validation: {
                          ...field.validation,
                          date_validation: {
                            ...field.validation?.date_validation,
                            allow_past_dates: !current,
                          },
                        },
                      });
                    }}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      field.validation?.date_validation?.allow_past_dates !== false
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    )}>
                      ←
                    </div>
                    <span className="text-xs font-medium text-center">Past Dates</span>
                    <Badge 
                      variant={field.validation?.date_validation?.allow_past_dates !== false ? "default" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      {field.validation?.date_validation?.allow_past_dates !== false ? "Allowed" : "Blocked"}
                    </Badge>
                  </div>
                  
                  <div 
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                      field.validation?.date_validation?.allow_today !== false
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                        : "bg-muted/50 border-border hover:border-muted-foreground/50"
                    )}
                    onClick={() => {
                      const current = field.validation?.date_validation?.allow_today !== false;
                      onUpdate({
                        validation: {
                          ...field.validation,
                          date_validation: {
                            ...field.validation?.date_validation,
                            allow_today: !current,
                          },
                        },
                      });
                    }}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      field.validation?.date_validation?.allow_today !== false
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    )}>
                      ●
                    </div>
                    <span className="text-xs font-medium text-center">Today</span>
                    <Badge 
                      variant={field.validation?.date_validation?.allow_today !== false ? "default" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      {field.validation?.date_validation?.allow_today !== false ? "Allowed" : "Blocked"}
                    </Badge>
                  </div>
                  
                  <div 
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                      field.validation?.date_validation?.allow_future_dates !== false
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                        : "bg-muted/50 border-border hover:border-muted-foreground/50"
                    )}
                    onClick={() => {
                      const current = field.validation?.date_validation?.allow_future_dates !== false;
                      onUpdate({
                        validation: {
                          ...field.validation,
                          date_validation: {
                            ...field.validation?.date_validation,
                            allow_future_dates: !current,
                          },
                        },
                      });
                    }}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      field.validation?.date_validation?.allow_future_dates !== false
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    )}>
                      →
                    </div>
                    <span className="text-xs font-medium text-center">Future Dates</span>
                    <Badge 
                      variant={field.validation?.date_validation?.allow_future_dates !== false ? "default" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      {field.validation?.date_validation?.allow_future_dates !== false ? "Allowed" : "Blocked"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to toggle which dates users can select. By default, all dates are allowed.
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Default Value */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Default Value</Label>
        {field.field_type === "CHECKBOX" ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
            <Switch
              checked={field.default_value === true}
              onCheckedChange={(checked) => onUpdate({ default_value: checked })}
            />
            <Label className="text-sm">Default checked</Label>
          </div>
        ) : field.field_type === "SELECT" && field.options && field.options.length > 0 ? (
          <Select
            value={field.default_value || "__none__"}
            onValueChange={(value) => onUpdate({ default_value: value === "__none__" ? undefined : value })}
          >
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue placeholder="No default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No default</SelectItem>
              {field.options
                .filter((option) => option && option.trim() !== "")
                .map((option, idx) => (
                  <SelectItem key={`default-val-${field.field_key}-${idx}`} value={option}>
                    {option}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={field.field_type === "NUMBER" ? "number" : field.field_type === "DATE" ? "date" : "text"}
            value={localDefaultValue}
            onChange={(e) => setLocalDefaultValue(e.target.value)}
            onBlur={() => {
              const newValue = localDefaultValue || undefined;
              if (newValue !== field.default_value) {
                onUpdate({ default_value: newValue });
              }
            }}
            placeholder="Default value..."
            className="h-9 rounded-lg"
          />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if field data actually changed
  // Ignore function references (onUpdate, onChangeType, onSectionChange) as they may change but shouldn't trigger re-render
  return (
    prevProps.field.field_key === nextProps.field.field_key &&
    prevProps.field.field_label === nextProps.field.field_label &&
    prevProps.field.field_type === nextProps.field.field_type &&
    prevProps.field.placeholder === nextProps.field.placeholder &&
    prevProps.field.help_text === nextProps.field.help_text &&
    prevProps.field.required === nextProps.field.required &&
    prevProps.field.default_value === nextProps.field.default_value &&
    JSON.stringify(prevProps.field.options) === JSON.stringify(nextProps.field.options) &&
    JSON.stringify(prevProps.field.validation) === JSON.stringify(nextProps.field.validation) &&
    JSON.stringify(prevProps.field.conditional_requirements) === JSON.stringify(nextProps.field.conditional_requirements) &&
    prevProps.field.section_id === nextProps.field.section_id &&
    JSON.stringify(prevProps.sections) === JSON.stringify(nextProps.sections) &&
    JSON.stringify(prevProps.allFields) === JSON.stringify(nextProps.allFields) &&
    JSON.stringify(prevProps.otherFormsFields) === JSON.stringify(nextProps.otherFormsFields)
  );
});

export default FormFieldBuilder;
