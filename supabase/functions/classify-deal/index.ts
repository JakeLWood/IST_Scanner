import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Output schema (mirrors lib/prompts/classify-deal-type.ts)
// ---------------------------------------------------------------------------

interface DealTypeClassificationResult {
  deal_type: 'traditional_pe' | 'ip_technology';
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Classification system prompt
// (mirrors CLASSIFICATION_SYSTEM_PROMPT in lib/prompts/classify-deal-type.ts)
// ---------------------------------------------------------------------------

const CLASSIFICATION_SYSTEM_PROMPT = `You are a senior Private Equity associate at Catalyze Partners, a firm that acquires and commercializes advanced technologies and lower middle market operating companies.

Your task is to read an inbound deal document and classify it into exactly one of two categories before a full Investment Screening Test (IST) is conducted:

1. **traditional_pe** – The document describes an operating company that generates revenue and cash flow in the conventional sense. Catalyze would acquire it as a going-concern lower-middle-market business and apply its operational playbook.

2. **ip_technology** – The document describes a technology asset, patent portfolio, or IP-rich division that requires commercialisation or licensing rather than straightforward operational management.

## Classification heuristics (PRD §4.3)

Apply every rule below to the document. Each signal pushes toward one category. Weigh all signals together and select the category supported by the strongest evidence.

| Signal present in the document | Classification |
|---|---|
| Describes an **operating company with existing revenue and positive cash flow** | → traditional_pe |
| Describes a **technology, patent portfolio, or IP asset being divested or licensed** | → ip_technology |
| References a **Fortune 100 parent company spinning out or divesting a division** | → ip_technology |
| Discusses **Technology Readiness Levels (TRL), prototypes, or R&D programmes** | → ip_technology |
| Presents a **CIM-style financial profile with three or more years of historical financials** | → traditional_pe |

**Tie-breaking rule:** When signals conflict (e.g. an operating company that also holds significant IP), classify based on the *primary value driver* described in the document and note the hybrid nature in the \`reasoning\` field.

## Analytical philosophy

- Be rigorous and skeptical. Do not infer signals that are not clearly present in the document.
- Distinguish between facts stated in the document and your own inferences.
- If the document is extremely thin or ambiguous, default to \`"traditional_pe"\` with a confidence of \`0.5\` and explain the ambiguity in \`reasoning\`.

## Output format

Return **only** a valid JSON object — no surrounding prose, markdown fences, or explanation. The object must conform exactly to the following schema:

{
  "deal_type": "traditional_pe" | "ip_technology",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<1–3 sentences citing the specific signals from the document that drove this classification>"
}

Confidence scale:
- 0.90 – 1.00 : Unambiguous evidence; multiple signals all point to the same category.
- 0.70 – 0.89 : Clear primary signals with minor conflicting indicators.
- 0.50 – 0.69 : Document is ambiguous or lacks sufficient detail; classification is a best estimate.
- Do not return a confidence value below 0.50.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function buildClassificationPrompt(extractedText: string): string {
  return `Classify the following deal document according to your instructions.

<document>
${extractedText}
</document>

Return only the JSON classification object.`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isValidClassification(data: unknown): data is DealTypeClassificationResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.deal_type !== 'traditional_pe' && d.deal_type !== 'ip_technology') return false;
  if (typeof d.confidence !== 'number' || d.confidence < 0 || d.confidence > 1) return false;
  if (typeof d.reasoning !== 'string') return false;
  return true;
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing required Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

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
    let body: { extractedText: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const { extractedText } = body;

    if (!isString(extractedText) || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'extractedText must be a non-empty string' }),
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
    const userMessage = buildClassificationPrompt(extractedText);

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
          max_tokens: 256,
          system: CLASSIFICATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch (fetchError) {
      console.error('Failed to reach Anthropic API:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to reach AI provider' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error(`Anthropic API error ${anthropicResponse.status}:`, errorBody);
      return new Response(
        JSON.stringify({ error: 'AI provider returned an error', details: anthropicResponse.status }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 4. Extract and validate the response
    // ------------------------------------------------------------------
    const anthropicData = await anthropicResponse.json();

    const rawContent: string =
      anthropicData?.content?.[0]?.type === 'text'
        ? anthropicData.content[0].text
        : '';

    if (!rawContent) {
      console.error('Anthropic returned empty content');
      return new Response(
        JSON.stringify({ error: 'AI provider returned empty content' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    let parsedResult: unknown;
    try {
      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsedResult = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse Claude JSON response:', parseError, rawContent);
      return new Response(
        JSON.stringify({ error: 'AI provider returned unparseable JSON' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!isValidClassification(parsedResult)) {
      console.error('Classification result did not match expected schema:', parsedResult);
      return new Response(
        JSON.stringify({ error: 'AI response did not conform to the classification schema' }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 5. Return the classification result
    // ------------------------------------------------------------------
    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in classify-deal function:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
