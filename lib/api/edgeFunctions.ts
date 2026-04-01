/**
 * Helpers for calling Supabase Edge Functions from client components.
 */

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
