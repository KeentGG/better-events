import { describe, expect, it, vi } from "vitest";
import app from "../app";

// A team token signs in without a database; everything else goes through the real lookup.
vi.mock("../shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared")>();
  return {
    ...actual,
    resolveActor: (...args: Parameters<typeof actual.resolveActor>) =>
      args[1] === "Bearer team-token" ? Promise.resolve({ kind: "collector", id: "collector-juan", name: "Juan" }) : actual.resolveActor(...args),
    touch: () => Promise.resolve(),
  };
});

// postgres-js connects lazily, so these paths run without a database: none of them query it.
const env = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", ADMIN_TOKEN: "admin-secret" };
const request = (method: string, path: string, token?: string) =>
  app.request(path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} }, env);
const get = (path: string, token?: string) => request("GET", path, token);

const ITEM = "00000000-0000-4000-8000-000000000000";

describe("/api/control auth", () => {
  it("rejects a request with no token", async () => {
    const res = await get("/api/control/board");
    expect(res.status).toBe(401);
  });

  it("guards the curator inbox with the same sign-in", async () => {
    expect((await get("/api/control/inbox")).status).toBe(401);
    expect((await request("POST", `/api/control/items/${ITEM}/actions`)).status).toBe(401);
  });

  it("no longer serves the old ADMIN_TOKEN-only inbox routes", async () => {
    expect((await get("/api/admin/inbox", "admin-secret")).status).toBe(404);
  });

  it("signs ADMIN_TOKEN in as Admin, with the admin role, never cached", async () => {
    const res = await get("/api/control/me", "admin-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Admin", role: "admin" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("signs a team member in with the collector role", async () => {
    const res = await get("/api/control/me", "team-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Juan", role: "collector" });
  });

  it.each([
    ["POST", `/api/control/items/${ITEM}/actions`],
    ["GET", "/api/control/groups/traffic"],
    ["PATCH", "/api/control/groups/traffic"],
    ["POST", "/api/control/fetchers/open-meteo/retry"],
    ["GET", "/api/control/inbox"],
    ["POST", "/api/control/posts"],
    ["GET", "/api/control/stream?filter=verify"],
    ["GET", "/api/control/stream?filter=flagged"],
    ["GET", "/api/control/graph?filter=verify"],
  ])("refuses a team member %s %s", async (method, path) => {
    expect((await request(method, path, "team-token")).status).toBe(403);
  });

  it("rejects an unknown intake filter", async () => {
    expect((await get("/api/control/stream?filter=everything", "team-token")).status).toBe(400);
  });

  it("rejects an unknown category on a tile's live list", async () => {
    expect((await get("/api/team/recent?category=promo&category=everything", "team-token")).status).toBe(400);
  });
});
