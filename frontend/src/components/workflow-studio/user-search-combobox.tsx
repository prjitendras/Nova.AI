/**
 * User Search Combobox Component
 * Searchable combobox for selecting EXL users by email
 * Supports two modes:
 * 1. String mode (default): value/onChange work with email strings
 * 2. Object mode: value/onChange work with full DirectoryUser objects
 */
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUserSearch, useUserByEmail } from "@/hooks/use-directory";
import type { DirectoryUser } from "@/hooks/use-directory";

// Simplified user object for external use
export interface SelectedUser {
  email: string;
  aad_id?: string;
  display_name?: string;
}

// String mode props (backward compatible)
interface UserSearchComboboxStringProps {
  value?: string;
  onChange: (email: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Object mode props (for reassignment feature)
interface UserSearchComboboxObjectProps {
  value?: SelectedUser | null;
  onChange: (user: SelectedUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

type UserSearchComboboxProps = UserSearchComboboxStringProps | UserSearchComboboxObjectProps;

// Type guard to determine which mode we're in
function isObjectMode(props: UserSearchComboboxProps): props is UserSearchComboboxObjectProps {
  // Check if value is an object (not a string)
  if (props.value === null) return true;
  if (props.value === undefined) {
    // Check onChange signature by looking at what it returns
    return false; // Default to string mode when value is undefined
  }
  return typeof props.value === 'object';
}

export function UserSearchCombobox(props: UserSearchComboboxProps) {
  const {
    placeholder = "Search for user by name or email...",
    disabled = false,
    className,
  } = props;
  
  const objectMode = isObjectMode(props);
  
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  
  // Get email from value (works for both modes)
  const emailValue = objectMode 
    ? (props.value as SelectedUser | null)?.email 
    : (props.value as string | undefined);

  // Search users when query changes
  const { data: searchResults, isLoading: isSearching } = useUserSearch(
    searchQuery,
    open && searchQuery.length >= 2
  );

  // Load user details if value is provided
  const { data: userData } = useUserByEmail(emailValue || "");

  useEffect(() => {
    if (emailValue && userData) {
      setSelectedUser(userData);
    } else if (!emailValue) {
      setSelectedUser(null);
    }
  }, [emailValue, userData]);
  
  // Also set from object value in object mode
  useEffect(() => {
    if (objectMode && props.value) {
      const objValue = props.value as SelectedUser;
      if (objValue && objValue.email) {
        setSelectedUser({
          email: objValue.email,
          display_name: objValue.display_name || objValue.email,
          aad_id: objValue.aad_id,
        });
      }
    }
  }, [objectMode, props.value]);

  const users = searchResults?.items || [];

  const handleSelect = (user: DirectoryUser) => {
    setSelectedUser(user);
    if (objectMode) {
      (props.onChange as (user: SelectedUser | null) => void)({
        email: user.email,
        aad_id: user.aad_id,
        display_name: user.display_name,
      });
    } else {
      (props.onChange as (email: string | undefined) => void)(user.email);
    }
    setOpen(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    setSelectedUser(null);
    if (objectMode) {
      (props.onChange as (user: SelectedUser | null) => void)(null);
    } else {
      (props.onChange as (email: string | undefined) => void)(undefined);
    }
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-9",
            !selectedUser && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedUser ? (
              <>
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {selectedUser.display_name} ({selectedUser.email})
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedUser && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleClear();
                }}
                className="h-4 w-4 rounded-full hover:bg-muted flex items-center justify-center cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    handleClear();
                  }
                }}
              >
                <span className="text-xs">×</span>
              </div>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or email..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isSearching && searchQuery.length >= 2 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : searchQuery.length < 2 ? (
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search
                </div>
              </CommandEmpty>
            ) : users.length === 0 ? (
              <CommandEmpty>No users found.</CommandEmpty>
            ) : (
              <CommandGroup heading="EXL Users">
                {users.map((user) => (
                  <CommandItem
                    key={user.email}
                    value={user.email}
                    onSelect={() => handleSelect(user)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedUser?.email === user.email
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {user.display_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {user.email}
                        {user.job_title && ` • ${user.job_title}`}
                        {user.department && ` • ${user.department}`}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


