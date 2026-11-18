/** Shows ⌘ on Apple devices and Ctrl elsewhere. */
export const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-[0.3rem] border border-line-strong bg-surface px-1.5 font-sans text-[0.6875rem] font-medium text-ink-subtle">{children}</kbd>;
}
