import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIENCE, createHarness, ISSUER } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

const me = (token: string) => request(h.app).get("/api/v1/me").set("Authorization", `Bearer ${token}`);

describe("health", () => {
  it("reports live and ready without authentication", async () => {
    expect((await request(h.app).get("/health/live")).status).toBe(200);
    expect((await request(h.app).get("/health/ready")).status).toBe(200);
  });
});

describe("token verification", () => {
  it("accepts a valid token and creates the profile with preferences", async () => {
    const u = await h.user();
    const res = await u.get("/api/v1/me");
    expect(res.status).toBe(200);
    expect(res.body.data.authUserId).toBe(u.id);
    expect(res.body.data.preferences.celebrations).toBe(true);
    expect(res.body.error).toBeNull();
  });
  it("survives concurrent first requests from a new user", async () => {
    const u = await h.user();
    const results = await Promise.all(Array.from({ length: 8 }, () => u.get("/api/v1/me")));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
  });
  it("rejects a missing token", async () => {
    const res = await request(h.app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
  it("rejects wrong issuer, wrong audience and expired tokens", async () => {
    const id = randomUUID();
    expect((await me(await h.sign({}, id, { iss: "https://evil.test" }))).status).toBe(401);
    expect((await me(await h.sign({}, id, { aud: "other" }))).status).toBe(401);
    expect((await me(await h.sign({}, id, { exp: "-1m" }))).status).toBe(401);
  });
  it("rejects a token signed by a different key", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(randomUUID())
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);
    expect((await me(forged)).status).toBe(401);
  });
  it("rejects an unsigned alg=none token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const payload = { sub: randomUUID(), iss: ISSUER, aud: AUDIENCE, role: "authenticated", exp: 9999999999 };
    expect((await me(`${b64({ alg: "none" })}.${b64(payload)}.`)).status).toBe(401);
  });
  it("rejects service-role tokens used as a user session", async () => {
    expect((await me(await h.sign({ role: "service_role" }, randomUUID()))).status).toBe(401);
  });
  it("blocks a user whose access was revoked", async () => {
    const u = await h.user();
    await u.get("/api/v1/me");
    await h.prisma.profile.update({ where: { authUserId: u.id }, data: { accessRevokedAt: new Date() } });
    const res = await u.get("/api/v1/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("access_revoked");
  });
  it("ignores client-supplied identity in the body", async () => {
    const [a, b] = [await h.user(), await h.user()];
    await b.get("/api/v1/me");
    const res = await a.post("/api/v1/categories", { name: "Mine", userId: b.id });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(a.id);
  });
});

describe("categories", () => {
  it("creates, lists, updates and archives", async () => {
    const u = await h.user();
    const created = await u.post("/api/v1/categories", { name: "Health & Fitness", color: "#1FAD82" });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe("health-fitness");
    const id = created.body.data.id;
    expect((await u.patch(`/api/v1/categories/${id}`, { name: "Health" })).body.data.name).toBe("Health");
    expect((await u.get("/api/v1/categories")).body.data).toHaveLength(1);
    expect((await u.delete(`/api/v1/categories/${id}`)).status).toBe(204);
    expect((await u.get("/api/v1/categories")).body.data).toHaveLength(0);
  });
  it("gives duplicate names unique slugs", async () => {
    const u = await h.user();
    await u.post("/api/v1/categories", { name: "Work" });
    expect((await u.post("/api/v1/categories", { name: "Work" })).body.data.slug).toBe("work-2");
  });
  it("returns field-level validation errors", async () => {
    const u = await h.user();
    const res = await u.post("/api/v1/categories", { name: "", color: "red" });
    expect(res.status).toBe(422);
    expect(res.body.error.errors.map((e: { path: string }) => e.path).sort()).toEqual(["color", "name"]);
  });
  it("rejects cycles and excess depth", async () => {
    const u = await h.user();
    const make = async (name: string, parentId?: string) =>
      (await u.post("/api/v1/categories", { name, parentId })).body.data?.id;
    const a = await make("A");
    const b = await make("B", a);
    expect((await u.patch(`/api/v1/categories/${a}`, { parentId: b })).body.error.code).toBe("cycle");
    const c = await make("C", b);
    expect((await u.post("/api/v1/categories", { name: "D", parentId: c })).body.error.code).toBe("too_deep");
  });
  it("records an audit event", async () => {
    const u = await h.user();
    const { body } = await u.post("/api/v1/categories", { name: "Audited" });
    const events = await h.prisma.auditEvent.findMany({ where: { entityId: body.data.id } });
    expect(events.map((e) => e.action)).toEqual(["category.create"]);
  });
  it("hides another user's categories on every route", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const id = (await owner.post("/api/v1/categories", { name: "Private" })).body.data.id;
    expect((await other.get("/api/v1/categories")).body.data).toHaveLength(0);
    expect((await other.patch(`/api/v1/categories/${id}`, { name: "Stolen" })).status).toBe(404);
    expect((await other.delete(`/api/v1/categories/${id}`)).status).toBe(404);
    expect((await other.post("/api/v1/categories/reorder", { orderedIds: [id] })).status).toBe(404);
    expect((await other.post("/api/v1/categories", { name: "Child", parentId: id })).status).toBe(404);
    expect((await owner.get("/api/v1/categories")).body.data[0].name).toBe("Private");
  });
});

describe("errors", () => {
  it("never leaks internals on bad JSON or unknown routes", async () => {
    const u = await h.user();
    const bad = await request(h.app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${u.token}`)
      .set("content-type", "application/json")
      .send("{not json");
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/stack|node_modules|SyntaxError/);
    expect((await u.get("/api/v1/nope")).status).toBe(404);
  });
});
