import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:58025/api/v1";

export async function verificationLink(email: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const list = (await (
      await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as { messages: { ID: string }[] };
    const id = list.messages[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const match = /https?:\/\/[^"\s]+verify[^"\s]*/.exec(message.HTML || message.Text);
      if (match) return match[0].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${email}`);
}

export const PASSWORD = `Pw-${randomUUID()}`;

/** Signs up through the real UI and follows the real emailed link. */
export async function signUp(page: Page) {
  const email = `e2e+${randomUUID().slice(0, 8)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  return email;
}

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(" ")})`,
  );
  expect(summary).toEqual([]);
}

export async function createPlannerWithTask(page: Page, name: string, task: string) {
  await page.goto("/app/planners/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create and build" }).click();
  await expect(page.getByRole("heading", { name: `Edit ${name}` })).toBeVisible();
  await page.getByPlaceholder("Add a task").fill(task);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByLabel("Task title")).toHaveValue(task);
}

export async function scheduleDaily(page: Page, task: string) {
  await page.getByRole("button", { name: `Schedule ${task}` }).click();
  await page.getByLabel("Repeats").selectOption("daily");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

export async function clearMail(email: string) {
  await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}`, {
    method: "DELETE",
  });
}

/** Admin roles are granted only in the database, never through the API. */
export function promote(email: string) {
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "lifeos",
      "-d",
      "lifeos",
      "-c",
      `UPDATE profiles SET role = 'admin' WHERE email = '${email}'`,
    ],
    { cwd: "../..", stdio: "pipe" },
  );
}

/** RFC 6238 code, so the test uses the same factor a real authenticator app would. */
export function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
