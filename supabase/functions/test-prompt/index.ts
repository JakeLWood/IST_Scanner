/**
 * test-prompt — Supabase Edge Function
 *
 * Runs a draft system prompt against a user-supplied text snippet and returns
 * the raw Claude response for admin inspection. This is the "Test Prompt"
 * feature in the system prompt editor (PRD §5.1 / §6.2.5).
 *
 * The Anthropic API key is held exclusively in the edge-function environment
 * (ANTHROPIC_API_KEY secret) — it is never exposed to the client (PRD §2.4).
 *
 * Request body:
 *   {
 *     systemPrompt: string,        // draft system prompt to test
 *     text: string,                // deal text snippet to analyse
 *     track: "traditional_pe" | "ip_technology"
 *   }
 *
 * Response body:
 *   { rawOutput: string }          // raw text from Claude (may or may not be valid JSON)
 *
 * Authorization:
 *   Bearer <supabase_access_token> header required; user must be authenticated.
 *   (Admin role is NOT required — any authenticated user can run a test.)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type DealTrack = 'traditional_pe' | 'ip_technology';

interface RequestBody {
  systemPrompt: string;
  text: string;
  track: DealTrack;
}

// ---------------------------------------------------------------------------
// Analysis prompt builders (simplified versions for test runs)
// ---------------------------------------------------------------------------

function buildTestAnalysisPrompt(text: string, track: DealTrack): string {
  const analysisDate = new Date().toISOString().slice(0, 10);

  if (track === 'traditional_pe') {
    return `\
Perform a complete Investment Screening Tool (IST) analysis on the following deal \
materials and return a single JSON object that EXACTLY matches the ISTAnalysis \
TypeScript interface shown below. Do not include anything outside the JSON object.

=== ISTAnalysis Interface (for reference) ===
{
  "companyName":    string,
  "analysisDate":   "${analysisDate}",
  "dealType":       "traditional_pe",
  "companyOverview":   { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "marketOpportunity": { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "financialProfile":  { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "managementTeam":    { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "investmentThesis":  { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "riskAssessment":    { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "dealDynamics":      { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "overallScore":      number,
  "recommendation":    "proceed" | "conditional_proceed" | "pass",
  "executiveSummary":  string
}
=== End of Interface ===

=== Deal Materials ===
${text}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown, no prose, no code fences.
`;
  }

  // IP / Technology track
  return `\
Perform a complete Investment Screening Tool (IST) analysis on the following IP / \
Technology Commercialization deal materials and return a single JSON object that EXACTLY \
matches the ISTAnalysis TypeScript interface shown below. Do not include anything outside \
the JSON object.

Catalyze's core thesis is "orthogonal application": technology proven in one domain \
unlocks its greatest value when applied to adjacent markets the original inventors did \
not target. Every section must be evaluated through this lens.

=== ISTAnalysis Interface (for reference) ===
{
  "companyName":    string,
  "analysisDate":   "${analysisDate}",
  "dealType":       "ip_technology",
  "companyOverview":   { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "marketOpportunity": { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "financialProfile":  { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "managementTeam":    { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "investmentThesis":  { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "riskAssessment":    { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "dealDynamics":      { "sectionName": string, "score": <1–10>, "commentary": string, "keyFindings": string[] },
  "overallScore":      number,
  "recommendation":    "proceed" | "conditional_proceed" | "pass",
  "executiveSummary":  string
}
=== End of Interface ===

=== Deal Materials ===
${text}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown, no prose, no code fences.
`;
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ------------------------------------------------------------------
    // 1. Authenticate the caller via Supabase JWT (PRD §2.4)
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 2. Parse and validate the request body
    // ------------------------------------------------------------------
    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { systemPrompt, text, track } = body;

    if (!systemPrompt || typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
      return new Response(
        JSON.stringify({ error: 'systemPrompt is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'text is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (track !== 'traditional_pe' && track !== 'ip_technology') {
      return new Response(
        JSON.stringify({ error: 'track must be "traditional_pe" or "ip_technology".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 3. Call the Anthropic API (PRD §2.4 — key stays server-side)
    // ------------------------------------------------------------------
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'AI service is not configured.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const model = 'claude-sonnet-4-5-20250929';
    const analysisPrompt = buildTestAnalysisPrompt(text.trim(), track);

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt.trim(),
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error('Anthropic error:', errorBody);
      return new Response(
        JSON.stringify({ error: `Claude API error (HTTP ${anthropicResponse.status}).` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawOutput: string =
      anthropicData?.content?.[0]?.type === 'text'
        ? anthropicData.content[0].text
        : '';

    if (!rawOutput) {
      return new Response(
        JSON.stringify({ error: 'Claude returned an empty response.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 4. Return the raw output for admin inspection
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({ rawOutput }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('test-prompt error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
