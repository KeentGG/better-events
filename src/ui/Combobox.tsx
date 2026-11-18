import { ChevronDown, Plus } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

type Option = { kind: "none" } | { kind: "value"; value: string } | { kind: "create"; value: string };

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * A text box that searches a list and picks one value, and can add a value that isn't there yet
 * (`onCreate`, which resolves to the value as stored). `emptyLabel` adds a first option that clears the
 * value. `aliases` are other names an option is found by, so typing "CR" offers Restroom instead of
 * adding it again. Typing filters; arrows move; Enter picks; Esc closes. Spread `Field`'s props on it like an input.
 */
export function Combobox({
  value,
  options,
  aliases,
  onChange,
  onCreate,
  emptyLabel,
  placeholder,
  createLabel = (q) => `Add “${q}”`,
  className,
  ...aria
}: {
  value: string;
  options: string[];
  aliases?: Record<string, readonly string[]>;
  onChange: (value: string) => void;
  onCreate?: (query: string) => Promise<string>;
  emptyLabel?: string;
  placeholder?: string;
  createLabel?: (query: string) => string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  const q = fold(query);
  const names = (o: string) => [o, ...(aliases?.[o] ?? [])].map(fold);
  // Whole names first, then names that start with the query, then any that contain it, so "cr" puts
  // Restroom (alias "CR") above First aid (alias "red cross").
  const rank = (o: string) => Math.min(...names(o).map((n) => (n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3)));
  const matches = options.filter((o) => rank(o) < 3).sort((a, b) => (q ? rank(a) - rank(b) : 0));
  const exact = options.some((o) => names(o).includes(q));
  const list: Option[] = [
    ...(emptyLabel && !q ? [{ kind: "none" } as const] : []),
    ...matches.map((value) => ({ kind: "value", value }) as const),
    // Two characters at least, so a stray keypress can't add a value.
    ...(onCreate && q.length >= 2 && !exact ? [{ kind: "create", value: query.trim().replace(/\s+/g, " ") } as const] : []),
  ];
  const optionId = (i: number) => `${listId}-${i}`;

  function show() {
    setQuery("");
    setActive(Math.max(0, list.findIndex((o) => o.kind === "value" && o.value === value)));
    setError(undefined);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  async function pick(option: Option | undefined) {
    if (!option) return;
    if (option.kind === "create") {
      if (!onCreate) return;
      setCreating(true);
      setError(undefined);
      try {
        onChange(await onCreate(option.value));
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add it. Try again.");
      } finally {
        setCreating(false);
      }
      return;
    }
    onChange(option.kind === "none" ? "" : option.value);
    close();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (list.length ? (i + step + list.length) % list.length : 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      void pick(list[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        ref={input}
        {...aria}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && list[active] ? optionId(active) : undefined}
        autoComplete="off"
        className="h-11 w-full rounded-control border border-line-strong bg-surface-raised pr-10 pl-3.5 text-base text-ink transition duration-150 outline-none placeholder:text-ink-muted focus:border-focus focus:ring-3 focus:ring-focus/25 aria-invalid:border-danger aria-invalid:ring-danger/20"
        placeholder={open ? "Type to search" : (placeholder ?? emptyLabel)}
        value={open ? query : value}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={close}
        onKeyDown={onKey}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
        {creating ? <Spinner /> : <ChevronDown className="size-4" aria-hidden />}
      </span>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-control border border-line bg-surface-raised py-1 shadow-overlay"
          // Keep focus in the box while clicking an option, so blur doesn't close the list first.
          onMouseDown={(e) => e.preventDefault()}
        >
          {list.map((o, i) => (
            <li
              key={o.kind === "none" ? "" : `${o.kind}:${o.value}`}
              id={optionId(i)}
              role="option"
              aria-selected={o.kind === "value" ? o.value === value : o.kind === "none" ? !value : false}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3.5 py-2 text-sm",
                i === active && "bg-surface-sunken",
                o.kind === "none" && "text-ink-muted",
                o.kind === "create" && "font-medium text-primary-ink",
                o.kind === "value" && o.value === value && "font-semibold",
              )}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(o)}
            >
              {o.kind === "create" && <Plus className="size-4 shrink-0" aria-hidden />}
              {o.kind === "none" ? emptyLabel : o.kind === "create" ? createLabel(o.value) : o.value}
            </li>
          ))}
          {!list.length && <li className="px-3.5 py-2 text-sm text-ink-subtle italic">No matches</li>}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-danger-ink">{error}</p>}
    </div>
  );
}
