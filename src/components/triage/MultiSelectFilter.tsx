"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  paramKey: string;
  allParams: Record<string, string | string[]>;
  counts?: Record<string, number>;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  paramKey,
  allParams,
  counts,
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
    router.push(`/triage${query ? `?${query}` : ""}`, { scroll: false });
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
        className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <span className="uppercase tracking-wide text-slate-400">{label}:</span>
        <span>{displayText}</span>
        {selected.length > 0 && (
          <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            {selected.length}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto p-2">
            <div className="mb-2 flex gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(option)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="flex-1 text-xs text-slate-700">{option}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
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

