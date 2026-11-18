import { KeyRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { teamFetch, TeamApiError } from "../../lib/team";
import type { ControlMe } from "../../lib/types";
import { Button, Card, Field, Input } from "../../ui";

/**
 * Asks for a token once and checks it with /api/control/me before saving it. Staff and team members
 * each have one token for every team page. Team pages are not linked from the public nav; the team
 * opens them from a shared link.
 */
export function TeamSignIn({ title, children, onToken }: { title: string; children: ReactNode; onToken: (token: string, me: ControlMe) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const token = value.trim();
    if (!token) return setError("Paste your token first.");
    setChecking(true);
    setError(undefined);
    try {
      onToken(token, await teamFetch<ControlMe>("/api/control/me", token));
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-control bg-primary-soft text-primary-ink">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-title">{title}</h1>
      </div>
      <p className="text-sm text-ink-muted">{children}</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your token" error={error} hint="Saved on this device only. You won't need to paste it again.">
          {(p) => <Input {...p} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <Button type="submit" block loading={checking}>
          Continue
        </Button>
      </form>
    </Card>
  );
}
