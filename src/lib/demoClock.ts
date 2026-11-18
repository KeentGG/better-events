/** The real clock, captured before any pin, so pinning twice still starts from the native Date. */
const NativeDate = globalThis.Date;

type DateArgs =
  | []
  | [value: number | string]
  | [value: number | string | Date]
  | [year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number];

/**
 * Freezes the process clock at `iso` for demo builds. `new Date()` and `Date.now()` return that instant
 * for the rest of the process, and it never ticks. Every other constructor form, `Date.parse` and
 * `Date.UTC` keep their normal behaviour, so explicit dates still read correctly.
 */
export function pinClock(iso: string): void {
  const pinned = NativeDate.parse(iso);
  if (Number.isNaN(pinned)) throw new RangeError(`pinClock: ${JSON.stringify(iso)} is not a valid date`);

  class PinnedDate extends NativeDate {
    constructor(...args: DateArgs) {
      if (args.length === 0) super(pinned);
      else if (args.length === 1) super(args[0]);
      // Forward exactly the arguments given: an explicit undefined would make a valid date invalid.
      else super(...(args as [number, number]));
    }

    static now() {
      return pinned;
    }
  }

  globalThis.Date = PinnedDate as unknown as DateConstructor;
}

/**
 * True when `iso` falls at or before the pinned instant. Demo feeds drop posts published after the pin,
 * so the site never shows anything from after the frozen moment.
 */
export function atOrBefore(iso: string, pin: string): boolean {
  return NativeDate.parse(iso) <= NativeDate.parse(pin);
}
