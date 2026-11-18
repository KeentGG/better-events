import { sql } from "drizzle-orm";
import { items } from "../db/schema";

/**
 * An item someone entered on the team desk, rather than one the classifier made from a raw post. A
 * team member or a staff member entered it (`collector_id` or `staff_id`; the schema allows one).
 * Desk entries show as "Verified by staff" and are what `/api/team/items/:id` may hide and unhide.
 */
export const isDeskEntry = sql<boolean>`(${items.collectorId} is not null or ${items.staffId} is not null)`;
