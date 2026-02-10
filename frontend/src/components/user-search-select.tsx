/**
 * User Search Select Component
 * Reusable AD user search with dropdown selection and debouncing
 * Uses Popover for proper rendering in dialogs
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { useUserSearch, type DirectoryUser } from "@/hooks/use-directory";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  Loader2,
  User,
  X,
} from "lucide-react";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

interface UserSearchSelectProps {
  value?: DirectoryUser | null;
  onChange: (user: DirectoryUser | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showManualEntry?: boolean;
  className?: string;
}

export function UserSearchSelect({
  value,
  onChange,
  label = "Search Employee",
  placeholder = "Search by name or email...",
  disabled = false,
  showManualEntry = true,
  className = "",
}: UserSearchSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Debounce search query by 300ms
  const debouncedQuery = useDebounce(inputValue, 300);

  const {
    data: searchResults,
    isLoading: isSearching,
    isFetching,
  } = useUserSearch(debouncedQuery, !disabled && !value && open);

  // Sync input with value
  useEffect(() => {
    if (value) {
      setInputValue(value.display_name);
    }
  }, [value]);

  const selectUser = (user: DirectoryUser) => {
    onChange(user);
    setInputValue(user.display_name);
    setOpen(false);
  };

  const clearSelection = () => {
    onChange(null);
    setInputValue("");
  };

  // Show up to 6 results with scrolling
  const users = (searchResults?.items || []).slice(0, 6);
  
  const showDropdown = open && inputValue.length >= 2 && !value;

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label>{label}</Label>}
      
      <Popover open={showDropdown} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setOpen(true);
                if (value && e.target.value !== value.display_name) {
                  onChange(null);
                }
              }}
              onFocus={() => setOpen(true)}
              className="pl-9 pr-9"
              autoComplete="off"
              disabled={disabled}
            />
            {(isSearching || isFetching) && inputValue.length >= 2 && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {value && !isFetching && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSelection();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </PopoverTrigger>
        
        <PopoverContent 
          className="p-0 w-[var(--radix-popover-trigger-width)] overflow-hidden" 
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={true}
          collisionPadding={20}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-[200px] overflow-y-auto overscroll-contain">
            {users.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {isFetching ? "Searching..." : "No users found"}
              </div>
            ) : (
              <div className="p-1">
                {users.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => selectUser(u)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-accent transition-colors text-left overflow-hidden"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center flex-shrink-0 text-blue-700 dark:text-blue-300 font-medium text-xs">
                      {u.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium truncate">
                        {u.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                      {u.department && (
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {u.department}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                {(searchResults?.items?.length || 0) > 6 && (
                  <p className="text-xs text-center text-muted-foreground py-2 border-t">
                    Type more to narrow results...
                  </p>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected User Display */}
      {value && (
        <div className="rounded-lg border p-3 bg-muted/30 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{value.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">{value.email}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection} className="shrink-0">
              Change
            </Button>
          </div>
          {(value.job_title || value.department) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {value.job_title && (
                <Badge variant="secondary" className="text-xs whitespace-normal break-words">
                  {value.job_title}
                </Badge>
              )}
              {value.department && (
                <Badge variant="outline" className="text-xs whitespace-normal break-words">
                  {value.department}
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Entry Fallback */}
      {showManualEntry && !value && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Can't find the user? Enter email manually
          </summary>
          <div className="mt-2">
            <Input
              type="email"
              placeholder="user@company.com"
              onChange={(e) => {
                const email = e.target.value;
                if (email.includes("@")) {
                  const displayName = email
                    .split("@")[0]
                    .replace(/\./g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase());
                  onChange({ email, display_name: displayName });
                  setOpen(false);
                }
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}

export default UserSearchSelect;
