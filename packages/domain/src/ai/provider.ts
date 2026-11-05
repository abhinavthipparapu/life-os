import OpenAI from "openai";

export interface AiResult<T> {
  value: T;
  tokens: number;
  model: string;
}

export interface AiProvider {
  name: string;
  completeJson(system: string, user: string, maxTokens: number): Promise<AiResult<unknown>>;
  streamText(system: string, user: string, maxTokens: number): AsyncGenerator<string, { tokens: number; model: string }>;
}

const estimate = (text: string) => Math.ceil(text.length / 4);

/** Rough pre-flight size check, so oversized requests fail before any money is spent. */
export const estimateUsage = (...parts: string[]) => parts.reduce((n, p) => n + estimate(p), 0);

const REDACTIONS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[phone]"],
];

/** Strips contact details the model does not need. */
export function redact(text: string): string {
  return REDACTIONS.reduce((out, [pattern, label]) => out.replace(pattern, label), text);
}

const UNSAFE = [
  /\b(suicide|kill myself|self[- ]harm|end my life)\b/i,
  /\b(starv\w*|purg(e|ing)|pro[- ]?ana)\b/i,
  /\b(overdose|lethal dose)\b/i,
  /\b(make|build) (a )?(bomb|weapon)\b/i,
];

export function isUnsafeContent(text: string): boolean {
  return UNSAFE.some((pattern) => pattern.test(text));
}

/** Deterministic provider for local development and tests. It makes no network calls. */
export function createMockProvider(): AiProvider {
  const model = "mock-1";
  return {
    name: "mock",
    async completeJson(system, user) {
      const tokens = estimateUsage(system, user) + 50;
      if (system.includes("INTENT")) {
        const keys = [...system.matchAll(/metric:([a-z0-9_]+)/g)].map((m) => m[1]);
        const metricKey = keys.find((k) => k && user.toLowerCase().includes(k.replace(/_/g, " ")));
        return { value: { kind: metricKey ? "metric" : "adherence", metricKey: metricKey ?? null, days: 30 }, tokens, model };
      }
      if (system.includes("SCHEDULE")) {
        const ids = [...user.matchAll(/task:([0-9a-f-]{36})/g)].map((m) => m[1]);
        const proposals = ids.map((taskId, i) => ({
          taskId,
          localTime: `${String(7 + i).padStart(2, "0")}:00`,
          reason: "Spreads tasks across the morning",
        }));
        return { value: { proposals }, tokens, model };
      }
      const name = user.replace(/\s+/g, " ").trim().slice(0, 60) || "New plan";
      return {
        value: {
          name,
          description: "Draft generated for your review.",
          sections: [
            {
              name: "Daily habits",
              tasks: [
                { title: "Morning review", type: "checkbox", rrule: "FREQ=DAILY", localTime: "08:00" },
                {
                  title: "Focused session",
                  type: "duration",
                  targetValue: 30,
                  targetUnit: "min",
                  rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
                  children: [{ title: "Note what went well", type: "checkbox" }],
                },
              ],
            },
          ],
        },
        tokens,
        model,
      };
    },
    async *streamText(system, user) {
      const text = `Here is what your numbers show. ${user.split("\n")[0] ?? ""}`;
      for (const word of text.split(" ")) yield `${word} `;
      return { tokens: estimateUsage(system, user, text), model };
    },
  };
}

export function createOpenAiProvider(apiKey: string, model: string): AiProvider {
  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 });
  return {
    name: "openai",
    async completeJson(system, user, maxTokens) {
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return {
        value: JSON.parse(res.choices[0]?.message.content ?? "null"),
        tokens: res.usage?.total_tokens ?? estimateUsage(system, user),
        model: res.model,
      };
    },
    async *streamText(system, user, maxTokens) {
      const stream = await client.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      let tokens = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta.content;
        if (delta) yield delta;
        if (chunk.usage) tokens = chunk.usage.total_tokens;
      }
      return { tokens, model };
    },
  };
}

export function createAiProvider(env: { AI_PROVIDER?: string; OPENAI_API_KEY?: string; OPENAI_MODEL?: string }): AiProvider {
  if (env.AI_PROVIDER !== "openai") return createMockProvider();
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) {
    throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY and OPENAI_MODEL");
  }
  return createOpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
}
