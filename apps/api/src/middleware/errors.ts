import type { ApiEnvelope, ProblemDetails } from "@lifeos/contracts";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../shared/http.js";

function respond(res: Parameters<RequestHandler>[1], problem: ProblemDetails) {
  const body: ApiEnvelope<never> = { data: null, meta: null, error: problem };
  res.status(problem.status).type("application/problem+json").json(body);
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  respond(res, { type: "about:blank", title: "Not found", status: 404, code: "not_found" });
};

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
}

/** Unexpected errors are logged server-side and returned without any detail or stack trace. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    respond(res, {
      type: `https://lifeos.app/problems/${err.code}`,
      title: err.message,
      status: err.status,
      code: err.code,
      ...err.extra,
    });
    return;
  }
  const status = statusOf(err);
  if (status) {
    respond(res, { type: "about:blank", title: "Invalid request", status, code: "invalid_request" });
    return;
  }
  req.log?.error({ err }, "unhandled error");
  respond(res, {
    type: "about:blank",
    title: "Internal server error",
    status: 500,
    code: "internal_error",
  });
};
