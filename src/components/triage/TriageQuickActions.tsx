"use client";

import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface TriageQuickActionsProps {
  onToggle: () => void;
  isOpen: boolean;
}

export function TriageQuickActions({
  onToggle,
  isOpen,
}: TriageQuickActionsProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium",
        "hover:bg-slate-100 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
        isOpen && "bg-slate-100"
      )}
      title="Actions"
    >
      <MoreVertical className="h-4 w-4 text-slate-600" />
    </button>
  );
}

