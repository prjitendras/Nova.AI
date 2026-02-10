"use client";

/**
 * NOVA AI Chatbot - Ultra Premium, Top-Notch UI/UX
 * 
 * Features:
 * - Draggable floating button
 * - Ultra-premium animations & effects
 * - EXL brand orange color in header
 * - Rich markdown rendering with beautiful styling
 * - Glassmorphism & gradient effects
 * - Persona-aware capabilities
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  X,
  Send,
  Sparkles,
  Loader2,
  Lightbulb,
  Minimize2,
  Maximize2,
  User,
  Trash2,
  Zap,
  Ticket,
  ClipboardList,
  CheckCircle2,
  Workflow,
  Shield,
  ChevronRight,
  Copy,
  Check,
  GripVertical,
  Brain,
  Cpu,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";


// Types
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// Persona configuration
const PERSONA_CONFIG: Record<string, {
  name: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  bgGradient: string;
  capabilities: string[];
  suggestions: string[];
}> = {
  requester: {
    name: "Requester",
    icon: <Ticket className="h-4 w-4" />,
    color: "text-blue-500",
    gradient: "from-blue-500 to-cyan-500",
    bgGradient: "from-blue-500/10 to-cyan-500/10",
    capabilities: [
      "View all your tickets & track status",
      "Get notes, messages & attachments",
      "Browse available services to request",
      "Check approval status & timeline",
      "Get your ticket statistics",
    ],
    suggestions: [
      "Show my open tickets",
      "What services can I request?",
      "Show notes for TKT-...",
    ],
  },
  agent: {
    name: "Agent",
    icon: <ClipboardList className="h-4 w-4" />,
    color: "text-green-500",
    gradient: "from-green-500 to-emerald-500",
    bgGradient: "from-green-500/10 to-emerald-500/10",
    capabilities: [
      "View tasks assigned to you",
      "Get workload & pending tasks",
      "View ticket details, notes & forms",
      "Track info requests & responses",
      "Monitor productivity metrics",
    ],
    suggestions: [
      "Show my pending tasks",
      "My workload summary",
      "Show details of TKT-...",
    ],
  },
  manager: {
    name: "Manager",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-amber-500",
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-500/10 to-orange-500/10",
    capabilities: [
      "View pending approvals for you",
      "Track approval history & decisions",
      "Get team performance statistics",
      "View ticket details & timelines",
      "Monitor info requests",
    ],
    suggestions: [
      "Show my pending approvals",
      "Team statistics",
      "My recent approval decisions",
    ],
  },
  designer: {
    name: "Designer",
    icon: <Workflow className="h-4 w-4" />,
    color: "text-purple-500",
    gradient: "from-purple-500 to-pink-500",
    bgGradient: "from-purple-500/10 to-pink-500/10",
    capabilities: [
      "View all workflows (draft/published)",
      "Get workflow usage statistics",
      "Query tickets using any workflow",
      "Access audit logs & system data",
      "View admin user list",
    ],
    suggestions: [
      "Show all published workflows",
      "Workflow usage statistics",
      "Show audit events",
    ],
  },
  admin: {
    name: "Admin",
    icon: <Shield className="h-4 w-4" />,
    color: "text-red-500",
    gradient: "from-red-500 to-rose-500",
    bgGradient: "from-red-500/10 to-rose-500/10",
    capabilities: [
      "Full system overview & health",
      "View all users & access levels",
      "Query any MongoDB collection",
      "Access complete audit trail",
      "All persona capabilities combined",
    ],
    suggestions: [
      "System overview",
      "Show all admin users",
      "Query tickets collection",
    ],
  },
};

// Premium Markdown renderer with beautiful styling
function renderMarkdownContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';
  let inTable = false;
  let tableRows: string[][] = [];
  
  lines.forEach((line, lineIdx) => {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${lineIdx}`} className="my-4 rounded-xl overflow-hidden border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-lg">
            {codeLanguage && (
              <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{codeLanguage}</span>
              </div>
            )}
            <pre className="p-4 text-sm overflow-x-auto font-mono text-slate-100 leading-relaxed">
              <code>{codeContent.join('\n')}</code>
            </pre>
          </div>
        );
        codeContent = [];
        codeLanguage = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      return;
    }
    
    if (inCodeBlock) {
      codeContent.push(line);
      return;
    }
    
    // Tables with premium styling - horizontal scroll for wide tables
    if (line.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      if (!line.includes('---')) {
        const cells = line.split('|').filter(c => c.trim());
        tableRows.push(cells.map(c => c.trim()));
      }
      return;
    } else if (inTable) {
      elements.push(
        <div 
          key={`table-${lineIdx}`} 
          className="my-4 rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 shadow-sm"
        >
          <div 
            className="table-scroll-container"
            style={{ 
              overflowX: 'auto', 
              overflowY: 'hidden',
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <table style={{ minWidth: '500px', width: '100%' }} className="text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/50">
                  {tableRows[0]?.map((cell, i) => (
                    <th key={i} className="py-3 px-4 text-left font-semibold text-foreground text-xs" style={{ whiteSpace: 'nowrap' }}>{cell.replace(/\*\*/g, '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="py-2.5 px-4 text-foreground/90 text-sm" style={{ whiteSpace: 'nowrap' }}>{cell.replace(/\*\*/g, '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-muted-foreground/50 text-center py-1 border-t border-border/30">
            ← Scroll to see more →
          </div>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
    
    // H2 Headers with gradient
    if (line.startsWith('## ')) {
      const headerText = line.replace(/^## /, '').replace(/\*\*/g, '');
      elements.push(
        <div key={lineIdx} className="flex items-start gap-3 mt-5 mb-3" style={{ maxWidth: '100%' }}>
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-primary via-purple-500 to-pink-500 shrink-0 mt-0.5" />
          <h2 className="text-base font-bold text-foreground flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>
            {headerText}
          </h2>
        </div>
      );
      return;
    }
    
    // H3 Headers
    if (line.startsWith('### ')) {
      const headerText = line.replace(/^### /, '').replace(/\*\*/g, '');
      elements.push(
        <div key={lineIdx} className="flex items-start gap-2 mt-4 mb-2" style={{ maxWidth: '100%' }}>
          <div className="h-5 w-0.5 rounded-full bg-primary/60 shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold text-foreground flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>
            {headerText}
          </h3>
        </div>
      );
      return;
    }
    
    // Numbered lists with premium styling
    if (line.match(/^[0-9]+\.\s/)) {
      const num = line.match(/^([0-9]+)\./)?.[1];
      const content = line.replace(/^[0-9]+\.\s/, '');
      elements.push(
        <div key={lineIdx} className="flex gap-3 my-2 ml-1 group" style={{ maxWidth: '100%' }}>
          <div className="shrink-0 h-6 w-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-bold text-primary group-hover:from-primary/30 group-hover:to-primary/20 transition-colors">
            {num}
          </div>
          <span className="text-foreground/90 leading-relaxed pt-0.5 flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>{formatInlineMarkdown(content)}</span>
        </div>
      );
      return;
    }
    
    // Bullet lists
    if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={lineIdx} className="flex gap-3 my-1.5 ml-1" style={{ maxWidth: '100%' }}>
          <div className="shrink-0 mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-purple-500" />
          <span className="text-foreground/90 leading-relaxed flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>{formatInlineMarkdown(line.replace(/^[-•]\s/, ''))}</span>
        </div>
      );
      return;
    }
    
    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={lineIdx} className="h-2" />);
      return;
    }
    
    // Regular paragraphs
    elements.push(
      <p key={lineIdx} className="my-1.5 text-foreground/90 leading-relaxed" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>
        {formatInlineMarkdown(line)}
      </p>
    );
  });
  
  // Handle unclosed code block
  if (inCodeBlock && codeContent.length > 0) {
    elements.push(
      <div key="final-code" className="my-4 rounded-xl overflow-hidden border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-lg">
        {codeLanguage && (
          <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{codeLanguage}</span>
          </div>
        )}
        <pre className="p-4 text-sm overflow-x-auto font-mono text-slate-100 leading-relaxed">
          <code>{codeContent.join('\n')}</code>
        </pre>
      </div>
    );
  }
  
  // Handle unclosed table
  if (inTable && tableRows.length > 0) {
    elements.push(
      <div 
        key="final-table" 
        className="my-4 rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 shadow-sm"
      >
        <div 
          className="table-scroll-container"
          style={{ 
            overflowX: 'auto', 
            overflowY: 'hidden',
            scrollbarWidth: 'thin',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <table style={{ minWidth: '500px', width: '100%' }} className="text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/50">
                {tableRows[0]?.map((cell, i) => (
                  <th key={i} className="py-3 px-4 text-left font-semibold text-xs" style={{ whiteSpace: 'nowrap' }}>{cell.replace(/\*\*/g, '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="py-2.5 px-4 text-sm" style={{ whiteSpace: 'nowrap' }}>{cell.replace(/\*\*/g, '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-muted-foreground/50 text-center py-1 border-t border-border/30">
          ← Scroll to see more →
        </div>
      </div>
    );
  }
  
  return <div className="prose-sm max-w-none">{elements}</div>;
}

function formatInlineMarkdown(text: string): React.ReactNode {
  // Bold with gradient effect
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  // Inline code with premium styling
  text = text.replace(/`([^`]+)`/g, '<code class="px-2 py-0.5 rounded-md bg-gradient-to-r from-primary/15 to-purple-500/15 text-primary text-xs font-mono font-medium border border-primary/20">$1</code>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">$1</a>');
  
  return <span dangerouslySetInnerHTML={{ __html: text }} />;
}

// Premium Typing indicator with brain animation
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="flex items-start gap-3"
    >
      <motion.div 
        className="relative h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-500/30"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <Brain className="h-5 w-5 text-white" />
        </motion.div>
        {/* Orbiting sparkle */}
        <motion.div
          className="absolute"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "center" }}
        >
          <motion.div 
            className="absolute -top-1 left-1/2"
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <Sparkles className="h-3 w-3 text-amber-300" />
          </motion.div>
        </motion.div>
      </motion.div>
      <div className="bg-gradient-to-br from-muted/80 to-muted/40 backdrop-blur-xl border border-border/50 rounded-2xl rounded-tl-md px-5 py-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
                animate={{ 
                  y: [0, -8, 0], 
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5] 
                }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-muted-foreground">NOVA is thinking...</span>
        </div>
      </div>
    </motion.div>
  );
}

// Premium Message bubble with glassmorphism
function ChatMessageBubble({ 
  message,
  onCopy,
}: { 
  message: ChatMessage;
  onCopy: (text: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Calculate available width for message content (panel width minus avatar and gaps)
  const maxContentWidth = 'calc(100% - 60px)';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="flex gap-3 group w-full"
      style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
    >
      {/* Avatar - fixed size */}
      <div className="shrink-0 mt-1" style={{ width: '44px' }}>
        {isUser ? (
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 flex items-center justify-center shadow-lg ring-2 ring-slate-500/20">
            <User className="h-5 w-5 text-white" />
          </div>
        ) : (
          <motion.div
            className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-500/30 ring-2 ring-purple-400/20"
            whileHover={{ scale: 1.05 }}
          >
            <Brain className="h-5 w-5 text-white" />
            <motion.div
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 border-2 border-background"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        )}
      </div>
      
      {/* Content - takes remaining space with overflow handling */}
      <div 
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
        style={{ 
          maxWidth: maxContentWidth,
          minWidth: 0,
          flex: '1 1 auto'
        }}
      >
        <span className="text-[11px] font-medium text-muted-foreground mb-1.5 px-1 flex items-center gap-1.5">
          {isUser ? (
            <>You</>
          ) : (
            <>
              <Sparkles className="h-3 w-3 text-primary" />
              NOVA AI
            </>
          )}
        </span>
        
        {/* Message bubble */}
        <div
          className={cn(
            "relative rounded-2xl px-5 py-4 shadow-lg w-full",
            isUser 
              ? "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white rounded-tr-md ring-1 ring-slate-600/50" 
              : "bg-gradient-to-br from-background via-muted/50 to-muted/30 backdrop-blur-xl border border-border/50 rounded-tl-md"
          )}
        >
          {/* Subtle gradient overlay for AI messages */}
          {!isUser && (
            <div className="absolute inset-0 rounded-2xl rounded-tl-md bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
          )}
          
          {isUser ? (
            <p 
              className="text-[14px] leading-relaxed whitespace-pre-wrap relative z-10"
              style={{ 
                wordBreak: 'break-word', 
                overflowWrap: 'break-word'
              }}
            >
              {message.content}
            </p>
          ) : (
            <div 
              className="text-[14px] leading-relaxed relative z-10 chatbot-message-content"
              style={{ 
                wordBreak: 'break-word', 
                overflowWrap: 'break-word'
              }}
            >
              {renderMarkdownContent(message.content)}
            </div>
          )}
          
          {!isUser && (
            <motion.button
              onClick={handleCopy}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute -bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all bg-background border border-border rounded-xl p-2 shadow-lg hover:shadow-xl hover:border-primary/50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
            </motion.button>
          )}
        </div>
        
        <span className="text-[10px] text-muted-foreground/60 mt-1.5 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// Premium Quick action chip
function QuickActionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 hover:from-primary/20 hover:via-purple-500/20 hover:to-pink-500/20 border border-primary/20 hover:border-primary/40 text-[13px] font-medium text-foreground transition-all shadow-sm hover:shadow-md group"
    >
      <Zap className="h-3.5 w-3.5 text-primary group-hover:text-primary" />
      <span>{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </motion.button>
  );
}

// Premium Welcome screen
function WelcomeScreen({ 
  persona, 
  userName,
  onSelectSuggestion 
}: { 
  persona: string;
  userName: string;
  onSelectSuggestion: (text: string) => void;
}) {
  const config = PERSONA_CONFIG[persona] || PERSONA_CONFIG.requester;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full px-1 py-1"
    >
      {/* Hero Section with animated background */}
      <div className="relative flex flex-col items-center text-center mb-6">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-0 left-1/4 w-32 h-32 bg-primary/20 rounded-full blur-3xl"
            animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.2, 1] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-0 right-1/4 w-40 h-40 bg-purple-500/15 rounded-full blur-3xl"
            animate={{ x: [0, -20, 0], y: [0, -30, 0], scale: [1.2, 1, 1.2] }}
            transition={{ duration: 10, repeat: Infinity }}
          />
        </div>
        
        <motion.div
          className="relative mb-5"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, delay: 0.1 }}
        >
          <motion.div
            className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-2xl"
            animate={{ 
              boxShadow: [
                "0 15px 50px rgba(139, 92, 246, 0.3)",
                "0 20px 60px rgba(139, 92, 246, 0.5)",
                "0 15px 50px rgba(139, 92, 246, 0.3)",
              ]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <Brain className="h-10 w-10 text-white" />
            </motion.div>
            
            {/* Orbiting particles */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute h-3 w-3"
                animate={{ rotate: 360 }}
                transition={{ duration: 3 + i, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "center" }}
              >
                <motion.div
                  className="absolute rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                  style={{ 
                    top: -20 - i * 5, 
                    left: "50%", 
                    width: 6 - i, 
                    height: 6 - i,
                    marginLeft: -(6 - i) / 2 
                  }}
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                />
              </motion.div>
            ))}
          </motion.div>
          
          <motion.div
            className="absolute -bottom-2 -right-2 h-8 w-8 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 border-4 border-background flex items-center justify-center shadow-lg"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="h-4 w-4 text-white" />
          </motion.div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
            Hi {userName.split(' ')[0]}! 👋
          </h2>
          <p className="text-foreground/80 text-sm">
            I'm <span className="text-primary font-semibold">NOVA</span>, your AI-powered assistant
          </p>
        </motion.div>
      </div>
      
      {/* Capabilities Card with gradient border */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative rounded-2xl p-[1px] mb-6 bg-gradient-to-br from-primary/50 via-purple-500/30 to-pink-500/50"
      >
        <div className={cn(
          "rounded-2xl p-5 bg-gradient-to-br from-background via-muted/30 to-background"
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn("p-2.5 rounded-xl bg-gradient-to-r shadow-lg", config.gradient)}>
              <span className="text-white">{config.icon}</span>
            </div>
            <div>
              <span className="font-bold text-foreground">{config.name} Mode</span>
              <p className="text-xs text-muted-foreground">Specialized assistance</p>
            </div>
          </div>
          <div className="space-y-2">
            {config.capabilities.slice(0, 4).map((cap, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + idx * 0.05 }}
                className="flex items-center gap-3 text-sm text-foreground/80 group"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-purple-500 group-hover:scale-150 transition-transform" />
                {cap}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
      
      {/* Suggestions with stagger animation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex-1"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">Try asking:</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {config.suggestions.map((suggestion, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + idx * 0.08 }}
            >
              <QuickActionChip
                label={suggestion}
                onClick={() => onSelectSuggestion(suggestion)}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>
      
      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-center mt-6 pt-4 border-t border-border/50"
      >
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Real-time access to your data
          <Sparkles className="h-3 w-3 text-primary" />
        </p>
      </motion.div>
    </motion.div>
  );
}

// Main Component
export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  
  const pathname = usePathname();
  const { user } = useAuth();
  
  // Determine current persona based on URL path
  const currentPersona = useMemo(() => {
    if (!pathname) return 'requester';
    
    const path = pathname.toLowerCase();
    
    // Admin routes - check for /admin prefix
    if (path.startsWith('/admin')) return 'admin';
    
    // Designer routes (studio is the workflow designer)
    if (path.startsWith('/studio') || path.startsWith('/designer') || path.startsWith('/workflows')) return 'designer';
    
    // Manager routes - check for /manager or /approvals
    if (path.startsWith('/manager') || path.startsWith('/approvals')) return 'manager';
    
    // Agent routes - check for /agent or /tasks
    if (path.startsWith('/agent') || path.startsWith('/tasks')) return 'agent';
    
    // Everything else is requester (dashboard, tickets, catalog, profile, etc.)
    return 'requester';
  }, [pathname]);
  
  const personaConfig = PERSONA_CONFIG[currentPersona] || PERSONA_CONFIG.requester;
  const userName = user?.display_name || "User";
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Load chat history from MongoDB on mount and persona change
  useEffect(() => {
    const loadHistory = async () => {
      if (!user?.email) return;
      
      setIsLoadingHistory(true);
      try {
        const response = await apiClient.get<{ messages: Array<{ role: string; content: string }> }>(
          `/ai-chat/history/${currentPersona}`
        );
        
        // Safely handle response with null checks
        const messages = response?.messages;
        if (messages && Array.isArray(messages) && messages.length > 0) {
          const loadedMessages: ChatMessage[] = messages
            .filter(msg => msg && msg.role && msg.content) // Filter out invalid messages
            .map((msg, idx) => ({
              id: `history-${idx}-${Date.now()}`,
              role: (msg.role === 'user' || msg.role === 'assistant') ? msg.role : 'assistant',
              content: msg.content || '',
              timestamp: new Date(),
            }));
          setMessages(loadedMessages);
        } else {
          setMessages([]); // Clear messages if no history
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
        setMessages([]); // Clear on error to avoid stale data
      } finally {
        setIsLoadingHistory(false);
      }
    };
    
    loadHistory();
  }, [currentPersona, user?.email]);
  
  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiClient.post<{ response: string; actions: unknown[] }>("/ai-chat/chat", {
        message,
        persona: currentPersona,
        conversation_history: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      });
      return response;  // apiClient.post already returns response.data
    },
    onSuccess: (data) => {
      // Safely handle response with null checks
      const responseText = data?.response || "I encountered an issue processing your request. Please try again.";
      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error: Error) => {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });
  
  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);
  
  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  
  // Send message
  const handleSend = useCallback(() => {
    const message = inputValue.trim();
    if (!message || chatMutation.isPending) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    chatMutation.mutate(message);
  }, [inputValue, chatMutation]);
  
  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  // Handle suggestion selection - sends message directly to avoid race condition
  const handleSelectSuggestion = useCallback((text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    chatMutation.mutate(text);
  }, [chatMutation]);
  
  // Clear chat
  const handleClearChat = async () => {
    try {
      await apiClient.post(`/ai-chat/clear-history/${currentPersona}`);
      setMessages([]);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  };
  
  // Copy to clipboard
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };
  
  return (
    <>
      {/* Drag constraints container */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-40" />
      
      {/* Fullscreen backdrop */}
      <AnimatePresence>
        {isFullScreen && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
            onClick={() => setIsFullScreen(false)}
          />
        )}
      </AnimatePresence>
      
      {/* Chat Panel - Wide and premium */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className={cn(
              isFullScreen
                ? "fixed inset-4 md:inset-8 z-50 rounded-3xl"
                : "fixed bottom-28 right-6 z-50 rounded-3xl",
              "bg-background/98 backdrop-blur-2xl border border-border/50 shadow-2xl overflow-hidden"
            )}
            style={{ 
              width: isFullScreen ? undefined : '640px',
              height: isFullScreen ? undefined : '750px',
              maxHeight: isFullScreen ? undefined : 'calc(100vh - 140px)',
              maxWidth: isFullScreen ? undefined : 'calc(100vw - 48px)'
            }}
          >
            {/* Inner wrapper */}
            <div className="flex flex-col h-full w-full">
            {/* Premium Header with EXL Orange */}
            <div className="relative overflow-hidden shrink-0">
              {/* Main gradient background with EXL Orange */}
              <div className="bg-gradient-to-br from-[#F26722] via-[#E85D1C] to-[#D14F12] p-5">
                {/* Animated background effects */}
                <div className="absolute inset-0 overflow-hidden">
                  <motion.div
                    className="absolute top-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"
                    animate={{ x: [0, 80, 0], y: [0, 50, 0] }}
                    transition={{ duration: 12, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute bottom-0 right-0 w-56 h-56 bg-white/5 rounded-full blur-3xl"
                    animate={{ x: [0, -50, 0], y: [0, -40, 0] }}
                    transition={{ duration: 10, repeat: Infinity }}
                  />
                  {/* Sparkle particles */}
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute h-1 w-1 bg-white/60 rounded-full"
                      style={{ left: `${20 + i * 15}%`, top: `${30 + (i % 3) * 20}%` }}
                      animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                    />
                  ))}
                </div>
                
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* EXL Logo in header */}
                    <motion.div
                      className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-xl"
                      whileHover={{ scale: 1.05, rotate: 2 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Image
                        src="/exl-logo.png"
                        alt="EXL"
                        width={48}
                        height={20}
                        unoptimized
                      />
                    </motion.div>
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        NOVA AI
                        <motion.span 
                          className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[10px] font-semibold tracking-wide"
                          animate={{ scale: [1, 1.02, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          AI POWERED
                        </motion.span>
                      </h2>
                      <p className="text-white/80 text-sm font-medium flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/10 backdrop-blur-sm">
                          {personaConfig.icon}
                          <span>{personaConfig.name}</span>
                        </span>
                        <span className="text-white/50">•</span>
                        <span>Assistant</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all"
                      onClick={handleClearChat}
                      title="Clear conversation"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all"
                      onClick={() => setIsFullScreen(!isFullScreen)}
                      title={isFullScreen ? "Exit full screen" : "Full screen"}
                    >
                      {isFullScreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all"
                      onClick={() => { setIsOpen(false); setIsFullScreen(false); }}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Decorative bottom wave */}
              <div className="absolute -bottom-px left-0 right-0 h-4 bg-gradient-to-b from-[#D14F12] to-transparent" />
            </div>
            
            {/* Messages Area - native scroll for better compatibility */}
            <div 
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--primary) / 0.3) transparent'
              }}
            >
              <div className="p-6">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="h-10 w-10 rounded-full border-3 border-primary/30 border-t-primary mb-4"
                    />
                    <p className="text-sm text-muted-foreground">Loading conversation...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <WelcomeScreen
                    persona={currentPersona}
                    userName={userName}
                    onSelectSuggestion={handleSelectSuggestion}
                  />
                ) : (
                  <div className="space-y-5">
                    {messages.map((msg) => (
                      <ChatMessageBubble
                        key={msg.id}
                        message={msg}
                        onCopy={handleCopy}
                      />
                    ))}
                    {chatMutation.isPending && <TypingIndicator />}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>
            
            {/* Quick suggestions when chat is active */}
            {messages.length > 0 && !chatMutation.isPending && (
              <div className="px-5 py-3 border-t border-border/50 bg-gradient-to-r from-muted/30 via-transparent to-muted/30 shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {personaConfig.suggestions.slice(0, 3).map((suggestion, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="shrink-0 text-xs px-4 py-2.5 rounded-xl bg-gradient-to-r from-muted/80 to-muted/60 hover:from-primary/10 hover:to-purple-500/10 text-muted-foreground hover:text-foreground transition-all border border-border/50 hover:border-primary/30"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Premium Input Area */}
            <div className="p-5 border-t border-border/50 bg-gradient-to-br from-muted/40 via-background to-muted/20 shrink-0">
              <div className="flex gap-4 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    rows={1}
                    className="w-full resize-none bg-background/80 backdrop-blur-sm border-2 border-border/50 hover:border-primary/30 focus:border-primary rounded-2xl px-5 py-4 pr-14 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground transition-all"
                    disabled={chatMutation.isPending}
                    style={{ minHeight: "56px", maxHeight: "120px" }}
                  />
                  <div className="absolute right-2 bottom-2">
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="icon"
                        disabled={!inputValue.trim() || chatMutation.isPending}
                        onClick={handleSend}
                        className={cn(
                          "h-10 w-10 rounded-xl transition-all",
                          inputValue.trim()
                            ? "bg-gradient-to-r from-[#F26722] to-[#E85D1C] hover:from-[#E85D1C] hover:to-[#D14F12] text-white shadow-lg shadow-orange-500/25"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {chatMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-center text-muted-foreground/60 mt-4">
                NOVA can make mistakes. Verify important information.
              </p>
            </div>
            </div>{/* Close inner wrapper */}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Ultra Premium Draggable Floating Button */}
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
        whileDrag={{ scale: 1.1, cursor: "grabbing" }}
        initial={{ scale: 0, x: 0, y: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15 }}
        className="fixed bottom-6 right-6 z-50 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div className="relative">
          {/* Outer glow rings */}
          {!isOpen && (
            <>
              <motion.div
                className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#F26722] to-[#E85D1C]"
                animate={{ 
                  scale: [1, 1.6, 1.6],
                  opacity: [0.6, 0, 0]
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#F26722]/60 to-[#E85D1C]/60"
                animate={{ 
                  scale: [1, 2, 2],
                  opacity: [0.4, 0, 0]
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
              />
            </>
          )}
          
          <motion.button
            onClick={() => !isDragging && setIsOpen(!isOpen)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative h-[72px] w-[72px] rounded-3xl shadow-2xl transition-all overflow-hidden",
              isOpen
                ? "bg-gradient-to-br from-slate-700 to-slate-900"
                : "bg-gradient-to-br from-[#F26722] via-[#E85D1C] to-[#D14F12] shadow-orange-500/40"
            )}
          >
            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/20 pointer-events-none" />
            
            {/* Inner glow */}
            <motion.div
              className="absolute inset-2 rounded-2xl bg-gradient-to-br from-white/20 to-transparent pointer-events-none"
              animate={!isOpen ? { opacity: [0.5, 0.8, 0.5] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.3, type: "spring" }}
                  className="relative z-10 flex items-center justify-center h-full"
                >
                  <X className="h-8 w-8 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  key="open"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.3, type: "spring" }}
                  className="relative z-10 flex items-center justify-center h-full"
                >
                  {/* Animated Bot/Brain icon */}
                  <motion.div
                    animate={{ 
                      y: [0, -3, 0],
                      rotateZ: [0, 3, -3, 0]
                    }}
                    transition={{ 
                      duration: 3, 
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Brain className="h-9 w-9 text-white drop-shadow-lg" />
                  </motion.div>
                  
                  {/* Floating sparkles */}
                  <motion.div
                    className="absolute top-3 right-3"
                    animate={{ 
                      scale: [0.8, 1.3, 0.8],
                      opacity: [0.5, 1, 0.5],
                      rotate: [0, 180, 360]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="h-3 w-3 text-yellow-200" />
                  </motion.div>
                  <motion.div
                    className="absolute bottom-4 left-3"
                    animate={{ 
                      scale: [1, 0.7, 1],
                      opacity: [0.3, 0.8, 0.3]
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
                  >
                    <Sparkles className="h-2.5 w-2.5 text-white/80" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
          
          {/* Online status indicator */}
          {!isOpen && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 border-[3px] border-background flex items-center justify-center shadow-lg shadow-green-500/30"
            >
              <motion.div
                className="h-2.5 w-2.5 rounded-full bg-white"
                animate={{ scale: [1, 0.7, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
          )}
          
          {/* Drag handle indicator */}
          {!isOpen && (
            <motion.div
              className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-3 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              whileHover={{ x: -2 }}
            >
              <GripVertical className="h-4 w-4 text-white/80" />
            </motion.div>
          )}
          
          {/* Tooltip */}
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 0 }}
              whileHover={{ opacity: 1, x: 0 }}
              className="absolute right-full mr-4 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap shadow-xl flex items-center gap-2">
                <Brain className="h-4 w-4 text-[#F26722]" />
                Ask NOVA AI
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1.5 w-2.5 h-2.5 bg-slate-900 rotate-45" />
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  );
}
