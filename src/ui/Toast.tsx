import { CheckCircle2, OctagonAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { cn } from "./cn";

export type ToastMessage = { tone: "ok" | "danger"; title: string; text?: string };

const tones = {
  ok: { icon: CheckCircle2, color: "text-ok" },
  danger: { icon: OctagonAlert, color: "text-danger" },
};

/**
 * A short note that floats over the page after an action, like "Published". Success notes leave on
 * their own after a few seconds (held while hovered or focused); errors stay until closed, so nobody
 * misses one. Sits above the bottom tabs on phones and in the bottom-right corner on wide screens.
 * Pass a new object to show a new note: it replaces the old one and restarts the timer.
 */
export function Toast({ toast, onClose }: { toast: ToastMessage | undefined; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!toast || toast.tone === "danger" || held) return;
    const timer = setTimeout(() => close.current(), 5000);
    return () => clearTimeout(timer);
  }, [toast, held]);

  if (!toast) return null;
  const { icon: Icon, color } = tones[toast.tone];
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6 lg:justify-end lg:px-6">
      <div
        role={toast.tone === "danger" ? "alert" : "status"}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-surface-raised py-2 pr-2 pl-3.5 shadow-overlay starting:translate-y-2 starting:opacity-0 transition duration-200 ease-out-quint motion-reduce:transition-none"
      >
        <Icon className={cn("mt-2.5 size-5 shrink-0", color)} aria-hidden />
        <div className="min-w-0 flex-1 py-2">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.text && <p className={cn("text-sm text-ink-muted", toast.tone === "ok" && "truncate")}>{toast.text}</p>}
        </div>
        <IconButton label="Close" size="sm" icon={<X className="size-4" aria-hidden />} onClick={() => close.current()} />
      </div>
    </div>,
    document.body,
  );
}
