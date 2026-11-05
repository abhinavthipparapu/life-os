import type { ApiEnvelope, ProblemDetails } from "@lifeos/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Partial<ProblemDetails> = {},
  ) {
    super(message);
  }
}

// Missing and not-yours share one response, so IDs of other users' records cannot be probed.
export const notFound = (entity = "Resource") => new AppError(404, "not_found", `${entity} not found`);
export const conflict = (message: string, current?: unknown) =>
  new AppError(409, "version_conflict", message, { current });
export const badRequest = (message: string, code = "invalid_request") => new AppError(400, code, message);

export function send<T>(res: Response, data: T, meta: ApiEnvelope<T>["meta"] = null, status = 200) {
  const body: ApiEnvelope<T> = { data, meta, error: null };
  res.status(status).json(body);
}

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError(422, "validation_failed", "Request validation failed", {
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

export function userId(req: Request): string {
  if (!req.user) throw new AppError(401, "unauthenticated", "Authentication required");
  return req.user.id;
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value !== "string" || !uuid.test(value)) throw notFound();
  return value;
}

/** Fetch with `take: limit + 1`, then split the extra row off to get the next cursor. */
export function paginate<T extends { id: string }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  return { page, nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null };
}
