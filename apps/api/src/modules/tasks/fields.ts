import type { Prisma } from "@lifeos/db";
import { AppError } from "../../shared/http.js";

interface Definition {
  id: string;
  key: string;
  type: string;
  validationJson: unknown;
}
interface Rules {
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

function invalid(key: string, message: string): never {
  throw new AppError(422, "validation_failed", "Request validation failed", {
    errors: [{ path: `fields.${key}`, message }],
  });
}

function checkValue(def: Definition, value: unknown) {
  const rules = (def.validationJson ?? {}) as Rules;
  switch (def.type) {
    case "number":
    case "rating":
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(def.key, "Must be a number");
      if (rules.min !== undefined && value < rules.min) invalid(def.key, `Must be at least ${rules.min}`);
      if (rules.max !== undefined && value > rules.max) invalid(def.key, `Must be at most ${rules.max}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") invalid(def.key, "Must be true or false");
      break;
    case "date":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(def.key, "Must be a date");
      break;
    case "select":
      if (typeof value !== "string" || !rules.options?.includes(value)) invalid(def.key, "Must be one of the options");
      break;
    default:
      if (typeof value !== "string" || value.length > 2000) invalid(def.key, "Must be text up to 2000 characters");
  }
}

/** Validates against the planner's definitions, then writes values and their numeric projection. */
export async function writeFieldValues(
  tx: Prisma.TransactionClient,
  plannerId: string,
  taskId: string,
  fields: Record<string, unknown>,
  isCreate: boolean,
) {
  const definitions = await tx.fieldDefinition.findMany({ where: { plannerId, deletedAt: null } });
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  for (const key of Object.keys(fields)) {
    if (!byKey.has(key)) invalid(key, "Unknown field");
  }
  if (isCreate) {
    for (const def of definitions) {
      if ((def.validationJson as Rules).required && fields[def.key] === undefined) invalid(def.key, "Required");
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    const def = byKey.get(key)!;
    checkValue(def, value);
    const data = {
      valueJson: value as Prisma.InputJsonValue,
      valueNumber: typeof value === "number" ? value : null,
    };
    await tx.fieldValue.upsert({
      where: { taskId_fieldDefinitionId: { taskId, fieldDefinitionId: def.id } },
      create: { taskId, fieldDefinitionId: def.id, ...data },
      update: data,
    });
  }
}
