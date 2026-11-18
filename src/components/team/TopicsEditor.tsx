import { Pencil, Plus, Tags, X } from "lucide-react";
import { useState } from "react";
import { addTopic, saveTopic, useTopics } from "../../lib/topics";
import type { TeamTopic } from "../../lib/types";
import { Badge, Button, CardSkeleton, Chip, EmptyState, Field, Input, Select } from "../../ui";
import { TeamForm } from "./fields";

/**
 * Staff: the topics visitors follow. Rename them, add the other names people type (aliases, so
 * "ahedres" finds Chess), set the icon and order, move one under another main topic, or hide it. The
 * key never changes, since visitors' saved interests name it.
 */
export function TopicsEditor({ token }: { token: string }) {
  const topics = useTopics(token);
  const [editing, setEditing] = useState<TeamTopic | "new">();

  if (editing === "new") return <NewTopic token={token} roots={topics.filter((t) => !t.parentKey)} onDone={() => setEditing(undefined)} />;
  if (editing) return <TopicForm token={token} topic={editing} all={topics} onDone={() => setEditing(undefined)} />;

  const roots = topics.filter((t) => !t.parentKey);
  return (
    <div className="space-y-4">
      <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>
        Add a topic
      </Button>
      {topics.length === 0 ? (
        <CardSkeleton />
      ) : roots.length === 0 ? (
        <EmptyState icon={Tags} title="No topics yet">
          Add the things visitors follow: food, music, sports.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {roots.flatMap((r) => [r, ...topics.filter((t) => t.parentKey === r.key)]).map((t) => (
            <li key={t.key} className={t.parentKey ? "flex items-center gap-3 p-3 pl-8" : "flex items-center gap-3 p-3"}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="truncate text-sm text-ink-muted">{t.aliases.length ? `Also: ${t.aliases.join(", ")}` : "No other names"}</p>
              </div>
              {t.hidden && <Badge>Hidden</Badge>}
              <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(t)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTopic({ token, roots, onDone }: { token: string; roots: TeamTopic[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [parentKey, setParentKey] = useState("");
  const [error, setError] = useState<string>();
  return (
    <TeamForm
      submitLabel="Add topic"
      extra={
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      }
      send={async () => {
        setError(name.trim().length >= 2 ? undefined : "Name the topic.");
        if (name.trim().length < 2) return false;
        await addTopic(token, name.trim(), parentKey || null);
        onDone();
      }}
    >
      <Field label="Name" hint="If it already exists under this name or another, that one is kept." error={error}>
        {(p) => <Input {...p} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <ParentSelect roots={roots} value={parentKey} onChange={setParentKey} />
    </TeamForm>
  );
}

function ParentSelect({ roots, value, onChange, disabled }: { roots: TeamTopic[]; value: string; onChange: (key: string) => void; disabled?: boolean }) {
  return (
    <Field label="Under" hint={disabled ? "It has topics under it, so it stays a main topic." : "Topics go two levels deep: Sports › Chess."}>
      {(p) => (
        <Select {...p} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Nothing (a main topic)</option>
          {roots.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function TopicForm({ token, topic, all, onDone }: { token: string; topic: TeamTopic; all: TeamTopic[]; onDone: () => void }) {
  const [name, setName] = useState(topic.name);
  const [parentKey, setParentKey] = useState(topic.parentKey ?? "");
  const [aliases, setAliases] = useState(topic.aliases);
  const [alias, setAlias] = useState("");
  const [icon, setIcon] = useState(topic.icon ?? "");
  const [order, setOrder] = useState(String(topic.order));
  const [hidden, setHidden] = useState(topic.hidden);
  const [errors, setErrors] = useState<{ name?: string; order?: string }>({});
  const hasChildren = all.some((t) => t.parentKey === topic.key);

  function addAlias() {
    const a = alias.trim().replace(/\s+/g, " ");
    if (a && !aliases.some((x) => x.toLowerCase() === a.toLowerCase())) setAliases([...aliases, a]);
    setAlias("");
  }

  return (
    <TeamForm
      submitLabel="Save topic"
      extra={
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      }
      send={async () => {
        const next = { name: name.trim().length >= 2 ? undefined : "Name the topic.", order: /^\d+$/.test(order) ? undefined : "A whole number." };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        await saveTopic(token, { key: topic.key, name: name.trim(), parentKey: parentKey || null, aliases, icon: icon.trim() || null, order: Number(order), hidden });
        onDone();
      }}
    >
      <p className="font-mono text-xs text-ink-muted">Key: {topic.key}</p>
      <Field label="Name" error={errors.name}>
        {(p) => <Input {...p} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <ParentSelect roots={all.filter((t) => !t.parentKey && t.key !== topic.key)} value={parentKey} onChange={setParentKey} disabled={hasChildren} />
      <div className="space-y-2">
        <Field label="Other names" hint="What people type for it, in any language: “ahedres” for Chess. Suggestions match these too.">
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                maxLength={40}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
              />
              <Button variant="secondary" onClick={addAlias}>
                Add
              </Button>
            </div>
          )}
        </Field>
        {aliases.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Other names">
            {aliases.map((a) => (
              <li key={a}>
                <Chip active onClick={() => setAliases(aliases.filter((x) => x !== a))} aria-label={`Remove ${a}`} icon={<X aria-hidden />}>
                  {a}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Icon (optional)" hint="A lucide icon name, e.g. “crown”. Empty uses the main topic's.">
          {(p) => <Input {...p} maxLength={40} value={icon} onChange={(e) => setIcon(e.target.value)} />}
        </Field>
        <Field label="Order" hint="Lower comes first." error={errors.order}>
          {(p) => <Input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        Hide from visitors and suggestions
      </label>
    </TeamForm>
  );
}
