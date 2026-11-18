import { GitMerge, Pencil, Shapes, X } from "lucide-react";
import { useState } from "react";
import { mergePlaceKind, savePlaceKind } from "../../lib/placeKinds";
import { TeamApiError } from "../../lib/team";
import { PLACE_ICONS, PROMO_KIND, type TeamPlaceKind } from "../../lib/types";
import { Alert, Badge, Button, CardSkeleton, Chip, EmptyState, Field, Input, Select } from "../../ui";
import { placeIcons } from "../AroundView";
import { TeamForm, useTeamList } from "./fields";

/**
 * Staff: the kinds of Around place. Rename one, set its plural and icon, add the other names people type
 * ("CR" for Restroom), say whether it is a service, or merge a duplicate into another kind. The key never
 * changes, since `#/around/<key>` links name it.
 */
export function PlaceKindsEditor({ token }: { token: string }) {
  const { list, error, reload } = useTeamList<TeamPlaceKind>("/api/team/place-kinds", token);
  const [editing, setEditing] = useState<TeamPlaceKind>();
  const [merging, setMerging] = useState<TeamPlaceKind>();
  const [done, setDone] = useState<string>();

  if (editing) {
    return (
      <KindForm
        token={token}
        kind={editing}
        onDone={() => {
          setEditing(undefined);
          reload();
        }}
      />
    );
  }
  if (merging && list) {
    return (
      <MergeForm
        token={token}
        kind={merging}
        others={list.filter((k) => k.key !== merging.key && k.key !== PROMO_KIND)}
        onDone={(message) => {
          setMerging(undefined);
          setDone(message);
          reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger" title="Couldn't load place kinds">{error}</Alert>}
      {done && (
        <Alert tone="ok" title="Merged">
          {done}
        </Alert>
      )}
      {!list ? (
        !error && <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={Shapes} title="No kinds yet">
          Kinds are added while filling in a place.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {list.map((k) => (
            <li key={k.key} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{k.name}</p>
                <p className="truncate text-sm text-ink-muted">
                  {k.places ?? 0} {k.places === 1 ? "place" : "places"}
                  {k.aliases.length > 0 && ` · Also: ${k.aliases.join(", ")}`}
                </p>
              </div>
              {k.services && <Badge tone="info">Service</Badge>}
              <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => { setDone(undefined); setEditing(k); }}>
                Edit
              </Button>
              {k.key !== PROMO_KIND && (
                <Button variant="ghost" size="sm" icon={<GitMerge className="size-4" aria-hidden />} onClick={() => { setDone(undefined); setMerging(k); }}>
                  Merge into…
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindForm({ token, kind, onDone }: { token: string; kind: TeamPlaceKind; onDone: () => void }) {
  const [name, setName] = useState(kind.name);
  const [plural, setPlural] = useState(kind.plural);
  const [icon, setIcon] = useState(kind.icon);
  const [services, setServices] = useState(kind.services);
  const [aliases, setAliases] = useState(kind.aliases);
  const [alias, setAlias] = useState("");
  const [errors, setErrors] = useState<{ name?: string; plural?: string }>({});

  function addAlias() {
    const a = alias.trim().replace(/\s+/g, " ");
    if (a && !aliases.some((x) => x.toLowerCase() === a.toLowerCase())) setAliases([...aliases, a]);
    setAlias("");
  }

  return (
    <TeamForm
      submitLabel="Save kind"
      extra={
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      }
      send={async () => {
        const next = { name: name.trim().length >= 2 ? undefined : "Name the kind.", plural: plural.trim().length >= 2 ? undefined : "What are several called?" };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        await savePlaceKind(token, { key: kind.key, name: name.trim(), plural: plural.trim(), icon, services, aliases });
        onDone();
      }}
    >
      <p className="font-mono text-xs text-ink-muted">Key: {kind.key}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="e.g. “Restroom”" error={errors.name}>
          {(p) => <Input {...p} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Plural" hint="For the filter chip and headings: “Restrooms”" error={errors.plural}>
          {(p) => <Input {...p} maxLength={60} value={plural} onChange={(e) => setPlural(e.target.value)} />}
        </Field>
      </div>
      <Field label="Icon">
        {(p) => (
          <Select {...p} value={icon} onChange={(e) => setIcon(e.target.value as typeof icon)}>
            {PLACE_ICONS.map((i) => (
              <option key={i} value={i}>
                {placeIcons[i].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="space-y-2">
        <Field label="Other names" hint="What people type for it: “CR” for Restroom. Another kind can't use the same name.">
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
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={services} onChange={(e) => setServices(e.target.checked)} />
        A service (restrooms, first aid, police, ATMs): listed under Services on Around
      </label>
    </TeamForm>
  );
}

function MergeForm({ token, kind, others, onDone }: { token: string; kind: TeamPlaceKind; others: TeamPlaceKind[]; onDone: (message: string) => void }) {
  const [into, setInto] = useState("");
  const [error, setError] = useState<string>();
  const target = others.find((k) => k.key === into);
  return (
    <TeamForm
      submitLabel="Merge"
      extra={
        <Button variant="ghost" size="lg" onClick={() => onDone("")}>
          Cancel
        </Button>
      }
      send={async () => {
        setError(target ? undefined : "Pick the kind to keep.");
        if (!target) return false;
        if (!confirm(`Move ${kind.places ?? 0} place(s) from ${kind.name} to ${target.name} and delete ${kind.name}? This can't be undone.`)) return false;
        try {
          const res = await mergePlaceKind(token, kind.key, target.key);
          onDone(`${res.moved} place(s) moved from ${kind.name} to ${target.name}. “${kind.name}” now finds ${target.name} too.`);
        } catch (err) {
          setError(err instanceof TeamApiError ? err.message : "Couldn't merge. Try again.");
          return false;
        }
      }}
    >
      <p className="text-sm text-ink-muted">
        Moves every place of kind <strong>{kind.name}</strong> to the kind you pick, then deletes {kind.name}. Its name and other names are kept on the kind you pick, so searches still find it.
      </p>
      <Field label="Merge into" error={error}>
        {(p) => (
          <Select {...p} value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">Pick a kind…</option>
            {others.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </TeamForm>
  );
}
