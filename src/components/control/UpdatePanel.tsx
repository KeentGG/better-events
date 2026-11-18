import { useEffect, useState } from "react";
import { teamFetch, TeamApiError } from "../../lib/team";
import type { Category, ControlRole, TeamEvent, UpdateKey } from "../../lib/types";
import { Alert, Skeleton, SlideOver } from "../../ui";
import { LiveList } from "./LiveList";
import { UPDATE_SPECS } from "./updates";

/**
 * One update form from Update mode, opened at `#/control/<update>` with its option already picked
 * (docs/MISSION_CONTROL.md §2.1). It posts to the team desk under the signed-in person's name, then
 * closes and reports the headline through `onDone`. Below the form it lists what the tile has live, from
 * `categories`, so the volunteer sees what's already posted and can take it down.
 */
export function UpdatePanel({
  updateKey,
  categories,
  token,
  role,
  onDone,
  onClose,
  onOpen,
  onSignOut,
}: {
  updateKey: UpdateKey;
  /** The categories of the tile the update was opened from. */
  categories: Category[];
  token: string | undefined;
  role: ControlRole | undefined;
  onDone: (title: string) => void;
  onClose: () => void;
  /** Opens another update, e.g. adding an event from a form that needs one. */
  onOpen: (key: UpdateKey) => void;
  onSignOut: () => void;
}) {
  const spec = UPDATE_SPECS[updateKey];
  const [events, setEvents] = useState<TeamEvent[]>();
  const [error, setError] = useState<string>();
  // ADMIN_TOKEN names nobody, so the desk refuses its posts; without a token this is a preview.
  const canPost = Boolean(token) && (role === "staff" || role === "collector");

  useEffect(() => {
    if (!token || !canPost) return;
    teamFetch<TeamEvent[]>("/api/team/events", token)
      .then(setEvents)
      .catch((err) => {
        if (err instanceof TeamApiError && err.status === 401) return onSignOut();
        setError(err instanceof TeamApiError ? err.message : "Couldn't load the schedule.");
        setEvents([]);
      });
  }, [token, canPost]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SlideOver title={(spec.kind === "form" && spec.title) || spec.label} onClose={onClose}>
      {!token ? (
        <Alert tone="info" title="Preview">
          This is sample data. Sign in with your token to post updates.
        </Alert>
      ) : role === "admin" ? (
        <Alert tone="info" title="Sign in with your own token">
          Updates are posted under the name of whoever enters them, and the admin token names nobody. Use your staff token to post.
        </Alert>
      ) : !canPost ? (
        <Alert tone="warn" title="Can't reach the server">
          Nothing can be posted right now. Try again in a moment.
        </Alert>
      ) : spec.kind !== "form" ? (
        <Alert tone="info" title={spec.label}>
          This opens from the tile.
        </Alert>
      ) : (
        <>
          {error && (
            <Alert tone="danger" title="Something went wrong">
              {error}
            </Alert>
          )}
          {events === undefined && needsEvents(updateKey) ? (
            <div className="space-y-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            spec.render({ token, events, onDone, onCancel: onClose, onAddEvents: () => onOpen("schedule_add"), staff: role === "staff" })
          )}
          {categories.length > 0 && <LiveList token={token} categories={categories} moderator={role === "staff"} onSignOut={onSignOut} />}
        </>
      )}
    </SlideOver>
  );
}

/** Forms that pick an event wait for the schedule, so their picker doesn't start empty. */
const needsEvents = (key: UpdateKey) => ["delay", "cancellation", "venue_change", "back_on_schedule", "winners_post"].includes(key);
