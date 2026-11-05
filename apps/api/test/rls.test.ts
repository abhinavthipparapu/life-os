import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

it("has row level security on every table, so Supabase's public API cannot read them", async () => {
  const open = await h.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`;
  expect(open.map((t) => t.tablename)).toEqual([]);
});
