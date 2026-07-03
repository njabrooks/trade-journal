"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lane B judgment deep link (docs/v2/20 §B2): v1 is clipboard-copy of the runbook
 * command (e.g. `/thesis GLXY re-underwrite`), pasted into a Claude Code session —
 * not a custom URL scheme.
 */
export function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (non-secure context) — nothing sensible to do
    }
  }, [command]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      title="Copy command — paste into a Claude Code session"
      className="max-w-full"
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
      <code className="truncate font-mono text-xs">{command}</code>
    </Button>
  );
}
