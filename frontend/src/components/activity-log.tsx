/**
 * Activity Log Component - Reusable chat-like interface for notes
 * 
 * Used in:
 * - Agent Tasks
 * - Manager Approvals
 * - Ticket Detail Page
 * 
 * NOTE: This is for NOTES ONLY. Attachments are handled separately via StepAttachments component.
 */
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  ChevronDown, 
  CheckCircle, 
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAddNote } from "@/hooks/use-tickets";
import { parseUTCDate } from "@/lib/utils";

export interface ActivityNote {
  content: string;
  actor: { display_name: string; email: string };
  timestamp: string;
}

interface OptimisticNote extends ActivityNote {
  isPending: boolean;
}

interface ActivityLogProps {
  ticketId: string;
  stepId: string;
  notes: ActivityNote[];
  /** Query key to invalidate on refresh - e.g., ['agent-tasks'] or ['manager-approvals'] */
  queryKey?: string[];
  /** Whether the user can add notes (default: true) */
  canAddNotes?: boolean;
  /** Custom title (default: "Activity Log") */
  title?: string;
  /** Initial expanded state (default: true) */
  defaultExpanded?: boolean;
}

export function ActivityLog({ 
  ticketId, 
  stepId, 
  notes, 
  queryKey = ['tickets'],
  canAddNotes = true,
  title = "Activity Log",
  defaultExpanded = true
}: ActivityLogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [newNote, setNewNote] = useState("");
  const [optimisticNotes, setOptimisticNotes] = useState<OptimisticNote[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const addNote = useAddNote();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Combine real notes with optimistic ones
  const allNotes = useMemo(() => {
    const combined = [...notes.map(n => ({ ...n, isPending: false })), ...optimisticNotes];
    return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [notes, optimisticNotes]);

  // Clear optimistic notes when real notes update
  useEffect(() => {
    if (optimisticNotes.length > 0) {
      setOptimisticNotes(prev => 
        prev.filter(opt => !notes.some(n => n.content === opt.content && n.actor?.email === opt.actor?.email))
      );
    }
  }, [notes, optimisticNotes.length]);

  // Auto-scroll to bottom when new notes are added
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allNotes.length, isExpanded]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSubmit = async () => {
    if (!newNote.trim() || !canAddNotes) return;
    
    const noteContent = newNote.trim();
    
    const optimisticNote: OptimisticNote = {
      content: noteContent,
      actor: { 
        display_name: user?.display_name || user?.email || "You", 
        email: user?.email || "" 
      },
      timestamp: new Date().toISOString(),
      isPending: true,
    };
    
    setOptimisticNotes(prev => [...prev, optimisticNote]);
    setNewNote("");
    
    try {
      await addNote.mutateAsync({
        ticketId,
        stepId,
        content: noteContent,
        attachmentIds: [], // Notes don't have attachments anymore
      });
    } catch {
      setOptimisticNotes(prev => prev.filter(n => n !== optimisticNote));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  };

  const getAvatarColor = (email: string) => {
    const colors = [
      'from-violet-500 to-purple-500',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-500',
      'from-orange-500 to-amber-500',
      'from-pink-500 to-rose-500',
      'from-indigo-500 to-blue-500',
    ];
    const index = email?.charCodeAt(0) % colors.length || 0;
    return colors[index];
  };

  const isOwnMessage = (email: string) => {
    return user?.email?.toLowerCase() === email?.toLowerCase();
  };

  return (
    <div className="pt-4 border-t border-dashed border-slate-200 dark:border-slate-700">
      {/* Premium Header with Glassmorphism */}
      <div className="w-full flex items-center justify-between text-left mb-3 p-3 -m-2 rounded-2xl hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 dark:hover:from-indigo-950/30 dark:hover:to-purple-950/30 transition-all duration-300">
        {/* Clickable area for expand/collapse */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            {allNotes.length > 0 && (
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">{allNotes.length > 9 ? '9+' : allNotes.length}</span>
              </div>
            )}
          </div>
          <div>
            <span className="text-sm font-bold text-foreground tracking-tight">{title}</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allNotes.length === 0 
                ? "Start the conversation" 
                : `${allNotes.length} ${allNotes.length === 1 ? 'message' : 'messages'}`}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {/* Refresh Button - Separate from expand button */}
          <button
            type="button"
            onClick={handleRefresh}
            className={`h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {/* Expand/Collapse indicator */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
              isExpanded 
                ? 'bg-indigo-100 dark:bg-indigo-900/40 rotate-180' 
                : 'bg-transparent hover:bg-muted/80'
            }`}
          >
            <ChevronDown className={`h-4 w-4 transition-colors ${isExpanded ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-3 animate-in slide-in-from-top-3 fade-in duration-300">
          {/* Notes Container - Chat Style */}
          <div 
            ref={scrollRef}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-b from-slate-50/80 to-white dark:from-slate-900/50 dark:to-slate-900/80 p-4 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600"
            style={{ scrollBehavior: 'smooth' }}
          >
            {allNotes.length === 0 ? (
              <div className="text-center py-10">
                <div className="relative mx-auto w-fit mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center">
                    <MessageSquare className="h-7 w-7 text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                    <span className="text-sm">💬</span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
                  Add notes to track progress and keep everyone in the loop
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {allNotes.map((note, idx) => {
                  const isOwn = isOwnMessage(note.actor?.email);
                  return (
                    <div
                      key={`${note.timestamp}-${idx}`}
                      className={`flex gap-3 animate-in slide-in-from-bottom-2 duration-300 ${
                        note.isPending ? 'opacity-70' : 'opacity-100'
                      } ${isOwn ? 'flex-row-reverse' : ''}`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      {/* Avatar */}
                      <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${getAvatarColor(note.actor?.email)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md ring-2 ring-white dark:ring-slate-900`}>
                        {getInitials(note.actor?.display_name)}
                      </div>
                      
                      {/* Message Bubble */}
                      <div className={`flex-1 min-w-0 max-w-[85%] ${isOwn ? 'text-right' : ''}`}>
                        <div className={`inline-block text-left px-4 py-2.5 shadow-sm ${
                          isOwn 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl rounded-tr-md' 
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-md'
                        }`}>
                          <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'justify-end' : ''}`}>
                            <span className={`font-semibold text-xs ${isOwn ? 'text-white/90' : 'text-foreground'}`}>
                              {isOwn ? 'You' : (note.actor?.display_name || "Unknown")}
                            </span>
                            <span className={`text-[10px] ${isOwn ? 'text-white/70' : 'text-muted-foreground'}`}>
                              {note.timestamp
                                ? formatDistanceToNow(parseUTCDate(note.timestamp), { addSuffix: true })
                                : "just now"}
                            </span>
                            {note.isPending && (
                              <span className="flex items-center gap-1 text-[10px] text-white/80">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              </span>
                            )}
                          </div>
                          <p className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                            isOwn ? 'text-white' : 'text-foreground/90'
                          }`}>
                            {note.content}
                          </p>
                        </div>
                        {/* Delivery status for own messages */}
                        {isOwn && !note.isPending && (
                          <div className="flex items-center justify-end gap-1 mt-1 mr-1">
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] text-muted-foreground">Sent</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input Area - Modern Design */}
          {canAddNotes && (
            <div className="relative space-y-2">
              {/* Main Input - Notes only, no attachments */}
              <div className="flex gap-2 items-end p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg shadow-slate-200/50 dark:shadow-none focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400 transition-all duration-200">
                <Textarea
                  placeholder="Type your note here..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="min-h-[40px] max-h-[100px] resize-none border-0 shadow-none focus-visible:ring-0 text-sm p-1 bg-transparent placeholder:text-muted-foreground/60"
                  disabled={addNote.isPending}
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!newNote.trim() || addNote.isPending}
                  className={`h-10 w-10 p-0 rounded-xl transition-all duration-300 ${
                    newNote.trim()
                      ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 shadow-lg shadow-indigo-500/40 scale-100 hover:scale-105' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {addNote.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2 px-2">
                <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-mono border border-slate-200 dark:border-slate-700">Enter</kbd>
                    <span>to send</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-mono border border-slate-200 dark:border-slate-700">Shift+Enter</kbd>
                    <span>new line</span>
                  </span>
                </p>
                {newNote.length > 0 && (
                  <span className={`text-[10px] font-medium transition-colors ${
                    newNote.length > 450 ? 'text-red-500' : newNote.length > 400 ? 'text-amber-500' : 'text-muted-foreground'
                  }`}>
                    {newNote.length}/500
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
