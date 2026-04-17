-- =============================================================================
-- IST Screener – Deals Table (PRD §8.1 DealFlow Platform Integration)
-- =============================================================================
-- The `deals` table stores pipeline deals created from PROCEED screenings.
-- Each row is pre-populated from the IST snapshot and links back to the
-- originating screening via ist_screening_id.

CREATE TABLE deals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Core deal identity (pre-populated from IST snapshot)
    company_name        TEXT        NOT NULL,
    sector              TEXT,
    -- Revenue and EBITDA stored as free-text strings (e.g. "$85M", "14% margin")
    -- to match the narrative format of IST snapshot financial data.
    revenue             TEXT,
    ebitda              TEXT,
    location            TEXT,
    deal_source         TEXT,
    deal_type           deal_type,
    -- Back-link to the originating IST screening (PRD §8.1)
    ist_screening_id    UUID        REFERENCES screenings(id) ON DELETE SET NULL,
    -- Pipeline status (active | archived)
    status              TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'archived')),
    notes               TEXT,
    created_by          UUID        NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX deals_ist_screening_id_idx ON deals (ist_screening_id);
CREATE INDEX deals_created_by_idx ON deals (created_by);
CREATE INDEX deals_status_created_at_idx ON deals (status, created_at DESC);
CREATE INDEX deals_company_name_trgm_idx ON deals USING GIN (company_name gin_trgm_ops);

-- Keep updated_at current on every write
CREATE TRIGGER deals_updated_at
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security (PRD §7.3)
-- ---------------------------------------------------------------------------

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all pipeline deals (small team, full transparency).
CREATE POLICY "authenticated users can read deals"
    ON deals
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Any authenticated user may add a deal to the pipeline.
CREATE POLICY "authenticated users can insert deals"
    ON deals
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

-- Only the creator or an admin may update a deal record.
CREATE POLICY "creator or admin can update deals"
    ON deals
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() OR is_admin())
    WITH CHECK (created_by = auth.uid() OR is_admin());

-- Only the creator or an admin may delete a deal record.
CREATE POLICY "creator or admin can delete deals"
    ON deals
    FOR DELETE
    TO authenticated
    USING (created_by = auth.uid() OR is_admin());
