-- =============================================================================
-- IST Screener – Seed Hard Disqualifiers
-- PRD §3.6: Five hard disqualifiers that trigger an automatic PASS.
-- These are inserted only when the table is empty so they are safe to re-run.
-- =============================================================================

INSERT INTO disqualifiers (name, description, field, operator, value, is_active)
SELECT * FROM (VALUES
  (
    'Revenue Below $2M',
    'Too small for meaningful PE returns at Catalyze''s scale.',
    'revenue',
    'lt',
    '2000000',
    TRUE
  ),
  (
    'Non-U.S. Headquartered',
    'Unless the technology IP is uniquely compelling and can be operated domestically.',
    'location',
    'not_contains',
    'US',
    TRUE
  ),
  (
    'Regulated Substance / Cannabis / Cryptocurrency',
    'Outside Catalyze''s mandate.',
    'industry',
    'contains_any',
    'cannabis,cryptocurrency,regulated substance',
    TRUE
  ),
  (
    'Heavy Cyclicality with No Recurring Revenue',
    'E.g., pure construction, commodities, or oil & gas exploration.',
    'industry',
    'contains_any',
    'construction,commodities,oil and gas',
    TRUE
  ),
  (
    'Asking Multiple Above 15x EBITDA',
    'Unless high-growth SaaS or technology with exceptional defensibility.',
    'ev_ebitda_multiple',
    'gt',
    '15',
    TRUE
  )
) AS v(name, description, field, operator, value, is_active)
WHERE NOT EXISTS (SELECT 1 FROM disqualifiers LIMIT 1);
