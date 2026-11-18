import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  // prepare: false keeps it compatible with poolers (Neon, Supabase, Hyperdrive).
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
