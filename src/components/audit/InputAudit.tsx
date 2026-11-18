import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { audit, fixes, tiles, type AuditFix, type AuditResult, type AuditScenario, type FixId, type Rich } from "../../data/inputAudit";
import { href } from "../../lib/route";
import { Badge, type BadgeTone, cn } from "../../ui";

/**
 * The Mission Control input audit at `#/audit` (content in src/data/inputAudit.ts): every tile's
 * scenarios with what happens today, and the fixes they point to. `#/audit/<id>` scrolls to a tile,
 * a scenario or a fix and marks it, so fixes and scenarios can link to each other.
 */
export default function InputAudit({ focus }: { focus?: string }) {
  const [marked, setMarked] = useState<string>();

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus);
    if (!el) return;
    el.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setMarked(focus);
    const t = setTimeout(() => setMarked(undefined), 2400);
    return () => clearTimeout(t);
  }, [focus]);

  const mark = (id: string) => cn("scroll-mt-20 transition-shadow duration-500", marked === id && "ring-2 ring-accent ring-offset-2 ring-offset-surface");

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <Contents />
      <div className="min-w-0 space-y-12">
        <Header />
        <TopIssues mark={mark} />
        {tiles.map((t) => (
          <section key={t.id} id={t.id} aria-labelledby={`${t.id}-title`} className={cn("space-y-4 rounded-card", mark(t.id))}>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <h2 id={`${t.id}-title`} className="font-display text-2xl font-semibold">
              {t.title}
            </h2>
            <Tally scenarios={t.scenarios} />
            {t.buttons.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Buttons on the tile">
                {t.buttons.map((b) => (
                  <li key={b} className="rounded-control border border-line bg-surface-raised px-2.5 py-1 text-sm font-medium">
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {t.intro.map((p, i) => (
              <p key={i} className="max-w-prose">
                <RichText text={p} />
              </p>
            ))}
            <Scenarios scenarios={t.scenarios} mark={mark} />
            {t.evidence && (
              <div className="max-w-prose space-y-2 py-1 text-sm">
                <p>
                  <RichText text={t.evidence.text} />
                </p>
                <FixLinks ids={t.evidence.fixes} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {t.boxes.map((b) => (
                <Box key={b.title} title={b.title} fix={b.fix}>
                  <ul className="list-disc space-y-1.5 pl-5">
                    {b.items.map((x, i) => (
                      <li key={i}>
                        <RichText text={x} />
                      </li>
                    ))}
                  </ul>
                </Box>
              ))}
            </div>
          </section>
        ))}
        <Patterns />
        <Fixes mark={mark} />
      </div>
    </div>
  );
}

// Links within the page. Clicking the one already in the URL scrolls again instead of doing nothing.

const to = (id: string) => href({ tab: "audit", detail: id });

function PageLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (location.hash !== to(id)) return;
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  };
  return (
    <a href={to(id)} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

const fixNumber = (id: FixId) => fixes.findIndex((f) => f.id === id) + 1;
const fixById = (id: FixId) => fixes.find((f) => f.id === id)!;

function FixLinks({ ids }: { ids: FixId[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <PageLink
          key={id}
          id={`fix-${id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-hover"
        >
          Go to fix {fixNumber(id)}: {fixById(id).title}
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </PageLink>
      ))}
    </div>
  );
}

// Inline markup from src/data/inputAudit.ts: `code`, **bold**, *italic*, [[ok|label]].

const resultTone: Record<AuditResult, BadgeTone> = {
  ok: "ok",
  partial: "warn",
  no: "danger",
};
const token = /(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*|\[\[(?:ok|partial|no)\|[^\]]+\]\])/;

function RichText({ text }: { text: Rich }) {
  return (
    <>
      {text.split(token).map((part, i) => {
        if (part.startsWith("`")) {
          return (
            <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em] break-words">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**")) return <strong key={i}>{<RichText text={part.slice(2, -2)} />}</strong>;
        if (part.startsWith("*") && part.length > 2) return <em key={i}>{<RichText text={part.slice(1, -1)} />}</em>;
        if (part.startsWith("[[")) {
          const [result, label] = part.slice(2, -2).split("|") as [AuditResult, string];
          return (
            <Badge key={i} tone={resultTone[result]} className="mx-0.5 align-middle">
              {label}
            </Badge>
          );
        }
        return part;
      })}
    </>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs tracking-[0.18em] text-primary-ink uppercase">{children}</p>;
}

function Contents() {
  const entries = [
    { id: "top", label: "Top issues" },
    ...tiles.map((t) => ({ id: t.id, label: t.title })),
    { id: "patterns", label: "Cross-tile patterns" },
    { id: "priorities", label: "Recommended fixes" },
  ];
  return (
    <nav aria-label="Sections" className="sticky top-20 hidden self-start lg:block">
      <ol className="space-y-1 text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <PageLink id={e.id} className="block rounded-control px-2 py-1 text-ink-muted hover:bg-surface-sunken hover:text-ink">
              {e.label}
            </PageLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Header() {
  return (
    <header className="space-y-3">
      <a href={href({ tab: "control" })} className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Mission control
      </a>
      <Eyebrow>{audit.eyebrow}</Eyebrow>
      <h1 className="text-hero font-display text-balance">{audit.title}</h1>
      <p className="max-w-prose text-lg text-ink-muted">{audit.lede}</p>
      <p className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-ink-subtle">
        {audit.meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </p>
      <Progress />
      <p className="max-w-prose text-sm leading-7 text-ink-muted">
        <RichText text={audit.legend} />
      </p>
    </header>
  );
}

function TopIssues({ mark }: { mark: (id: string) => string }) {
  return (
    <section id="top" aria-labelledby="top-title" className={cn("space-y-4 rounded-card", mark("top"))}>
      <Eyebrow>{audit.top.eyebrow}</Eyebrow>
      <h2 id="top-title" className="font-display text-2xl font-semibold">
        {audit.top.title}
      </h2>
      <ol className="space-y-4">
        {audit.top.items.map((item, i) => (
          <li key={i} className="grid max-w-prose grid-cols-[2rem_minmax(0,1fr)] gap-2">
            <span className="font-display text-2xl leading-7 font-semibold text-primary-ink" aria-hidden>
              {i + 1}
            </span>
            <p>
              <RichText text={item} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const resultIcon: Record<AuditResult, string> = {
  ok: "✅",
  partial: "⚠️",
  no: "❌",
};
const resultLabel: Record<AuditResult, string> = {
  ok: "full",
  partial: "partial",
  no: "can't",
};

/** Scenario, result and what happens; a table on wide screens, stacked rows on a phone. */
function Scenarios({ scenarios, mark }: { scenarios: AuditScenario[]; mark: (id: string) => string }) {
  const grid = "sm:grid sm:grid-cols-[minmax(0,2fr)_4.5rem_minmax(0,3fr)] sm:gap-4";
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-card">
      <div className={cn("hidden border-b border-line px-4 py-2 text-xs font-medium tracking-[0.08em] text-ink-muted uppercase", grid)} aria-hidden>
        <span>Scenario</span>
        <span>Result</span>
        <span>What happens</span>
      </div>
      <ul className="divide-y divide-line">
        {scenarios.map((s) => (
          <li key={s.id} id={s.id} className={cn("space-y-2 px-4 py-3 text-sm sm:space-y-0", grid, mark(s.id))}>
            <p className="italic">
              <RichText text={s.scenario} />
            </p>
            <div>
              <Badge tone={resultTone[s.result]}>
                <span aria-hidden>{resultIcon[s.result]}</span>
                <span className="sr-only">{resultLabel[s.result]}</span>
              </Badge>
              {s.before && (
                <span className="mt-1 block text-xs whitespace-nowrap text-ink-subtle">
                  was <span aria-hidden>{resultIcon[s.before]}</span>
                  <span className="sr-only">{resultLabel[s.before]}</span>
                </span>
              )}
            </div>
            <div className="space-y-2">
              <p>
                <RichText text={s.what} />
              </p>
              {s.fix && (
                <details className="group rounded-control border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
                    Recommended fix
                  </summary>
                  <div className="space-y-2.5 px-3 pt-1 pb-3">
                    <p>
                      <RichText text={s.fix.summary} />
                    </p>
                    <FixLinks ids={s.fix.fixes} />
                  </div>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Box({ title, fix, children }: { title: string; fix?: boolean; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-2 border-t-2 pt-2.5 text-sm", fix ? "border-primary" : "border-line")}>
      <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Patterns() {
  const p = audit.patterns;
  return (
    <section id="patterns" aria-labelledby="patterns-title" className="scroll-mt-20 space-y-4">
      <Eyebrow>{p.eyebrow}</Eyebrow>
      <h2 id="patterns-title" className="font-display text-2xl font-semibold">
        {p.title}
      </h2>
      {p.items.map((it) => (
        <div key={it.title} className="max-w-prose space-y-2">
          <h3 className="font-display text-title">{it.title}</h3>
          {it.body?.map((b, i) => (
            <p key={i}>
              <RichText text={b} />
            </p>
          ))}
          {it.list && (
            <ul className="list-disc space-y-1.5 pl-5">
              {it.list.map((x, i) => (
                <li key={i}>
                  <RichText text={x} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

/** Scenarios that point at each fix, derived from the tiles so the two never disagree. */
const scenariosFor = (id: FixId) => tiles.flatMap((t) => t.scenarios.filter((s) => s.fix?.fixes.includes(id)));

function Fixes({ mark }: { mark: (id: string) => string }) {
  const s = audit.fixSection;
  return (
    <section id="priorities" aria-labelledby="priorities-title" className={cn("space-y-5 rounded-card", mark("priorities"))}>
      <Eyebrow>{s.eyebrow}</Eyebrow>
      <h2 id="priorities-title" className="font-display text-2xl font-semibold">
        {s.title}
      </h2>
      <p className="max-w-prose text-sm text-ink-muted">{s.intro}</p>

      <div className="overflow-x-auto rounded-card border border-line bg-surface-raised shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-[0.08em] text-ink-muted uppercase">
              {s.columns.map((c) => (
                <th key={c} scope="col" className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fixes.map((f, i) => (
              <tr key={f.id}>
                <td className="px-4 py-2 font-mono font-semibold text-primary-ink tabular-nums">{i + 1}</td>
                <td className="px-4 py-2">
                  <PageLink id={`fix-${f.id}`} className="font-medium text-primary-ink hover:underline">
                    {f.title}
                  </PageLink>
                </td>
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{f.effort}</td>
                <td className="px-4 py-2 font-mono tabular-nums">{scenariosFor(f.id).length}</td>
                <td className="px-4 py-2">
                  <FixStatus fix={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-5">
        {fixes.map((f, i) => {
          const refs = scenariosFor(f.id);
          return (
            <article
              key={f.id}
              id={`fix-${f.id}`}
              className={cn("space-y-3 rounded-card border border-line bg-surface-raised p-4 shadow-card", mark(`fix-${f.id}`))}
            >
              <header className="flex items-baseline gap-3">
                <span className="min-w-8 font-display text-3xl leading-none font-semibold text-primary-ink">{i + 1}</span>
                <div className="min-w-0 space-y-1">
                  <h3 className="font-display text-title">{f.title}</h3>
                  <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
                    {f.effort}
                    <FixStatus fix={f} />
                  </p>
                </div>
              </header>
              <p className="max-w-prose text-sm">
                <RichText text={f.problem} />
              </p>
              {(f.ui.length > 0 || f.data.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { title: "Change: UI", items: f.ui },
                    { title: "Change: data model", items: f.data },
                  ]
                    .filter((b) => b.items.length)
                    .map((b) => (
                      <Box key={b.title} title={b.title} fix>
                        <ul className="list-disc space-y-1.5 pl-5">
                          {b.items.map((x, j) => (
                            <li key={j}>
                              <RichText text={x} />
                            </li>
                          ))}
                        </ul>
                      </Box>
                    ))}
                </div>
              )}
              <div className="space-y-1.5 text-sm">
                <h4 className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">Scenarios this fixes</h4>
                <ul className="list-disc space-y-1 pl-5 italic">
                  {refs.length ? (
                    refs.map((r) => (
                      <li key={r.id}>
                        <PageLink id={r.id} className="text-primary-ink hover:underline">
                          <RichText text={r.scenario} />
                        </PageLink>
                      </li>
                    ))
                  ) : (
                    <li>Cross-tile issue; see the patterns above.</li>
                  )}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** How a tile's (or the whole audit's) scenarios stand now. */
function Tally({ scenarios }: { scenarios: AuditScenario[] }) {
  const results: AuditResult[] = ["ok", "partial", "no"];
  return (
    <p className="flex flex-wrap gap-1.5" aria-label="Scenario results">
      {results.map((r) => {
        const n = scenarios.filter((s) => s.result === r).length;
        if (!n) return null;
        return (
          <Badge key={r} tone={resultTone[r]}>
            <span aria-hidden>{resultIcon[r]}</span> {n} <span className="sr-only">{resultLabel[r]}</span>
          </Badge>
        );
      })}
    </p>
  );
}

function Progress() {
  const all = tiles.flatMap((t) => t.scenarios);
  const done = fixes.filter((f) => f.status?.state === "done").length;
  const doing = fixes.filter((f) => f.status?.state === "doing").length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <Tally scenarios={all} />
      <span className="text-ink-muted">
        {all.length} scenarios · {done} of {fixes.length} fixes done
        {doing > 0 && `, ${doing} in progress`}
      </span>
    </div>
  );
}

function FixStatus({ fix }: { fix: AuditFix }) {
  const s = fix.status;
  if (s?.state === "done") return <Badge tone="ok">Done · {s.commit}</Badge>;
  if (s?.state === "doing") return <Badge tone="info">In progress</Badge>;
  return <Badge tone="neutral">Open</Badge>;
}
