import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { AroundView } from "./components/AroundView";
import { ContributeView } from "./components/ContributeView";
import { ControlView } from "./components/control/ControlView";
import { ForYouView } from "./components/ForYouView";
import { InterestDock } from "./components/InterestDock";
import { NowView } from "./components/NowView";
import { ScheduleView } from "./components/ScheduleView";
import { SearchPalette, useSearchHotkey } from "./components/SearchPalette";
import { SiteHeader } from "./components/SiteHeader";
import { InboxView } from "./components/team/InboxView";
import { TeamDesk } from "./components/team/TeamDesk";
import { weatherWarning } from "./components/HeaderControls";
import { TrafficView } from "./components/TrafficView";
import { VisitView } from "./components/VisitView";
import { api } from "./lib/api";
import { useRoute } from "./lib/route";
import { useConnectionLost, usePolling } from "./lib/usePolling";
import { CardSkeleton } from "./ui";

// A long internal document, loaded only when someone opens it.
const InputAudit = lazy(() => import("./components/audit/InputAudit"));

export default function App() {
  const [route, go] = useRoute();
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useSearchHotkey(openSearch);

  const feed = usePolling(api.feed);
  const top = usePolling(api.feedTop);
  const traffic = usePolling(api.traffic);
  const crowd = usePolling(api.crowd);
  const weather = usePolling(api.weather, 15 * 60_000);
  const schedule = usePolling(api.schedule, 5 * 60_000);
  const around = usePolling(api.around, 15 * 60_000);
  const tips = usePolling(api.tips, 60 * 60_000);
  const visit = usePolling(api.visit, 60 * 60_000);
  const lost = useConnectionLost();

  const warning = useMemo(() => weatherWarning(feed?.data), [feed]);
  const searchData = useMemo(
    () => ({ schedule: schedule?.data, feed: feed?.data, traffic: traffic?.data, around: around?.data, visit: visit?.data }),
    [schedule, feed, traffic, around, visit],
  );
  const forYouData = useMemo(() => ({ feed: feed?.data, schedule: schedule?.data, around: around?.data }), [feed, schedule, around]);
  const team = route.tab === "team" || route.tab === "inbox" || route.tab === "control" || route.tab === "audit";
  // Mission control is a staff wall, not a page people navigate from, so it drops the header.
  // Its input audit is read alongside it, so it does the same.
  const bare = route.tab === "control" || route.tab === "audit";

  return (
    <div className="app">
      <div className="app-shell">
        <div className="app-body">
          {!bare && (
            <SiteHeader
              at={route}
              go={go}
              onSearch={openSearch}
              weather={weather?.data}
              warning={warning}
              schedule={schedule?.data}
              around={around?.data}
              traffic={traffic?.data}
              sample={feed ? !feed.live && !team : false}
              full={route.tab === "now"}
            />
          )}

          {/* Public pages leave room at the foot for the interest dock. */}
          <main className={team ? "app-main space-y-7" : "app-main space-y-7 pb-20"}>
            {lost && !team && (
              <p role="status" className="rounded-chip border border-line bg-surface-raised px-3.5 py-2 text-xs text-ink-muted">
                Can't reach the server. Showing the last update we have; retrying.
              </p>
            )}
            {route.tab === "now" ? (
              <NowView feed={feed?.data} top={top?.data} traffic={traffic?.data} crowd={crowd?.data} tips={tips?.data} around={around?.data} />
            ) : route.tab === "foryou" ? (
              <ForYouView data={forYouData} />
            ) : route.tab === "schedule" ? (
              <ScheduleView events={schedule?.data} focus={route.detail} weather={weather?.data} />
            ) : route.tab === "traffic" ? (
              <TrafficView key={route.detail} areas={traffic?.data} crowd={crowd?.data} feed={feed?.data} schedule={schedule?.data} detail={route.detail} />
            ) : route.tab === "around" ? (
              <AroundView places={around?.data} kind={route.detail} onKind={(k) => go({ tab: "around", detail: k })} />
            ) : route.tab === "visit" ? (
              <VisitView sections={visit?.data} section={route.detail} />
            ) : route.tab === "team" ? (
              <TeamDesk section={route.detail} onSection={(detail) => go({ tab: "team", detail })} />
            ) : route.tab === "inbox" ? (
              <InboxView />
            ) : route.tab === "control" ? (
              <ControlView detail={route.detail} />
            ) : route.tab === "audit" ? (
              <Suspense fallback={<CardSkeleton />}>
                <InputAudit focus={route.detail} />
              </Suspense>
            ) : (
              <ContributeView section={route.detail} onSection={(detail) => go({ tab: "report", detail })} />
            )}
          </main>

        </div>
      </div>
      {/* Off the forms too, where it would sit over the send button. */}
      {!team && route.tab !== "foryou" && route.tab !== "report" && <InterestDock />}
      <SearchPalette open={searching} onClose={() => setSearching(false)} data={searchData} />
    </div>
  );
}
