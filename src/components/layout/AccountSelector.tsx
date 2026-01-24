"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Account } from "@/db/schema";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountId: string | null;
  basePath?: string;
  showAllOption?: boolean; // For strategies page - show "All Accounts" option
  label?: string;
}

export function AccountSelector({
  accounts,
  selectedAccountId,
  basePath = "/triage",
  showAllOption = false,
  label = "Account",
}: AccountSelectorProps) {
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

  const updateAccount = (accountId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (accountId) {
      params.set("accountId", accountId);
    } else {
      params.delete("accountId");
    }

    const query = params.toString();
    router.push(`${basePath}${query ? `?${query}` : ""}`, { scroll: false });
    setIsOpen(false);
  };

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)
    : null;

  const displayText = selectedAccount
    ? selectedAccount.label || selectedAccount.brokerAccountId
    : showAllOption
    ? "All Accounts"
    : "Select Account";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:ring-offset-background"
      >
        <span className="uppercase tracking-wide text-muted-foreground">{label}:</span>
        <span>{displayText}</span>
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
        <div className="absolute left-0 z-50 mt-2 w-64 rounded-lg border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="max-h-60 overflow-auto p-1">
            {showAllOption && (
              <button
                type="button"
                onClick={() => updateAccount(null)}
                className={cn(
                  "w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  !selectedAccountId && "bg-accent text-accent-foreground"
                )}
              >
                All Accounts
              </button>
            )}
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => updateAccount(account.id)}
                className={cn(
                  "w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  selectedAccountId === account.id && "bg-accent text-accent-foreground"
                )}
              >
                <div className="font-medium">
                  {account.label || account.brokerAccountId}
                </div>
                {account.label && (
                  <div className="text-xs text-muted-foreground">{account.brokerAccountId}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}






