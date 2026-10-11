/** Minimal server-only Luminal (OpenAI-compatible) JSON completion, as used by agent.ts. */

/**
 * POSTs a chat completion to Luminal and returns an ordinary (non-streaming) completion response.
 *
 * Luminal's gateway answers 503 to any request that has not started responding within about 20 s,
 * and long drafts take longer than that to generate. So the request is always sent with
 * `stream: true` (tokens start flowing in ~1 s) and the server-sent events are assembled back into
 * `{choices: [{message: {content}, finish_reason}], usage}` for callers. Transient failures
 * (429/502/503/504) are retried with backoff that honors Retry-After. Logs provider error text only.
 */
export async function luminalFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  const body = JSON.parse(String(init.body ?? "{}"));
  const streamed = { ...init, body: JSON.stringify({ ...body, stream: true }) };
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, streamed);
    if (response.ok) return assemble(response);
    if (![429, 502, 503, 504].includes(response.status) || attempt >= attempts) {
      console.error(`Luminal ${response.status} after ${attempt} attempt(s): ${(await response.clone().text()).slice(0, 300)}`);
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1500 * 2 ** (attempt - 1);
    console.warn(`Luminal ${response.status}; retrying in ${wait} ms`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    if ((init.signal as AbortSignal | undefined)?.aborted) return response;
  }
}

/** Reads an OpenAI-style SSE stream into a single completion JSON response. */
async function assemble(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return response;
  let content = "";
  let finish: string | null = null;
  let usage: unknown;
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data);
        const choice = chunk.choices?.[0];
        if (typeof choice?.delta?.content === "string") content += choice.delta.content;
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
      } catch {}
    }
  }
  return Response.json({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }], usage });
}

export class LuminalError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export async function luminalJSON(
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<Record<string, any>> {
  const key = process.env.LUMINAL_API_KEY;
  if (!key)
    throw new LuminalError(
      503,
      "AI is not configured. Set LUMINAL_API_KEY on the backend.",
      "AI_NOT_CONFIGURED",
    );
  const base = (process.env.LUMINAL_BASE_URL || "https://flash.luminal.cloud/v1").replace(/\/$/, "");
  const deadline = AbortSignal.timeout(50000);
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
      ...(attempt
        ? [{ role: "user", content: "The prior response was not parseable JSON. Return exactly one valid JSON object and nothing else." }]
        : []),
    ];
    let response: Response;
    try {
      response = await luminalFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: deadline,
        body: JSON.stringify({
          model: process.env.LUMINAL_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash",
          messages,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
      });
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      throw new LuminalError(timeout ? 504 : 502, timeout ? "AI request timed out. Please retry." : "AI provider could not be reached. Please retry.", timeout ? "AI_TIMEOUT" : "AI_REQUEST_FAILED");
    }
    if (!response.ok)
      throw new LuminalError(
        response.status === 429 ? 429 : 502,
        response.status === 429 ? "AI provider is busy. Please retry shortly." : "AI provider could not complete this request. Please retry.",
        "AI_PROVIDER_ERROR",
      );
    const raw = ((await response.json()) as any)?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") continue;
    try {
      return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    } catch {}
  }
  throw new LuminalError(502, "AI returned an unreadable response. Please retry.", "AI_INVALID_JSON");
}
