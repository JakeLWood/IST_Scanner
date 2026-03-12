-- =============================================================================
-- IST Screener – Initial Schema Migration
-- Section 7.1  Tables & columns
-- Section 7.2  GIN, composite, and full-text search indexes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable required extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram similarity / GIN on text
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- accent-insensitive full-text search

-- ---------------------------------------------------------------------------
-- Custom types
-- ---------------------------------------------------------------------------

-- PRD §7.1: role must be admin | analyst | read_only
CREATE TYPE user_role AS ENUM ('admin', 'analyst', 'read_only');

-- PRD §2.3: deal type determines which screening framework is applied
CREATE TYPE deal_type AS ENUM ('traditional_pe', 'ip_technology');

-- PRD §3.6: composite score thresholds produce one of these three verdicts
CREATE TYPE screening_recommendation AS ENUM ('PROCEED', 'FURTHER_REVIEW', 'PASS');

-- PRD §7.1: track used to scope scoring_config and system_prompts rows
CREATE TYPE deal_track AS ENUM ('traditional_pe', 'ip_technology');

-- PRD §5.1 / §7.1: prompt_type for system_prompts table
CREATE TYPE prompt_type AS ENUM ('system', 'analysis_pe', 'analysis_ip', 'classification', 'summary');

-- Provider enum for api_usage_log
CREATE TYPE api_provider AS ENUM ('anthropic', 'openai', 'google', 'other');

-- =============================================================================
-- 7.1  TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users
-- Mirrors Supabase auth.users; stores application-level profile data.
-- PRD §7.1: id, email, name, role (admin/analyst/read_only), created_at
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL UNIQUE,
    name            TEXT,
    role            user_role   NOT NULL DEFAULT 'analyst',
    avatar_url      TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    preferences     JSONB       NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screenings
-- One row per IST screening session.
-- PRD §7.1: id, user_id, company_name, deal_type, deal_source,
--            composite_score, recommendation, raw_document_text,
--            ai_response_json, scores_json, snapshot_json, notes,
--            created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE screenings (
    id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    -- PRD uses "user_id" (FK to users)
    user_id             UUID                    NOT NULL REFERENCES users(id),
    company_name        TEXT                    NOT NULL,
    deal_type           deal_type,
    deal_source         TEXT,
    -- PRD §3.6: composite score is 1.0–10.0 (weighted average of 1–10 dimension scores)
    composite_score     NUMERIC(4, 2)           CHECK (composite_score IS NULL OR (composite_score >= 1 AND composite_score <= 10)),
    recommendation      screening_recommendation,
    raw_document_text   TEXT,
    ai_response_json    JSONB,
    scores_json         JSONB,
    snapshot_json       JSONB,
    notes               TEXT,
    is_disqualified     BOOLEAN                 NOT NULL DEFAULT FALSE,
    disqualifier_ids    UUID[]                  NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screening_documents
-- Files uploaded as part of a screening.
-- PRD §7.1: id, screening_id, file_name, file_type, file_size,
--            storage_path, created_at
-- PRD §4.1: Supported formats — PDF, DOCX, PPTX, PNG, JPG, plain text
-- ---------------------------------------------------------------------------
CREATE TABLE screening_documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id    UUID        NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    file_name       TEXT        NOT NULL,
    -- PRD §4.1: pdf | docx | pptx | png | jpg | txt
    file_type       TEXT        NOT NULL,
    file_size       BIGINT,
    storage_path    TEXT        NOT NULL,
    extracted_text  TEXT,
    page_count      INTEGER,
    -- hash for PRD §9.3 duplicate detection
    content_hash    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- scoring_config
-- Configurable dimension weights and recommendation thresholds.
-- PRD §7.1: id, track (pe/ip_tech), dimension, weight, updated_by, updated_at
-- PRD §3.5: one row per dimension per track; weights must sum to 100 per track
-- ---------------------------------------------------------------------------
CREATE TABLE scoring_config (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    track       deal_track  NOT NULL,
    dimension   TEXT        NOT NULL,
    weight      NUMERIC(5, 2) NOT NULL
                    CHECK (weight >= 0 AND weight <= 100),
    updated_by  UUID        REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (track, dimension)
);

-- ---------------------------------------------------------------------------
-- scoring_thresholds
-- Configurable composite score cutoffs for PROCEED / FURTHER_REVIEW / PASS.
-- PRD §3.6: default PROCEED >= 7.5, FURTHER_REVIEW >= 5.5, PASS < 5.5
-- ---------------------------------------------------------------------------
CREATE TABLE scoring_thresholds (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    proceed_threshold       NUMERIC(4, 2) NOT NULL DEFAULT 7.5
                                CHECK (proceed_threshold >= 1 AND proceed_threshold <= 10),
    further_review_threshold NUMERIC(4, 2) NOT NULL DEFAULT 5.5
                                CHECK (further_review_threshold >= 1 AND further_review_threshold <= 10),
    updated_by              UUID        REFERENCES users(id),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- disqualifiers
-- Hard-stop rules that trigger automatic PASS regardless of score.
-- PRD §7.1: id, name, description, field, operator, value, is_active, created_at
-- PRD §3.6: configurable — admin can add/edit/remove via UI
-- ---------------------------------------------------------------------------
CREATE TABLE disqualifiers (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    -- Structured rule columns instead of opaque JSONB: matches PRD §7.1
    field       TEXT        NOT NULL,
    operator    TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by  UUID        REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- system_prompts
-- Versioned Claude prompt templates stored in the database.
-- PRD §7.1: id, name, prompt_text, track (pe/ip_tech), is_active,
--            version, created_by, created_at
-- PRD §5.1: system prompt is configurable by admins through the UI
-- ---------------------------------------------------------------------------
CREATE TABLE system_prompts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    prompt_text TEXT        NOT NULL,
    prompt_type prompt_type NOT NULL,
    -- NULL track means the prompt applies to both deal types
    track       deal_track,
    is_active   BOOLEAN     NOT NULL DEFAULT FALSE,
    version     INTEGER     NOT NULL DEFAULT 1,
    created_by  UUID        REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, version)
);

-- ---------------------------------------------------------------------------
-- api_usage_log
-- Tracks every Claude API call for cost and audit purposes.
-- PRD §7.1: id, screening_id, user_id, model, input_tokens, output_tokens,
--            cost_estimate, latency_ms, created_at
-- PRD §2.4: service-role only writes; no authenticated INSERT policy
-- ---------------------------------------------------------------------------
CREATE TABLE api_usage_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id    UUID            REFERENCES screenings(id) ON DELETE SET NULL,
    user_id         UUID            REFERENCES users(id),
    provider        api_provider    NOT NULL DEFAULT 'anthropic',
    model           TEXT            NOT NULL,
    input_tokens    INTEGER         NOT NULL DEFAULT 0,
    output_tokens   INTEGER         NOT NULL DEFAULT 0,
    -- Generated column: total_tokens = input + output
    total_tokens    INTEGER         GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,
    -- PRD §7.1 uses "cost_estimate" (vs cost_usd in the prior version)
    cost_estimate   NUMERIC(12, 6),
    latency_ms      INTEGER,
    http_status     SMALLINT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screening_overrides
-- Audit log of manual recommendation overrides.
-- PRD §7.1: id, screening_id, user_id, original_recommendation,
--            new_recommendation, override_reason, created_at
-- ---------------------------------------------------------------------------
CREATE TABLE screening_overrides (
    id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id            UUID                    NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    user_id                 UUID                    NOT NULL REFERENCES users(id),
    original_recommendation screening_recommendation NOT NULL,
    new_recommendation      screening_recommendation NOT NULL,
    override_reason         TEXT                    NOT NULL,
    notes                   TEXT,
    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7.2  INDEXES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GIN indexes on JSONB columns (§7.2)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_preferences_gin
    ON users USING GIN (preferences jsonb_path_ops);

CREATE INDEX idx_screenings_ai_response_gin
    ON screenings USING GIN (ai_response_json jsonb_path_ops);

CREATE INDEX idx_screenings_scores_gin
    ON screenings USING GIN (scores_json jsonb_path_ops);

CREATE INDEX idx_screenings_snapshot_gin
    ON screenings USING GIN (snapshot_json jsonb_path_ops);

-- GIN index on UUID array column
CREATE INDEX idx_screenings_disqualifier_ids_gin
    ON screenings USING GIN (disqualifier_ids);

-- ---------------------------------------------------------------------------
-- Composite indexes (§7.2)
-- ---------------------------------------------------------------------------

-- PRD §7.2: filter by recommendation, deal_type, created_at
CREATE INDEX idx_screenings_recommendation_deal_type_created_at
    ON screenings (recommendation, deal_type, created_at DESC);

-- Dashboard listing: user's screenings sorted by newest
CREATE INDEX idx_screenings_user_id_created_at
    ON screenings (user_id, created_at DESC);

-- Sort and filter by composite score
CREATE INDEX idx_screenings_composite_score
    ON screenings (composite_score DESC NULLS LAST);

-- Documents for a screening
CREATE INDEX idx_screening_documents_screening_id
    ON screening_documents (screening_id, created_at DESC);

-- Duplicate detection via content hash
CREATE INDEX idx_screening_documents_content_hash
    ON screening_documents (content_hash)
    WHERE content_hash IS NOT NULL;

-- API usage: cost reporting by user and time
CREATE INDEX idx_api_usage_log_user_created_at
    ON api_usage_log (user_id, created_at DESC);

-- API usage: cost reporting by screening
CREATE INDEX idx_api_usage_log_screening_created_at
    ON api_usage_log (screening_id, created_at DESC);

-- API usage: cost reporting by provider and model
CREATE INDEX idx_api_usage_log_provider_model
    ON api_usage_log (provider, model, created_at DESC);

-- Override history per screening
CREATE INDEX idx_screening_overrides_screening_created_at
    ON screening_overrides (screening_id, created_at DESC);

-- Active scoring config by track
CREATE INDEX idx_scoring_config_track
    ON scoring_config (track);

-- Active disqualifiers
CREATE INDEX idx_disqualifiers_active
    ON disqualifiers (is_active)
    WHERE is_active = TRUE;

-- Active system prompts by type and track
CREATE INDEX idx_system_prompts_type_track_active
    ON system_prompts (prompt_type, track, is_active);

-- ---------------------------------------------------------------------------
-- Full-text search indexes (§7.2)
-- PRD §7.2: full-text search on company_name, raw_document_text, AI response
-- ---------------------------------------------------------------------------

-- Full-text search on company name and deal source
CREATE INDEX idx_screenings_fts
    ON screenings
    USING GIN (
        to_tsvector(
            'english',
            COALESCE(company_name, '') || ' ' ||
            COALESCE(deal_source,  '')
        )
    );

-- Full-text search on AI-generated summaries / recommendations (stored in JSON)
CREATE INDEX idx_screenings_raw_document_fts
    ON screenings
    USING GIN (
        to_tsvector('english', COALESCE(raw_document_text, ''))
    );

-- Full-text search on extracted document text
CREATE INDEX idx_screening_documents_extracted_text_fts
    ON screening_documents
    USING GIN (
        to_tsvector('english', COALESCE(extracted_text, ''))
    );

-- Full-text search on system prompt content
CREATE INDEX idx_system_prompts_content_fts
    ON system_prompts
    USING GIN (
        to_tsvector('english', COALESCE(prompt_text, ''))
    );

-- Full-text search on override reason / notes
CREATE INDEX idx_screening_overrides_reason_fts
    ON screening_overrides
    USING GIN (
        to_tsvector('english', COALESCE(override_reason, '') || ' ' || COALESCE(notes, ''))
    );

-- Trigram index for fuzzy / prefix search on company name (§7.2)
CREATE INDEX idx_screenings_company_name_trgm
    ON screenings
    USING GIN (company_name gin_trgm_ops);

-- Trigram index for fuzzy / prefix search on document file names
CREATE INDEX idx_screening_documents_file_name_trgm
    ON screening_documents
    USING GIN (file_name gin_trgm_ops);

-- =============================================================================
-- Row-Level Security (enabled; policies defined in 20260307000001_rls_policies.sql)
-- =============================================================================
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_thresholds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE disqualifiers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_prompts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_overrides  ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_screenings
    BEFORE UPDATE ON screenings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_scoring_config
    BEFORE UPDATE ON scoring_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_scoring_thresholds
    BEFORE UPDATE ON scoring_thresholds
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_disqualifiers
    BEFORE UPDATE ON disqualifiers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_system_prompts
    BEFORE UPDATE ON system_prompts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- Seed data – default scoring weights (PRD §3.5)
-- =============================================================================

-- Traditional PE default weights (sum = 100%)
INSERT INTO scoring_config (track, dimension, weight) VALUES
    ('traditional_pe', 'financial_quality',         20.0),
    ('traditional_pe', 'market_attractiveness',     15.0),
    ('traditional_pe', 'value_creation_potential',  15.0),
    ('traditional_pe', 'competitive_position',      12.0),
    ('traditional_pe', 'customer_quality',          10.0),
    ('traditional_pe', 'risk_profile',              10.0),
    ('traditional_pe', 'strategic_fit',              8.0),
    ('traditional_pe', 'valuation_attractiveness',   5.0),
    ('traditional_pe', 'transaction_feasibility',    3.0),
    ('traditional_pe', 'management_team',            2.0);

-- IP / Technology default weights (sum = 100%)
INSERT INTO scoring_config (track, dimension, weight) VALUES
    ('ip_technology', 'technology_readiness',            18.0),
    ('ip_technology', 'ip_strength_defensibility',       16.0),
    ('ip_technology', 'market_attractiveness',           15.0),
    ('ip_technology', 'commercialization_pathway',       14.0),
    ('ip_technology', 'orthogonal_application_potential',12.0),
    ('ip_technology', 'competitive_position',             8.0),
    ('ip_technology', 'value_creation_potential',         7.0),
    ('ip_technology', 'risk_profile',                     5.0),
    ('ip_technology', 'strategic_fit',                    3.0),
    ('ip_technology', 'management_team',                  2.0);

-- Default recommendation thresholds (PRD §3.6)
INSERT INTO scoring_thresholds (proceed_threshold, further_review_threshold)
VALUES (7.5, 5.5);

-- Default hard disqualifiers (PRD §3.6)
INSERT INTO disqualifiers (name, description, field, operator, value) VALUES
    (
        'Revenue below $2M',
        'Too small for meaningful PE returns at Catalyze''s scale',
        'revenue', '<', '2000000'
    ),
    (
        'Non-US headquarters',
        'Unless the technology IP is uniquely compelling and can be operated domestically',
        'hq_country', '!=', 'US'
    ),
    (
        'Regulated substance',
        'Cannabis, cryptocurrency, or other regulated substances outside Catalyze''s mandate',
        'industry_flag', 'in', 'cannabis,cryptocurrency,regulated_substance'
    ),
    (
        'Heavy cyclicality, no recurring revenue',
        'Pure construction, commodities, or oil & gas exploration without recurring revenue',
        'industry_flag', 'in', 'pure_construction,commodities,oil_gas_exploration'
    ),
    (
        'Asking multiple above 15x EBITDA',
        'Unless high-growth SaaS or technology with exceptional defensibility',
        'ev_ebitda_multiple', '>', '15'
    );
