import { Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { teamFetch, TeamApiError } from "../../lib/team";
import type { CommunitySubmission } from "../../lib/types";
import { Alert, CardSkeleton, EmptyState, SegmentedControl } from "../../ui";
import { SuggestionCard } from "./SuggestionCard";

type View = CommunitySubmission["status"];

/**
 * What visitors sent from the Contribute page, for the team to check. Approving one enters it on the desk
 * under your name, exactly as if you had filled in the form, so the desk's own rules apply and it can
 * still say no (an event that has since changed, say). Turning one down just files it.
 */
export function SuggestionsView({ token, staff, onCount }: { token: string; staff: boolean; onCount?: (pending: number) => void }) {
  const [view, setView] = useState<View>("pending");
  const [rows, setRows] = useState<CommunitySubmission[]>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(async () => {
    try {
      const list = await teamFetch<CommunitySubmission[]>(`/api/community/review?status=${view}`, token);
      setRows(list);
      if (view === "pending") onCount?.(list.length);
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Couldn't load suggestions.");
    }
  }, [view, token, onCount]);

  useEffect(() => {
    setRows(undefined);
    void load();
    // Visitors keep sending while this is open.
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Sent by visitors from the Contribute page. Check each against its source before approving: it goes up under your name, as if you had entered it yourself.
      </p>
      <SegmentedControl<View>
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: "pending", label: "Waiting" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Turned down" },
        ]}
      />
      {error && (
        <Alert tone="danger" title="That didn't go through">
          {error}
        </Alert>
      )}
      {done && <Alert tone="ok" title={done} />}
      {!rows ? (
        !error && <CardSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={view === "pending" ? "Nothing waiting" : "Nothing here yet"}>
          {view === "pending" ? "New suggestions from visitors show up here." : "Reviewed suggestions are kept here."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-line bg-surface-raised p-3.5 shadow-card">
              <SuggestionCard
                row={row}
                token={token}
                staff={staff}
                onReviewed={(line) => {
                  setError(undefined);
                  setDone(line);
                  void load();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
