import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a date string as UTC
 * Handles dates both with and without timezone info
 */
export function parseUTCDate(dateString: string | Date | undefined | null): Date {
  if (!dateString) return new Date();
  if (dateString instanceof Date) return dateString;
  
  // If the date string doesn't have timezone info, treat it as UTC
  const str = dateString.toString();
  if (!str.includes('Z') && !str.includes('+') && !str.includes('-', 10)) {
    // No timezone indicator, assume UTC by appending Z
    return new Date(str.replace(' ', 'T') + 'Z');
  }
  
  return new Date(str);
}
