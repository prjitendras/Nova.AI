"use client";
// Component for displaying linked task output values in ticket details

import type { FormField, FormSection } from "@/lib/types";

interface LinkedTaskOutputDisplayProps {
  outputValues: Record<string, any>;
  outputFields: FormField[];
  sections: FormSection[];
}

export function LinkedTaskOutputDisplay({
  outputValues,
  outputFields,
  sections
}: LinkedTaskOutputDisplayProps) {
  const formatFieldValue = (value: any, fieldType: string): string => {
    if (value === undefined || value === null || value === "") {
      return "-";
    }
    
    if (fieldType === "FILE") {
      if (typeof value === "string") {
        return value.split("/").pop() || value;
      }
      return "-";
    }
    
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    
    if (Array.isArray(value)) {
      return value.join(", ") || "-";
    }
    
    if (fieldType === "DATE" && value) {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return String(value);
      }
    }
    
    if (fieldType === "USER_SELECT" && typeof value === "object" && value !== null) {
      return value.display_name || value.email || String(value);
    }
    
    return String(value);
  };
  
  // Check if this is a linked task
  const isLinkedTask = outputValues.__is_linked_task === true;
  const linkedRows = isLinkedTask ? (outputValues.linked_rows || []) : [];
  
  if (!isLinkedTask || linkedRows.length === 0) {
    return null;
  }
  
  return (
    <div className="mt-2 p-3 rounded-lg bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-medium text-green-600 dark:text-green-400">📋 Task Form Data</p>
        <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs font-medium">
          Linked Task • {linkedRows.length} items
        </span>
      </div>
      <div className="space-y-4">
        {linkedRows.map((row: Record<string, any>, rowIndex: number) => {
          const contextItems = Object.entries(row.__context || {}).map(([key, data]) => ({
            key,
            label: (data as { label: string; value: any }).label,
            value: (data as { label: string; value: any }).value
          }));
          
          return (
            <div 
              key={rowIndex} 
              className="p-3 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20"
            >
              {/* Row Header */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-purple-200 dark:border-purple-700">
                <div className="h-6 w-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                  {rowIndex + 1}
                </div>
                <span className="text-sm font-medium text-foreground">
                  Item {rowIndex + 1} of {linkedRows.length}
                </span>
              </div>
              
              {/* Context Information (Source Data) */}
              {contextItems.length > 0 && (
                <div className="mb-3 p-2 rounded bg-muted/50 border border-muted">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                    Source Data
                  </p>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {contextItems.map((item) => (
                      <div key={item.key} className="text-xs">
                        <span className="text-muted-foreground">{item.label}:</span>{" "}
                        <span className="font-medium">{String(item.value || "-")}</span>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              
              {/* Agent-filled Fields */}
              <div>
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">Agent Response</p>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {outputFields.map((field: FormField) => (
                    <div key={field.field_key} className="space-y-1">
                      <dt className="text-muted-foreground text-xs">{field.field_label}</dt>
                      <dd className="font-medium">
                        {formatFieldValue(row[field.field_key], field.field_type)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
