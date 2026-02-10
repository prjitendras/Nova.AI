/**
 * EXL Logo Component
 * Uses the official EXL logo
 */
"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface EXLLogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon";
}

export function EXLLogo({ className, size = "md", variant = "full" }: EXLLogoProps) {
  // Full logo sizes (aspect ratio ~3:1 for full, square for icon)
  const fullSizes = {
    xs: { width: 48, height: 16 },
    sm: { width: 60, height: 20 },
    md: { width: 78, height: 26 },
    lg: { width: 96, height: 32 },
    xl: { width: 120, height: 40 },
  };

  // Icon sizes - compact for sidebar use
  const iconSizes = {
    xs: { width: 30, height: 10 },
    sm: { width: 36, height: 12 },
    md: { width: 42, height: 14 },
    lg: { width: 54, height: 18 },
    xl: { width: 66, height: 22 },
  };

  if (variant === "icon") {
    const { width, height } = iconSizes[size];
    return (
      <Image
        src="/exl-logo.png"
        alt="EXL"
        width={width}
        height={height}
        className={cn("flex-shrink-0", className)}
        priority
        unoptimized
      />
    );
  }

  const { width, height } = fullSizes[size];

  return (
    <Image
      src="/exl-logo.png"
      alt="EXL"
      width={width}
      height={height}
      className={cn("flex-shrink-0", className)}
      priority
      unoptimized
    />
  );
}

export function EXLLogoWithTagline({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <EXLLogo size="lg" variant="full" />
      <span className="text-[10px] text-muted-foreground font-medium tracking-wider mt-1">
        ANALYTICS • AI • DIGITAL
      </span>
    </div>
  );
}

