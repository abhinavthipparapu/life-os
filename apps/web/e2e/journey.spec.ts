import { expect, test } from "@playwright/test";
import {
  clearMail,
  createPlannerWithTask,
  expectAccessible,
  PASSWORD,
  promote,
  scheduleDaily,
  signUp,
  totp,
  verificationLink,
} from "./helpers";

test("public pages load and protected pages redirect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A planner shaped");
  await expectAccessible(page);
  await page.goto("/app/today");
  await expect(page).toHaveURL(/\/login/);
  await expectAccessible(page);
});

test("wrong password shows one generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("invalid auth links show a recovery state", async ({ page }) => {
  await page.goto("/verify-email");
  await expect(page.getByRole("heading", { name: /invalid or has expired/ })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});

test("new user plans, completes, undoes and sees progress", async ({ page }) => {
  await signUp(page);
  await expectAccessible(page);
  await createPlannerWithTask(page, "Morning", "Stretch");
  await scheduleDaily(page, "Stretch");

  await page.goto("/app/today");
  const box = page.getByRole("checkbox", { name: /Stretch/ });
  await expect(box).toHaveAttribute("aria-checked", "false");
  await expectAccessible(page);
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("1 of 1")).toBeVisible();
  await expect(page.getByText("Everything done for today")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(box).toHaveAttribute("aria-checked", "false");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("First step")).toBeVisible();
});

test("template install gives an editable copy", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/templates");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Career growth" })
    .getByRole("button", { name: "Preview" })
    .click();
  await expect(page.getByRole("dialog").getByText("Deep work block")).toBeVisible();
  await page.getByRole("button", { name: "Use this template" }).click();
  await expect(page.getByRole("heading", { name: "Career growth" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Deep work block" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Write down the day's priority" })).toBeVisible();
});

test("AI draft changes nothing until approved", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/ai");
  await page.getByLabel("What do you want to plan?").fill("A study plan for my exam");
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await expect(page.getByText("Preview only. Nothing has been created.")).toBeVisible();
  await page.goto("/app/planners");
  await expect(page.getByText("No planners yet")).toBeVisible();

  await page.goto("/app/ai");
  await page.getByLabel("What do you want to plan?").fill("A study plan for my exam");
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("button", { name: "Review and apply" }).click();
  await page.getByRole("button", { name: "Create planner" }).click();
  await expect(page.getByRole("heading", { name: "A study plan for my exam" })).toBeVisible();
});

test("dashboard builder saves a chart with a live preview and data table", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/dashboards");
  await page.getByRole("button", { name: "New dashboard" }).first().click();
  await expect(page.getByRole("heading", { name: "Edit dashboard" })).toBeVisible();
  await page.getByLabel("Title").fill("My adherence");
  await expect(page.getByText("Live preview")).toBeVisible();
  await page.getByRole("button", { name: "Add to dashboard" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("My adherence")).toBeVisible();
  await expectAccessible(page);
});

test("users cannot see each other's data in the browser", async ({ page, browser }) => {
  await signUp(page);
  await createPlannerWithTask(page, "Private plan", "Secret task");
  const url = page.url().replace("/edit", "");
  const other = await browser.newContext();
  const second = await other.newPage();
  await signUp(second);
  await second.goto("/app/planners");
  await expect(second.getByText("No planners yet")).toBeVisible();
  await second.goto(url);
  await expect(second.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(second.getByText("Secret task")).toHaveCount(0);
  await other.close();
});

test("offline completion queues, labels and syncs on reconnect", async ({ page, context }) => {
  await signUp(page);
  await createPlannerWithTask(page, "Offline plan", "Walk");
  await scheduleDaily(page, "Walk");
  await page.goto("/app/today");
  const box = page.getByRole("checkbox", { name: /Walk/ });
  await expect(box).toBeVisible();

  await context.setOffline(true);
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Pending sync", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline, 1 pending sync/ })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Pending sync", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Walk/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("logout wipes cached private data", async ({ page }) => {
  await signUp(page);
  await createPlannerWithTask(page, "Wipe plan", "Read");
  await scheduleDaily(page, "Read");
  await page.goto("/app/today");
  await expect(page.getByRole("checkbox", { name: /Read/ })).toBeVisible();
  const count = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open("lifeos");
          open.onsuccess = () => {
            const req = open.result.transaction("occurrences").objectStore("occurrences").count();
            req.onsuccess = () => {
              open.result.close();
              resolve(req.result);
            };
          };
        }),
    );
  expect(await count()).toBeGreaterThan(0);
  await page.goto("/app/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await count()).toBe(0);
});

test("account deletion needs the password and removes the login", async ({ page, request }) => {
  const email = await signUp(page);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Your password").fill("wrong-password-here");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("dialog").getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible();
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("dialog").getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/");

  // The worker removes the login shortly after. Wait for Auth itself to refuse it, then check the UI.
  await expect
    .poll(
      async () =>
        (
          await request.post("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
            data: { email, password: PASSWORD },
          })
        ).status(),
      { timeout: 30_000 },
    )
    .toBe(400);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("a token from a deleted account signs the browser out instead of reviving it", async ({
  page,
  request,
}) => {
  await signUp(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))!;
    return (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
  });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("dialog").getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/");
  await expect
    .poll(
      async () =>
        (
          await request.get("http://localhost:4000/api/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status(),
      { timeout: 30_000 },
    )
    .toBe(403);
});

test("forgotten password can be reset through the emailed link", async ({ page }) => {
  const email = await signUp(page);
  await page.goto("/app/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await clearMail(email);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/reset-password/);
  const updated = `New-${PASSWORD}`;
  await page.getByLabel("New password").fill(updated);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/app/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(updated);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
});

test("admin area is hidden from users, and needs MFA for admins", async ({ page }) => {
  const email = await signUp(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  promote(email);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
  await expect(page.getByText("Audit", { exact: true })).toHaveCount(0);
  await expectAccessible(page);
  const secret = await page.getByTestId("mfa-secret").innerText();

  await page.getByLabel("Six digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toContainText("didn't work");

  await page.getByLabel("Six digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("tab", { name: "Audit" })).toBeVisible();
  await page.getByRole("tab", { name: "Jobs" }).click();
  await expect(page.getByText("Pending outbox events")).toBeVisible();
  await expectAccessible(page);
});

for (const path of [
  "today",
  "calendar",
  "categories",
  "planners",
  "planners/new",
  "templates",
  "goals",
  "dashboards",
  "analytics",
  "ai",
  "notifications",
  "settings",
]) {
  test(`loads with no errors or accessibility violations: /app/${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signUp(page);
    await page.goto(`/app/${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(400);
    await expectAccessible(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, "page scrolls sideways").toBe(false);
    expect(errors).toEqual([]);
  });
}
