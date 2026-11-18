import { Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TeamApiError } from "../../lib/team";
import { suggestTopics } from "../../lib/topicMatch";
import { addTopic, topicLabel, useTopics } from "../../lib/topics";
import { Button, Chip, Combobox, Field, Select } from "../../ui";

/**
 * What an event, place or announcement is about, so visitors who follow a topic find it. Until someone
 * changes the picks it fills them in from `text` (the title and details) by topic names and aliases,
 * marked as suggestions to check. Typing a topic that isn't listed offers to add it, as a main topic or
 * under one. An entry that already has topics keeps them.
 */
export function TopicPicker({
  token,
  value,
  onChange,
  text,
  required,
  error,
}: {
  token: string;
  value: string[];
  onChange: (keys: string[]) => void;
  text: string;
  required?: boolean;
  error?: string;
}) {
  const topics = useTopics(token);
  const [touched, setTouched] = useState(value.length > 0);
  const [adding, setAdding] = useState<{ name: string; parentKey: string }>();
  const [addError, setAddError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(() => suggestTopics(text, topics).map((s) => s.key), [text, topics]);
  const suggestedKey = suggested.join(",");
  useEffect(() => {
    if (!touched && suggestedKey !== value.join(",")) onChange(suggested);
    // Only the suggestion changing refills the picks.
  }, [touched, suggestedKey]);

  const pick = (keys: string[]) => {
    setTouched(true);
    onChange(keys);
  };
  const labelOf = (key: string) => {
    const t = topics.find((x) => x.key === key);
    return t ? topicLabel(t, topics) : key;
  };
  const options = topics.filter((t) => !t.hidden && !value.includes(t.key));
  const roots = topics.filter((t) => !t.parentKey && !t.hidden);

  async function create() {
    if (!adding) return;
    setSaving(true);
    setAddError(undefined);
    try {
      const topic = await addTopic(token, adding.name, adding.parentKey || null);
      pick([...value.filter((k) => k !== topic.key), topic.key]);
      setAdding(undefined);
    } catch (err) {
      setAddError(err instanceof TeamApiError ? err.message : "Couldn't add the topic. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Field
        label={required ? "Topics" : "Topics (optional)"}
        hint="What it's about, so people who follow it find it. Search, or add one that isn't listed."
        error={error}
      >
        {(p) => (
          <Combobox
            {...p}
            value=""
            options={options.map((t) => topicLabel(t, topics))}
            aliases={Object.fromEntries(options.map((t) => [topicLabel(t, topics), [t.name, ...t.aliases]]))}
            onChange={(label) => {
              const t = options.find((x) => topicLabel(x, topics) === label);
              if (t) pick([...value, t.key]);
            }}
            onCreate={async (name) => {
              setAdding({ name, parentKey: "" });
              return "";
            }}
            createLabel={(q) => `Add topic “${q}”…`}
            placeholder={value.length ? "Add another topic" : "Search topics: food, chess, music…"}
          />
        )}
      </Field>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-control border border-line bg-surface-sunken p-3">
          <Field label={`Add “${adding.name}” under`}>
            {(p) => (
              <Select {...p} value={adding.parentKey} onChange={(e) => setAdding({ ...adding, parentKey: e.target.value })}>
                <option value="">Nothing (a main topic)</option>
                {roots.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button size="sm" loading={saving} onClick={() => void create()}>
            Add topic
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(undefined)}>
            Cancel
          </Button>
          {addError && <p className="w-full text-sm text-danger-ink">{addError}</p>}
        </div>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Picked topics">
          {value.map((k) => (
            <li key={k}>
              <Chip active onClick={() => pick(value.filter((v) => v !== k))} aria-label={`Remove ${labelOf(k)}`} icon={<X aria-hidden />}>
                {labelOf(k)}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      {!touched && value.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Suggested from the title. Remove any that don't fit.
        </p>
      )}
    </div>
  );
}
