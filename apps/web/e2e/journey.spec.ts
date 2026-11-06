import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  clearMail,
  createPlannerWithTask,
  expectAccessible,
  mailCount,
  PASSWORD,
  promote,
  scheduleDaily,
  signUp,
  totp,
  verificationLink,
} from "./helpers";

test("public pages load and protected pages redirect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your life your way");
  await expectAccessible(page);
  await page.goto("/app/today");
  await expect(page).toHaveURL(/\/login/);
  await expectAccessible(page);
});

test("visitors can try ticking a list on the landing page without signing up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try it first" }).click();
  const demo = page.getByRole("region", { name: "Go on, tick something off" });
  const boxes = demo.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await boxes.nth(i).click();
  await expect(demo.getByText("3 of 3 done")).toBeVisible();
  await expect(demo.getByText("That's a perfect day")).toBeVisible();
  await expectAccessible(page);
  await demo.getByRole("button", { name: "Start the list again" }).click();
  await expect(demo.getByText("0 of 3 done")).toBeVisible();
  await boxes.first().click();
  await boxes.first().click();
  await expect(boxes.first()).toHaveAttribute("aria-checked", "false");
});

test("the landing page tells the story with real video, and respects reduced motion", async ({
  page,
  browser,
  isMobile,
}) => {
  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  await page.goto("/");
  const hero = page.locator("video").first();
  await expect(hero).toHaveAttribute("src", "/guide/today.mp4");
  await expect.poll(() => hero.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);

  const story = page.getByRole("region", { name: "See how it fits into your life" });
  await expect(story.getByRole("heading", { level: 3 })).toHaveCount(4);
  if (!isMobile) {
    await story
      .getByRole("heading", { name: "Life doesn't wait for signal" })
      .scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 120);
    await expect(story.locator("video:visible")).toHaveAttribute("src", "/guide/offline.mp4");
    await expect(story.getByText(/3 of 4/)).toBeVisible();
  } else {
    await expect(story.locator("video:visible")).toHaveCount(4);
  }

  await page.getByRole("button", { name: "Pause Today page" }).click();
  await expect.poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole("button", { name: "Play Today page" }).click();
  await expect.poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  expect(await overflows(), "page scrolls sideways").toBe(false);

  await page.goto("/how-it-works");
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .or(page.getByRole("heading", { name: "How LifeOS works" }))
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "How LifeOS works" }).getByRole("heading", { level: 3 }),
  ).toHaveCount(7);
  await expectAccessible(page);
  expect(await overflows(), "page scrolls sideways").toBe(false);

  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const quiet = await calm.newPage();
  await quiet.goto("http://localhost:5173/");
  await expect(quiet.getByRole("img", { name: /Ticking off every task/ })).toBeVisible();
  await expect(quiet.locator("video")).toHaveCount(0);
  await calm.close();
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

test("tasks can be ticked and unticked in the planner, with a strike line, in sync with Today", async ({
  page,
}) => {
  await signUp(page);
  await createPlannerWithTask(page, "Errands", "Buy milk");
  await page.getByPlaceholder("Add a task").fill("Water plants");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByLabel("Task title")).toHaveCount(2);
  await scheduleDaily(page, "Water plants");
  await page.getByRole("link", { name: "Done" }).click();

  const milk = page.getByRole("checkbox", { name: /Buy milk/ });
  const plants = page.getByRole("checkbox", { name: /Water plants/ });
  const strike = (name: string) => page.getByRole("link", { name }).getByTestId("strike-line");
  const struck = async (name: string) =>
    strike(name).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

  await expect.poll(() => struck("Buy milk")).toBeLessThan(0.05);
  await expectAccessible(page);

  await milk.click();
  await expect(milk).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => struck("Buy milk")).toBeGreaterThan(0.95);
  await plants.click();
  await expect(plants).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible();
  // Scan the settled page. Anything mid fade-in briefly measures as low contrast.
  await page.waitForTimeout(700);
  await expectAccessible(page);

  await page.reload();
  await expect(milk).toHaveAttribute("aria-checked", "true");

  await page.goto("/app/today");
  await expect(page.getByRole("checkbox", { name: /Buy milk/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.goBack();
  await milk.click();
  await expect(milk).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => struck("Buy milk")).toBeLessThan(0.05);
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible();
  await page.reload();
  await expect(milk).toHaveAttribute("aria-checked", "false");
});

test("sections, custom fields and templates can be renamed and deleted", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signUp(page);
  await page.goto("/app/planners/new");
  await page.getByLabel("Name").fill("Home");
  await page.getByRole("button", { name: "Create and build" }).click();
  await page.getByLabel("New section name").fill("Morning");
  await page.getByRole("button", { name: "Add section" }).click();

  const section = page.getByLabel("Name of section Morning");
  await section.fill("Evening");
  await section.blur();
  await expect(page.getByLabel("Name of section Evening")).toHaveValue("Evening");
  await page.getByLabel("New task in Evening").fill("Lock the door");
  await page.getByRole("region", { name: "Evening" }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Task title")).toHaveValue("Lock the door");

  await page.getByRole("button", { name: "Delete section Evening" }).click();
  await expect(page.getByLabel("Name of section Evening")).toHaveCount(0);
  await expect(page.getByLabel("Task title")).toHaveValue("Lock the door");

  await page.getByLabel("Field name").fill("Effort");
  await page.getByRole("button", { name: "Add field" }).click();
  const field = page.getByLabel("Name of field Effort");
  await field.fill("Energy");
  await field.blur();
  await expect(page.getByLabel("Name of field Energy")).toHaveValue("Energy");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Delete field Energy" }).click();
  await expect(page.getByLabel("Name of field Energy")).toHaveCount(0);

  await page.getByRole("link", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(page.getByText("Saved to your templates")).toBeVisible();
  await page.goto("/app/templates");
  const template = page.getByLabel("Name of template Home");
  await template.fill("My home");
  await template.blur();
  await expect(page.getByLabel("Name of template My home")).toHaveValue("My home");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Delete template My home" }).click();
  await expect(page.getByLabel("Name of template My home")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Career growth" })).toBeVisible();
});

test("goals, metrics and entries can be edited, and a metric in use is protected", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await signUp(page);
  await page.goto("/app/goals");
  await page.getByLabel("New metric").fill("Water");
  await page.getByRole("button", { name: "Add metric" }).click();
  await page.getByLabel("Log Water").fill("9999");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Water logged").first()).toBeVisible();

  await page.getByRole("textbox", { name: "Goal" }).fill("Hydrate");
  await page.getByRole("combobox", { name: "Metric" }).selectOption({ label: "Water" });
  await page.getByLabel("Target", { exact: true }).fill("20000");
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByText("9999 of 20000")).toBeVisible();

  await page.getByRole("button", { name: "Edit Hydrate" }).click();
  await page.getByRole("dialog").getByLabel("Target").fill("10000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByText("9999 of 10000")).toBeVisible();

  await page.getByRole("button", { name: "Edit metric Water" }).click();
  const entry = page.getByRole("dialog").getByLabel(/Entry from/);
  await expect(entry).toHaveValue("9999");
  await expectAccessible(page);
  await entry.fill("500");
  await entry.blur();
  await expect(entry).toHaveValue("500");

  await page.getByRole("button", { name: "Delete metric" }).click();
  await expect(page.getByText("Remove the goals and charts using this metric first")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("500 of 10000")).toBeVisible();

  await page.getByRole("button", { name: "Edit metric Water" }).click();
  await page.getByRole("button", { name: /Delete entry from/ }).click();
  await expect(page.getByText("No entries yet.")).toBeVisible();
});

test("task fields follow the task type, and text tasks take a note", async ({ page }) => {
  await signUp(page);
  await createPlannerWithTask(page, "Journal", "Reflect");
  await scheduleDaily(page, "Reflect");
  await page.getByRole("link", { name: "Done" }).click();
  await page.getByRole("link", { name: "Reflect" }).click();

  const dialog = page.getByRole("dialog");
  const type = dialog.getByLabel("Type");
  await expect(dialog.getByLabel("Target")).toHaveCount(0);
  await expect(dialog.getByLabel("Unit")).toHaveCount(0);

  await type.selectOption("quantity");
  await expect(dialog.getByLabel("Target", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Unit")).toBeVisible();
  await type.selectOption("duration");
  await expect(dialog.getByLabel("Target (minutes)")).toBeVisible();
  await expect(dialog.getByLabel("Unit")).toHaveCount(0);
  await type.selectOption("rating");
  await expect(dialog.getByText("Rated from 1 to 10")).toBeVisible();
  await expect(dialog.getByLabel(/Target/)).toHaveCount(0);

  await type.selectOption("text");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto("/app/today");
  await page.getByLabel("Note for Reflect").fill("A calm day");
  await expectAccessible(page);
  await page.getByRole("checkbox", { name: /Reflect/ }).click();
  await expect(page.getByText("A calm day")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText("A calm day")).toBeVisible();
});

test("a new planner keeps its default colour, and a chosen one", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/planners/new");
  await expect(page.getByLabel("Color")).toHaveValue("#1fad82");
  await page.getByLabel("Name").fill("Green");
  await page.getByRole("button", { name: "Create and build" }).click();
  await expect(page.getByRole("heading", { name: "Edit Green" })).toBeVisible();
  await expect(page.getByLabel("Color")).toHaveValue("#1fad82");

  await page.goto("/app/planners/new");
  await page.getByLabel("Name").fill("Purple");
  await page.getByLabel("Color").fill("#7468e8");
  await page.getByRole("button", { name: "Create and build" }).click();
  await expect(page.getByRole("heading", { name: "Edit Purple" })).toBeVisible();
  await expect(page.getByLabel("Color")).toHaveValue("#7468e8");
});

test.describe("voice input", () => {
  // Browsers have no real microphone in tests, so this stands in for the speech service.
  const fakeSpeech = () => {
    class Fake {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { speech: Fake }).speech = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
      say(text: string) {
        this.onresult?.({ resultIndex: 0, results: [[{ transcript: text }]] });
      }
      fail(error: string) {
        this.onerror?.({ error });
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: Fake, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: Fake, configurable: true });
  };
  const say = (page: Page, text: string) =>
    page.evaluate(
      (t) =>
        (
          window as unknown as { speech: { say: (x: string) => void; stop: () => void } }
        ).speech.say(t),
      text,
    );
  const end = (page: Page) =>
    page.evaluate(() => (window as unknown as { speech: { stop: () => void } }).speech.stop());

  test("speaks a task into the planner and Today, with a one-time notice", async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    await signUp(page);
    await createPlannerWithTask(page, "Voice", "First task");
    await page.getByRole("button", { name: "Speak a task for this planner" }).click();
    await expect(page.getByRole("heading", { name: "Use your voice" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();
    await say(page, "Call the bank");
    const field = page.getByLabel("New task in planner");
    await expect(field).toHaveValue("Call the bank");
    await end(page);
    await expect(page.getByRole("button", { name: "Speak a task for this planner" })).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(page.getByLabel("Task title").last()).toHaveValue("Call the bank");

    await page.goto("/app/today");
    const quick = page.getByLabel("New task for today");
    await quick.fill("Buy");
    await page.getByRole("button", { name: "Speak a task" }).click();
    await expect(page.getByRole("heading", { name: "Use your voice" })).toHaveCount(0);
    await say(page, "fresh milk");
    await expect(quick).toHaveValue("Buy fresh milk");
    await end(page);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("checkbox", { name: /Buy fresh milk/ })).toBeVisible();
  });

  test("explains a blocked microphone and leaves typing available", async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    await page.addInitScript(() => localStorage.setItem("lifeos.voiceNoticeSeen", "true"));
    await signUp(page);
    await createPlannerWithTask(page, "Blocked", "Task");
    await page.goto("/app/today");
    await page.getByRole("button", { name: "Speak a task" }).click();
    await page.evaluate(() =>
      (window as unknown as { speech: { fail: (e: string) => void } }).speech.fail("not-allowed"),
    );
    await expect(page.getByText("Allow microphone access")).toBeVisible();
    await expect(page.getByRole("button", { name: "Speak a task" })).toBeVisible();
    await page.getByLabel("New task for today").fill("Typed instead");
    await expect(page.getByLabel("New task for today")).toHaveValue("Typed instead");
  });

  test("hides the mic where the browser has no speech support", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "webkitSpeechRecognition", {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    });
    await signUp(page);
    await createPlannerWithTask(page, "No voice", "Task");
    await expect(page.getByRole("button", { name: /Speak a task/ })).toHaveCount(0);
  });
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

test.describe("email verification", () => {
  const start = async (page: Page) => {
    const email = `e2e+${randomUUID().slice(0, 8)}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    return email;
  };
  const login = async (page: Page, email: string) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
  };

  test("signup shows the address, tips and a resend cooldown", async ({ page }) => {
    const email = await start(page);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Check your spam or junk folder.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resend email in \d+s/ })).toBeDisabled();
    await expectAccessible(page);
  });

  test("logging in before verifying leads to the screen, and resend sends a new email", async ({
    page,
  }) => {
    const email = await start(page);
    await expect.poll(() => mailCount(email)).toBe(1);
    await page.waitForTimeout(1500); // Local Auth allows one email per address per second.
    await login(page, email);
    await expect(page.getByText("Your account isn't active yet")).toBeVisible();
    await expect(page).toHaveURL(/check-email/);
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("status")).toContainText("a new email is on its way");
    await expect(page.getByRole("button", { name: /Resend email in \d+s/ })).toBeDisabled();
    await expect.poll(() => mailCount(email)).toBe(2);
  });

  test("the emailed link verifies the account, and login then works", async ({ page }) => {
    const email = await start(page);
    await page.goto(await verificationLink(email));
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.getByRole("link", { name: "Continue to LifeOS" }).click();
    await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
    await page.goto("/app/settings");
    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await login(page, email);
    await expect(page).toHaveURL(/\/app/);
  });

  test("a tab left on the verify screen moves on after confirming in another tab", async ({
    page,
    context,
  }) => {
    const email = await start(page);
    const other = await context.newPage();
    await other.goto(await verificationLink(email));
    await expect(other.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await expect(page).toHaveURL(/\/app/);
  });

  test("an expired link offers a new one, even without a remembered address", async ({ page }) => {
    await page.goto("/verify-email#error=access_denied&error_description=expired");
    await expect(page.getByRole("heading", { name: /invalid or has expired/ })).toBeVisible();
    await page.getByRole("link", { name: "Send a new link" }).click();
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("status")).toContainText("valid email");
    await page.getByLabel("Email").fill(`nobody+${randomUUID().slice(0, 8)}@example.com`);
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("status")).toContainText("a new email is on its way");
  });
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

  // Codes roll every 30 seconds, so start early in a window rather than racing its end.
  const intoWindow = (Date.now() / 1000) % 30;
  if (intoWindow > 20) await page.waitForTimeout((31 - intoWindow) * 1000);
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
