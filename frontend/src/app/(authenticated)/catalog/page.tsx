/**
 * Catalog Page
 * Browse published workflows and create tickets
 * Enhanced AI-themed design
 */
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCatalog } from "@/hooks/use-workflows";
import { PageContainer } from "@/components/page-header";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { 
  Search, 
  ArrowRight, 
  Workflow, 
  Sparkles, 
  Zap, 
  FolderOpen,
  LayoutGrid,
  Bot,
  ChevronRight
} from "lucide-react";

// Category icon mapping
const categoryIcons: Record<string, typeof Workflow> = {
  IT: Zap,
  HR: FolderOpen,
  Finance: LayoutGrid,
  Enterprise: Sparkles,
  default: Workflow,
};

// Category color mapping
const categoryColors: Record<string, string> = {
  IT: "from-blue-500 to-cyan-500",
  HR: "from-emerald-500 to-teal-500",
  Finance: "from-amber-500 to-orange-500",
  Enterprise: "from-violet-500 to-purple-500",
  default: "from-primary to-primary/80",
};

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useCatalog({ q: searchQuery || undefined });

  // Extract unique categories
  const categories = useMemo(() => {
    if (!data?.items) return [];
    const cats = new Set(data.items.map(w => w.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [data?.items]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    if (!data?.items) return [];
    if (!selectedCategory) return data.items;
    return data.items.filter(w => w.category === selectedCategory);
  }, [data?.items, selectedCategory]);

  const getIcon = (category?: string) => {
    return categoryIcons[category || ""] || categoryIcons.default;
  };

  const getGradient = (category?: string) => {
    return categoryColors[category || ""] || categoryColors.default;
  };

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-violet-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Service Catalog</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              Browse intelligent workflows
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm rounded-lg bg-card/50 border-border/50"
          />
        </div>
        
        {/* Category Pills */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedCategory === null 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted/50 hover:bg-muted text-muted-foreground"
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedCategory === cat 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "bg-muted/50 hover:bg-muted text-muted-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Count */}
      {!isLoading && !error && data?.items.length ? (
        <p className="text-xs text-muted-foreground mb-3">
          Showing {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''}
          {selectedCategory && ` in ${selectedCategory}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      ) : null}

      {/* Catalog Grid */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-xl overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-2/3 mb-2" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message="Failed to load catalog"
          onRetry={() => refetch()}
        />
      ) : !filteredWorkflows.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-violet-500/20 blur-2xl rounded-full" />
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border/50">
              <Workflow className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-base font-semibold mb-1">
            {searchQuery || selectedCategory ? "No workflows found" : "No workflows available"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {searchQuery || selectedCategory 
              ? "Try adjusting your search or filter criteria" 
              : "Check back later for new workflow templates"}
          </p>
          {(searchQuery || selectedCategory) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => { setSearchQuery(""); setSelectedCategory(null); }}
              className="rounded-lg"
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredWorkflows.map((workflow, index) => {
            const Icon = getIcon(workflow.category);
            const gradient = getGradient(workflow.category);
            
            return (
              <Card
                key={workflow.workflow_id}
                className="group rounded-xl overflow-hidden border-0 shadow-sm hover:shadow-md transition-all duration-200 bg-card animate-fade-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <CardContent className="p-0">
                  {/* Top gradient bar */}
                  <div className={`h-1 bg-gradient-to-r ${gradient}`} />
                  
                  <div className="p-3">
                    {/* Header */}
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg bg-gradient-to-br ${gradient} shrink-0`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-xs leading-tight line-clamp-2 group-hover:text-primary transition-colors" title={workflow.name}>
                          {workflow.name}
                        </h3>
                        {workflow.category && (
                          <Badge variant="outline" className="mt-1 text-[8px] font-medium h-4 px-1">
                            {workflow.category}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <CardDescription className="line-clamp-2 min-h-[28px] mb-2 text-[10px]">
                      {workflow.description || (
                        <span className="italic text-muted-foreground/60">No description</span>
                      )}
                    </CardDescription>

                    {/* Tags */}
                    {workflow.tags && workflow.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {workflow.tags.slice(0, 2).map((tag) => (
                          <Badge 
                            key={tag} 
                            variant="secondary" 
                            className="text-[8px] px-1.5 py-0 bg-muted/50 h-4"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {workflow.tags.length > 2 && (
                          <Badge variant="secondary" className="text-[8px] px-1.5 py-0 bg-muted/50 h-4">
                            +{workflow.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* CTA Button */}
                    <Button 
                      asChild 
                      size="sm"
                      className={`w-full rounded-lg h-7 text-xs bg-gradient-to-r ${gradient} hover:opacity-90 text-white transition-all duration-200`}
                    >
                      <Link href={`/catalog/${workflow.workflow_id}/create`}>
                        <span>Create</span>
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Help */}
      {!isLoading && !error && filteredWorkflows.length > 0 && (
        <div className="mt-6 p-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold">Need help choosing?</h3>
              <p className="text-[10px] text-muted-foreground truncate">
                Browse by category or use search. Our AI routes requests automatically.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex h-7 text-xs shrink-0">
              <Link href="/tickets">
                My Requests
                <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
