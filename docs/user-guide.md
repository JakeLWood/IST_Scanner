# IST Screener — User Guide

**Catalyze Partners · Internal Use Only · Estimated reading time: 10 minutes**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Uploading a Deal Document](#2-uploading-a-deal-document)
3. [Reading the Screening Results — The 7 IST Sections](#3-reading-the-screening-results--the-7-ist-sections)
4. [Understanding the Scoring Dimensions](#4-understanding-the-scoring-dimensions)
   - 4.1 [Dimensions Common to Both Tracks](#41-dimensions-common-to-both-tracks)
   - 4.2 [Traditional PE — Additional Dimensions](#42-traditional-pe--additional-dimensions)
   - 4.3 [IP / Technology Track — Additional Dimensions](#43-ip--technology-track--additional-dimensions)
   - 4.4 [Score Scale at a Glance](#44-score-scale-at-a-glance)
5. [Using the Deal Comparison View (IC Meetings)](#5-using-the-deal-comparison-view-ic-meetings)
6. [Searching and Exporting the Deal Log](#6-searching-and-exporting-the-deal-log)
7. [Overriding a Recommendation](#7-overriding-a-recommendation)
8. [FAQ — Hard Disqualifiers Explained](#8-faq--hard-disqualifiers-explained)
9. [Glossary](#9-glossary)

---

## 1. Overview

The **IST Screener** is Catalyze Partners' AI-powered deal screening platform. When you upload a deal document — a broker one-pager, CIM, pitch deck, or even a pasted email description — the system automatically:

1. Extracts the relevant financial and operational data from the document.
2. Classifies the deal as either a **Traditional PE** opportunity (operating companies) or an **IP / Technology Commercialization** opportunity (technology spinouts, patent portfolios, Fortune 100 divestitures).
3. Runs a full **Investment Screening Test (IST)** using Catalyze's proprietary framework and produces a scored report in under 60 seconds.
4. Recommends **PROCEED**, **FURTHER REVIEW**, or **PASS** based on the composite score.
5. Stores the result in the searchable deal log for future reference and IC prep.

You do not need any technical background to use this tool. This guide covers everything you need.

---

## 2. Uploading a Deal Document

### Step-by-step

1. **Click "New Screening"** (or the upload icon in the left navigation).

2. **Add your document** in one of two ways:
   - **Drag and drop** a file onto the large upload zone, or click it to browse your files.
   - **Paste text** directly into the text area below the upload zone — useful for deals that arrived as email body text or brief descriptions.

3. **Accepted file types:** PDF, DOCX (Word), PPTX (PowerPoint), PNG, JPG.  
   **Maximum file size:** 25 MB.

4. **Fill in the optional fields** (all optional, but recommended):
   | Field | What to enter |
   |---|---|
   | Deal Source | Select from the dropdown: Broker Network, Investment Bank / Advisor, Proprietary, etc. |
   | Deal Name Override | Override the company name if you already know it (the AI will also try to extract it). |
   | Notes | Any context you want attached to the record — e.g., "Introduced by [advisor name], timeline uncertain." |

5. **Click "Screen This Deal"** to start the analysis.

6. **Watch the progress bar** — it moves through four steps:
   - *Extracting text* — the system pulls text from your document.
   - *Classifying deal type* — the AI determines Traditional PE or IP/Technology.
   - *Confirming* — you are shown the detected deal type and can **override it** if the AI got it wrong. Click the correct type and then confirm.
   - *Running IST analysis* — the full screening is generated (typically 15–45 seconds).
   - *Saving results* — the record is stored in the deal log.

7. **You are redirected** to the Screening Results page automatically when the analysis is complete.

> **Tip:** If your document is a scanned image or a "flat" PDF with no selectable text, the system falls back to OCR automatically. Scan quality affects accuracy — clean, high-contrast scans work best.

> **Tip:** If both Revenue and EBITDA are completely absent from the document, the system will flag the screening as "Insufficient Data" and ask you to provide more information before completing the full analysis.

---

## 3. Reading the Screening Results — The 7 IST Sections

Every screening report is structured into seven standard sections, regardless of deal type. Here is what each section contains and what to look for.

---

### Section I — Investment Snapshot

**What it is:** A quick-reference header card at the top of every report — the "at a glance" view.

**What it contains:**
- Company name, industry/sector, headquarters location
- Transaction type (acquisition, licensing, divestiture, etc.)
- Financial snapshot: Revenue, EBITDA, EBITDA margin, EV/EBITDA multiple, revenue growth rate, employee count
- Deal source and deal type badge (Traditional PE or IP / Technology)

**What to look for:** Missing metrics are shown as "—". If several critical fields are blank, treat the AI's scores for those areas with extra caution and check the Key Questions section for what follow-up data is needed.

---

### Section II — Investment Strengths

**What it is:** A structured list of 3–6 reasons this deal could be compelling.

**What it contains:** Each strength is organized into a named category (e.g., *Market Position*, *Business Model*, *Financial Profile*, *IP & Differentiation*) with a short title, a description, and specific supporting data points pulled from the document.

**What to look for:** Strengths that cite hard numbers are more reliable than generic claims. If a strength reads "strong customer relationships" without citing retention rates, contract lengths, or customer names — treat it as a soft signal until validated.

---

### Section III — Strategic Considerations

**What it is:** The risk assessment and due diligence priority list.

**What it contains:**
- A table of identified risks with **Severity** ratings: 🔴 High, 🟡 Medium, 🟢 Low
- A proposed mitigation for each risk
- A prioritized list of due diligence focus areas

**What to look for:** High-severity risks highlighted in red are the most important to address before a PROCEED decision. If the document claimed a risk was mitigated but provided no evidence, the AI will note this and score the risk severity higher. Pay attention to those flags.

---

### Section IV — Value Creation Thesis

**What it is:** A concrete plan for how Catalyze would create value post-acquisition.

**What it contains:**
- **Near-term (12–24 months):** Specific initiatives, estimated EBITDA impact range, and investment required
- **Medium-term (24–36 months):** Longer-horizon growth levers
- **Strategic exit positioning:** How and to whom Catalyze would eventually exit
- A summary bar showing total identified EBITDA upside as a percentage of entry EBITDA

**What to look for:** A strong thesis identifies **at least 30% EBITDA upside** from identifiable levers — not from general "operational improvements." Vague theses suggest either a weak opportunity or insufficient data in the source document.

---

### Section V — Scoring Summary

**What it is:** The quantitative heart of the IST — numerical scores across every dimension.

**What it contains:**
- A **radar/spider chart** showing all dimension scores visually (hover over any axis to see the justification)
- Individual score cards for each dimension, sorted from weakest to strongest — so weaknesses are always visible first
- The **composite score** (1–10 weighted average), color-coded green / amber / red
- The **recommendation badge**: PROCEED (green), FURTHER REVIEW (amber), PASS (red)

**What to look for:** The composite score thresholds are:
| Score | Recommendation | Meaning |
|---|---|---|
| 7.5 – 10.0 | **PROCEED** ✅ | Move to LOI and detailed due diligence |
| 5.5 – 7.4 | **FURTHER REVIEW** ⚠️ | Merit exists, but key questions must be resolved first |
| 1.0 – 5.4 | **PASS** ❌ | Does not meet Catalyze's criteria |

See [Section 4](#4-understanding-the-scoring-dimensions) of this guide for a plain-English explanation of every dimension.

---

### Section VI — Recommendation

**What it is:** The AI's final verdict with supporting reasoning.

**What it contains:**
- The verdict: PROCEED, FURTHER REVIEW, or PASS
- 3–5 bullet-point justifications for the verdict
- **If PROCEED:** Suggested LOI terms (price range, structure) and critical diligence priorities
- **If PASS:** Specific disqualifying factors

**What to look for:** This section is a starting point for the team's discussion — not a final decision. You can override it (see [Section 7](#7-overriding-a-recommendation)). Review the bullet reasoning carefully; sometimes a FURTHER REVIEW recommendation has one or two blockers that the team already knows the answer to.

---

### Section VII — Key Questions

**What it is:** A targeted list of 5–10 questions the deal team should ask management or the intermediary.

**What it contains:** Each question has a parenthetical tag indicating which risk or thesis element it is designed to validate — e.g., *(validates: customer concentration risk)*.

**What to look for:** These questions are specifically generated from gaps and risks the AI identified in the source document. They are good starting points for a management call agenda or a follow-up request to the broker.

---

### IP / Technology Track — Additional Sections

When a deal is classified as **IP / Technology Commercialization**, four additional dimension cards appear within the scoring summary (Section V). See [Section 4.3](#43-ip--technology-track--additional-dimensions) below for plain-English explanations of each.

---

## 4. Understanding the Scoring Dimensions

Every dimension is scored on a **1–10 scale**. The AI provides a 2–3 sentence justification for each score, visible by hovering on the radar chart or expanding the score card.

### 4.1 Dimensions Common to Both Tracks

These seven dimensions are scored on every deal, regardless of whether it is a Traditional PE or IP/Technology opportunity.

---

**Market Attractiveness**
> *Is the market large enough and growing fast enough to make this worth our time?*

Looks at the size of the addressable market (TAM), the market's growth rate relative to GDP, the presence of favorable trends (e.g., regulatory tailwinds, demographic shifts), how fragmented the market is (consolidation opportunity), and how cyclical the industry is. A TAM above $1B with above-GDP growth scores well.

---

**Competitive Position**
> *How hard is it for a competitor to displace this company?*

Evaluates market share, barriers to entry (proprietary technology, switching costs, brand), pricing power, customer relationships, and IP protection (patents, trade secrets). A company with a 40-year customer relationship with Boeing and proprietary products scores much higher than a commodity distributor.

---

**Management & Team**
> *Does the leadership team have what it takes to execute — and is there life after the founder?*

Assesses the track record of the leadership team, their tenure, whether there is a strong layer of management below the founder (key-person dependency is a risk), succession readiness, and cultural indicators. In the lower middle market, management can be supplemented post-acquisition, so this dimension carries the lowest weight for PE deals.

---

**Customer Quality**
> *Is the revenue base diversified, sticky, and from creditworthy customers?*

Reviews customer concentration (ideally no single customer above 15% of revenue), the split between contracted recurring revenue and spot/project revenue, retention and churn rates, and the overall quality of the customer base (blue-chip enterprises vs. SMBs). High customer concentration is one of the most common risk flags.

---

**Value Creation Potential**
> *How much room is there to grow and improve this business after we own it?*

Identifies organic growth levers (new products, new markets, pricing), margin expansion opportunities, bolt-on acquisition potential, and operational improvements. The AI looks for at least 30% identifiable EBITDA upside above the current run-rate. This is where Catalyze's operational expertise directly drives returns.

---

**Risk Profile**
> *How manageable are the risks — and does the potential reward justify them?*

Aggregates the number, severity, and mitigation quality of all identified risks. Note that this score runs **opposite** to most: a score of **10 = very low risk**, and a score of **1 = deal-breaking risk level**. Common risks evaluated include founder/key-person dependency, customer concentration, supplier concentration, regulatory exposure, cyclicality, and technology obsolescence.

---

**Strategic Fit**
> *Does this deal fit Catalyze's investment thesis and portfolio?*

Evaluates alignment with Catalyze's focus on technology-driven industrial businesses (aerospace, advanced materials, industrial technology), whether Catalyze's shared services platform applies, portfolio synergies, sector expertise, and geographic preference for U.S.-headquartered companies.

---

### 4.2 Traditional PE — Additional Dimensions

These three dimensions are scored **only for Traditional PE** deals. They account for 28% of the composite score combined.

---

**Financial Quality** *(Default weight: 20% — highest single weight)*
> *Is the financial performance real, sustainable, and attractive?*

Examines three years of revenue growth trajectory, EBITDA margins relative to industry benchmarks, margin stability (are margins expanding or contracting?), working capital efficiency, capital expenditure intensity, the quality of EBITDA adjustments (are the add-backs legitimate?), debt levels, and cash flow conversion. This is the most heavily weighted dimension in PE because financial performance is the primary driver of returns.

---

**Valuation Attractiveness** *(Default weight: 5%)*
> *Is the asking price reasonable?*

Compares the implied EV/EBITDA multiple to sector comparables, models implied returns at the target hold period (typically 3–5 years), assesses multiple arbitrage potential on exit, and evaluates revenue multiple reasonableness. A deal asking 8x EBITDA in a sector where comps exit at 10–12x has valuation tailwind; one asking 14x in a flat market does not.

---

**Transaction Feasibility** *(Default weight: 3%)*
> *How likely are we to actually close this deal, and on what terms?*

Looks at seller motivation and timeline, whether this is an auction or a proprietary/bilateral process, financing availability, regulatory or antitrust complexity, and deal structure flexibility (seller note, earnout, rollover equity). A founder-retirement proprietary process scores much higher than a competitive auction with a tight timeline.

---

### 4.3 IP / Technology Track — Additional Dimensions

These four dimensions **replace** the PE-specific dimensions for IP/Technology deals.

---

**Technology Readiness** *(Default weight: 18% — highest single weight)*
> *How close is this technology to actually working in the market?*

Uses the NASA Technology Readiness Level (TRL) scale of 1–9:
- TRL 1–3: Basic research / concept stage — high development risk
- TRL 4–6: Prototype / laboratory validation — moderate development risk
- TRL 7–9: Demonstrated / production-ready — low development risk

Also assesses prototype existence, testing and validation data, manufacturing scalability, remaining R&D required, and estimated time-to-market. This is the primary gating criterion — immature technology is the main reason IP deals fail.

---

**IP Strength & Defensibility** *(Default weight: 16%)*
> *How well-protected is the intellectual property — and can we actually own it clearly?*

Evaluates the patent portfolio (granted vs. pending, breadth of claims, remaining life, geographic coverage), trade secrets, freedom-to-operate concerns (are there blocking patents owned by others?), any licensing encumbrances from the original parent company, and the competitive IP landscape. Without strong, defensible IP, there is no sustainable competitive advantage.

---

**Commercialization Pathway** *(Default weight: 14%)*
> *Is there a credible plan to turn this technology into revenue?*

Assesses the clarity of identified target customers, the distribution strategy, go-to-market plan viability, pricing model, required partnerships, any regulatory pathway (FDA, FAA, FCC clearances), and the estimated time-to-first-revenue. A phase timeline of commercialization milestones is included when the data supports it. Technology without a business model is a science project, not an investment.

---

**Orthogonal Application Potential** *(Default weight: 12%)*
> *Can this technology solve problems in markets beyond its original use case?*

This is a **core Catalyze thesis**. Many technologies developed for one domain (e.g., aerospace sensors, defense materials, industrial robotics) can be re-applied to adjacent markets (e.g., medical devices, EV manufacturing, consumer safety). The score reflects how many credible adjacent markets exist and how large they are. Each identified market includes a TAM estimate and a rationale for why the technology applies. Higher orthogonal potential = higher value ceiling and more exit options.

---

### 4.4 Score Scale at a Glance

| Score | What It Means |
|---|---|
| 9–10 | Exceptional — a genuine standout in this dimension |
| 7–8 | Strong — meaningfully above average |
| 5–6 | Adequate / mixed — meets minimum bar but with caveats |
| 3–4 | Concerning — this dimension is a real risk to the thesis |
| 1–2 | Deal-breaking weakness — serious enough to reconsider the opportunity |

A true "10" is rare. Most good deals score 6–8 across most dimensions.

---

## 5. Using the Deal Comparison View (IC Meetings)

The Deal Comparison page is designed for IC meetings where the team needs to evaluate 2–4 opportunities side by side before deciding where to spend diligence resources.

### How to open it

1. **From the Deal Log page**, check the boxes next to 2–4 screened deals.
2. Click **"Compare Selected"** — the comparison page opens with those deals loaded.
3. Alternatively, navigate directly to **"Compare"** in the left navigation and use the deal selector to add companies.

### What you see

**Overlaid Radar Chart**
- Each deal is drawn as a colored line on the same radar chart (indigo, green, amber, pink).
- Dimensions where one deal clearly outperforms the others are immediately visible — look for large gaps between lines.
- Hover over any axis to see the score and justification for that deal.

**Composite Score Bar Chart**
- Side-by-side bars showing the composite score for each deal.
- Color-coded: green for PROCEED range (≥7.5), amber for FURTHER REVIEW (5.5–7.4), red for PASS (<5.5).

**Financial Metrics Table**
- Side-by-side comparison of Revenue, EBITDA, EBITDA Margin, Revenue Growth Rate, and EV/EBITDA multiple.
- Cells are color-highlighted to show which deal is strongest on each metric.

**Dimension Score Table**
- Row-by-row comparison of every scoring dimension.
- The winning score in each row is highlighted — quickly shows whether one deal dominates overall or if the comparison is mixed.

### IC meeting tips

- Use the radar chart as the **opening visual** — it communicates the overall picture faster than any table.
- Focus discussion on dimensions where deals are **close in score** — those are the ones where IC judgment adds the most value.
- Deals with very different profiles (e.g., a 7.8 PROCEED vs. a 6.1 FURTHER REVIEW) often have one or two dimensions driving the gap — find them in the dimension table.
- You can view up to **four deals** at once; two or three usually works best for clarity.

---

## 6. Searching and Exporting the Deal Log

The Deal Log is your complete searchable history of every screening ever run.

### Navigating to the Deal Log

Click **"Screenings"** in the left navigation.

### Columns in the table

| Column | Description |
|---|---|
| Company Name | Click to open the full screening report |
| Date Screened | When the analysis was run |
| Deal Type | Traditional PE or IP / Technology |
| Composite Score | The 1–10 weighted score, color-coded |
| Recommendation | PROCEED / FURTHER REVIEW / PASS badge |
| Sector | Industry category extracted from the document |
| Deal Source | How the deal was sourced (broker, proprietary, etc.) |
| Screened By | Team member who initiated the screening |

The table defaults to **most recent first**.

### Sorting

Click any column header to sort by that column. Click again to reverse the sort order.

### Filtering

Use the filter bar above the table to narrow results:

| Filter | Options |
|---|---|
| Recommendation | PROCEED, FURTHER REVIEW, PASS (multi-select) |
| Deal Type | Traditional PE, IP / Technology |
| Sector | Free-text or dropdown depending on available values |
| Date Range | From / To date pickers |
| Score Range | Minimum and maximum composite score sliders |

Combine multiple filters — they work together (AND logic).

### Full-text search

The search box at the top right searches across company names, sectors, deal sources, and the full analysis text. This means you can search for terms like *"aerospace"*, *"$5M EBITDA"*, or *"founder retirement"* and surface matching deals from anywhere in the history.

### Exporting

**Single deal:**
- Open the deal's screening result page.
- Click **"Export PDF"** in the header action buttons to download a formatted PDF of the full IST report.

**Bulk export:**
1. In the Deal Log, **check the boxes** next to the deals you want to export.
2. Click **"Export Selected"**.
3. Choose your format:
   - **Excel (.xlsx):** A spreadsheet with one row per deal, columns for all key metrics and scores. Ideal for offline analysis, sorting, or sharing with advisors.
   - **PDF:** A summary PDF with one page per deal. Useful for printing IC packets.
4. The file downloads to your browser immediately.

---

## 7. Overriding a Recommendation

The AI's recommendation is a starting point, not a final verdict. Any team member with **Analyst** or **Admin** role can override the recommendation and log the reason.

### Why you might override

- The AI scored a deal as PASS due to one disqualifier, but you know that condition has changed.
- The deal scored FURTHER REVIEW, but the team has already resolved the key open questions through a management call.
- The AI missed context that you provided separately (e.g., a follow-on document was uploaded, or you know the seller).

### How to override

1. Open the screening result page for the deal.
2. Click the **"Edit / Override"** button in the top-right action bar.
3. A dialog box appears showing:
   - The **original AI recommendation** (cannot be changed, it's a permanent record).
   - A **New Recommendation** selector: PROCEED, FURTHER REVIEW, or PASS.
   - An **Override Reason** text field — this is required and cannot be left blank.
4. Type a clear reason (e.g., *"Management call confirmed customer concentration resolved — top customer now 9% of revenue, down from 18%"*).
5. Click **"Save Override"**.

### What gets recorded

The override is stored in the `screening_overrides` table and is permanently associated with the deal record. The deal log and results page show the **overridden recommendation** going forward, with a small badge indicating it was manually changed. The original AI recommendation and your override reason are both preserved and visible to all team members — there is full audit trail transparency.

> **Note:** Only Admins can delete or modify a saved override.

---

## 8. FAQ — Hard Disqualifiers Explained

Hard disqualifiers are automatic PASS criteria — deals that trigger them receive a PASS recommendation regardless of their composite score. They represent situations where Catalyze has decided, as a firm policy, that an opportunity is outside the mandate.

These rules are configurable by Admins (Settings → Hard Disqualifiers), but the defaults are:

---

**Q: The deal has revenue below $2M. Why is it automatically a PASS?**

At Catalyze's scale, sub-$2M revenue companies do not generate enough EBITDA to produce meaningful PE returns after acquisition costs, management fees, and integration resources. Even an exceptional company at this size requires proportionally as much diligence and operational attention as a $10M revenue company, for far less return. The firm's model requires a minimum economic scale to work.

*In practice:* If a broker sends you a teaser for a $1.8M revenue business, the screener will flag this immediately rather than producing a full analysis. You can override this if you believe the revenue figure is understated or if the deal has other compelling attributes worth exploring.

---

**Q: The company is headquartered outside the U.S. Why does that trigger a PASS?**

Catalyze's operational model, shared services platform, and sector expertise are all U.S.-centric. Cross-border acquisitions introduce foreign regulatory complexity, currency risk, and management overhead that does not fit the firm's current capabilities or fund mandate.

*Exception:* If a deal is IP/Technology commercialization where the IP itself is uniquely compelling and the technology can be acquired and operated domestically (e.g., a European university licensing a patent portfolio), the screener will flag the non-U.S. HQ but may not auto-PASS. The team should review these on a case-by-case basis.

---

**Q: The deal involves cannabis, cryptocurrency, or regulated substances. Why is it off-limits?**

These sectors are outside Catalyze's mandate entirely — not because they lack economic merit, but because they fall outside the firm's LP guidelines, risk appetite, and institutional positioning. Cannabis involves state-by-state legal complexity and federal banking restrictions. Cryptocurrency introduces extreme volatility and novel regulatory risk. Regulated controlled substances (beyond standard pharmaceutical distribution) require specialized compliance infrastructure the firm does not have.

*In practice:* Forward these deals to an appropriate firm and document the pass. Do not spend time building a case for an exception.

---

**Q: The company has heavy cyclicality and no recurring revenue. What does that mean?**

Cyclical businesses — like pure commercial construction, commodity raw materials extraction, or oil and gas exploration — see their revenues and profits swing dramatically with economic cycles. "No recurring revenue" means they have no contracted, subscription, or otherwise sticky revenue that cushions downturns. Together, these make financial modeling unreliable, debt financing risky, and exit timing unpredictable.

*Examples that would trigger this:* A concrete contractor with all project-based revenue. A raw steel distributor. An oil and gas exploration company.

*Examples that would NOT trigger this (even in cyclical sectors):* A building materials manufacturer with 60% recurring maintenance contracts. An energy services company with multi-year service agreements.

---

**Q: The asking price is above 15x EBITDA. Why is that a problem?**

At 15x EBITDA or higher, the deal math becomes very difficult for a PE buyer. The combination of entry price, acquisition financing costs, and required EBITDA growth to achieve target returns (typically 20%+ IRR) leaves very little margin for error. Any operational miss, market downturn, or unexpected cost makes the investment thesis fall apart.

*Exception:* High-growth SaaS companies or technology businesses with exceptional IP defensibility and revenue growth rates (e.g., 30%+ ARR growth) can justify elevated multiples because their EBITDA trajectory makes the math work over a 3–5 year hold. The AI will note this context in its analysis if it applies.

*In practice:* When you see this flag, check whether the document contains a growth justification for the premium. If the company is growing at 5% annually and asking 16x EBITDA, that is a hard pass. If it is growing at 40% with recurring revenue, that warrants a conversation.

---

**Q: Can we turn off a disqualifier for a specific deal?**

You cannot turn off a disqualifier just for one deal, but you can **override the recommendation** and log your reason (see [Section 7](#7-overriding-a-recommendation)). If you find yourself regularly overriding a specific disqualifier, discuss with an Admin whether the rule should be adjusted or removed entirely in Settings → Hard Disqualifiers.

---

**Q: Who can add or change the hard disqualifier rules?**

Only users with the **Admin** role. Go to **Settings → Hard Disqualifiers** to view, add, edit, or deactivate rules. Changes take effect immediately for all future screenings. Past screenings are not retroactively re-evaluated.

---

## 9. Glossary

| Term | Definition |
|---|---|
| **IST** | Investment Screening Test — Catalyze's proprietary rapid evaluation framework |
| **CIM** | Confidential Information Memorandum — detailed document prepared by the seller's advisor |
| **Teaser** | Brief 1–2 page deal summary, typically anonymized, sent to prospective buyers |
| **TRL** | Technology Readiness Level — NASA scale from 1 (concept) to 9 (production-proven) |
| **TAM** | Total Addressable Market — total revenue opportunity for a product or service |
| **EV / EBITDA** | Enterprise Value divided by EBITDA — the most common valuation multiple in PE |
| **LOI** | Letter of Intent — formal expression of interest with proposed acquisition terms |
| **QoE** | Quality of Earnings — analysis validating the sustainability of reported earnings |
| **EBITDA** | Earnings Before Interest, Taxes, Depreciation, and Amortization |
| **Composite Score** | Weighted average of all dimension scores, yielding a single 1–10 value |
| **Orthogonal Application** | Using a technology in a market different from its original intended use (core Catalyze thesis) |
| **Hard Disqualifier** | A rule that triggers an automatic PASS regardless of the composite score |
| **Override** | A manual change to the AI recommendation, logged with a reason for audit purposes |
| **PROCEED** | Composite score ≥ 7.5 — move to LOI and detailed due diligence |
| **FURTHER REVIEW** | Composite score 5.5–7.4 — merit exists but key questions must be resolved |
| **PASS** | Composite score < 5.5 (or hard disqualifier triggered) — does not meet criteria |

---

*Questions? Contact your Admin user or refer to the technical README for system architecture details.*
