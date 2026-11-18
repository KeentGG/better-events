import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INGEST_INTERVAL_MINUTES } from "./control/config";

describe("wrangler.toml cron", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const crons = [...(toml.match(/^crons\s*=\s*\[(.*)\]/m)?.[1].matchAll(/"([^"]+)"/g) ?? [])].map((m) => m[1]);

  it("runs the ingest pass every INGEST_INTERVAL_MINUTES", () => {
    expect(crons).toEqual([`*/${INGEST_INTERVAL_MINUTES} * * * *`]);
  });

  it("uses an interval that divides the hour, so */N really is every N minutes", () => {
    expect(60 % INGEST_INTERVAL_MINUTES).toBe(0);
  });
});
