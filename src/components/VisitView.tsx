import { Banknote, Bus, Compass, Droplets, LifeBuoy, MapPinned, Phone, Shield, Sun, Umbrella, Users, Utensils, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import type { GuideIcon, VisitSection } from "../lib/types";
import { CardSkeleton } from "../ui";

/** The icons guide sections and tips can pick (GUIDE_ICONS). */
export const guideIcons: Record<GuideIcon, { icon: LucideIcon; label: string }> = {
  water: { icon: Droplets, label: "Water" },
  cash: { icon: Banknote, label: "Money" },
  rain: { icon: Umbrella, label: "Rain" },
  meet: { icon: Users, label: "People" },
  map: { icon: MapPinned, label: "Map" },
  compass: { icon: Compass, label: "Compass" },
  help: { icon: LifeBuoy, label: "Help" },
  food: { icon: Utensils, label: "Food" },
  bus: { icon: Bus, label: "Transport" },
  sun: { icon: Sun, label: "Sun" },
  phone: { icon: Phone, label: "Phone" },
  shield: { icon: Shield, label: "Safety" },
};

/** A guide for first-time visitors, in sections of tips kept on the team desk. `section` scrolls to one part. */
export function VisitView({ sections, section }: { sections: VisitSection[] | undefined; section: string | undefined }) {
  useEffect(() => {
    if (section && sections) document.getElementById(section)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [section, sections]);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">First time in Bacolod?</p>
        <h1 className="text-hero mt-2 font-display text-balance">
          Your MassKara, <em className="text-primary-ink">made easy.</em>
        </h1>
        <p className="mt-1.5 text-ink-muted">How to get here, what not to miss, and what locals wish every visitor knew. Check routes and fares with official sources before you travel.</p>
      </header>

      {!sections ? (
        <CardSkeleton />
      ) : (
        <div className="auto-grid [--gap:1.25rem] [--min:19rem]">
          {sections.map((s) => {
            const Icon = guideIcons[s.icon].icon;
            return (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 rounded-card border border-line bg-surface-raised shadow-card">
                <h2 id={`${s.id}-title`} className="sawali flex items-center gap-2 rounded-t-card border-b border-line bg-surface-band px-4 py-3 font-display text-title">
                  <span className="grid size-8 place-items-center rounded-control bg-surface-band text-accent-ink">
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="rounded-control bg-surface-band px-1">{s.title}</span>
                </h2>
                <ol className="divide-y divide-line">
                  {s.items.map((it) => {
                    const TipIcon = it.icon && guideIcons[it.icon].icon;
                    return (
                      <li key={it.id} className="flex gap-3 p-4">
                        {TipIcon && <TipIcon className="mt-0.5 size-5 shrink-0 text-accent-ink" strokeWidth={1.75} aria-hidden />}
                        <div>
                          <h3 className="font-semibold">{it.title}</h3>
                          {it.body && <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{it.body}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}

    </div>
  );
}
