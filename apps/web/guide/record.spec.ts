import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PASSWORD, verificationLink } from "../e2e/helpers";

const OUT = "/tmp/lifeos-guide";
const STATE = `${OUT}/state.json`;
const trims: Record<string, number> = {};
let started = 0;

test.describe.configure({ mode: "serial" });

// A visible pointer, since browser recordings don't include one.
function cursor() {
  const add = () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(116,104,232,.35);border:2px solid #7468e8;z-index:2147483647;pointer-events:none;transition:transform .12s;transform:translate(560px,350px)";
    document.documentElement.append(dot);
    let x = 560;
    let y = 350;
    const place = (s: number) => (dot.style.transform = `translate(${x}px,${y}px) scale(${s})`);
    addEventListener(
      "mousemove",
      (e: MouseEvent) => {
        x = e.clientX;
        y = e.clientY;
        place(1);
      },
      true,
    );
    addEventListener("mousedown", () => place(0.7), true);
    addEventListener("mouseup", () => place(1), true);
  };
  if (document.documentElement) add();
  else addEventListener("DOMContentLoaded", add);
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function press(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
  await pause(page, 220);
  await target.click();
  await pause(page, 350);
}

async function type(page: Page, target: Locator, text: string) {
  await press(page, target);
  await target.pressSequentially(text, { delay: 38 });
  await pause(page, 250);
}

/** The clip starts here, so page loading is trimmed away. */
const roll = (name: string) => {
  trims[name] = (Date.now() - started) / 1000;
};

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ recordVideo: undefined });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@lifeos.local");
  await page.getByLabel("Password").fill(process.env.SEED_DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  await context.storageState({ path: STATE });
  await context.close();
});

test.beforeEach(async ({ page }) => {
  started = Date.now();
  await page.addInitScript(cursor);
});

test.afterEach(async ({ page }, info) => {
  const video = page.video();
  await page.close();
  await video?.saveAs(`${OUT}/${info.title}.webm`);
  writeFileSync(`${OUT}/trims.json`, JSON.stringify(trims));
});

test.describe("new visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signup", async ({ page }) => {
    const email = `alex.${Date.now() % 100000}@example.com`;
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await pause(page, 400);
    roll("signup");
    await type(page, page.getByLabel("Email"), email);
    await type(page, page.getByLabel("Password"), PASSWORD.slice(0, 14));
    await press(page, page.getByRole("button", { name: "Create account" }));
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await pause(page, 2200);
    await page.goto(await verificationLink(email));
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await pause(page, 1400);
    await press(page, page.getByRole("link", { name: "Continue to LifeOS" }));
    await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
    await pause(page, 1800);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: STATE });

  test("today", async ({ page }) => {
    await page.goto("/app/today");
    await expect(page.getByRole("checkbox", { name: /Read/ })).toBeVisible();
    await pause(page, 500);
    roll("today");
    await press(page, page.getByRole("checkbox", { name: /Stretch/ }));
    await pause(page, 900);
    await press(page, page.getByRole("checkbox", { name: /Read/ }));
    await pause(page, 900);
    await press(page, page.getByRole("checkbox", { name: /Drink/ }));
    await expect(page.getByText("Everything done for today")).toBeVisible();
    await pause(page, 3000);
  });

  test("offline", async ({ page, context }) => {
    await page.goto("/app/today");
    const box = page.getByRole("checkbox", { name: /Stretch/ });
    await expect(box).toHaveAttribute("aria-checked", "true");
    // Reopened before the clip starts, because the Today clip finished the whole list.
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible();
    await pause(page, 900);
    roll("offline");
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: /Sync status: Offline/ })).toBeVisible();
    await pause(page, 1200);
    await press(page, box);
    await expect(page.getByText("Pending sync", { exact: true })).toBeVisible();
    await pause(page, 2200);
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible({
      timeout: 15_000,
    });
    await pause(page, 2200);
  });

  test("voice", async ({ page }) => {
    // Recordings have no microphone, so speech is simulated. The screens are the real app.
    await page.addInitScript(() => {
      class Fake {
        onresult: ((e: unknown) => void) | null = null;
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
      }
      Object.defineProperty(window, "SpeechRecognition", { value: Fake, configurable: true });
    });
    await page.goto("/app/today");
    await expect(page.getByRole("button", { name: "Speak a task" })).toBeVisible();
    await pause(page, 500);
    roll("voice");
    await press(page, page.getByRole("button", { name: "Speak a task" }));
    await expect(page.getByRole("heading", { name: "Use your voice" })).toBeVisible();
    await pause(page, 1500);
    await press(page, page.getByRole("button", { name: "Continue" }));
    await pause(page, 500);
    for (const words of ["Call", "Call the", "Call the bank", "Call the bank tomorrow"]) {
      await page.evaluate(
        (t) => (window as unknown as { speech: { say: (x: string) => void } }).speech.say(t),
        words,
      );
      await pause(page, 380);
    }
    await page.evaluate(() =>
      (window as unknown as { speech: { stop: () => void } }).speech.stop(),
    );
    await pause(page, 500);
    await press(page, page.getByRole("button", { name: "Add", exact: true }));
    await expect(page.getByRole("checkbox", { name: /Call the bank tomorrow/ })).toBeVisible();
    await pause(page, 2200);
  });

  test("build", async ({ page }) => {
    await page.goto("/app/planners/new");
    await expect(page.getByLabel("Name")).toBeVisible();
    await pause(page, 400);
    roll("build");
    await type(page, page.getByLabel("Name"), "Weekend reset");
    await press(page, page.getByRole("button", { name: "Create and build" }));
    await expect(page.getByRole("heading", { name: "Edit Weekend reset" })).toBeVisible();
    await pause(page, 500);
    await type(page, page.getByPlaceholder("Add a task"), "Plan next week");
    await press(page, page.getByRole("button", { name: "Add", exact: true }).first());
    await expect(page.getByLabel("Task title")).toHaveValue("Plan next week");
    await press(page, page.getByRole("button", { name: /Schedule Plan next week/ }));
    await page.getByLabel("Repeats").selectOption("weekly");
    await pause(page, 500);
    await press(page, page.getByRole("button", { name: "SA", exact: true }));
    await press(page, page.getByRole("button", { name: "Save schedule" }));
    await expect(page.getByRole("dialog")).toBeHidden();
    await pause(page, 500);
    await press(page, page.getByRole("link", { name: "Done" }));
    await expect(page.getByRole("heading", { name: "Weekend reset" })).toBeVisible();
    await pause(page, 1800);
  });

  test("template", async ({ page }) => {
    await page.goto("/app/templates");
    await expect(page.getByRole("heading", { name: "Career growth" })).toBeVisible();
    await pause(page, 500);
    roll("template");
    await press(
      page,
      page
        .getByRole("listitem")
        .filter({ hasText: "Career growth" })
        .getByRole("button", { name: "Preview" }),
    );
    await expect(page.getByRole("dialog").getByText("Deep work block")).toBeVisible();
    await pause(page, 1800);
    await press(page, page.getByRole("button", { name: "Use this template" }));
    await expect(page.getByRole("heading", { name: "Career growth" })).toBeVisible();
    await pause(page, 2000);
  });

  test("ai", async ({ page }) => {
    await page.goto("/app/ai");
    await expect(page.getByLabel("What do you want to plan?")).toBeVisible();
    // The demo notice is for this local stack, and would confuse a landing page visitor.
    await page.getByText("Demo mode:").evaluate((el) => el.remove());
    await pause(page, 400);
    roll("ai");
    await type(page, page.getByLabel("What do you want to plan?"), "A 12 week study plan");
    await press(page, page.getByRole("button", { name: "Draft a plan" }));
    await expect(page.getByText("Preview only. Nothing has been created.")).toBeVisible();
    await pause(page, 1800);
    await press(page, page.getByRole("button", { name: "Review and apply" }));
    await pause(page, 1000);
    await press(page, page.getByRole("button", { name: "Create planner" }));
    await expect(page.getByRole("heading", { name: "A 12 week study plan" })).toBeVisible();
    await pause(page, 1800);
  });

  test("insights", async ({ page }) => {
    await page.goto("/app/analytics");
    await expect(page.getByRole("figure", { name: "Adherence over time" })).toBeVisible();
    await pause(page, 1400);
    roll("insights");
    await pause(page, 1000);
    await page.mouse.move(480, 320, { steps: 8 });
    await page.mouse.wheel(0, 460);
    await pause(page, 1800);
    await page.mouse.wheel(0, 500);
    await pause(page, 1800);
    await page.goto("/app/dashboards");
    await expect(page.getByRole("heading", { name: "Dashboards" })).toBeVisible();
    await pause(page, 2400);
  });
});
