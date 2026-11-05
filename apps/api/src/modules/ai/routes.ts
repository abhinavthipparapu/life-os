import { applyDraft, askMetrics, createPlannerDraft, insightRequest, scheduleSuggestionRequest } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { aiService } from "./service.js";

export function aiRoutes({ prisma, env, ai }: Deps) {
  const router = Router();
  const service = aiService(prisma, ai, env.AI_MONTHLY_TOKEN_BUDGET);

  router.get("/usage", async (req, res) => send(res, await service.usage(userId(req))));
  router.post("/planner-drafts", async (req, res) => {
    const { prompt, includeSensitive } = parse(createPlannerDraft, req.body);
    const { draft, cached } = await service.generatePlanDraft(userId(req), prompt, includeSensitive);
    send(res, draft, { cached }, 201);
  });
  router.get("/planner-drafts/:id", async (req, res) => send(res, await service.getDraft(userId(req), param(req, "id"))));
  router.post("/planner-drafts/:id/apply", async (req, res) =>
    send(res, await service.applyDraft(userId(req), param(req, "id"), parse(applyDraft, req.body)), null, 201),
  );
  router.post("/ask", async (req, res) =>
    send(res, await service.askMetrics(userId(req), parse(askMetrics, req.body).question)),
  );
  router.post("/schedule-suggestions", async (req, res) => {
    const { plannerId, constraints } = parse(scheduleSuggestionRequest, req.body);
    send(res, await service.suggestSchedule(userId(req), plannerId, constraints), null, 201);
  });
  router.post("/schedule-drafts/:id/apply", async (req, res) =>
    send(res, await service.applySchedule(userId(req), param(req, "id"))),
  );

  // Server-sent events. Source metrics go first, so the UI can show them beside the narrative.
  router.post("/insights", async (req, res) => {
    const { rangeDays, includeSensitive } = parse(insightRequest, req.body);
    const insight = await service.prepareInsight(userId(req), rangeDays, includeSensitive);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const emit = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    emit("sources", { sources: insight.context.sources, from: insight.context.from, to: insight.context.to });
    try {
      const stream = insight.stream();
      for (;;) {
        const next = await stream.next();
        if (next.done) {
          await insight.finish(next.value.model, next.value.tokens);
          break;
        }
        emit("delta", { text: next.value });
      }
      emit("done", {});
    } catch (err) {
      req.log?.error({ err }, "insight stream failed");
      emit("error", { message: "The insight could not be completed" });
    }
    res.end();
  });
  return router;
}
