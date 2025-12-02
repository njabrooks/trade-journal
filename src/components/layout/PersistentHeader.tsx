"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function PersistentHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-7 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="h-6 w-6" />
      <h1 className="text-xs font-semibold">Trade Journal</h1>
    </header>
  );
}

