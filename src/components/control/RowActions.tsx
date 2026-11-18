import { BadgeCheck, Eye, EyeOff } from "lucide-react";
import type { RowAction } from "../../lib/inbox";
import type { ItemAction } from "../../lib/types";
import { Button } from "../../ui";

const label: Record<RowAction, string> = { verify: "Verify", hide: "Hide", unhide: "Unhide" };
const icon = { verify: BadgeCheck, hide: EyeOff, unhide: Eye };

/**
 * Verify, Hide and Unhide buttons for an item, from `availableActions`. `busy` is the action being sent, if any.
 * `labels` renames a button where the context words it differently.
 */
export function RowActions({
  actions,
  busy,
  disabled,
  labels,
  onAct,
}: {
  actions: RowAction[];
  busy: ItemAction | undefined;
  disabled?: boolean;
  labels?: Partial<Record<RowAction, string>>;
  onAct: (action: RowAction) => void;
}) {
  return actions.map((action) => {
    const Icon = icon[action];
    return (
      <Button
        key={action}
        size="sm"
        variant={action === "verify" ? "secondary" : "ghost"}
        disabled={disabled || (busy !== undefined && busy !== action)}
        loading={busy === action}
        icon={<Icon className="size-4" aria-hidden />}
        onClick={() => onAct(action)}
      >
        {labels?.[action] ?? label[action]}
      </Button>
    );
  });
}
