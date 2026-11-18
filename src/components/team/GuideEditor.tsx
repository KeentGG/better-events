import { ArrowDown, ArrowUp, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { teamFetch, TeamApiError } from "../../lib/team";
import { GUIDE_ICONS, type GuideIcon, type TeamTip, type TeamTipSection } from "../../lib/types";
import { Alert, Badge, Button, CardSkeleton, EmptyState, Field, IconButton, Input, Select, Textarea } from "../../ui";
import { guideIcons } from "../VisitView";
import { TeamForm, useTeamList } from "./fields";

type Editing = { kind: "section"; section?: TeamTipSection } | { kind: "tip"; tip?: TeamTip; sectionId?: string };

/**
 * The visitor guide: sections of tips shown on the Visit page, in order. Sections marked for the Now
 * page feed its "Know before you go". Hidden sections and tips stay here but not on the site.
 */
export function GuideEditor({ token }: { token: string }) {
  const { list, error, reload } = useTeamList<TeamTipSection>("/api/team/guide", token);
  const [editing, setEditing] = useState<Editing>();
  const [moveError, setMoveError] = useState<string>();

  const done = () => {
    setEditing(undefined);
    reload();
  };

  if (editing?.kind === "section") return <SectionEditor token={token} section={editing.section} onDone={done} onCancel={() => setEditing(undefined)} />;
  if (editing?.kind === "tip" && list) {
    return <TipEditor token={token} sections={list} tip={editing.tip} initialSectionId={editing.sectionId} onDone={done} onCancel={() => setEditing(undefined)} />;
  }

  async function move(kind: "section" | "tip", id: string, direction: "up" | "down") {
    setMoveError(undefined);
    try {
      await teamFetch("/api/team/guide/move", token, { method: "POST", body: { kind, id, direction } });
      reload();
    } catch (err) {
      setMoveError(err instanceof TeamApiError ? err.message : "Couldn't move it. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ kind: "section" })}>
        Add a section
      </Button>
      {error && <Alert tone="danger" title="Couldn't load the guide">{error}</Alert>}
      {moveError && <Alert tone="danger" title="Not moved">{moveError}</Alert>}
      {!list ? (
        !error && <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No sections yet">
          Add a section, like “Getting there”, then its tips. They show on the Visit page.
        </EmptyState>
      ) : (
        list.map((section, i) => {
          const Icon = guideIcons[section.icon].icon;
          return (
            <section key={section.id} aria-label={section.title} className="rounded-card border border-line bg-surface-raised">
              <header className="flex items-center gap-2 border-b border-line p-3">
                <Icon className="size-5 shrink-0 text-accent-ink" aria-hidden />
                <h2 className="min-w-0 flex-1 truncate font-semibold">{section.title}</h2>
                {section.featured && <Badge tone="brand">On the Now page</Badge>}
                {!section.active && <Badge>Hidden</Badge>}
                <IconButton size="sm" label="Move section up" icon={<ArrowUp className="size-4" aria-hidden />} disabled={i === 0} onClick={() => void move("section", section.id, "up")} />
                <IconButton size="sm" label="Move section down" icon={<ArrowDown className="size-4" aria-hidden />} disabled={i === list.length - 1} onClick={() => void move("section", section.id, "down")} />
                <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing({ kind: "section", section })}>
                  Edit
                </Button>
              </header>
              <ol className="divide-y divide-line">
                {section.tips.map((tip, j) => (
                  <li key={tip.id} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{tip.title}</p>
                      {tip.body && <p className="truncate text-sm text-ink-muted">{tip.body}</p>}
                    </div>
                    {!tip.active && <Badge>Hidden</Badge>}
                    <IconButton size="sm" label="Move tip up" icon={<ArrowUp className="size-4" aria-hidden />} disabled={j === 0} onClick={() => void move("tip", tip.id, "up")} />
                    <IconButton
                      size="sm"
                      label="Move tip down"
                      icon={<ArrowDown className="size-4" aria-hidden />}
                      disabled={j === section.tips.length - 1}
                      onClick={() => void move("tip", tip.id, "down")}
                    />
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing({ kind: "tip", tip })}>
                      Edit
                    </Button>
                  </li>
                ))}
                <li className="p-2">
                  <Button variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ kind: "tip", sectionId: section.id })}>
                    Add a tip
                  </Button>
                </li>
              </ol>
            </section>
          );
        })
      )}
    </div>
  );
}

function IconSelect({ label, value, onChange, fallback }: { label: string; value: GuideIcon | ""; onChange: (icon: GuideIcon | "") => void; fallback?: string }) {
  return (
    <Field label={label}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value as GuideIcon | "")}>
          {fallback && <option value="">{fallback}</option>}
          {GUIDE_ICONS.map((icon) => (
            <option key={icon} value={icon}>
              {guideIcons[icon].label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

interface EditorProps {
  token: string;
  /** Called with the section or tip's title once it is saved or removed. */
  onDone: (title: string) => void;
  onCancel: () => void;
  /** Drop the card around the form, when it already sits in a panel. */
  bare?: boolean;
}

function SectionEditor({ token, section, onDone, onCancel, bare }: EditorProps & { section?: TeamTipSection }) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [icon, setIcon] = useState<GuideIcon>(section?.icon ?? "compass");
  const [featured, setFeatured] = useState(section?.featured ?? false);
  const [active, setActive] = useState(section?.active ?? true);
  const [error, setError] = useState<string>();

  async function remove() {
    if (!section) return;
    const count = section.tips.length;
    if (!confirm(`Remove “${section.title}”${count ? ` and its ${count} ${count === 1 ? "tip" : "tips"}` : ""}?`)) return;
    await teamFetch(`/api/team/guide/sections/${section.id}`, token, { method: "DELETE" });
    onDone(section.title);
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={section ? "Save section" : "Add section"}
      extra={
        <>
          {section && (
            <Button variant="ghost" size="lg" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
              Remove
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
      send={async () => {
        setError(title.trim() ? undefined : "Name the section.");
        if (!title.trim()) return false;
        const body = { title: title.trim(), icon, featured, active };
        await teamFetch(section ? `/api/team/guide/sections/${section.id}` : "/api/team/guide/sections", token, { method: section ? "PUT" : "POST", body });
        onDone(body.title);
      }}
    >
      <Field label="Section" hint="e.g. “Getting there”, “Where to eat”" error={error}>
        {(p) => <Input {...p} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <IconSelect label="Icon" value={icon} onChange={(v) => v && setIcon(v)} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
        <span>
          <span className="block font-medium">Show its tips on the Now page</span>
          <span className="block text-ink-muted">The first two appear under “Know before you go”.</span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Show on the Visit page
      </label>
    </TeamForm>
  );
}

/** Adds a tip, or edits `tip`. A new tip goes at the end of its section. */
export function TipEditor({
  token,
  sections,
  tip,
  initialSectionId,
  onDone,
  onCancel,
  bare,
}: EditorProps & { sections: TeamTipSection[]; tip?: TeamTip; initialSectionId?: string }) {
  const [sectionId, setSectionId] = useState(tip?.sectionId ?? initialSectionId ?? sections[0]?.id ?? "");
  const [title, setTitle] = useState(tip?.title ?? "");
  const [body, setBody] = useState(tip?.body ?? "");
  const [icon, setIcon] = useState<GuideIcon | "">(tip?.icon ?? "");
  const [active, setActive] = useState(tip?.active ?? true);
  const [errors, setErrors] = useState<{ section?: string; title?: string }>({});
  const section = sections.find((s) => s.id === sectionId);

  async function remove() {
    if (!tip || !confirm(`Remove “${tip.title}”?`)) return;
    await teamFetch(`/api/team/guide/tips/${tip.id}`, token, { method: "DELETE" });
    onDone(tip.title);
  }

  if (!sections.length) {
    return (
      <Alert tone="info" title="No sections yet">
        Add a section to the visitor guide first, then its tips.
      </Alert>
    );
  }

  return (
    <TeamForm
      bare={bare}
      submitLabel={tip ? "Save tip" : "Add tip"}
      extra={
        <>
          {tip && (
            <Button variant="ghost" size="lg" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
              Remove
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
      send={async () => {
        const next = { section: section ? undefined : "Pick a section.", title: title.trim() ? undefined : "What's the tip?" };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const payload = { sectionId, title: title.trim(), body: body.trim(), icon: icon || null, active };
        await teamFetch(tip ? `/api/team/guide/tips/${tip.id}` : "/api/team/guide/tips", token, { method: tip ? "PUT" : "POST", body: payload });
        onDone(payload.title);
      }}
    >
      <Field label="Section" error={errors.section}>
        {(p) => (
          <Select {...p} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {!s.active && " (hidden)"}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Tip" hint="A short headline: “Carry small bills”" error={errors.title}>
        {(p) => <Input {...p} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label="Details (optional)" hint="One or two plain sentences.">
        {(p) => <Textarea {...p} rows={3} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <IconSelect label="Icon" value={icon} onChange={setIcon} fallback={section ? `Section's (${guideIcons[section.icon].label})` : "Section's"} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Show on the site
      </label>
    </TeamForm>
  );
}

/** Mission control's "Add tip": loads the sections, then the tip form. */
export function NewTip({ token, onDone, onCancel, bare }: EditorProps) {
  const { list, error, reload } = useTeamList<TeamTipSection>("/api/team/guide", token);
  const [addingSection, setAddingSection] = useState(false);
  if (error) return <Alert tone="danger" title="Couldn't load the guide">{error}</Alert>;
  if (!list) return <CardSkeleton />;
  if (addingSection) {
    const done = () => {
      setAddingSection(false);
      reload();
    };
    return <SectionEditor token={token} onDone={done} onCancel={() => setAddingSection(false)} bare={bare} />;
  }
  if (!list.length) {
    return (
      <Alert tone="info" title="No sections yet">
        <p>Tips go in a section of the visitor guide, like “Getting there”. Add one first.</p>
        <Button className="mt-2" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAddingSection(true)}>
          Add a section
        </Button>
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Lasting advice. For tonight-only warnings, post an announcement.</p>
      <TipEditor token={token} sections={list} onDone={onDone} onCancel={onCancel} bare={bare} />
    </div>
  );
}
