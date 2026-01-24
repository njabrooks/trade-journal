"use client";

import { useEffect, useRef, useState } from "react";
import { Account } from "@/db/schema";
import { cn } from "@/lib/utils";

interface AccountMultiSelectProps {
  accounts: Account[];
  selected: string[];
  onChange: (accountIds: string[]) => void;
  label?: string;
}

export function AccountMultiSelect({
  accounts,
  selected,
  onChange,
  label = "Accounts",
}: AccountMultiSelectProps) {
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

  const handleToggle = (accountId: string) => {
    if (selected.includes(accountId)) {
      onChange(selected.filter((id) => id !== accountId));
    } else {
      onChange([...selected, accountId]);
    }
  };

  const handleSelectAll = () => {
    onChange(accounts.map((a) => a.id));
  };

  const handleClear = () => {
    onChange([]);
  };

  const allSelected = selected.length === accounts.length && accounts.length > 0;
  const noneSelected = selected.length === 0;

  // Display text
  let displayText: string;
  if (allSelected) {
    displayText = "All Accounts";
  } else if (noneSelected) {
    displayText = "No Accounts";
  } else if (selected.length === 1) {
    const account = accounts.find((a) => a.id === selected[0]);
    displayText = account?.label || account?.brokerAccountId || "1 Account";
  } else {
    displayText = `${selected.length} Accounts`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Pill-shaped trigger for filter bar context */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-foreground",
          "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          isOpen && "ring-2 ring-ring ring-offset-2"
        )}
      >
        <span className="uppercase tracking-wide text-muted-foreground">{label}:</span>
        <span>{displayText}</span>
        <svg
          className={cn("h-4 w-4 opacity-50 transition-transform", isOpen && "rotate-180")}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 w-72 rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {/* Quick actions */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={allSelected}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select All
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={handleClear}
              disabled={noneSelected}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          {/* Account list with checkboxes */}
          <div className="max-h-60 overflow-y-auto p-1">
            {accounts.map((account) => {
              const isSelected = selected.includes(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleToggle(account.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm outline-none",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground"
                  )}
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
                  <div className="flex-1 text-left">
                    <div className="font-medium">
                      {account.label || account.brokerAccountId}
                    </div>
                    {account.label && (
                      <div className="text-xs text-muted-foreground">{account.brokerAccountId}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {selected.length} of {accounts.length} selected
          </div>
        </div>
      )}
    </div>
  );
}
