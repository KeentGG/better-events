import { X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { addArea, useAreas } from "../../lib/areas";
import { teamFetch, TeamApiError } from "../../lib/team";
import { Alert, Button, Chip, Combobox, Field, Input, cn } from "../../ui";

// Times are entered and shown in Bacolod time (UTC+8, no daylight saving),
// whatever time zone the device is set to, so the team and the site always agree.
const MANILA_OFFSET_MS = 8 * 3_600_000;

/** `datetime-local` value for an ISO time or date, in Bacolod time. */
export function toLocalInput(value: string | Date) {
  return new Date(new Date(value).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/** ISO time from a `datetime-local` value in Bacolod time, or undefined when empty. */
export function fromLocalInput(value: string) {
  const ms = Date.parse(`${value}:00+08:00`);
  return value && !Number.isNaN(ms) ? new Date(ms).toISOString() : undefined;
}

/** The optional reference link every team entry can carry. */
export function LinkField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="Link to the source (optional)" hint="The post or page this came from. Readers can open it to check." error={error}>
      {(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder="https://facebook.com/…" value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function linkError(url: string) {
  return url.trim() && !URL.canParse(url.trim()) ? "Use the full link, starting with https://" : undefined;
}

/** Offers "Add …" for an area that isn't listed; `token` signs the new area in, like any desk entry. */
const createArea = (token: string) => async (name: string) => {
  try {
    return await addArea(token, name);
  } catch (err) {
    throw new Error(err instanceof TeamApiError ? err.message : "Couldn't add the area. Try again.");
  }
};

/** One area: search the list, or add one that isn't there. `optional` offers "No specific area". */
export function AreaSelect({
  label = "Area",
  token,
  value,
  onChange,
  optional,
  error,
}: {
  label?: string;
  token: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  error?: string;
}) {
  const areas = useAreas();
  return (
    <Field label={label} error={error}>
      {(p) => (
        <Combobox
          {...p}
          value={value}
          options={areas}
          onChange={onChange}
          onCreate={createArea(token)}
          emptyLabel={optional ? "No specific area" : undefined}
          placeholder={optional ? undefined : "Search or add an area"}
        />
      )}
    </Field>
  );
}

/** Several areas at once, e.g. every road a parade closes: the picked ones as chips, and a search to add more. */
export function AreaChips({ token, value, onChange, error }: { token: string; value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const areas = useAreas();
  return (
    <div className="space-y-2">
      <Field label="Roads or areas" error={error}>
        {(p) => (
          <Combobox
            {...p}
            value=""
            options={areas.filter((a) => !value.includes(a))}
            onChange={(a) => a && onChange([...value, a])}
            onCreate={createArea(token)}
            placeholder={value.length ? "Add another road or area" : "Search or add a road or area"}
          />
        )}
      </Field>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Picked roads and areas">
          {value.map((a) => (
            <li key={a}>
              <Chip active onClick={() => onChange(value.filter((v) => v !== a))} aria-label={`Remove ${a}`} icon={<X aria-hidden />}>
                {a}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TimeField({ label, hint, value, onChange, error }: { label: string; hint?: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} hint={hint ?? "Bacolod time."} error={error}>
      {(p) => <Input {...p} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/**
 * Form shell for team entries: runs `send`, shows server errors, and disables the button while sending.
 * `send` returns false when local validation failed, so nothing is sent. `bare` drops the card, for a
 * form that already sits in a panel (a slide-over on mission control).
 */
export function TeamForm({
  children,
  submitLabel,
  send,
  extra,
  bare,
}: {
  children: ReactNode;
  submitLabel: string;
  send: () => Promise<boolean | void>;
  extra?: ReactNode;
  bare?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailure(undefined);
    setSending(true);
    try {
      await send();
    } catch (err) {
      setFailure(err instanceof TeamApiError ? err.message : "Something went wrong. Nothing was saved; try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("space-y-4", !bare && "rounded-card border border-line bg-surface-raised p-4 shadow-card")} noValidate>
      {children}
      {failure && (
        <Alert tone="danger" title="Not saved">
          {failure}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" loading={sending} className="flex-1">
          {submitLabel}
        </Button>
        {extra}
      </div>
    </form>
  );
}

/** Loads a team list (events or places) and reloads it on demand. */
export function useTeamList<T>(path: string, token: string) {
  const [list, setList] = useState<T[]>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    teamFetch<T[]>(path, token)
      .then((rows) => {
        setList(rows);
        setError(undefined);
      })
      .catch((err) => setError(err instanceof TeamApiError ? err.message : "Couldn't load the list."));
  }, [path, token, version]);
  return { list, error, reload: () => setVersion((v) => v + 1) };
}
