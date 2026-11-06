// Idempotent. Starter templates and the achievement catalog run in every environment.
// Demo users are created only when SEED_DEMO_USERS=true, which should only ever be set locally.
import { createHash } from "node:crypto";
import { ACHIEVEMENTS, plannerSnapshot, type PlannerSnapshot } from "@lifeos/contracts";
import { createPrisma } from "@lifeos/db";

const daily = "FREQ=DAILY";
const weekdays = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";

// Optional examples, not application behavior: users install an editable copy.
const STARTERS: { description: string; snapshot: PlannerSnapshot }[] = [
  {
    description: "Simple daily movement, water and sleep habits.",
    snapshot: {
      name: "Healthy routine",
      color: "#1FAD82",
      icon: "heart",
      sections: [
        {
          name: "Every day",
          tasks: [
            {
              title: "Move for 30 minutes",
              type: "duration",
              targetValue: 30,
              targetUnit: "min",
              rrule: daily,
              localTime: "07:30",
            },
            {
              title: "Drink water",
              type: "quantity",
              targetValue: 2000,
              targetUnit: "ml",
              rrule: daily,
            },
            { title: "Lights out on time", type: "checkbox", rrule: daily, localTime: "22:30" },
          ],
        },
        {
          name: "Every week",
          tasks: [
            {
              title: "Plan healthy meals",
              type: "checkbox",
              rrule: "FREQ=WEEKLY;BYDAY=SU",
              localTime: "17:00",
            },
          ],
        },
      ],
    },
  },
  {
    description: "Build skills and keep your career moving each week.",
    snapshot: {
      name: "Career growth",
      color: "#7468E8",
      icon: "briefcase",
      sections: [
        {
          name: "Learning",
          tasks: [
            {
              title: "Deep work block",
              type: "duration",
              targetValue: 60,
              targetUnit: "min",
              rrule: weekdays,
              localTime: "09:00",
              children: [{ title: "Write down the day's priority", type: "checkbox" }],
            },
            { title: "Read one industry article", type: "checkbox", rrule: weekdays },
          ],
        },
        {
          name: "Network",
          tasks: [
            { title: "Reach out to one person", type: "checkbox", rrule: "FREQ=WEEKLY;BYDAY=TH" },
          ],
        },
      ],
    },
  },
  {
    description: "Small routines for a calmer home and a better week.",
    snapshot: {
      name: "Balanced lifestyle",
      color: "#F2B84A",
      icon: "sun",
      sections: [
        {
          name: "Home",
          tasks: [
            { title: "Ten minute tidy", type: "checkbox", rrule: daily, localTime: "19:00" },
            { title: "Weekly reset", type: "checkbox", rrule: "FREQ=WEEKLY;BYDAY=SA" },
          ],
        },
        {
          name: "Wellbeing",
          tasks: [
            { title: "Rate your day", type: "rating", rrule: daily, localTime: "21:00" },
            { title: "Time with people you like", type: "checkbox", rrule: "FREQ=WEEKLY;BYDAY=SU" },
          ],
        },
      ],
    },
  },
];

/** Gives a demo account believable history, so charts and streaks can be reviewed locally. */
async function seedDemoHistory(userId: string, email: string) {
  await prisma.profile.upsert({
    where: { authUserId: userId },
    update: {},
    create: {
      authUserId: userId,
      email,
      displayName: "Demo",
      timezone: "Asia/Kolkata",
      preferences: { create: {} },
    },
  });
  if ((await prisma.planner.count({ where: { userId } })) > 0) return;
  const category = await prisma.category.create({
    data: { userId, name: "Health", slug: "health", color: "#1FAD82" },
  });
  const planner = await prisma.planner.create({
    data: {
      userId,
      categoryId: category.id,
      name: "Morning routine",
      slug: "morning-routine",
      timezone: "Asia/Kolkata",
      color: "#1FAD82",
    },
  });
  const section = await prisma.plannerSection.create({
    data: { plannerId: planner.id, name: "Every day", position: 0 },
  });
  const today = new Date().toISOString().slice(0, 10);
  const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000);
  const titles = ["Stretch for 10 minutes", "Drink water", "Read 20 pages"];
  for (const [i, title] of titles.entries()) {
    const task = await prisma.task.create({
      data: { userId, plannerId: planner.id, sectionId: section.id, title, sortOrder: i },
    });
    await prisma.taskSchedule.create({
      data: {
        taskId: task.id,
        timezone: "Asia/Kolkata",
        rrule: "FREQ=DAILY",
        startsOn: day(-45),
        generatedUntil: day(0),
        localTime: `0${7 + i}:00`,
      },
    });
    for (let offset = -45; offset <= 0; offset += 1) {
      // Deterministic pattern, so reviews are repeatable: mostly done, some gaps, and a rest day.
      const roll = (offset * 7 + i * 13 + 1000) % 10;
      const status =
        offset === 0
          ? "pending"
          : roll < 7
            ? "completed"
            : roll < 8
              ? "skipped"
              : roll < 9
                ? "rest"
                : "pending";
      await prisma.taskOccurrence.create({
        data: {
          userId,
          taskId: task.id,
          slotKey: "default",
          date: day(offset),
          status,
          completedAt: status === "completed" ? day(offset) : null,
        },
      });
    }
  }
  const metric = await prisma.metricDefinition.create({
    data: { userId, key: "water", label: "Water", kind: "quantity", unit: "ml" },
  });
  for (let offset = -30; offset <= 0; offset += 1) {
    await prisma.metricLog.create({
      data: {
        userId,
        metricId: metric.id,
        recordedAt: day(offset),
        localDate: day(offset),
        value: 1400 + ((offset * 37 + 900) % 9) * 100,
      },
    });
  }
  await prisma.goal.create({
    data: {
      userId,
      metricId: metric.id,
      title: "Stay hydrated",
      target: 2000,
      period: "daily",
      milestones: {
        create: [
          { title: "Halfway", threshold: 1000 },
          { title: "Full target", threshold: 2000 },
        ],
      },
    },
  });
  await prisma.dashboard.create({
    data: {
      userId,
      name: "My week",
      widgets: {
        create: [
          {
            title: "Adherence",
            chartType: "line",
            querySpecJson: {
              source: "occurrences",
              measure: "adherence",
              grain: "day",
              rangeDays: 30,
            },
          },
          {
            title: "Water",
            chartType: "bar",
            querySpecJson: {
              source: "metric",
              measure: "sum",
              grain: "week",
              rangeDays: 30,
              metricId: metric.id,
            },
          },
        ],
      },
    },
  });
}

async function createDemoUsers() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!url || !key || !password)
    throw new Error(
      "Demo users need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_DEMO_PASSWORD",
    );
  const headers = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
  for (const email of ["demo@lifeos.local", "demo2@lifeos.local"]) {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    let id = created.ok ? ((await created.json()) as { id: string }).id : null;
    if (!id) {
      const list = (await (
        await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, { headers })
      ).json()) as { users: { id: string; email: string }[] };
      id = list.users.find((u) => u.email === email)?.id ?? null;
    }
    if (!id) throw new Error(`Could not create ${email}`);
    await seedDemoHistory(id, email);
    console.log(`Demo user ready: ${email}`);
  }
}

const prisma = createPrisma(process.env.DATABASE_URL!);

for (const achievement of ACHIEVEMENTS) {
  await prisma.achievement.upsert({
    where: { key: achievement.key },
    update: achievement,
    create: achievement,
  });
}

for (const { description, snapshot } of STARTERS) {
  const parsed = plannerSnapshot.parse(snapshot);
  const snapshotJson = JSON.parse(JSON.stringify(parsed));
  const checksum = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  const existing = await prisma.template.findFirst({
    where: { name: parsed.name, ownerId: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!existing) {
    await prisma.template.create({
      data: {
        name: parsed.name,
        description,
        visibility: "starter",
        versions: { create: { version: 1, snapshotJson, checksum } },
      },
    });
  } else if (existing.versions[0]?.checksum !== checksum) {
    // Versions are immutable, so a changed starter becomes a new version.
    await prisma.templateVersion.create({
      data: {
        templateId: existing.id,
        version: (existing.versions[0]?.version ?? 0) + 1,
        snapshotJson,
        checksum,
      },
    });
  }
}

if (process.env.SEED_DEMO_USERS === "true") await createDemoUsers();
await prisma.$disconnect();
console.log(`Seeded ${STARTERS.length} starter templates and ${ACHIEVEMENTS.length} achievements.`);
