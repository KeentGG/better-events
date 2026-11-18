import { pinClock } from "../src/lib/demoClock";

// Runs before ./app (the first import in server/node.ts), so the Hono routes and everything the API
// reads already see the pinned instant.
const pinned = process.env.DEMO_NOW;
if (pinned) pinClock(pinned);
