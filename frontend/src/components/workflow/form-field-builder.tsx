"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  List,
  CheckSquare,
  Upload,
  Copy,
} from "lucide-react";

export interface FormFieldDefinition {
  field_key: string;
  field_label: string;
  field_type: string;
  required: boolean;
  placeholder?: string;
  default_value?: string;
  help_text?: string;
  options?: string[];
  validation?: {
    min_length?: number;
    max_length?: number;
    min_value?: number;
    max_value?: number;
    regex_pattern?: string;
  };
  order: number;
}

interface FormFieldBuilderProps {
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}

const FIELD_TYPES = [
  { value: "TEXT", label: "Text Input", icon: Type },
  { value: "TEXTAREA", label: "Text Area", icon: AlignLeft },
  { value: "NUMBER", label: "Number", icon: Hash },
  { value: "DATE", label: "Date Picker", icon: Calendar },
  { value: "SELECT", label: "Dropdown", icon: List },
  { value: "MULTISELECT", label: "Multi-select", icon: List },
  { value: "CHECKBOX", label: "Checkbox", icon: CheckSquare },
  { value: "FILE", label: "File Upload", icon: Upload },
];

function generateFieldKey(label: string, existingKeys: string[]): string {
  const baseKey = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  
  let key = baseKey || "field";
  let counter = 1;
  
  while (existingKeys.includes(key)) {
    key = `${baseKey}_${counter}`;
    counter++;
  }
  
  return key;
}

export function FormFieldBuilder({ fields, onChange }: FormFieldBuilderProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormFieldDefinition | null>(null);
  const [newField, setNewField] = useState<Partial<FormFieldDefinition>>({
    field_type: "TEXT",
    required: false,
    options: [],
  });
  const [optionInput, setOptionInput] = useState("");

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(fields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order
    const reorderedFields = items.map((field, index) => ({
      ...field,
      order: index,
    }));

    onChange(reorderedFields);
  };

  const addField = () => {
    if (!newField.field_label) return;

    const existingKeys = fields.map((f) => f.field_key);
    const field_key = generateFieldKey(newField.field_label, existingKeys);

    const field: FormFieldDefinition = {
      field_key,
      field_label: newField.field_label!,
      field_type: newField.field_type || "TEXT",
      required: newField.required || false,
      placeholder: newField.placeholder,
      default_value: newField.default_value,
      help_text: newField.help_text,
      options: newField.options,
      validation: newField.validation,
      order: fields.length,
    };

    onChange([...fields, field]);
    resetNewField();
    setIsAddDialogOpen(false);
  };

  const updateField = (fieldKey: string, updates: Partial<FormFieldDefinition>) => {
    const updatedFields = fields.map((field) =>
      field.field_key === fieldKey ? { ...field, ...updates } : field
    );
    onChange(updatedFields);
  };

  const deleteField = (fieldKey: string) => {
    const filteredFields = fields
      .filter((f) => f.field_key !== fieldKey)
      .map((f, index) => ({ ...f, order: index }));
    onChange(filteredFields);
  };

  const duplicateField = (field: FormFieldDefinition) => {
    const existingKeys = fields.map((f) => f.field_key);
    const newKey = generateFieldKey(field.field_label, existingKeys);

    const duplicatedField: FormFieldDefinition = {
      ...field,
      field_key: newKey,
      field_label: `${field.field_label} (Copy)`,
      order: fields.length,
    };

    onChange([...fields, duplicatedField]);
  };

  const resetNewField = () => {
    setNewField({
      field_type: "TEXT",
      required: false,
      options: [],
    });
    setOptionInput("");
    setEditingField(null);
  };

  const addOption = () => {
    if (!optionInput.trim()) return;
    setNewField({
      ...newField,
      options: [...(newField.options || []), optionInput.trim()],
    });
    setOptionInput("");
  };

  const removeOption = (index: number) => {
    setNewField({
      ...newField,
      options: (newField.options || []).filter((_, i) => i !== index),
    });
  };

  const needsOptions = (fieldType: string) =>
    ["SELECT", "MULTISELECT"].includes(fieldType);

  const getFieldIcon = (fieldType: string) => {
    const type = FIELD_TYPES.find((t) => t.value === fieldType);
    return type?.icon || Type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Form Fields</h3>
          <p className="text-sm text-muted-foreground">
            Configure the fields for this form step
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetNewField}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingField ? "Edit Field" : "Add Form Field"}
              </DialogTitle>
              <DialogDescription>
                Configure the field properties
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Field Type */}
              <div className="grid grid-cols-4 gap-2">
                {FIELD_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() =>
                        setNewField({ ...newField, field_type: type.value })
                      }
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                        newField.field_type === type.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs text-center">{type.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Basic Properties */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Field Label *</Label>
                  <Input
                    value={newField.field_label || ""}
                    onChange={(e) =>
                      setNewField({ ...newField, field_label: e.target.value })
                    }
                    placeholder="e.g., Full Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Placeholder</Label>
                  <Input
                    value={newField.placeholder || ""}
                    onChange={(e) =>
                      setNewField({ ...newField, placeholder: e.target.value })
                    }
                    placeholder="e.g., Enter your full name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Help Text</Label>
                <Input
                  value={newField.help_text || ""}
                  onChange={(e) =>
                    setNewField({ ...newField, help_text: e.target.value })
                  }
                  placeholder="Additional instructions for the user"
                />
              </div>

              <div className="space-y-2">
                <Label>Default Value</Label>
                <Input
                  value={newField.default_value || ""}
                  onChange={(e) =>
                    setNewField({ ...newField, default_value: e.target.value })
                  }
                  placeholder="Pre-filled value"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={newField.required || false}
                  onCheckedChange={(checked) =>
                    setNewField({ ...newField, required: checked })
                  }
                />
                <Label>Required field</Label>
              </div>

              {/* Options for Select/Multiselect */}
              {needsOptions(newField.field_type || "") && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  <div className="flex gap-2">
                    <Input
                      value={optionInput}
                      onChange={(e) => setOptionInput(e.target.value)}
                      placeholder="Add an option"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOption();
                        }
                      }}
                    />
                    <Button type="button" onClick={addOption} variant="outline">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newField.options || []).map((option, index) => (
                      <Badge key={index} variant="secondary">
                        {option}
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation (for text and number fields) */}
              {["TEXT", "TEXTAREA", "NUMBER"].includes(
                newField.field_type || ""
              ) && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="validation">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Validation Rules
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 sm:grid-cols-2 pt-4">
                        {["TEXT", "TEXTAREA"].includes(
                          newField.field_type || ""
                        ) && (
                          <>
                            <div className="space-y-2">
                              <Label>Min Length</Label>
                              <Input
                                type="number"
                                value={newField.validation?.min_length || ""}
                                onChange={(e) =>
                                  setNewField({
                                    ...newField,
                                    validation: {
                                      ...newField.validation,
                                      min_length: parseInt(e.target.value) || undefined,
                                    },
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Max Length</Label>
                              <Input
                                type="number"
                                value={newField.validation?.max_length || ""}
                                onChange={(e) =>
                                  setNewField({
                                    ...newField,
                                    validation: {
                                      ...newField.validation,
                                      max_length: parseInt(e.target.value) || undefined,
                                    },
                                  })
                                }
                                placeholder="255"
                              />
                            </div>
                          </>
                        )}
                        {newField.field_type === "NUMBER" && (
                          <>
                            <div className="space-y-2">
                              <Label>Min Value</Label>
                              <Input
                                type="number"
                                value={newField.validation?.min_value || ""}
                                onChange={(e) =>
                                  setNewField({
                                    ...newField,
                                    validation: {
                                      ...newField.validation,
                                      min_value: parseFloat(e.target.value) || undefined,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Max Value</Label>
                              <Input
                                type="number"
                                value={newField.validation?.max_value || ""}
                                onChange={(e) =>
                                  setNewField({
                                    ...newField,
                                    validation: {
                                      ...newField.validation,
                                      max_value: parseFloat(e.target.value) || undefined,
                                    },
                                  })
                                }
                              />
                            </div>
                          </>
                        )}
                        {["TEXT"].includes(newField.field_type || "") && (
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Regex Pattern</Label>
                            <Input
                              value={newField.validation?.regex_pattern || ""}
                              onChange={(e) =>
                                setNewField({
                                  ...newField,
                                  validation: {
                                    ...newField.validation,
                                    regex_pattern: e.target.value || undefined,
                                  },
                                })
                              }
                              placeholder="e.g., ^[A-Z0-9]+$ for alphanumeric"
                            />
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addField} disabled={!newField.field_label}>
                {editingField ? "Update Field" : "Add Field"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Fields List */}
      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Type className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No fields added yet. Click "Add Field" to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="fields">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {fields.map((field, index) => {
                  const FieldIcon = getFieldIcon(field.field_type);
                  return (
                    <Draggable
                      key={field.field_key}
                      draggableId={field.field_key}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`${
                            snapshot.isDragging ? "shadow-lg" : ""
                          }`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab hover:bg-muted p-1 rounded"
                              >
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <FieldIcon className="h-5 w-5 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {field.field_label}
                                  </span>
                                  {field.required && (
                                    <Badge variant="secondary" className="text-xs">
                                      Required
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {field.field_key} •{" "}
                                  {FIELD_TYPES.find(
                                    (t) => t.value === field.field_type
                                  )?.label || field.field_type}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => duplicateField(field)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingField(field);
                                    setNewField(field);
                                    setIsAddDialogOpen(true);
                                  }}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteField(field.field_key)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

