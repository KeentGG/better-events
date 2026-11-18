import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { cn } from "./cn";

/**
 * A panel that slides in from the right over a dimmed page, like mission control's group panel.
 * Esc and the backdrop close it, the page behind does not scroll, and focus returns to whatever
 * opened it. The header holds an optional `icon`, the title with a `status` line under it, and a `badge`.
 */
export function SlideOver({
  icon,
  title,
  status,
  badge,
  footer,
  onClose,
  className,
  headerClassName,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  // Read through a ref so a new onClose each render doesn't re-run the effect, which would steal focus back to the panel.
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    // A field that used Escape itself (closing a combobox list) marks it handled, so the panel stays open.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-neutral-950/30" onClick={() => close.current()} />
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("relative flex h-full w-full max-w-[34rem] flex-col bg-surface-raised shadow-overlay outline-none", className)}
      >
        <header className={cn("flex items-center gap-3 border-b border-line px-5 py-4", headerClassName)}>
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate font-display text-title">
              {title}
            </h2>
            {status && <p className="text-sm opacity-80">{status}</p>}
          </div>
          {badge}
          <IconButton label="Close" icon={<X className="size-5" aria-hidden />} onClick={() => close.current()} />
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
