
PRODUCT REQUIREMENTS DOCUMENT
Catalyze Partners
AI-Powered Deal Screener
Investment Screening Test (IST) Automation Platform
Automated Intake, Scoring, and Screening of Inbound Deal Flow
Version	1.0
Date	February 25, 2026
Classification	Internal — Confidential
Prepared For	Technical Intern
Target Completion	May 31, 2026
Firm	Catalyze Partners
 
Table of Contents
Table of Contents	2
1. Executive Summary	4
1.1 Project Overview	4
1.2 Business Problem	4
1.3 Success Criteria	4
1.4 Timeline	5
2. System Architecture	6
2.1 High-Level Architecture	6
2.2 Technology Stack	6
2.3 Data Flow	7
2.4 API Proxy & Security	7
3. The IST Framework — Screening Methodology	8
3.1 IST Output Structure	8
3.2 Screening Dimensions — Common to Both Tracks	8
3.3 Additional Dimensions — Traditional PE Track	9
3.4 Additional Dimensions — IP / Technology Commercialization Track	10
3.5 Scoring Weights	11
3.6 Composite Score & Recommendation Thresholds	12
4. Document Ingestion & Data Extraction	14
4.1 Supported Input Formats	14
4.2 Data Extraction Requirements	14
4.2.1 Structured Data Extraction	14
4.2.2 Handling Missing Data	15
4.3 Deal Type Classification	15
5. AI Analysis Engine — Prompt Architecture	17
5.1 System Prompt — Core Identity	17
5.2 Analysis Prompt Template — Traditional PE	17
5.3 Analysis Prompt Template — IP / Technology Track	19
5.4 Structured Output Schema	19
6. User Interface Specifications	21
6.1 Design Principles	21
6.2 Page Structure	21
6.2.1 Upload / New Screening Page	21
6.2.2 Screening Results Page	21
6.2.3 Screening History / Deal Log Page	23
6.2.4 Deal Comparison Page	23
6.2.5 Settings / Admin Page	23
7. Database Schema	25
7.1 Core Tables	25
7.2 Indexing & Search	25
7.3 Row-Level Security	25
8. Integrations & Future Extensions	27
8.1 DealFlow Platform Integration	27
8.2 Email Forwarding (Stretch Goal)	27
8.3 Market Research Enhancement (Stretch Goal)	27
8.4 Decision Log & Pattern Learning (Stretch Goal)	27
9. Testing & Quality Assurance	29
9.1 Calibration Testing (Critical)	29
9.2 Quality Benchmarking	29
9.3 Edge Case Testing	29
9.4 Acceptance Criteria	30
10. Appendices	31
Appendix A: Reference IST Output — Omega Technologies	31
Appendix B: Feature Checklist	32
Appendix C: Glossary	34

 
1. Executive Summary
1.1 Project Overview
This document defines the requirements for an AI-powered deal screening application — the Investment Screening Test (IST) Platform. The tool will allow Catalyze Partners to rapidly evaluate inbound acquisition opportunities by ingesting deal documents (one-pagers, teasers, CIMs, pitch decks) and automatically producing a structured, scored screening analysis with a PROCEED / FURTHER REVIEW / PASS recommendation.
Catalyze Partners evaluates two distinct categories of acquisition opportunities, and the screener must handle both:
•	Traditional PE Deal Flow: Lower middle market companies sourced through bankers, M&A advisors, and proprietary outreach. These typically arrive as CIMs, teasers, or one-pagers with financial data, company descriptions, and transaction parameters.
•	Fortune 100 IP / Technology Commercialization: Technologies or intellectual property being divested, spun out, or licensed from large corporations. These arrive as pitch decks, technical briefs, or partnership proposals. Evaluation criteria differ significantly from traditional PE deals — the focus shifts to technology readiness, IP defensibility, commercialization pathway, and orthogonal application potential.
The system must be intelligent enough to detect which type of opportunity it is evaluating and apply the appropriate screening framework automatically.
1.2 Business Problem
The deal screening and due diligence process is currently the firm’s biggest operational pain point. There is no structured, repeatable way to evaluate inbound deal flow. Screening is done ad hoc, which leads to inconsistent evaluations, missed red flags, wasted time on poor-fit deals, and difficulty comparing opportunities against each other. The firm sees a high volume of inbound deals, and the ability to efficiently screen out 70–80% of opportunities that don’t fit would free up significant time for deeper diligence on the most promising targets.
1.3 Success Criteria
•	A team member can upload a deal document and receive a complete IST screening analysis within 60 seconds
•	The screening output matches or exceeds the quality of the IST analyses the firm has produced manually (see Appendix A for reference)
•	The scoring system reliably separates strong opportunities from poor fits — validated against at least 15–20 historical deals where the firm knows the correct outcome
•	The system correctly identifies the deal type (Traditional PE vs. IP/Technology Commercialization) and applies the appropriate framework
•	All screening outputs are stored in a searchable database that builds institutional knowledge over time
•	The tool is usable by non-technical team members with no training beyond a 10-minute walkthrough
•	The system remains fully functional after the intern’s engagement ends (no dependency on the intern for ongoing operation)
1.4 Timeline
Phase	Duration	Deliverables
Phase 1: Foundation & IST Engine	Weeks 1–4	Document ingestion pipeline, data extraction logic, IST scoring engine, core screening output template, basic web UI
Phase 2: Scoring Calibration & Dual-Track	Weeks 5–8	Calibrate scoring against historical deals, implement IP/Technology track, build comparison views, refine output quality
Phase 3: Database, Search & Intelligence	Weeks 9–12	Screening history database, search/filter, deal comparison, market research integration, pattern detection
Phase 4: Polish, Testing & Handoff	Weeks 13–16	Performance optimization, documentation, team training, stress testing, deployment, handoff materials
 
2. System Architecture
2.1 High-Level Architecture
The system consists of four major components that work together in a pipeline:

Component	Purpose	Technology
Document Ingestion Layer	Accepts uploaded documents (PDF, DOCX, PPTX, images), extracts text and structured data, normalizes into a standard format for analysis	PDF parsing (pdf-parse or pdfjs), OCR fallback (Tesseract), PPTX/DOCX text extraction, file upload handling
AI Analysis Engine	Sends extracted content to Claude API with IST-specific system prompts, receives structured screening analysis	Anthropic Claude API (claude-sonnet-4-5-20250929 or latest), structured output prompting, JSON schema enforcement
Scoring & Decision Engine	Takes the AI-generated analysis and computes numerical scores across all screening dimensions, applies weighting, generates composite score and recommendation	Custom scoring logic (TypeScript), configurable weights and thresholds
Web Application & Database	User interface for uploading documents, viewing results, searching history, comparing deals, and configuring settings	React frontend, Supabase backend (PostgreSQL + Auth + Storage), Vercel hosting
2.2 Technology Stack
Layer	Technology	Rationale
Frontend	React 18+ with TypeScript, Tailwind CSS	Fast development, type safety, modern UI
Backend / Database	Supabase (PostgreSQL + Auth + Storage)	Hosted Postgres, built-in auth, file storage, no server management
AI Engine	Anthropic Claude API	Best-in-class document analysis, structured reasoning, the firm already uses Claude extensively
PDF Processing	pdf-parse + Tesseract.js (OCR fallback)	Extract text from uploaded PDFs; OCR for scanned documents
Document Processing	mammoth (DOCX), pptx2json (PPTX)	Extract text from non-PDF document formats
Hosting	Vercel (frontend) + Supabase (backend)	Zero-config deployment, edge functions for API proxy
Email Notifications	Resend	Send screening results to team members
2.3 Data Flow
The complete data flow for a screening request is as follows:
1.	Upload: User uploads a deal document (PDF, DOCX, PPTX, or image) through the web interface
2.	Extract: The ingestion layer extracts all text content from the document. For PDFs, use text extraction first; fall back to OCR if text layer is empty. For images, use OCR directly.
3.	Classify: Send extracted text to Claude with a classification prompt to determine deal type: Traditional PE or IP/Technology Commercialization. This determines which scoring framework to apply.
4.	Analyze: Send extracted text to Claude with the full IST analysis prompt (specific to the identified deal type). Claude returns a structured JSON response containing all screening dimensions, scores, findings, and recommendation.
5.	Score: The scoring engine takes Claude’s structured output and computes weighted numerical scores. Apply configurable thresholds to generate PROCEED / FURTHER REVIEW / PASS recommendation.
6.	Store: Save the complete screening record to the database: raw document, extracted text, AI analysis, scores, recommendation, metadata, and timestamp.
7.	Present: Display the formatted IST screening report to the user. Provide options to: export to PDF, share via email, add notes, override recommendation, and compare with other screened deals.
2.4 API Proxy & Security
The Claude API key must never be exposed to the client. All AI requests must route through a Supabase Edge Function or Vercel serverless function that holds the API key server-side. The proxy should also:
•	Validate that the requesting user is authenticated
•	Log all API calls for cost tracking and debugging
•	Enforce rate limiting to prevent accidental cost overruns (e.g., max 50 screenings per day)
•	Cache results — if the same document is uploaded again, return the cached analysis rather than calling the API again
 
3. The IST Framework — Screening Methodology
The Investment Screening Test (IST) is Catalyze Partners’ proprietary framework for rapidly evaluating acquisition opportunities. This section defines every dimension of the framework, the scoring methodology, and how the two deal tracks differ. This is the intellectual core of the entire application — the developer must understand it thoroughly.
3.1 IST Output Structure
Every IST screening analysis must produce the following sections, regardless of deal type. This structure mirrors the format the firm has used in manual IST analyses:

Section	Purpose	Contents
I. Investment Snapshot	Quick-reference header with key facts	Company name, industry, location, transaction type, financial snapshot (revenue, EBITDA, margin, employees, growth rate), deal source
II. Investment Strengths	Structured assessment of what makes this opportunity attractive	3–6 categorized strength areas with supporting data points. Categories vary by deal type (see 3.3 and 3.4).
III. Strategic Considerations	Risk assessment and mitigation analysis	Risk/Mitigation table with severity ratings (High/Medium/Low) and specific mitigation factors. Plus prioritized due diligence focus areas.
IV. Value Creation Thesis	How the firm would create value post-acquisition	Near-term opportunities (12–24 months) with estimated EBITDA impact and investment required. Medium-term opportunities (24–36 months). Strategic exit positioning.
V. Scoring Summary	Quantitative scoring across all dimensions	Scores (1–10) for each screening dimension, dimension weights, weighted composite score, visual score breakdown
VI. Recommendation	Final verdict with reasoning	PROCEED / FURTHER REVIEW / PASS with 3–5 bullet justification. If PROCEED: suggested LOI terms and critical diligence focus areas. If PASS: specific disqualifying factors.
VII. Key Questions	Questions the deal team should ask management or the intermediary	5–10 targeted questions with parenthetical noting which risk/thesis each question validates
3.2 Screening Dimensions — Common to Both Tracks
The following dimensions apply to both Traditional PE and IP/Technology deals, though the specific criteria and weighting differ:

Dimension	What It Measures	Score Range	Key Indicators
Market Attractiveness	Size, growth rate, and favorability of the target market	1–10	TAM > $1B preferred; market CAGR > GDP growth; favorable secular trends; low cyclicality; fragmented (consolidation opportunity)
Competitive Position	How defensible is the company’s market position	1–10	Market share; barriers to entry; switching costs; brand strength; customer relationships; patent/IP protection; pricing power
Management & Team	Quality and depth of the leadership team	1–10	Track record; tenure; depth below founder; succession readiness; key-person dependency risk; culture indicators
Customer Quality	Health and diversification of the customer base	1–10	Customer concentration (top customer < 15% of revenue preferred); contract vs. spot revenue mix; retention/churn rates; customer quality (blue-chip vs. SMB); NPS/satisfaction
Value Creation Potential	Upside available post-acquisition	1–10	Identifiable EBITDA improvement > 30% of entry EBITDA; organic growth levers; margin expansion opportunities; bolt-on potential; operational improvements; pricing power
Risk Profile	Overall risk level and manageability of risks	1–10 (10 = low risk)	Number and severity of identified risks; quality of mitigations available; regulatory/legal exposure; cyclicality; technology obsolescence risk; environmental/ESG issues
Strategic Fit	Alignment with Catalyze Partners’ investment thesis and capabilities	1–10	Technology/industrial focus alignment; shared services leverage potential; portfolio synergies; sector expertise; geographic fit (U.S.-based preferred)
3.3 Additional Dimensions — Traditional PE Track
For traditional PE deals (operating companies with established revenue and cash flow), the following additional dimensions are scored:

Dimension	What It Measures	Score Range	Key Indicators
Financial Quality	Reliability and attractiveness of financial performance	1–10	Revenue trajectory (3-year growth); EBITDA margins vs. industry; margin stability/expansion; working capital efficiency; capex intensity; quality of earnings (adjustment magnitude); debt levels; cash flow conversion
Valuation Attractiveness	Whether the asking price represents good value	1–10	EV/EBITDA multiple vs. sector comps; implied returns at target hold period; multiple arbitrage potential on exit; revenue multiple reasonableness
Transaction Feasibility	Likelihood of getting a deal done at reasonable terms	1–10	Seller motivation/timeline; process competitiveness (auction vs. proprietary); financing availability; regulatory/antitrust complexity; deal structure flexibility
3.4 Additional Dimensions — IP / Technology Commercialization Track
For technology/IP opportunities sourced from Fortune 100 companies or research institutions, the following dimensions replace the PE-specific ones:

Dimension	What It Measures	Score Range	Key Indicators
Technology Readiness	How close the technology is to commercial viability	1–10	Technology Readiness Level (TRL 1–9); prototype existence; testing/validation data; manufacturing scalability; remaining R&D required; time-to-market estimate
IP Strength & Defensibility	How well-protected the intellectual property is	1–10	Patent portfolio (granted vs. pending; breadth of claims; remaining life); trade secrets; freedom to operate; competitive IP landscape; licensing encumbrances; geographic coverage
Commercialization Pathway	Clarity and feasibility of the path to revenue	1–10	Identified target customers; distribution strategy; go-to-market plan; pricing model viability; required partnerships; regulatory pathway (FDA, FAA, etc.); estimated time-to-revenue
Orthogonal Application Potential	Ability to apply the technology to markets beyond its original use case	1–10	This is a core Catalyze thesis: technology developed for one domain (e.g., defense) that can be commercialized in adjacent markets (e.g., industrial, medical, consumer). Score higher when multiple credible applications exist.
3.5 Scoring Weights
Dimensions are weighted to reflect their relative importance to the investment decision. Weights must be configurable by administrators, but the default values are:

Traditional PE Track Weights
Dimension	Default Weight	Rationale
Financial Quality	20%	Cash flow is king in PE — financial performance is the primary driver of returns
Market Attractiveness	15%	Attractive markets provide organic tailwinds and exit optionality
Value Creation Potential	15%	The firm’s ability to improve the business post-acquisition drives returns
Competitive Position	12%	Defensibility protects margins and enables pricing power
Customer Quality	10%	Revenue quality and concentration directly affect risk and valuation
Risk Profile	10%	Overall risk level determines probability of achieving thesis
Strategic Fit	8%	Alignment with Catalyze’s capabilities and portfolio
Valuation Attractiveness	5%	Price is what you pay; value is what you get — but a bad price can sink returns
Transaction Feasibility	3%	Process dynamics affect ability to close but not intrinsic value
Management & Team	2%	Important but can be supplemented post-acquisition in lower middle market

IP / Technology Track Weights
Dimension	Default Weight	Rationale
Technology Readiness	18%	Immature tech = high risk of failure; TRL is the primary gating criterion
IP Strength & Defensibility	16%	Without strong IP, there is no sustainable competitive advantage
Market Attractiveness	15%	Even great technology needs a large, growing market
Commercialization Pathway	14%	A clear path to revenue is essential — technology without a business model is a hobby
Orthogonal Application Potential	12%	Core Catalyze thesis: multi-market applicability multiplies value
Competitive Position	8%	Technology advantage relative to alternatives and incumbents
Value Creation Potential	7%	Ability to grow and scale post-acquisition
Risk Profile	5%	Overall risk assessment
Strategic Fit	3%	Portfolio and capability alignment
Management & Team	2%	Can be built from scratch for technology spinouts
3.6 Composite Score & Recommendation Thresholds
The composite score is the weighted average of all dimension scores, yielding a value from 1.0 to 10.0. The recommendation is derived from the composite score using the following thresholds (configurable):

Composite Score	Recommendation	Action	Color Code
7.5 – 10.0	PROCEED	Move to LOI discussion and/or detailed due diligence. Generate suggested LOI terms and critical diligence priorities.	Green
5.5 – 7.4	FURTHER REVIEW	The opportunity has merit but also significant questions. Identify the 2–3 key issues that would need to be resolved before proceeding. Recommend specific follow-up actions.	Amber
1.0 – 5.4	PASS	The opportunity does not meet Catalyze’s criteria. Document the specific disqualifying factors for the deal log. Provide a clear, concise explanation.	Red

Hard Disqualifiers (Automatic PASS regardless of score):
•	Revenue below $2M: Too small for meaningful PE returns at Catalyze’s scale
•	Non-U.S. headquartered: Unless the technology IP is uniquely compelling and can be operated domestically
•	Regulated substance / cannabis / cryptocurrency: Outside Catalyze’s mandate
•	Heavy cyclicality with no recurring revenue: E.g., pure construction, commodities, or oil & gas exploration
•	Asking multiple above 15x EBITDA with no clear justification: Unless high-growth SaaS or technology with exceptional defensibility
Hard disqualifiers should be configurable. The developer should build an admin interface where the firm can add, edit, or remove disqualifiers without code changes.
 
4. Document Ingestion & Data Extraction
4.1 Supported Input Formats
Format	Common Use Case	Extraction Method
PDF (text-based)	CIMs, teasers, broker one-pagers, financial summaries	pdf-parse library for text extraction. Preserve table structure where possible.
PDF (scanned/image)	Older CIMs, faxed documents, signed NDAs with embedded info	OCR via Tesseract.js. Pre-process images for contrast/skew correction.
DOCX	Deal memos, company descriptions, broker write-ups	mammoth library for text extraction with formatting hints.
PPTX	Pitch decks, company presentations, technology briefs	pptx2json or similar. Extract text from all slides, including speaker notes.
Images (PNG/JPG)	Screenshots of deal summaries, photos of documents	OCR via Tesseract.js.
Plain Text / Paste	Email bodies, LinkedIn messages, brief deal descriptions	Direct text input — no extraction needed.
4.2 Data Extraction Requirements
The extraction layer should attempt to identify and structure the following data points from the uploaded document. Not all documents will contain all fields — the system should extract what is available and flag what is missing.
4.2.1 Structured Data Extraction
Field	Expected Format	Extraction Priority
Company Name	Text	Critical
Industry / Sector	Text	Critical
Location (HQ)	City, State	High
Transaction Type	Acquisition / Divestiture / Recapitalization / Licensing / Spinout	High
Revenue	Currency (annual)	Critical
Revenue Growth Rate	Percentage (YoY or CAGR)	High
EBITDA / Adj. EBITDA	Currency (annual)	Critical
EBITDA Margin	Percentage	High
Asking Price / Valuation	Currency or Multiple (e.g., 6x EBITDA)	High
Employee Count	Number	Medium
Year Founded	Year	Medium
Deal Source	Broker name, referral source, or proprietary	Medium
Customer Concentration	Top customer % of revenue	High
Key Products / Services	Text list	High
IP / Patents	Count or description	High (especially for tech track)
Seller Motivation	Text (retirement, strategic exit, growth capital, etc.)	Medium
Process Type	Auction / Limited / Proprietary / Bilateral	Medium
4.2.2 Handling Missing Data
The system should handle missing data gracefully:
•	Critical fields missing: If revenue AND EBITDA are both absent, flag the screening as “Insufficient Data” and ask the user to provide additional information or a supplementary document. Do not attempt a full scoring.
•	Non-critical fields missing: Score the available dimensions. In the output, clearly note which dimensions could not be fully scored due to missing data, and what information would be needed to complete the analysis.
•	Inferred data: Where possible, infer missing data (e.g., calculate EBITDA margin from EBITDA and revenue). Always label inferred values as “Calculated” or “Estimated” in the output.
4.3 Deal Type Classification
After extracting text, the system must classify the opportunity as one of two types before applying the screening framework. The classification prompt to Claude should consider:
•	Does the document describe an operating company with revenue and cash flow? → Traditional PE
•	Does the document describe a technology, patent portfolio, or IP being divested or licensed? → IP/Technology
•	Does it reference a Fortune 100 parent company spinning out or divesting a division? → IP/Technology
•	Is there discussion of Technology Readiness Levels, prototypes, or R&D? → IP/Technology
•	Is there a CIM-style financial profile with 3+ years of historical financials? → Traditional PE
The system should display the classification to the user and allow manual override before proceeding with the analysis.
 
5. AI Analysis Engine — Prompt Architecture
The quality of the IST output depends entirely on the quality of the prompts sent to Claude. This section specifies the prompt architecture in detail. The developer should treat these prompts as living documents that will be refined during calibration (Phase 2), but the initial structure must be robust.
5.1 System Prompt — Core Identity
The system prompt establishes Claude’s role and analytical framework. It should be stored as a configurable text field in the admin settings (not hardcoded) so the firm can refine it over time. The system prompt must include:
•	Role definition: You are a senior Private Equity associate at Catalyze Partners, a firm that acquires and commercializes advanced technologies and lower middle market operating companies. Your task is to perform an Investment Screening Test (IST) on the provided deal document.
•	Analytical philosophy: Be rigorous, skeptical, and data-driven. Prefer conservative estimates over optimistic projections. Flag areas where the document makes claims without supporting evidence. Distinguish between facts stated in the document and your own inferences.
•	Firm context: Catalyze Partners’ portfolio includes companies in aerospace (Metro Aerospace), advanced materials (Alpine Advanced Materials), and analytical instrumentation (Axcend). The firm specializes in technology-driven industrial businesses. Catalyze provides shared services across portfolio companies. The firm looks for companies where it can apply operational expertise and technology commercialization capabilities.
•	Output format: Return your analysis as a structured JSON object following the exact schema provided. Every score must include a 2–3 sentence justification. Every strength must include specific supporting data from the document. Every risk must include a severity rating and a proposed mitigation.
5.2 Analysis Prompt Template — Traditional PE
The analysis prompt for Traditional PE deals should instruct Claude to evaluate the following areas. This is the detailed instruction set for how to conduct the IST:

Investment Snapshot Instructions:
•	Extract all factual data points about the company: name, industry, location, financials, employees, founding year, transaction type
•	Calculate any derived metrics: EBITDA margin, EV/EBITDA multiple, revenue per employee, revenue CAGR
•	Note the deal source and process type if mentioned

Investment Strengths Instructions:
•	Identify 3–6 major investment strengths, organized into categories such as: Market Position, Business Model, Financial Profile, Market Tailwinds, IP & Differentiation, Customer Quality, Growth Trajectory
•	Each strength must cite specific data from the document (numbers, percentages, customer names, product details)
•	Do not fabricate strengths that are not supported by the document. If the document is thin on a particular area, note it as “insufficient data to assess”

Risk Assessment Instructions:
•	Identify all material risks. Present as a table with columns: Risk, Severity (High/Medium/Low), Mitigation
•	Common risk categories to evaluate: founder/key-person dependency, customer concentration, supplier concentration, technology obsolescence, regulatory/compliance, cyclicality, competitive threats, working capital issues, lease/facility risks, integration complexity
•	For each risk, evaluate whether a credible mitigation exists based on information in the document
•	Be skeptical: if the document claims a risk is mitigated but provides no evidence, rate the severity higher

Value Creation Thesis Instructions:
•	Identify specific, actionable value creation levers with estimated EBITDA impact ranges and investment required
•	Organize into near-term (12–24 months), medium-term (24–36 months), and strategic exit positioning
•	Value creation levers should be realistic and tied to evidence in the document or industry norms
•	Total identified EBITDA upside should be expressed as a percentage of entry EBITDA

Scoring Instructions:
•	Score each dimension on a 1–10 scale with 2–3 sentence justification per score
•	A score of 7–10 = strong/excellent; 5–6 = adequate/mixed; 3–4 = concerning; 1–2 = deal-breaking weakness
•	Be calibrated: a “10” should be rare and reserved for truly exceptional attributes. Most good deals will score 6–8 on most dimensions.
•	If insufficient data exists to score a dimension, return null with an explanation of what data would be needed

Key Questions Instructions:
•	Generate 5–10 questions the deal team should ask the target’s management or the intermediary
•	Each question should target a specific risk, validate a key assumption, or fill a data gap identified during the analysis
•	Include a parenthetical after each question noting which risk or thesis element it validates
5.3 Analysis Prompt Template — IP / Technology Track
The IP/Technology prompt follows the same structure but with different emphasis. Key differences:
•	Technology Readiness Assessment: Evaluate TRL level (1–9), prototype status, testing data, manufacturing scalability, remaining development work, and time-to-market
•	IP Deep Dive: Evaluate patent portfolio (granted vs. pending, claim breadth, remaining life, geographic coverage), trade secrets, freedom-to-operate concerns, licensing terms from the parent company
•	Commercialization Analysis: Identify target customers, distribution strategy, pricing model, regulatory pathway, and required partnerships
•	Orthogonal Applications: This is core to Catalyze’s thesis. Identify at least 2–3 potential markets beyond the technology’s original application. For each, estimate addressable market size and feasibility of entry. Example: technology developed for aerospace that could be applied to medical devices, industrial equipment, or EV manufacturing.
•	Value Creation replaces traditional PE levers: Focus on commercialization milestones, revenue ramp projections, partnership value, and exit scenarios (strategic sale to an industry buyer, IPO, licensing)
5.4 Structured Output Schema
Claude must return its analysis as a JSON object conforming to a strict schema. This enables the scoring engine and the UI to parse results programmatically. The schema should include:
•	deal_type: “traditional_pe” or “ip_technology”
•	snapshot: object containing all extracted factual data
•	strengths: array of {category, title, description, supporting_data[]}
•	risks: array of {risk, severity, mitigation, evidence}
•	value_creation: {near_term: [], medium_term: [], exit_positioning: []} each with {initiative, ebitda_impact_low, ebitda_impact_high, investment_required, timeline}
•	scores: array of {dimension, score (1–10 or null), justification, data_gaps[]}
•	recommendation: {verdict: PROCEED | FURTHER_REVIEW | PASS, reasoning: [], suggested_loi_terms (if PROCEED), disqualifying_factors (if PASS)}
•	key_questions: array of {question, validates}
•	data_quality: {completeness_pct, missing_critical_fields[], caveats[]}
The developer should define this schema as a TypeScript interface and validate all Claude responses against it. Invalid responses should trigger a retry with a correction prompt.
 
6. User Interface Specifications
6.1 Design Principles
•	Clarity over decoration: The UI exists to present analytical findings clearly. Every visual element should serve the decision-maker. Avoid gratuitous animation or visual complexity.
•	Scannable hierarchy: Partners and MDs will spend 30–60 seconds scanning a screening result before deciding whether to read in depth. The recommendation, composite score, and key strengths/risks must be visible without scrolling.
•	Dark theme: Consistent with the firm’s DealFlow platform (see separate PRD). Use the same color system: navy/slate backgrounds, indigo accents, green/amber/red for status.
•	Monospaced numbers: All financial figures, scores, and percentages should use a monospaced font (JetBrains Mono) for easy scanning and alignment.
6.2 Page Structure
6.2.1 Upload / New Screening Page
This is the entry point for initiating a new screening:
•	Large drag-and-drop zone for file upload (with a click-to-browse fallback)
•	Alternatively, a large text area for pasting deal descriptions directly (for email-forwarded deals)
•	Accepted file types clearly indicated (PDF, DOCX, PPTX, PNG, JPG)
•	Maximum file size: 25MB
•	Optional metadata fields before submission: deal source (dropdown), deal name override (text), notes (text)
•	A prominent “Screen This Deal” button that initiates the analysis
•	During processing: a progress indicator showing extraction → classification → analysis → scoring steps
•	Estimated processing time displayed (typically 15–45 seconds depending on document length)
6.2.2 Screening Results Page
This is the most important page in the application. It displays the complete IST analysis for a single deal.

Header Section (always visible):
•	Company name (large, bold)
•	Deal type badge (Traditional PE or IP/Technology)
•	Composite score displayed as a large, color-coded number (green/amber/red)
•	Recommendation badge: PROCEED (green), FURTHER REVIEW (amber), PASS (red)
•	Date screened, screened by, deal source
•	Action buttons: Export PDF, Share via Email, Add to DealFlow Pipeline, Edit/Override

Investment Snapshot Card:
•	Grid of key metrics: Revenue, EBITDA, Margin, Multiple, Growth Rate, Employees, Location
•	Each metric displayed as a label/value pair with monospaced values
•	Missing metrics shown as “—” with a subtle “not available” indicator

Score Radar Chart:
•	Radar/spider chart showing all dimension scores visually
•	Hover over any dimension to see the justification
•	Axis labels are the dimension names; values are 1–10
•	Fill color matches the recommendation color (green/amber/red)

Dimension Score Cards:
•	Scrollable section with one card per scoring dimension
•	Each card shows: dimension name, score (large number, color-coded), justification text, and any data gaps flagged
•	Cards sorted by score (lowest first) to draw attention to weaknesses

Strengths Section:
•	Expandable/collapsible cards for each identified strength
•	Category label, title, description, and supporting data points

Risk Table:
•	Table with columns: Risk, Severity (color-coded badge), Mitigation
•	Sortable by severity
•	Red-highlighted rows for High severity risks

Value Creation Section:
•	Grouped by timeline (Near-Term, Medium-Term, Exit)
•	Each initiative shows: description, EBITDA impact range, investment required
•	Summary bar showing total identified EBITDA upside as % of entry EBITDA

Key Questions Section:
•	Numbered list of management questions
•	Each with a tag indicating what it validates

Raw Document Section:
•	Collapsible section showing the original extracted text
•	Useful for verifying the AI’s interpretation of the source document
6.2.3 Screening History / Deal Log Page
This page shows all past screenings in a searchable, filterable table:
•	Columns: Company Name, Date Screened, Deal Type, Composite Score, Recommendation, Sector, Deal Source, Screened By
•	Sortable by any column (default: most recent first)
•	Filters: recommendation (PROCEED/FURTHER REVIEW/PASS), deal type, sector, date range, score range
•	Search: full-text search across company names, sectors, and analysis text
•	Click any row to open the full screening results page
•	Bulk export: select multiple screenings and export as a summary Excel or PDF
6.2.4 Deal Comparison Page
Allow the user to select 2–4 screened deals and view them side-by-side:
•	Overlaid radar charts showing dimension scores for each deal
•	Side-by-side metric comparison table (revenue, EBITDA, margin, growth, multiple)
•	Color-coded cells highlighting which deal scores higher on each dimension
•	Composite score comparison bar
•	Useful for IC meetings where the team is deciding which opportunities to prioritize
6.2.5 Settings / Admin Page
•	Scoring weights: sliders for each dimension weight (must sum to 100%)
•	Recommendation thresholds: adjustable cutoff scores for PROCEED/FURTHER REVIEW/PASS
•	Hard disqualifiers: add/edit/remove automatic PASS criteria
•	System prompt editor: edit the Claude system prompt and analysis instructions
•	Team management: invite/remove users, assign roles (Admin, Analyst, Read-Only)
•	API usage dashboard: total screenings, API cost tracker, rate limit status
 
7. Database Schema
7.1 Core Tables
Table	Purpose	Key Columns
users	Firm team members	id, email, name, role (admin/analyst/read_only), created_at
screenings	Each IST screening record	id, user_id, company_name, deal_type, deal_source, composite_score, recommendation, raw_document_text, ai_response_json, scores_json, snapshot_json, notes, created_at, updated_at
screening_documents	Uploaded files associated with a screening	id, screening_id, file_name, file_type, file_size, storage_path, created_at
scoring_config	Dimension weights and thresholds	id, track (pe/ip_tech), dimension, weight, updated_by, updated_at
disqualifiers	Hard disqualification rules	id, name, description, field, operator, value, is_active, created_at
system_prompts	Versioned system prompts and analysis instructions	id, name, prompt_text, track (pe/ip_tech), is_active, version, created_by, created_at
api_usage_log	Track every Claude API call	id, screening_id, user_id, model, input_tokens, output_tokens, cost_estimate, latency_ms, created_at
screening_overrides	Manual overrides of AI recommendations	id, screening_id, user_id, original_recommendation, new_recommendation, override_reason, created_at
7.2 Indexing & Search
•	Full-text search index on screenings.company_name, screenings.raw_document_text, and the AI response
•	Composite index on (recommendation, deal_type, created_at) for filtered list queries
•	GIN index on scores_json and snapshot_json for JSON field queries
•	Index on composite_score for range filtering and sorting
7.3 Row-Level Security
•	All authenticated users can read all screenings (the team is small; full transparency)
•	Only the screening creator and admins can edit/delete a screening
•	Only admins can modify scoring_config, disqualifiers, and system_prompts
•	API usage logs are read-only for all users
 
8. Integrations & Future Extensions
8.1 DealFlow Platform Integration
If the DealFlow deal management platform (see separate PRD) is built concurrently, the screener should integrate with it:
•	Push to Pipeline: A “Add to Pipeline” button on any PROCEED screening that creates a new deal record in DealFlow with pre-populated fields from the IST snapshot
•	Shared database: Ideally both applications share the same Supabase instance, so screening records are queryable from within DealFlow’s reporting and analytics
•	Deal detail link: From DealFlow’s deal detail page, a “View IST Screening” link to the original screening results
8.2 Email Forwarding (Stretch Goal)
Many deals arrive via email. A stretch goal is to create an email-based intake flow:
•	Set up a dedicated email address (e.g., screen@catalyze.partners) using the email service
•	Emails sent to this address are automatically parsed: attachments extracted, body text captured
•	A new screening is initiated automatically and results are emailed back to the sender
•	This enables partners to forward a broker email directly and receive a screening within minutes
8.3 Market Research Enhancement (Stretch Goal)
Enhance the IST analysis with real-time market data by giving the AI web search access:
•	After initial document analysis, trigger a follow-up Claude call with web search enabled
•	Search for: market size and growth data for the target’s industry, recent comparable M&A transactions, competitive landscape, industry news
•	Incorporate findings into the Market Attractiveness and Competitive Position scores
•	Clearly label all web-sourced data with citations
8.4 Decision Log & Pattern Learning (Stretch Goal)
Over time, the firm will screen hundreds of deals. The system should enable:
•	Tagging each screening with the firm’s actual decision (Pursued / Passed / Invested / Exited)
•	Analytics on screening accuracy: how often does a PROCEED recommendation actually lead to pursuit?
•	Pattern detection: which scoring dimensions are most predictive of the firm’s actual decisions?
•	This data can eventually be used to fine-tune scoring weights and calibrate the AI prompts
 
9. Testing & Quality Assurance
9.1 Calibration Testing (Critical)
The most important testing phase is calibration against the firm’s historical deal evaluations. This must happen in Phase 2:
8.	Collect 15–20 historical deals that the firm has previously evaluated. Include a mix of deals that were pursued and deals that were passed on.
9.	Run each through the screener and compare the AI’s recommendation to the firm’s actual decision.
10.	Identify misalignments: Cases where the AI says PROCEED but the firm passed (or vice versa). Analyze why — was it a scoring weight issue, a missing dimension, or a prompt quality issue?
11.	Adjust weights and prompts iteratively until the screener’s recommendations align with the firm’s historical decisions at least 80% of the time.
12.	Document the calibration process so future adjustments can follow the same methodology.
9.2 Quality Benchmarking
Compare the screener’s output quality against the Omega Technologies IST (see Appendix A). The AI’s output should be at least as thorough and analytical as that manual analysis. Specifically check:
•	Does the Investment Snapshot capture all available data points?
•	Are the strengths specific and data-backed (not generic platitudes)?
•	Does the risk table include risks that a PE professional would actually worry about?
•	Is the value creation thesis actionable with realistic EBITDA impact estimates?
•	Are the management questions targeted and non-obvious?
9.3 Edge Case Testing
Scenario	Expected Behavior
Very short document (< 200 words, e.g., a brief teaser email)	Extract what’s available, flag insufficient data, provide partial screening with clear caveats about low confidence
Very long document (50+ page CIM)	Extract and analyze successfully within Claude’s context window. If document exceeds limits, truncate intelligently (prioritize executive summary, financials, and risk factors)
Non-English document	Detect language, inform user that English documents are required, offer to proceed with translation caveat
Duplicate upload (same document submitted twice)	Detect via hash comparison, return cached result instead of re-calling the API
Document with contradictory information	Flag contradictions in the analysis (e.g., “the document states revenue of $10M on page 1 but $12M on page 3”)
Highly redacted document	Flag that the document appears to have significant redactions, reduce confidence in scoring, note specific areas where redactions impair analysis
Image-only PDF (no text layer)	Fall back to OCR, flag potential OCR errors, reduce confidence accordingly
Mixed deal type (operating company with significant IP component)	Classify as the primary type but note the hybrid nature; score the relevant IP dimensions even if classified as PE
9.4 Acceptance Criteria
13.	Screening produces a complete, well-formatted IST analysis for a standard one-pager or CIM in under 60 seconds
14.	Scoring aligns with the firm’s historical decisions on at least 80% of calibration test cases
15.	All scoring dimensions, weights, thresholds, and disqualifiers are configurable without code changes
16.	System prompts are editable by admin users through the UI
17.	Screening history is searchable and filterable with export to Excel/PDF
18.	Deal comparison view works for 2–4 simultaneous deals
19.	Authentication works, API key is secured server-side, rate limiting is in place
20.	Application is deployed and accessible to all firm team members
21.	Documentation (user guide + technical README) is complete
22.	The system functions correctly without the developer’s ongoing involvement
 
10. Appendices
Appendix A: Reference IST Output — Omega Technologies
The following is a summary of an actual IST analysis performed by the firm for Omega Technologies, Inc. The developer should use this as the quality benchmark for the AI’s screening output. The full analysis is available as a separate document.

Investment Snapshot:
•	Company: Omega Technologies, Inc. — Aerospace & Industrial Tooling (Distribution & Manufacturing)
•	Location: Westlake Village, CA
•	Transaction: 100% Acquisition (Founder Retirement)
•	Revenue: $9.5M | Adj. EBITDA: $1.0M (11% margin) | 20 FTEs | Growth: 14% annually

Key Strengths Identified:
•	40+ year defensible market position with blue-chip aerospace OEMs (Boeing, Lockheed, SpaceX, Airbus)
•	Digital-first business: 80% organic web traffic, $4.3M in web-generated sales on $45K ad spend (95:1 efficiency)
•	Low customer concentration (largest = 7% of revenue)
•	Proprietary products with patents (Roller Ratchet®, SAVI®)
•	Debt-free balance sheet, asset-light model
•	Favorable market tailwinds: aviation tooling market 6% CAGR ($16B → $27B by 2035)

Key Risks Identified:
•	Founder departure (Medium) — mitigated by VP with 15 years tenure
•	Supplier concentration (Medium) — top supplier = 21%; long-term relationships
•	E-commerce platform risk (Medium) — Amazon = 9% of revenue; diversified across 23+ owned sites

Value Creation Thesis:
•	$1.5M+ in identified EBITDA upside (50%+ of entry EBITDA)
•	Near-term: e-commerce expansion ($500–750K), retail channel for Cleco kits ($300–500K), operational efficiency ($150–200K)
•	Medium-term: new product lines ($200–400K), international distributors ($250–500K), B2B corporate contracts ($300–600K)

Recommendation: PROCEED
•	Suggested LOI: $5.0–5.5M (4.9–5.4x TTM Adj. EBITDA), 80% cash / 20% seller note

The AI screener’s output for a comparable deal should match this level of specificity, analytical rigor, and actionable insight. Generic or superficial analysis is not acceptable.
Appendix B: Feature Checklist
Feature	Priority	Phase	Status
Document upload (PDF, DOCX, PPTX, images)	P0	1	
Text/paste input for email-forwarded deals	P0	1	
OCR fallback for scanned documents	P1	1	
Deal type auto-classification	P0	1	
Manual deal type override	P0	1	
Full IST analysis — Traditional PE track	P0	1	
Full IST analysis — IP/Technology track	P0	2	
Structured JSON output from Claude	P0	1	
Dimension scoring (1–10 with justifications)	P0	1	
Composite score calculation with configurable weights	P0	1	
PROCEED / FURTHER REVIEW / PASS recommendation	P0	1	
Hard disqualifier rules (auto-PASS)	P0	2	
Screening results page with full IST output	P0	1	
Radar chart for dimension scores	P1	2	
Investment snapshot metrics card	P0	1	
Risk table with severity ratings	P0	1	
Value creation thesis display	P0	1	
Key management questions list	P0	1	
Screening history / deal log page	P0	2	
Search and filter on history	P0	2	
Deal comparison view (2–4 deals)	P1	3	
Export screening to PDF	P1	2	
Export screening to Excel	P2	3	
Email share of screening results	P2	3	
Admin: configurable scoring weights	P0	2	
Admin: configurable recommendation thresholds	P0	2	
Admin: editable hard disqualifiers	P1	2	
Admin: editable system prompts	P1	2	
Admin: team user management	P1	3	
API cost tracking dashboard	P2	3	
Duplicate document detection (hash-based)	P2	3	
Calibration against 15–20 historical deals	P0	2	
Push to DealFlow pipeline integration	P1	3	
Email-based intake (forward to screen)	P2	4	
Web search enhancement for market data	P2	4	
Decision log & accuracy tracking	P2	4	
Mobile-responsive UI	P1	4	
User authentication (Supabase Auth)	P0	1	
API key secured server-side	P0	1	
Rate limiting	P1	2	
User documentation & training guide	P0	4	
Technical README & architecture docs	P0	4	
Appendix C: Glossary
Term	Definition
IST	Investment Screening Test — Catalyze Partners’ proprietary framework for rapid deal evaluation
CIM	Confidential Information Memorandum — detailed document prepared by the seller’s advisor
Teaser	Brief 1–2 page summary of a deal opportunity, typically anonymized, sent to prospective buyers
One-Pager	Single-page deal summary with key metrics and company description
TRL	Technology Readiness Level — NASA-developed scale (1–9) measuring technology maturity
TAM	Total Addressable Market — total revenue opportunity for a product/service
QoE	Quality of Earnings — analysis validating the sustainability and accuracy of reported earnings
EV	Enterprise Value — total value of a business (equity value + debt – cash)
EBITDA	Earnings Before Interest, Taxes, Depreciation, and Amortization
LOI	Letter of Intent — formal expression of interest with proposed acquisition terms
Orthogonal Application	Using a technology in a market different from its original intended use (core Catalyze thesis)
Composite Score	Weighted average of all dimension scores, yielding a single 1–10 value

<img width="468" height="418" alt="image" src="https://github.com/user-attachments/assets/495cb882-40ae-4492-b17d-a1bfecb1d20a" />
