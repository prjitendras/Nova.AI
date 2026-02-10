"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseUTCDate } from "@/lib/utils";
import {
  FileEdit,
  Clock,
  Check,
  X,
  User,
  Calendar,
  ChevronRight,
  MessageSquare,
  ArrowRight,
  Loader2,
  Inbox,
  RefreshCw,
  ExternalLink,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

import {
  useMyPendingChangeRequests,
  useApproveChangeRequest,
  useRejectChangeRequest,
} from "@/hooks/use-change-requests";
import {
  CRReviewDialog,
  ChangeSummary,
  CRStatusBadge,
} from "@/components/change-request";
import type { ChangeRequest } from "@/lib/types";

export default function ChangeRequestAgentPage() {
  const [selectedCR, setSelectedCR] = useState<ChangeRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useMyPendingChangeRequests();
  const approveMutation = useApproveChangeRequest();
  const rejectMutation = useRejectChangeRequest();

  const pendingCRs = data?.items || [];
  const totalCount = data?.total || 0;

  const handleApprove = async (notes?: string) => {
    if (!selectedCR) return;

    try {
      await approveMutation.mutateAsync({ crId: selectedCR.change_request_id, notes });
      toast.success("Change request approved successfully");
      setReviewDialogOpen(false);
      setSelectedCR(null);
      refetch();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to approve change request";
      toast.error(message);
    }
  };

  const handleReject = async (notes?: string) => {
    if (!selectedCR) return;

    try {
      await rejectMutation.mutateAsync({ crId: selectedCR.change_request_id, notes });
      toast.success("Change request rejected");
      setReviewDialogOpen(false);
      setSelectedCR(null);
      refetch();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to reject change request";
      toast.error(message);
    }
  };

  const openReview = (cr: ChangeRequest) => {
    setSelectedCR(cr);
    setReviewDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileEdit className="h-6 w-6 text-primary" />
            Change Request Agent
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and approve change requests for tickets
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
                <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending CRs List */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-lg">Pending Change Requests</CardTitle>
          <CardDescription>
            Review form data change requests from requesters
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : pendingCRs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No Pending Change Requests</h3>
              <p className="text-muted-foreground mt-1">
                You don&apos;t have any change requests waiting for your review
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div className="space-y-4 pr-4">
                <AnimatePresence mode="popLayout">
                  {pendingCRs.map((cr, index) => (
                    <motion.div
                      key={cr.change_request_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <ChangeRequestCard cr={cr} onReview={() => openReview(cr)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      {selectedCR && (
        <CRReviewDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          changeRequest={selectedCR}
          onApprove={handleApprove}
          onReject={handleReject}
          isSubmitting={approveMutation.isPending || rejectMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Change Request Card Component
// ============================================================================

interface ChangeRequestCardProps {
  cr: ChangeRequest;
  onReview: () => void;
}

function ChangeRequestCard({ cr, onReview }: ChangeRequestCardProps) {
  const [expanded, setExpanded] = useState(false);

  const fieldChangeCount = cr.field_changes?.length || 0;
  const attachmentChangeCount = cr.attachment_changes?.length || 0;
  const totalChanges = fieldChangeCount + attachmentChangeCount;

  const timeSinceSubmit = getTimeSince(cr.requested_at);

  return (
    <Card className="hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs font-mono">
                {cr.change_request_id}
              </Badge>
              <CRStatusBadge status={cr.status} />
            </div>
            <h3 className="font-semibold text-lg">
              {cr.ticket_title || `Ticket ${cr.ticket_id}`}
            </h3>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-muted-foreground">
                {cr.workflow_name}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono flex items-center gap-1">
                  <Ticket className="h-3 w-3" />
                  {cr.ticket_id}
                </Badge>
                <Link 
                  href={`/tickets/${cr.ticket_id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  target="_blank"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Ticket
                </Link>
              </div>
            </div>
          </div>
          <Button onClick={onReview} className="flex items-center gap-2">
            Review
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Meta Info */}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {cr.requested_by.display_name}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {timeSinceSubmit}
          </div>
          <div className="flex items-center gap-1">
            <FileEdit className="h-4 w-4" />
            {totalChanges} change{totalChanges !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Reason */}
        <div className="mt-3 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
            <MessageSquare className="h-3 w-3" />
            Reason
          </div>
          <p className="text-sm">{cr.reason}</p>
        </div>

        {/* Expandable Changes Preview */}
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {expanded ? "Hide" : "Show"} Changes
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-3 rounded-lg border bg-card">
                  <ChangeSummary
                    fieldChanges={cr.field_changes || []}
                    attachmentChanges={cr.attachment_changes || []}
                    compact
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Utilities
// ============================================================================

function getTimeSince(dateString: string): string {
  const date = parseUTCDate(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}
