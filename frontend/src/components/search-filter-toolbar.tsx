/**
 * Search and Filter Toolbar Component
 * Provides search input and filter options with debouncing
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, Filter, CalendarDays, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface SearchFilters {
  search: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: string;
  sortOrder: string;
}

interface SearchFilterToolbarProps {
  onFiltersChange: (filters: SearchFilters) => void;
  placeholder?: string;
  showDateFilter?: boolean;
  showSortOptions?: boolean;
  className?: string;
  totalResults?: number;
  isLoading?: boolean;
}

export function SearchFilterToolbar({
  onFiltersChange,
  placeholder = "Search tickets...",
  showDateFilter = true,
  showSortOptions = true,
  className,
  totalResults,
  isLoading,
}: SearchFilterToolbarProps) {
  const [searchInput, setSearchInput] = useState("");
  const [dateFromStr, setDateFromStr] = useState("");
  const [dateToStr, setDateToStr] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Convert string dates to Date objects
  const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
  const dateTo = dateToStr ? new Date(dateToStr + "T23:59:59") : undefined;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Notify parent when filters change
  useEffect(() => {
    onFiltersChange({
      search: debouncedSearch,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });
  }, [debouncedSearch, dateFromStr, dateToStr, sortBy, sortOrder, onFiltersChange]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
  }, []);

  const clearDateFilters = useCallback(() => {
    setDateFromStr("");
    setDateToStr("");
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setDateFromStr("");
    setDateToStr("");
    setSortBy("updated_at");
    setSortOrder("desc");
  }, []);

  const hasActiveFilters = searchInput || dateFromStr || dateToStr || sortBy !== "updated_at" || sortOrder !== "desc";
  const hasDateFilters = dateFromStr || dateToStr;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Date Filter */}
          {showDateFilter && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={hasDateFilters ? "secondary" : "outline"}
                  className="gap-2"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {hasDateFilters
                      ? `${dateFromStr ? format(new Date(dateFromStr), "MMM d") : "Start"} - ${dateToStr ? format(new Date(dateToStr), "MMM d") : "End"}`
                      : "Date Range"}
                  </span>
                  {hasDateFilters && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      1
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-4">
                  <div className="text-sm font-medium">Filter by creation date</div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
                      <Input
                        id="date-from"
                        type="date"
                        value={dateFromStr}
                        onChange={(e) => setDateFromStr(e.target.value)}
                        max={dateToStr || undefined}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
                      <Input
                        id="date-to"
                        type="date"
                        value={dateToStr}
                        onChange={(e) => setDateToStr(e.target.value)}
                        min={dateFromStr || undefined}
                        className="w-full"
                      />
                    </div>
                  </div>
                  {hasDateFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearDateFilters}
                      className="w-full"
                    >
                      Clear dates
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Sort Options */}
          {showSortOptions && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Sort</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-3">
                  <div className="text-sm font-medium">Sort by</div>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updated_at">Last Updated</SelectItem>
                      <SelectItem value="created_at">Created Date</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="text-sm font-medium">Order</div>
                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest First</SelectItem>
                      <SelectItem value="asc">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Clear All */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results indicator */}
      {(totalResults !== undefined || isLoading) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Searching...</span>
            </div>
          ) : (
            <>
              <Filter className="h-3 w-3" />
              <span>
                {totalResults === 0
                  ? "No results found"
                  : `${totalResults} result${totalResults !== 1 ? "s" : ""}`}
                {searchInput && ` for "${searchInput}"`}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
