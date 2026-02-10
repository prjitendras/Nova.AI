/**
 * Parallel Approvals Configuration Component
 * Configure multiple approvers with ALL/ANY rule
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  X,
  Users,
  User,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export type ParallelApprovalRule = "ALL" | "ANY";

interface ParallelApprovalsConfigProps {
  enabled: boolean;
  onEnableChange: (enabled: boolean) => void;
  rule: ParallelApprovalRule;
  onRuleChange: (rule: ParallelApprovalRule) => void;
  approvers: string[];
  onApproversChange: (approvers: string[]) => void;
}

export function ParallelApprovalsConfig({
  enabled,
  onEnableChange,
  rule,
  onRuleChange,
  approvers,
  onApproversChange,
}: ParallelApprovalsConfigProps) {
  const [newApprover, setNewApprover] = useState("");

  const addApprover = () => {
    if (!newApprover.trim()) return;
    if (approvers.includes(newApprover.toLowerCase().trim())) return;
    onApproversChange([...approvers, newApprover.toLowerCase().trim()]);
    setNewApprover("");
  };

  const removeApprover = (email: string) => {
    onApproversChange(approvers.filter((a) => a !== email));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="parallel-enabled" className="font-medium">
            Parallel Approvals
          </Label>
        </div>
        <Switch
          id="parallel-enabled"
          checked={enabled}
          onCheckedChange={onEnableChange}
        />
      </div>

      {enabled && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-4">
            {/* Rule Selection */}
            <div className="space-y-2">
              <Label>Approval Rule</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onRuleChange("ALL")}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    rule === "ALL"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    rule === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">All Must Approve</p>
                    <p className="text-xs text-muted-foreground">
                      Every approver must approve
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRuleChange("ANY")}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    rule === "ANY"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    rule === "ANY" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Any One Approves</p>
                    <p className="text-xs text-muted-foreground">
                      First approval is sufficient
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Approvers List */}
            <div className="space-y-2">
              <Label>Approvers</Label>
              <div className="space-y-2">
                {approvers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No approvers added yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {approvers.map((email) => (
                      <Badge
                        key={email}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        <User className="h-3 w-3" />
                        {email}
                        <button
                          onClick={() => removeApprover(email)}
                          className="ml-1 h-4 w-4 rounded-full hover:bg-muted flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Approver */}
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={newApprover}
                  onChange={(e) => setNewApprover(e.target.value)}
                  placeholder="approver@company.com"
                  onKeyDown={(e) => e.key === "Enter" && addApprover()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={addApprover}
                  disabled={!newApprover.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Validation Warning */}
            {approvers.length < 2 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm">
                  Add at least 2 approvers for parallel approval
                </p>
              </div>
            )}

            {/* Rule Explanation */}
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                {rule === "ALL" ? (
                  <>
                    <strong>All approvers</strong> ({approvers.length || 0}) must
                    approve before the workflow proceeds. If any approver rejects,
                    the request is rejected.
                  </>
                ) : (
                  <>
                    <strong>Any one</strong> of the {approvers.length || 0} approvers
                    can approve to proceed. The first approval advances the workflow.
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ParallelApprovalsConfig;

