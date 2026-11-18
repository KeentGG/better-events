import { Check, X } from "lucide-react";
import { useState } from "react";
import { crowdTooOld } from "../../lib/crowd";
import { teamFetch, TeamApiError } from "../../lib/team";
import { dayTime, timeAgo } from "../../lib/time";
import type { CommunitySubmission } from "../../lib/types";
import { Badge, Button, Field, Input } from "../../ui";
import { useAnnounce } from "./announce";
import { fromLocalInput, TimeField, toLocalInput } from "./fields";

const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A field of the suggestion as a person would read it. Times are shown in Bacolod time, as everywhere else. */
function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return isoTime.test(value) ? dayTime(value) : value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(show).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => (show(v) ? `${k} ${show(v)}` : ""))
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
}

/** camelCase field names as words: "pendingUntil" reads "pending until". */
const words = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

const what: Record<string, string> = { POST: "Adds", PUT: "Changes", DELETE: "Removes" };

/**
 * One visitor suggestion with everything needed to check it, and, while it waits, the review: where it
 * goes up (Feed, Pinned or, for staff, Banner, which visitors never pick) and approve or turn down.
 * Approving enters it on the desk under your name, so the desk's own rules apply and it can still say no.
 * `onReviewed` gets the line to show once it's done.
 */
export function SuggestionCard({ row, token, staff, onReviewed }: { row: CommunitySubmission; token: string; staff: boolean; onReviewed: (line: string) => void }) {
  const body = row.body && typeof row.body === "object" ? (row.body as Record<string, unknown>) : {};
  const fields = Object.entries(body).filter(([k, v]) => k !== "type" && show(v));
  // A crowd level is true for minutes, so the card says how stale it is and the server refuses to post an old one.
  const update = row.method === "POST" && row.path === "/updates";
  const crowd = update && body.type === "crowd";
  const tooOld = crowd && row.status === "pending" && crowdTooOld(new Date(row.createdAt), new Date());
  const link = typeof body.url === "string" ? body.url : undefined;
  const announceable = update && !crowd;

  const ann = useAnnounce(staff);
  const [until, setUntil] = useState(typeof body.endsAt === "string" ? toLocalInput(body.endsAt) : "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject">();
  const [error, setError] = useState<string>();

  async function review(verdict: "approve" | "reject") {
    let sent: object = {};
    if (verdict === "approve" && announceable && ann.loud) {
      const { until: missing, blocked } = ann.check(until);
      if (missing) return setError(missing);
      if (blocked) return setError("Confirm replacing the banner first.");
      sent = { tier: ann.tier, endsAt: fromLocalInput(until) };
    }
    if (verdict === "reject") sent = { reason: reason.trim() || undefined };
    setBusy(verdict);
    setError(undefined);
    try {
      await teamFetch(`/api/community/review/${row.id}/${verdict}`, token, { method: "POST", body: sent });
      onReviewed(verdict === "approve" ? `Entered on the desk: ${row.summary}` : `Turned down: ${row.summary}`);
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={row.method === "DELETE" ? "danger" : "neutral"}>{what[row.method] ?? row.method}</Badge>
        {crowd && <Badge tone={tooOld ? "danger" : "warn"}>{tooOld ? "Too old to post" : `Sent ${timeAgo(row.createdAt)}`}</Badge>}
        {row.fromSender > 1 && <Badge tone="warn">{row.fromSender} from this sender</Badge>}
        <p className="ml-auto text-xs text-ink-subtle">
          <time dateTime={row.createdAt}>{timeAgo(row.createdAt)}</time> · sender {row.sender}
        </p>
      </div>
      <div>
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-balance">{row.summary}</h3>
        {row.about && <p className="text-sm text-ink-muted">About: {row.about}</p>}
      </div>
      {fields.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line pt-2.5 text-sm">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{words(k)}</dt>
              <dd className="whitespace-pre-line">{show(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {link && URL.canParse(link) && /^https?:$/.test(new URL(link).protocol) && (
        <a href={link} target="_blank" rel="noreferrer nofollow" className="inline-block text-sm font-medium text-primary-ink underline-offset-2 hover:underline">
          Open the source they linked
        </a>
      )}
      {row.reason && (
        <p className="rounded-control bg-warn-soft px-2.5 py-2 text-sm text-warn-ink">
          {row.status === "pending" ? "The desk refused it last time: " : "Reason: "}
          {row.reason}
        </p>
      )}
      {row.status === "pending" ? (
        <div className="space-y-3 border-t border-line pt-3">
          {announceable && !rejecting && (
            <>
              {ann.field}
              {ann.loud && <TimeField label="Until" hint="Bacolod time. The pin or banner comes down on its own then." value={until} onChange={setUntil} />}
            </>
          )}
          {rejecting && (
            <Field label="Why (optional)" hint="Kept with the suggestion for the team.">
              {(p) => <Input {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
          {error && <p className="text-sm text-danger-ink">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {rejecting ? (
              <>
                <Button size="sm" variant="secondary" loading={busy === "reject"} icon={<X className="size-4" aria-hidden />} onClick={() => void review("reject")}>
                  Turn down
                </Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRejecting(false)}>
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" loading={busy === "approve"} icon={<Check className="size-4" aria-hidden />} onClick={() => void review("approve")}>
                  Approve and enter
                </Button>
                <Button size="sm" variant="secondary" disabled={!!busy} icon={<X className="size-4" aria-hidden />} onClick={() => setRejecting(true)}>
                  Turn down…
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">
          {row.status === "approved" ? "Approved" : "Turned down"} by {row.reviewedBy ?? "the team"}
          {row.reviewedAt && ` · ${timeAgo(row.reviewedAt)}`}
        </p>
      )}
    </div>
  );
}
