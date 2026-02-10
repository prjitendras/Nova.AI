"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ArrowRight, AlertTriangle, Loader2, Clock, Trash2, Ticket, XCircle, X, Sparkles, User, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// Types
interface RecentSearch {
  ticketId: string;
  title?: string;
  status?: string;
  requester?: string;
  searchedAt: number;
}

interface TicketPreview {
  ticket_id: string;
  title: string;
  status: string;
  workflow_name: string;
  requester?: { display_name?: string; email?: string };
}

// Constants
const STORAGE_KEY = "nova_global_search_v3";
const TICKET_REGEX = /^TKT-[a-zA-Z0-9]+$/i;

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-blue-500 text-white",
  COMPLETED: "bg-emerald-500 text-white",
  CANCELLED: "bg-slate-400 text-white",
  REJECTED: "bg-red-500 text-white",
  SKIPPED: "bg-amber-500 text-white",
  WAITING_FOR_REQUESTER: "bg-amber-500 text-white",
  ON_HOLD: "bg-orange-500 text-white",
  PENDING: "bg-slate-500 text-white",
};

const getStatusColor = (s: string) => STATUS_COLORS[s] || "bg-slate-400 text-white";
const formatStatus = (s: string) => s?.replace(/_/g, " ") || "Unknown";

// Time ago helper
const timeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

// Storage helpers
const loadHistory = (): RecentSearch[] => {
  if (typeof window === "undefined") return [];
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    if (!d) return [];
    const parsed = JSON.parse(d);
    return Array.isArray(parsed) ? parsed.filter((x: RecentSearch) => x?.ticketId).slice(0, 6) : [];
  } catch { 
    return []; 
  }
};

const saveHistory = (item: RecentSearch) => {
  if (!item?.ticketId) return;
  try {
    const list = loadHistory().filter(x => x.ticketId.toLowerCase() !== item.ticketId.toLowerCase());
    const newList = [item, ...list].slice(0, 6);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  } catch (e) {
    console.error("Failed to save search history", e);
  }
};

const clearHistoryStorage = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear history", e);
  }
};

// Format ticket ID - preserve original case
const formatTicketId = (input: string): string => {
  const q = input.trim();
  if (q.toUpperCase().startsWith("TKT-")) {
    return "TKT-" + q.slice(4);
  }
  if (/^[a-zA-Z0-9]{6,}$/.test(q)) {
    return `TKT-${q}`;
  }
  return q;
};

const isValidTicketId = (id: string) => TICKET_REGEX.test(id);

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ticket, setTicket] = React.useState<TicketPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<RecentSearch[]>([]);
  const [animateItems, setAnimateItems] = React.useState(false);

  // Computed values
  const ticketId = React.useMemo(() => formatTicketId(query), [query]);
  const isValidId = isValidTicketId(ticketId);

  // Load history & focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setHistory(loadHistory());
      setTimeout(() => inputRef.current?.focus(), 100);
      // Trigger staggered animation
      setTimeout(() => setAnimateItems(true), 150);
    } else {
      setAnimateItems(false);
    }
  }, [open]);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setQuery("");
        setTicket(null);
        setError(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Global keyboard shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Search for ticket
  React.useEffect(() => {
    if (!query.trim()) {
      setTicket(null);
      setError(null);
      return;
    }

    if (!isValidId) {
      setTicket(null);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    
    const searchTicket = async () => {
      setLoading(true);
      setError(null);
      setTicket(null);
      
      try {
        const res = await apiClient.get<any>(`/tickets/${ticketId}`);
        
        if (abortController.signal.aborted) return;
        
        const t = res.ticket || res;
        if (t && t.ticket_id) {
          setTicket({
            ticket_id: t.ticket_id,
            title: t.title || "Untitled",
            status: t.status || "UNKNOWN",
            workflow_name: t.workflow_name || "",
            requester: t.requester,
          });
        } else {
          setError("not_found");
        }
      } catch (e: any) {
        if (abortController.signal.aborted) return;
        
        const status = e?.status || e?.response?.status;
        if (status === 404) {
          setError("not_found");
        } else if (status === 403) {
          setError("forbidden");
        } else {
          setError("error");
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(searchTicket, 400);
    
    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [ticketId, isValidId, query]);

  // Navigate to ticket
  const goToTicket = React.useCallback((id: string, title?: string, status?: string, requester?: string) => {
    if (!id) return;
    
    saveHistory({ 
      ticketId: id, 
      title: title || "Unknown", 
      status: status || "UNKNOWN",
      requester: requester,
      searchedAt: Date.now() 
    });
    
    setOpen(false);
    router.push(`/tickets/${id}`);
  }, [router]);

  // Clear history
  const handleClearHistory = React.useCallback(() => {
    clearHistoryStorage();
    setHistory([]);
    toast.success("Search history cleared");
  }, []);

  // Handle selecting found ticket
  const handleSelectTicket = React.useCallback(() => {
    if (ticket) {
      goToTicket(ticket.ticket_id, ticket.title, ticket.status, ticket.requester?.display_name);
    }
  }, [ticket, goToTicket]);

  // Handle keyboard in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && ticket) {
      handleSelectTicket();
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      {/* ========== TRIGGER BUTTON ========== */}
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="relative h-10 justify-start gap-2 text-sm text-muted-foreground w-[160px] sm:w-[240px] lg:w-[300px] xl:w-[360px] bg-background hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 group"
      >
        <Search className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100 group-hover:text-primary transition-all" />
        <span className="flex-1 text-left truncate font-normal">Search tickets...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex group-hover:border-primary/30 transition-colors">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* ========== SEARCH DIALOG ========== */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          className="sm:max-w-[600px] md:max-w-[680px] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300"
          showCloseButton={false}
        >
          {/* ===== HEADER WITH BRANDING ===== */}
          <div className="relative overflow-hidden">
            {/* Animated Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-purple-500/10 to-pink-500/15 animate-gradient" />
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse-slow" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative px-6 pt-6 pb-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4 animate-in slide-in-from-left-2 duration-300">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-primary/30 animate-bounce-subtle">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      Global Search
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Find any ticket instantly by ID
                    </DialogDescription>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setOpen(false)}
                  className="h-9 w-9 rounded-xl hover:bg-background/80 hover:rotate-90 transition-all duration-300"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Search Input */}
              <div className="relative animate-in slide-in-from-bottom-2 duration-300 delay-100">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter ticket ID (e.g. TKT-17d437f75691)"
                  className="h-14 pl-12 pr-14 text-lg rounded-xl border-2 border-border/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary bg-background/80 backdrop-blur-sm shadow-inner transition-all duration-200"
                />
                {loading && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                {!loading && query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ===== CONTENT AREA WITH CUSTOM SCROLLBAR ===== */}
          <div className="min-h-[300px] max-h-[420px] overflow-y-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
            
            {/* Invalid Format Warning */}
            {!loading && query.length > 3 && !isValidId && (
              <div className="mx-2 my-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200">Invalid ticket format</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Example: <code className="font-mono font-bold bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded-md">TKT-17d437f75691</code>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 animate-in fade-in-0 duration-200">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                  <div className="absolute inset-0 h-16 w-16 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
                </div>
                <p className="text-muted-foreground mt-4 font-medium">Searching...</p>
                <p className="text-sm text-muted-foreground/70 font-mono">{ticketId}</p>
              </div>
            )}

            {/* Error: Not Found */}
            {!loading && error === "not_found" && (
              <div className="flex flex-col items-center py-14 text-center px-4 animate-in fade-in-0 zoom-in-95 duration-300">
                <div className="h-20 w-20 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-5 shadow-lg shadow-red-500/10">
                  <XCircle className="h-10 w-10 text-red-500" />
                </div>
                <p className="text-xl font-bold">Ticket Not Found</p>
                <p className="text-muted-foreground mt-2">
                  No ticket exists with ID
                </p>
                <code className="mt-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-950/50 font-mono font-semibold text-red-600 dark:text-red-400">
                  {ticketId}
                </code>
              </div>
            )}

            {/* Error: Forbidden */}
            {!loading && error === "forbidden" && (
              <div className="flex flex-col items-center py-14 text-center px-4 animate-in fade-in-0 zoom-in-95 duration-300">
                <div className="h-20 w-20 rounded-2xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/10">
                  <AlertTriangle className="h-10 w-10 text-amber-500" />
                </div>
                <p className="text-xl font-bold">Access Restricted</p>
                <p className="text-muted-foreground mt-2">You don't have permission to view this ticket</p>
              </div>
            )}

            {/* ===== TICKET FOUND ===== */}
            {!loading && !error && ticket && (
              <div className="mt-3 animate-in fade-in-0 slide-in-from-bottom-3 duration-300">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest px-3 mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ticket Found
                </p>
                <button
                  onClick={handleSelectTicket}
                  className="w-full p-5 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0 shadow-xl shadow-purple-500/25 group-hover:scale-105 transition-transform duration-300">
                      <Ticket className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-bold font-mono text-xl text-primary">{ticket.ticket_id}</span>
                        <span className={cn("px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide shadow-sm", getStatusColor(ticket.status))}>
                          {formatStatus(ticket.status)}
                        </span>
                      </div>
                      <p className="font-semibold text-lg text-foreground truncate">{ticket.title}</p>
                      {ticket.workflow_name && (
                        <p className="text-sm text-muted-foreground truncate mt-1">{ticket.workflow_name}</p>
                      )}
                      {ticket.requester?.display_name && (
                        <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-3 w-3" />
                          </div>
                          <span>Created by <span className="font-semibold text-foreground">{ticket.requester.display_name}</span></span>
                        </div>
                      )}
                    </div>
                    <div className="h-12 w-12 rounded-xl bg-primary/10 group-hover:bg-primary flex items-center justify-center transition-all duration-300 shrink-0">
                      <ExternalLink className="h-5 w-5 text-primary group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* ===== EMPTY STATE: HISTORY OR HELP ===== */}
            {!loading && !error && !ticket && !query && (
              <>
                {history.length > 0 ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between px-3 mb-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Recent Searches
                      </p>
                      <button 
                        onClick={handleClearHistory}
                        className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-destructive/10 transition-all duration-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear all
                      </button>
                    </div>
                    <div className="space-y-2">
                      {history.map((item, idx) => (
                        <button
                          key={`history-${item.ticketId}-${idx}`}
                          onClick={() => goToTicket(item.ticketId, item.title, item.status, item.requester)}
                          className={cn(
                            "w-full flex items-start gap-4 p-4 rounded-xl hover:bg-accent border border-transparent hover:border-border text-left transition-all duration-200 group",
                            animateItems && "animate-in fade-in-0 slide-in-from-left-2"
                          )}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:scale-105 transition-all duration-200">
                            <Ticket className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-sm group-hover:text-primary transition-colors">{item.ticketId}</span>
                              {item.status && (
                                <span className={cn("px-2 py-0.5 text-[9px] font-bold rounded-full uppercase", getStatusColor(item.status))}>
                                  {formatStatus(item.status)}
                                </span>
                              )}
                            </div>
                            {item.title && (
                              <p className="text-sm text-muted-foreground truncate">{item.title}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/70">
                              {item.requester && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.requester}
                                </span>
                              )}
                              {item.searchedAt && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {timeAgo(item.searchedAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 shrink-0 mt-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-14 text-center px-4 animate-in fade-in-0 zoom-in-95 duration-300">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-5 shadow-inner">
                      <Search className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <p className="text-xl font-bold">Search Any Ticket</p>
                    <p className="text-muted-foreground mt-2 max-w-xs">
                      Enter a ticket ID to instantly view its details across the entire system
                    </p>
                    <div className="mt-6 px-5 py-3 rounded-xl bg-muted/50 border-2 border-dashed border-muted-foreground/20">
                      <code className="font-mono text-base font-semibold text-muted-foreground">TKT-17d437f75691</code>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Typing valid ID hint */}
            {!loading && !error && !ticket && query && isValidId && (
              <div className="flex flex-col items-center py-14 text-center animate-in fade-in-0 zoom-in-95 duration-200">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-bounce-subtle">
                  <Search className="h-8 w-8 text-primary" />
                </div>
                <p className="text-muted-foreground mb-3">
                  Press <kbd className="mx-1 px-3 py-1.5 text-xs font-semibold bg-muted rounded-lg border shadow-sm">Enter</kbd> to search
                </p>
                <code className="text-2xl font-bold font-mono text-primary">{ticketId}</code>
              </div>
            )}
          </div>

          {/* ===== FOOTER ===== */}
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded-md border shadow-sm text-[10px] font-semibold">↵</kbd>
                <span className="font-medium">Select</span>
              </span>
              <span className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded-md border shadow-sm text-[10px] font-semibold">Esc</kbd>
                <span className="font-medium">Close</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
              <span className="font-bold tracking-wider">NOVA.ai Workflow</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== CUSTOM ANIMATIONS ===== */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
        /* Custom scrollbar */
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.2);
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.4);
        }
      `}</style>
    </>
  );
}
