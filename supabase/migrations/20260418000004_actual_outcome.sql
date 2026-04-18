-- =============================================================================
-- IST Screener — Actual Outcome Tracking (PRD §8.4)
-- Adds an `actual_outcome` field to screenings so the firm can record what
-- actually happened to each deal after the IST recommendation was made.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New enum type: actual_outcome
-- PRD §8.4 options: Pursued / Passed / Invested / Currently in Diligence / Exited
-- ---------------------------------------------------------------------------
CREATE TYPE actual_outcome AS ENUM (
    'pursued',
    'passed',
    'invested',
    'currently_in_diligence',
    'exited'
);

-- ---------------------------------------------------------------------------
-- Add column to screenings
-- Nullable — most records will have no outcome recorded initially.
-- ---------------------------------------------------------------------------
ALTER TABLE screenings
    ADD COLUMN actual_outcome actual_outcome NULL;

-- ---------------------------------------------------------------------------
-- Index to support the reporting queries in the admin outcomes page
-- (filtering/grouping by recommendation + actual_outcome)
-- ---------------------------------------------------------------------------
CREATE INDEX screenings_outcome_rec_idx
    ON screenings (recommendation, actual_outcome)
    WHERE actual_outcome IS NOT NULL;
