/**
 * Helpers for calling Supabase Edge Functions from client components.
 */

import type { ISTAnalysis } from "@/types/ist-analysis";

/**
 * Calls a Supabase Edge Function via HTTP POST and returns the parsed JSON
 * response body.
 *
 * @param fnName      - Edge Function name (e.g. "classify-deal").
 * @param body        - Request body that will be JSON-serialised.
 * @param accessToken - JWT access token from the authenticated Supabase session.
 *
 * @returns Parsed JSON response typed as `T`.
 * @throws  When `NEXT_PUBLIC_SUPABASE_URL` is not set or the response is not ok.
 */
export async function callEdgeFunction<T>(
  fnName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: string };
      detail = err?.error ?? "";
    } catch {
      // ignore JSON parse failures on error responses
    }
    throw new Error(
      `${fnName} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Streaming support for the analyze-deal edge function
// ---------------------------------------------------------------------------

/** Events emitted by the analyze-deal edge function in streaming mode. */
export type AnalysisStreamEvent =
  | { type: "progress"; step: string; message: string }
  | { type: "text_delta"; text: string }
  | { type: "complete"; data: ISTAnalysis }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Calls the analyze-deal edge function in streaming (SSE) mode.
 *
 * The function sends `stream: true` in the request body. The edge function
 * responds with a `text/event-stream` response and emits a sequence of
 * {@link AnalysisStreamEvent} objects:
 *
 *  1. `progress` events during each processing phase (analyzing, enriching).
 *  2. `text_delta` events containing raw Claude output tokens as they arrive.
 *  3. A final `complete` event carrying the full {@link ISTAnalysis} JSON.
 *  4. A `done` event signalling the stream is closed.
 *
 * If the edge function emits an `error` event the returned promise rejects.
 *
 * @param fnName      - Edge Function name (must be "analyze-deal").
 * @param body        - Request body (without `stream` — that is added here).
 * @param accessToken - JWT access token from the authenticated Supabase session.
 * @param onEvent     - Called for every event received from the stream.
 *
 * @returns The complete {@link ISTAnalysis} when the stream finishes.
 */
export async function callEdgeFunctionStreaming(
  fnName: string,
  body: Record<string, unknown>,
  accessToken: string,
  onEvent: (event: AnalysisStreamEvent) => void,
): Promise<ISTAnalysis> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: string };
      detail = err?.error ?? "";
    } catch {
      // ignore JSON parse failures on error responses
    }
    throw new Error(
      `${fnName} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  if (!res.body) {
    throw new Error(`${fnName} returned no response body`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalAnalysis: ISTAnalysis | null = null;

  outerLoop: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are newline-separated; keep any partial last line in the buffer.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event: AnalysisStreamEvent;
      try {
        event = JSON.parse(raw) as AnalysisStreamEvent;
      } catch {
        // Ignore malformed SSE lines (e.g. keep-alive pings).
        continue;
      }

      onEvent(event);

      if (event.type === "complete") {
        finalAnalysis = event.data;
      } else if (event.type === "error") {
        reader.cancel().catch(() => {});
        throw new Error(event.message);
      } else if (event.type === "done") {
        reader.cancel().catch(() => {});
        break outerLoop;
      }
    }
  }

  if (!finalAnalysis) {
    throw new Error("Stream ended without a complete event");
  }

  return finalAnalysis;
}
