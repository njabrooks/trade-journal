"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  paramKey: string;
  allParams: Record<string, string | string[]>;
  counts?: Record<string, number>;
  basePath?: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  paramKey,
  allParams,
  counts,
  basePath = "/triage",
}: MultiSelectFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option];

    updateParams(newSelected);
  };

  const clearAll = () => {
    updateParams([]);
  };

  const selectAll = () => {
    updateParams([...options]);
  };

  const updateParams = (newSelected: string[]) => {
    const params = new URLSearchParams();
    
    // Preserve other params
    Object.entries(allParams).forEach(([key, value]) => {
      if (key !== paramKey) {
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else if (value && value !== "all") {
          params.set(key, value);
        }
      }
    });

    // Add new selected values
    if (newSelected.length > 0) {
      newSelected.forEach((val) => params.append(paramKey, val));
    }

    const query = params.toString();
    router.push(`${basePath}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const displayText =
    selected.length === 0
      ? `All ${label}s`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:ring-offset-background"
      >
        <span className="uppercase tracking-wide text-muted-foreground">{label}:</span>
        <span>{displayText}</span>
        {selected.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
            {selected.length}
          </span>
        )}
        <svg
          className={cn("h-4 w-4 opacity-50 transition-transform", isOpen && "rotate-180")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="max-h-64 overflow-y-auto p-2">
            <div className="mb-2 flex gap-2 border-b border-border pb-2">
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Clear
              </button>
            </div>
            {options.map((option) => {
              const isSelected = selected.includes(option);
              const count = counts?.[option] ?? 0;
              return (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {isSelected && (
                      <svg
                        className="h-3 w-3"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <span className="flex-1 text-xs">{option}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {count}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

