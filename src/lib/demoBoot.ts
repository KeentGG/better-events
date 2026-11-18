import { pinClock } from "./demoClock";

/** The instant this build is pinned to, or null outside demo mode. */
export const demoNow: string | null = import.meta.env.VITE_DEMO_NOW || null;

// Runs before the app's own imports (see src/main.tsx), so the first render already sees the pinned clock.
if (demoNow) pinClock(demoNow);
