import { createHash, randomBytes } from "node:crypto";
import { createDb } from "./client";
import { staff } from "./schema";

// Usage: npm run staff:add -- "Maria"
// Prints the mission control token once; only its hash is stored.
const name = process.argv[2];
const url = process.env.DATABASE_URL;
if (!name) throw new Error('Usage: npm run staff:add -- "<name>"');
if (!url) throw new Error("DATABASE_URL is not set");

const token = randomBytes(32).toString("base64url");
const db = createDb(url);
await db.insert(staff).values({ name, tokenHash: createHash("sha256").update(token).digest("hex") });
console.log(`Staff "${name}" added. Token (shown once):\n${token}`);
await db.$client.end();
