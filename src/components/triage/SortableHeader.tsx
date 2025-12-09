"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps {
  column: string;
  children: React.ReactNode;
  className?: string;
}

export function SortableHeader({ column, children, className }: SortableHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const currentSort = searchParams.get("sort");
  const currentDirection = searchParams.get("direction") || "desc";
  
  const isActive = currentSort === column;
  const direction = isActive ? currentDirection : null;
  
  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (isActive && direction === "desc") {
      // Toggle to ascending
      params.set("sort", column);
      params.set("direction", "asc");
    } else if (isActive && direction === "asc") {
      // Remove sort (back to default)
      params.delete("sort");
      params.delete("direction");
    } else {
      // Set new sort (default to desc)
      params.set("sort", column);
      params.set("direction", "desc");
    }
    
    router.push(`?${params.toString()}`, { scroll: false });
  };
  
  const isCenterAligned = className?.includes("text-center");
  const isLeftAligned = className?.includes("text-left");
  
  return (
    <th 
      className={cn(
        "px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors",
        className
      )}
      onClick={handleSort}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        isCenterAligned ? "justify-center" : isLeftAligned ? "justify-start" : "justify-center"
      )}>
        <span>{children}</span>
        {direction === "asc" ? (
          <ArrowUp className="h-3 w-3 text-slate-500" />
        ) : direction === "desc" ? (
          <ArrowDown className="h-3 w-3 text-slate-500" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-50" />
        )}
      </div>
    </th>
  );
}

