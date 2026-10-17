import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/// Copies `text` to the clipboard and briefly confirms it.
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure context, permissions);
      // the text stays visible and selectable either way.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex shrink-0 items-center gap-xs rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-white/5 hover:text-primary"
    >
      <Icon name={copied ? "check" : "content_copy"} size={14} />
      {copied ? "Copied" : label}
    </button>
  );
}
