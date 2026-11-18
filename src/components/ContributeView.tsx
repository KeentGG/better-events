import { ArrowLeft, CalendarClock, CalendarDays, Car, Lightbulb, Megaphone, ShieldCheck, Store, Trophy, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { COMMUNITY_TOKEN, SUGGESTION_SENT } from "../lib/team";
import type { TeamEvent } from "../lib/types";
import { Alert, Button, Toast, type ToastMessage } from "../ui";
import { useTeamList } from "./team/fields";
import { NewTip } from "./team/GuideEditor";
import { PlacesEditor, ScheduleEditor } from "./team/ListEditors";
import { CrowdForm, EventChangeForm, NoticeForm, TrafficForm, WinnersForm } from "./team/UpdateForms";

const actions: Array<{ id: string; title: string; hint: string; icon: LucideIcon }> = [
  { id: "traffic", title: "Traffic", hint: "A road that's jammed, closed or open again", icon: Car },
  { id: "crowd", title: "How crowded is it?", hint: "Quiet, busy or packed right now", icon: Users },
  { id: "event", title: "Event change", hint: "Running late, moved, cancelled", icon: CalendarClock },
  { id: "winners", title: "Winners", hint: "Results of a contest you watched", icon: Trophy },
  { id: "notice", title: "Announcement", hint: "Safety, weather, promos, raffles, news", icon: Megaphone },
  { id: "schedule", title: "Schedule", hint: "An event that's missing or listed wrong", icon: CalendarDays },
  { id: "places", title: "Around places", hint: "Food, kiosks, rides, restrooms, ATMs", icon: Store },
  { id: "tip", title: "Visitor tip", hint: "Something a first-timer should know", icon: Lightbulb },
];

/**
 * The Contribute page at `#/report`: anyone at the festival can send what the team desk can enter, on
 * the team's own forms. Nothing is published from here. Each form is handed the community token, which
 * turns what it saves into a suggestion the team reviews (src/lib/team.ts, server/community.ts).
 */
export function ContributeView({ section, onSection }: { section: string | undefined; onSection: (section: string | undefined) => void }) {
  const action = actions.find((a) => a.id === section);
  const events = useTeamList<TeamEvent>("/api/team/events", COMMUNITY_TOKEN);
  const [sent, setSent] = useState<string>();
  const [toast, setToast] = useState<ToastMessage>();

  // Every form reports through the same event, including the editors that keep you on their list after saving.
  useEffect(() => {
    const onSent = (e: Event) => {
      const summary = (e as CustomEvent<string>).detail;
      setSent(summary);
      setToast({ tone: "ok", title: "Sent to the team for review", text: summary });
    };
    window.addEventListener(SUGGESTION_SENT, onSent);
    return () => window.removeEventListener(SUGGESTION_SENT, onSent);
  }, []);

  const done = () => onSection(undefined);
  const formProps = { token: COMMUNITY_TOKEN, onDone: done, staff: false };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">Contribute</p>
          <h1 className="mt-1 font-display text-hero text-balance">{action?.title ?? "Seen something we haven't?"}</h1>
        </div>
        {action && (
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={done}>
            Back
          </Button>
        )}
      </header>

      {action ? (
        // The forms are the team's, so their buttons say Publish and Save. Here that means "send".
        <Alert tone="info" title="This goes to the team first">
          Whatever the button below says, nothing appears on the site until someone on the team has checked it.
        </Alert>
      ) : (
        <>
          <p className="text-ink-muted">
            You're on the ground and we're not everywhere. Tell us about a closed road, a late start, a winner, a food stall or a wrong listing. A link to where you saw it helps us confirm it faster.
          </p>
          {sent ? (
            <Alert tone="ok" title="Sent. Thank you!">
              {sent}. It shows on the site once someone on the team has checked it.
            </Alert>
          ) : (
            <p className="flex items-start gap-2 rounded-card bg-surface-sunken p-3 text-sm text-ink-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>The team reads everything before it goes up, so it won't show right away. No account needed, and we don't ask who you are.</span>
            </p>
          )}
        </>
      )}

      {section === "traffic" ? (
        <TrafficForm {...formProps} />
      ) : section === "crowd" ? (
        <CrowdForm {...formProps} />
      ) : section === "event" ? (
        <EventChangeForm token={COMMUNITY_TOKEN} staff={false} events={events.list} onDone={done} onAddEvents={() => onSection("schedule")} />
      ) : section === "winners" ? (
        <WinnersForm token={COMMUNITY_TOKEN} staff={false} events={events.list ?? []} onDone={done} />
      ) : section === "notice" ? (
        <NoticeForm {...formProps} />
      ) : section === "schedule" ? (
        <ScheduleEditor token={COMMUNITY_TOKEN} />
      ) : section === "places" ? (
        <PlacesEditor token={COMMUNITY_TOKEN} />
      ) : section === "tip" ? (
        <NewTip token={COMMUNITY_TOKEN} onDone={done} onCancel={done} />
      ) : (
        <ul className="auto-grid [--gap:0.75rem] [--min:14rem]">
          {actions.map(({ id, title, hint, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  setSent(undefined);
                  onSection(id);
                }}
                className="flex h-full w-full items-center gap-3 rounded-card border border-line bg-surface-raised p-3.5 text-left shadow-card transition duration-150 ease-out-quint hover:border-line-strong active:scale-[0.99]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-ink-muted">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Toast toast={toast} onClose={() => setToast(undefined)} />
    </div>
  );
}
