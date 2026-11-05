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
            { title: "Move for 30 minutes", type: "duration", targetValue: 30, targetUnit: "min", rrule: daily, localTime: "07:30" },
            { title: "Drink water", type: "quantity", targetValue: 2000, targetUnit: "ml", rrule: daily },
            { title: "Lights out on time", type: "checkbox", rrule: daily, localTime: "22:30" },
          ],
        },
        {
          name: "Every week",
          tasks: [{ title: "Plan healthy meals", type: "checkbox", rrule: "FREQ=WEEKLY;BYDAY=SU", localTime: "17:00" }],
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
          tasks: [{ title: "Reach out to one person", type: "checkbox", rrule: "FREQ=WEEKLY;BYDAY=TH" }],
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

async function createDemoUsers() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!url || !key || !password) throw new Error("Demo users need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_DEMO_PASSWORD");
  for (const email of ["demo@lifeos.local", "demo2@lifeos.local"]) {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    console.log(`${email}: ${res.ok ? "created" : res.status === 422 ? "already exists" : `failed (${res.status})`}`);
  }
}

const prisma = createPrisma(process.env.DATABASE_URL!);

for (const achievement of ACHIEVEMENTS) {
  await prisma.achievement.upsert({ where: { key: achievement.key }, update: achievement, create: achievement });
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
      data: { templateId: existing.id, version: (existing.versions[0]?.version ?? 0) + 1, snapshotJson, checksum },
    });
  }
}

if (process.env.SEED_DEMO_USERS === "true") await createDemoUsers();
await prisma.$disconnect();
console.log(`Seeded ${STARTERS.length} starter templates and ${ACHIEVEMENTS.length} achievements.`);
