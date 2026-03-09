import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types (mirrors types/ist.ts — kept inline so the Edge Function is
// self-contained without a build step)
// ---------------------------------------------------------------------------

type DealType = 'traditional_pe' | 'ip_technology';
type RecommendationVerdict = 'PROCEED' | 'FURTHER_REVIEW' | 'PASS';

interface ISTStrength {
  title: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
}

interface ISTRisk {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  likelihood: 'low' | 'medium' | 'high';
  mitigation?: string;
}

interface ISTValueCreation {
  title: string;
  description: string;
  timeframe: 'short_term' | 'medium_term' | 'long_term';
  potential: 'low' | 'medium' | 'high';
}

interface ISTScore {
  overall: number;
  market: number;
  management: number;
  financials: number;
  strategic_fit: number;
  ip_technology: number | null;
  rationale: {
    overall: string;
    market: string;
    management: string;
    financials: string;
    strategic_fit: string;
    ip_technology: string | null;
  };
}

interface ISTRecommendation {
  verdict: RecommendationVerdict;
  summary: string;
  conditions: string[];
  is_disqualified: boolean;
  disqualifier_reason: string | null;
}

interface ISTKeyQuestion {
  question: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high';
  owner?: string;
}

interface ISTDataQuality {
  confidence: 'low' | 'medium' | 'high';
  completeness_pct: number;
  missing_data: string[];
  caveats: string;
}

interface ISTAnalysis {
  schema_version: string;
  generated_at: string;
  company_name: string;
  deal_type: DealType;
  executive_summary: string;
  strengths: ISTStrength[];
  risks: ISTRisk[];
  value_creation: ISTValueCreation[];
  score: ISTScore;
  recommendation: ISTRecommendation;
  key_questions: ISTKeyQuestion[];
  data_quality: ISTDataQuality;
}

// ---------------------------------------------------------------------------
// IST System Prompt — Core Identity
// ---------------------------------------------------------------------------

const IST_SYSTEM_PROMPT = `You are a senior Private Equity associate at Catalyze Partners, a firm that acquires and commercializes advanced technologies and lower middle market operating companies. Your task is to perform an Investment Screening Test (IST) on the provided deal document.

Analytical philosophy: Be rigorous, skeptical, and data-driven. Prefer conservative estimates over optimistic projections. Flag areas where the document makes claims without supporting evidence. Distinguish between facts stated in the document and your own inferences.

Firm context: Catalyze Partners' portfolio includes companies in aerospace (Metro Aerospace), advanced materials (Alpine Advanced Materials), and analytical instrumentation (Axcend). The firm specializes in technology-driven industrial businesses. Catalyze provides shared services across portfolio companies. The firm looks for companies where it can apply operational expertise and technology commercialization capabilities.

Output format: Return your analysis as a structured JSON object following the exact schema provided below. Every score must include a 2–3 sentence justification. Every strength must include specific supporting data from the document. Every risk must include a severity rating and a proposed mitigation.

Required JSON schema:
{
  "schema_version": "1.0",
  "generated_at": "<ISO-8601 timestamp>",
  "company_name": "<string>",
  "deal_type": "<traditional_pe | ip_technology>",
  "executive_summary": "<string, max ~200 words>",
  "strengths": [
    {
      "title": "<string>",
      "description": "<string with specific data from the document>",
      "significance": "<low | medium | high>"
    }
  ],
  "risks": [
    {
      "title": "<string>",
      "description": "<string>",
      "severity": "<low | medium | high | critical>",
      "likelihood": "<low | medium | high>",
      "mitigation": "<string>"
    }
  ],
  "value_creation": [
    {
      "title": "<string>",
      "description": "<string>",
      "timeframe": "<short_term | medium_term | long_term>",
      "potential": "<low | medium | high>"
    }
  ],
  "score": {
    "overall": <number 0-100>,
    "market": <number 0-100>,
    "management": <number 0-100>,
    "financials": <number 0-100>,
    "strategic_fit": <number 0-100>,
    "ip_technology": <number 0-100 or null>,
    "rationale": {
      "overall": "<string>",
      "market": "<string>",
      "management": "<string>",
      "financials": "<string>",
      "strategic_fit": "<string>",
      "ip_technology": "<string or null>"
    }
  },
  "recommendation": {
    "verdict": "<PROCEED | FURTHER_REVIEW | PASS>",
    "summary": "<string, 2-5 sentences>",
    "conditions": ["<string>"],
    "is_disqualified": <boolean>,
    "disqualifier_reason": "<string or null>"
  },
  "key_questions": [
    {
      "question": "<string>",
      "rationale": "<string>",
      "priority": "<low | medium | high>",
      "owner": "<string, optional>"
    }
  ],
  "data_quality": {
    "confidence": "<low | medium | high>",
    "completeness_pct": <number 0-100>,
    "missing_data": ["<string>"],
    "caveats": "<string>"
  }
}

Return ONLY the JSON object with no additional text, markdown code blocks, or explanation.`;

// ---------------------------------------------------------------------------
// Analysis prompt builders
// ---------------------------------------------------------------------------

function buildAnalysisPrompt(
  extractedText: string,
  dealType: DealType,
): string {
  const dealTypeLabel =
    dealType === 'traditional_pe'
      ? 'Traditional PE'
      : 'IP / Technology Commercialization';

  const commonInstructions = `
DEAL DOCUMENT:
---
${extractedText}
---

DEAL TYPE: ${dealTypeLabel}

Perform a full Investment Screening Test (IST) analysis on the deal document above.`;

  if (dealType === 'traditional_pe') {
    return `${commonInstructions}

TRADITIONAL PE ANALYSIS INSTRUCTIONS:

Investment Snapshot:
- Extract all factual data points about the company: name, industry, location, financials, employees, founding year, transaction type.
- Calculate any derived metrics: EBITDA margin, EV/EBITDA multiple, revenue per employee, revenue CAGR.
- Note the deal source and process type if mentioned.

Investment Strengths (identify 3–6):
- Organize into categories such as: Market Position, Business Model, Financial Profile, Market Tailwinds, IP & Differentiation, Customer Quality, Growth Trajectory.
- Each strength must cite specific data from the document (numbers, percentages, customer names, product details).
- Do not fabricate strengths not supported by the document.

Risk Assessment:
- Identify all material risks with severity (high/medium/low/critical) and likelihood.
- Common risk categories: founder/key-person dependency, customer concentration, supplier concentration, technology obsolescence, regulatory/compliance, cyclicality, competitive threats, working capital issues, lease/facility risks, integration complexity.
- Be skeptical: if the document claims a risk is mitigated but provides no evidence, rate the severity higher.

Value Creation Thesis:
- Identify specific, actionable value creation levers.
- Organize into short_term (0–12 months), medium_term (1–3 years), long_term (3+ years).
- Value creation levers should be realistic and tied to evidence in the document.

Scoring (0–100 scale, where 70–100 = strong/excellent; 50–69 = adequate/mixed; 30–49 = concerning; 0–29 = deal-breaking weakness):
- Score each dimension: market, management, financials, strategic_fit.
- Set ip_technology score to null for Traditional PE deals.
- Compute overall as a weighted average (market 25%, management 25%, financials 30%, strategic_fit 20%).
- Include a 2–3 sentence justification for each score.
- If insufficient data exists to score a dimension, use 0 and explain in the rationale.

Key Questions (5–10):
- Generate questions the deal team should ask management or intermediaries.
- Each question should target a specific risk, validate a key assumption, or fill a data gap.

Recommendation:
- Verdict: PROCEED (strong opportunity), FURTHER_REVIEW (promising but needs more data), or PASS (material concerns).
- Include any conditions that must be met before advancing.
- Flag disqualifying factors if present (e.g., illegal activity, irreparable financial distress).

Return the analysis as valid JSON conforming exactly to the schema in the system prompt.`;
  }

  // IP / Technology track
  return `${commonInstructions}

IP / TECHNOLOGY COMMERCIALIZATION ANALYSIS INSTRUCTIONS:

Technology Readiness Assessment:
- Evaluate TRL level (1–9), prototype status, testing data, manufacturing scalability, remaining development work, and time-to-market.
- Assess technical risk and the credibility of development timelines.

IP Deep Dive:
- Evaluate patent portfolio (granted vs. pending, claim breadth, remaining life, geographic coverage).
- Assess trade secrets, freedom-to-operate concerns, and licensing terms from the parent company.

Commercialization Analysis:
- Identify target customers, distribution strategy, pricing model, regulatory pathway, and required partnerships.

Orthogonal Applications (core to Catalyze's thesis):
- Identify at least 2–3 potential markets beyond the technology's original application.
- For each, estimate addressable market size and feasibility of entry.
- Example: technology developed for aerospace that could apply to medical devices, industrial equipment, or EV manufacturing.

Value Creation (replaces traditional PE levers):
- Focus on commercialization milestones, revenue ramp projections, partnership value, and exit scenarios.
- Organize into short_term (0–12 months), medium_term (1–3 years), long_term (3+ years).

Risk Assessment:
- Identify all material risks with severity and likelihood.
- Key risk categories for IP deals: technology maturity, IP ownership/chain of title, regulatory approval, market adoption, competition from the parent company, exclusivity constraints, commercialization capital requirements.

Scoring (0–100 scale, where 70–100 = strong/excellent; 50–69 = adequate/mixed; 30–49 = concerning; 0–29 = deal-breaking weakness):
- Score each dimension: market, management, financials, strategic_fit, ip_technology.
- ip_technology score is REQUIRED for IP/Technology deals.
- Compute overall as a weighted average (market 20%, management 15%, financials 20%, strategic_fit 20%, ip_technology 25%).
- Include a 2–3 sentence justification for each score.

Key Questions (5–10):
- Focus on technology validation, IP defensibility, commercialization pathway, and partnership requirements.

Recommendation:
- Verdict: PROCEED, FURTHER_REVIEW, or PASS.
- Flag disqualifying factors if present (e.g., encumbered IP, no clear commercialization path).

Return the analysis as valid JSON conforming exactly to the schema in the system prompt.`;
}

// ---------------------------------------------------------------------------
// ISTAnalysis schema validation
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateISTAnalysis(data: unknown): data is ISTAnalysis {
  if (!isObject(data)) return false;

  // Top-level string fields
  if (!isString(data.schema_version)) return false;
  if (!isString(data.generated_at)) return false;
  if (!isString(data.company_name)) return false;
  if (data.deal_type !== 'traditional_pe' && data.deal_type !== 'ip_technology')
    return false;
  if (!isString(data.executive_summary)) return false;

  // strengths
  if (!isArray(data.strengths)) return false;
  for (const s of data.strengths) {
    if (!isObject(s)) return false;
    if (!isString(s.title) || !isString(s.description)) return false;
    if (s.significance !== 'low' && s.significance !== 'medium' && s.significance !== 'high')
      return false;
  }

  // risks
  if (!isArray(data.risks)) return false;
  for (const r of data.risks) {
    if (!isObject(r)) return false;
    if (!isString(r.title) || !isString(r.description)) return false;
    if (
      r.severity !== 'low' &&
      r.severity !== 'medium' &&
      r.severity !== 'high' &&
      r.severity !== 'critical'
    )
      return false;
    if (
      r.likelihood !== 'low' &&
      r.likelihood !== 'medium' &&
      r.likelihood !== 'high'
    )
      return false;
  }

  // value_creation
  if (!isArray(data.value_creation)) return false;
  for (const v of data.value_creation) {
    if (!isObject(v)) return false;
    if (!isString(v.title) || !isString(v.description)) return false;
    if (
      v.timeframe !== 'short_term' &&
      v.timeframe !== 'medium_term' &&
      v.timeframe !== 'long_term'
    )
      return false;
    if (v.potential !== 'low' && v.potential !== 'medium' && v.potential !== 'high')
      return false;
  }

  // score
  if (!isObject(data.score)) return false;
  const score = data.score;
  if (!isNumber(score.overall) || !isNumber(score.market)) return false;
  if (!isNumber(score.management) || !isNumber(score.financials)) return false;
  if (!isNumber(score.strategic_fit)) return false;
  if (score.ip_technology !== null && !isNumber(score.ip_technology)) return false;
  if (!isObject(score.rationale)) return false;
  const rat = score.rationale;
  if (
    !isString(rat.overall) ||
    !isString(rat.market) ||
    !isString(rat.management) ||
    !isString(rat.financials) ||
    !isString(rat.strategic_fit)
  )
    return false;
  if (rat.ip_technology !== null && !isString(rat.ip_technology)) return false;

  // recommendation
  if (!isObject(data.recommendation)) return false;
  const rec = data.recommendation;
  if (
    rec.verdict !== 'PROCEED' &&
    rec.verdict !== 'FURTHER_REVIEW' &&
    rec.verdict !== 'PASS'
  )
    return false;
  if (!isString(rec.summary)) return false;
  if (!isArray(rec.conditions)) return false;
  if (!isBoolean(rec.is_disqualified)) return false;
  if (rec.disqualifier_reason !== null && !isString(rec.disqualifier_reason))
    return false;

  // key_questions
  if (!isArray(data.key_questions)) return false;
  for (const q of data.key_questions) {
    if (!isObject(q)) return false;
    if (!isString(q.question) || !isString(q.rationale)) return false;
    if (q.priority !== 'low' && q.priority !== 'medium' && q.priority !== 'high')
      return false;
  }

  // data_quality
  if (!isObject(data.data_quality)) return false;
  const dq = data.data_quality;
  if (dq.confidence !== 'low' && dq.confidence !== 'medium' && dq.confidence !== 'high')
    return false;
  if (!isNumber(dq.completeness_pct)) return false;
  if (!isArray(dq.missing_data)) return false;
  if (!isString(dq.caveats)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Cost estimation — claude-sonnet-4-5 pricing
// Rates as of 2025-09: Input $3 / million tokens; Output $15 / million tokens.
// These values are specific to the claude-sonnet-4-5-20250929 model.
// If the model or Anthropic pricing changes, update the constants below.
// ---------------------------------------------------------------------------

const COST_PER_MILLION_INPUT_TOKENS = 3; // USD
const COST_PER_MILLION_OUTPUT_TOKENS = 15; // USD

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * COST_PER_MILLION_INPUT_TOKENS +
      outputTokens * COST_PER_MILLION_OUTPUT_TOKENS) /
    1_000_000
  );
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ------------------------------------------------------------------
    // 1. Verify the user is authenticated
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('Missing required Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Create a Supabase client scoped to the requesting user's JWT to
    // authenticate them and resolve their user ID.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 2. Parse and validate the request body
    // ------------------------------------------------------------------
    let body: { extractedText: string; dealType: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const { extractedText, dealType } = body;

    if (!isString(extractedText) || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'extractedText must be a non-empty string' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (dealType !== 'traditional_pe' && dealType !== 'ip_technology') {
      return new Response(
        JSON.stringify({
          error: 'dealType must be "traditional_pe" or "ip_technology"',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 3. Call the Anthropic Claude API
    // ------------------------------------------------------------------
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const model = 'claude-sonnet-4-5-20250929';
    const analysisPrompt = buildAnalysisPrompt(extractedText, dealType as DealType);

    const requestStartMs = Date.now();
    let anthropicResponse: Response;

    try {
      anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          // 8 192 tokens is sufficient for the full structured ISTAnalysis JSON
          // output for both Traditional PE and IP/Technology deals (typical
          // responses are 2 000–5 000 tokens). Raise this limit if longer
          // documents or more detailed analyses are required in the future.
          max_tokens: 8192,
          system: IST_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      });
    } catch (fetchError) {
      console.error('Failed to reach Anthropic API:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to reach AI provider' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const latencyMs = Date.now() - requestStartMs;
    const httpStatus = anthropicResponse.status;

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error(`Anthropic API error ${httpStatus}:`, errorBody);

      // Log the failed call before returning
      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        httpStatus,
        errorMessage: `Anthropic API error ${httpStatus}: ${errorBody.slice(0, 500)}`,
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned an error', details: httpStatus }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 4. Extract and validate the response
    // ------------------------------------------------------------------
    const anthropicData = await anthropicResponse.json();

    const inputTokens: number = anthropicData?.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData?.usage?.output_tokens ?? 0;
    const costUsd = estimateCostUsd(inputTokens, outputTokens);

    // Extract the text content from the first content block
    const rawContent: string =
      anthropicData?.content?.[0]?.type === 'text'
        ? anthropicData.content[0].text
        : '';

    if (!rawContent) {
      console.error('Anthropic returned empty content', JSON.stringify(anthropicData));

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: 'Anthropic returned empty content',
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned empty content' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Parse the JSON — Claude may wrap it in a markdown code block
    let parsedAnalysis: unknown;
    try {
      // Strip optional markdown fences (```json ... ```)
      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsedAnalysis = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse Claude JSON response:', parseError, rawContent);

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: `JSON parse error: ${String(parseError)}`,
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned invalid JSON' }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!validateISTAnalysis(parsedAnalysis)) {
      console.error('ISTAnalysis schema validation failed', JSON.stringify(parsedAnalysis));

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: 'ISTAnalysis schema validation failed',
      });

      return new Response(
        JSON.stringify({ error: 'AI response did not conform to the ISTAnalysis schema' }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 5. Log the successful API call to api_usage_log
    // ------------------------------------------------------------------
    await logApiUsage({
      supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
      userId: user.id,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      httpStatus,
      errorMessage: null,
    });

    // ------------------------------------------------------------------
    // 6. Return the parsed ISTAnalysis
    // ------------------------------------------------------------------
    return new Response(JSON.stringify(parsedAnalysis), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in analyze-deal function:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});

// ---------------------------------------------------------------------------
// api_usage_log helper
// ---------------------------------------------------------------------------

interface LogApiUsageParams {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  httpStatus: number;
  errorMessage: string | null;
}

async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  try {
    const adminClient = createClient(params.supabaseUrl, params.serviceRoleKey);

    const { error } = await adminClient.from('api_usage_log').insert({
      user_id: params.userId,
      provider: 'anthropic',
      model: params.model,
      endpoint: 'https://api.anthropic.com/v1/messages',
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: params.costUsd,
      latency_ms: params.latencyMs,
      http_status: params.httpStatus,
      error_message: params.errorMessage,
      request_meta: { max_tokens: 8192 },
    });

    if (error) {
      console.error('Failed to insert api_usage_log record:', error);
    }
  } catch (err) {
    console.error('Unexpected error while logging API usage:', err);
  }
}
