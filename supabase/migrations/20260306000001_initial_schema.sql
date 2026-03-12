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
CREATE TYPE user_role       AS ENUM ('admin', 'reviewer', 'viewer');
CREATE TYPE screening_status AS ENUM (
    'pending',
    'in_progress',
    'ai_complete',
    'approved',
    'rejected',
    'overridden'
);
CREATE TYPE document_type   AS ENUM ('resume', 'cover_letter', 'transcript', 'other');
CREATE TYPE prompt_type     AS ENUM ('screening', 'scoring', 'summary', 'disqualifier');
CREATE TYPE api_provider    AS ENUM ('openai', 'anthropic', 'google', 'other');

-- =============================================================================
-- 7.1  TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users
-- Mirrors Supabase auth.users; stores application-level profile data.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL UNIQUE,
    full_name       TEXT,
    role            user_role   NOT NULL DEFAULT 'viewer',
    avatar_url      TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    preferences     JSONB       NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screenings
-- One row per candidate / application screening session.
-- ---------------------------------------------------------------------------
CREATE TABLE screenings (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by          UUID            NOT NULL REFERENCES users(id),
    candidate_name      TEXT            NOT NULL,
    candidate_email     TEXT,
    position_title      TEXT,
    department          TEXT,
    status              screening_status NOT NULL DEFAULT 'pending',
    ai_score            NUMERIC(5, 2)    CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)),
    ai_summary          TEXT,
    ai_recommendation   TEXT,
    is_disqualified     BOOLEAN         NOT NULL DEFAULT FALSE,
    disqualifier_ids    UUID[]          NOT NULL DEFAULT '{}',
    metadata            JSONB           NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screening_documents
-- Files / extracted text attached to a screening.
-- ---------------------------------------------------------------------------
CREATE TABLE screening_documents (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id    UUID            NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    document_type   document_type   NOT NULL DEFAULT 'other',
    file_name       TEXT            NOT NULL,
    storage_path    TEXT            NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    extracted_text  TEXT,
    page_count      INTEGER,
    metadata        JSONB           NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- scoring_config
-- Configurable scoring rubric (weights, criteria, passing threshold).
-- ---------------------------------------------------------------------------
CREATE TABLE scoring_config (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL UNIQUE,
    description         TEXT,
    -- Default threshold of 70 is a conventional passing grade; adjust per config.
    passing_threshold   NUMERIC(5, 2) NOT NULL DEFAULT 70.0
                            CHECK (passing_threshold >= 0 AND passing_threshold <= 100),
    criteria            JSONB       NOT NULL DEFAULT '{}'::JSONB,
    weights             JSONB       NOT NULL DEFAULT '{}'::JSONB,
    is_active           BOOLEAN     NOT NULL DEFAULT FALSE,
    version             INTEGER     NOT NULL DEFAULT 1,
    created_by          UUID        REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- disqualifiers
-- Hard-stop rules that automatically reject a candidate.
-- ---------------------------------------------------------------------------
CREATE TABLE disqualifiers (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    rule        JSONB       NOT NULL DEFAULT '{}'::JSONB,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    priority    INTEGER     NOT NULL DEFAULT 0,
    created_by  UUID        REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- system_prompts
-- Versioned AI prompt templates used during screening.
-- ---------------------------------------------------------------------------
CREATE TABLE system_prompts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    prompt_type prompt_type NOT NULL,
    content     TEXT        NOT NULL,
    version     INTEGER     NOT NULL DEFAULT 1,
    is_active   BOOLEAN     NOT NULL DEFAULT FALSE,
    model_hint  TEXT,
    created_by  UUID        REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, version)
);

-- ---------------------------------------------------------------------------
-- api_usage_log
-- Tracks every outbound AI/LLM API call for cost & audit purposes.
-- ---------------------------------------------------------------------------
CREATE TABLE api_usage_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            REFERENCES users(id),
    screening_id    UUID            REFERENCES screenings(id) ON DELETE SET NULL,
    provider        api_provider    NOT NULL,
    model           TEXT            NOT NULL,
    endpoint        TEXT,
    prompt_id       UUID            REFERENCES system_prompts(id) ON DELETE SET NULL,
    input_tokens    INTEGER         NOT NULL DEFAULT 0,
    output_tokens   INTEGER         NOT NULL DEFAULT 0,
    total_tokens    INTEGER         GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,
    cost_usd        NUMERIC(12, 6),
    latency_ms      INTEGER,
    http_status     SMALLINT,
    error_message   TEXT,
    request_meta    JSONB           NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- screening_overrides
-- Audit log of manual decisions that supersede the AI recommendation.
-- ---------------------------------------------------------------------------
CREATE TABLE screening_overrides (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id    UUID                NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    overridden_by   UUID                NOT NULL REFERENCES users(id),
    original_status screening_status    NOT NULL,
    new_status      screening_status    NOT NULL,
    original_score  NUMERIC(5, 2)       CHECK (original_score IS NULL OR (original_score >= 0 AND original_score <= 100)),
    new_score       NUMERIC(5, 2)       CHECK (new_score IS NULL OR (new_score >= 0 AND new_score <= 100)),
    reason          TEXT                NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7.2  INDEXES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GIN indexes on JSONB columns
-- (supports @>, ?, ?|, ?& operators and jsonb_path_exists / jsonb_path_query)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_preferences_gin
    ON users USING GIN (preferences jsonb_path_ops);

CREATE INDEX idx_screenings_metadata_gin
    ON screenings USING GIN (metadata jsonb_path_ops);

CREATE INDEX idx_screening_documents_metadata_gin
    ON screening_documents USING GIN (metadata jsonb_path_ops);

CREATE INDEX idx_scoring_config_criteria_gin
    ON scoring_config USING GIN (criteria jsonb_path_ops);

CREATE INDEX idx_scoring_config_weights_gin
    ON scoring_config USING GIN (weights jsonb_path_ops);

CREATE INDEX idx_disqualifiers_rule_gin
    ON disqualifiers USING GIN (rule jsonb_path_ops);

CREATE INDEX idx_api_usage_log_request_meta_gin
    ON api_usage_log USING GIN (request_meta jsonb_path_ops);

-- GIN index on the UUID array column
CREATE INDEX idx_screenings_disqualifier_ids_gin
    ON screenings USING GIN (disqualifier_ids);

-- ---------------------------------------------------------------------------
-- Composite indexes
-- ---------------------------------------------------------------------------

-- Look up screenings by creator and status (dashboard queries)
CREATE INDEX idx_screenings_created_by_status
    ON screenings (created_by, status);

-- Time-ordered listing of screenings per creator
CREATE INDEX idx_screenings_created_by_created_at
    ON screenings (created_by, created_at DESC);

-- Filter screenings by status then sort by newest
CREATE INDEX idx_screenings_status_created_at
    ON screenings (status, created_at DESC);

-- Retrieve all documents belonging to a screening
CREATE INDEX idx_screening_documents_screening_type
    ON screening_documents (screening_id, document_type);

-- Cost analysis: sum API spend per user over time
CREATE INDEX idx_api_usage_log_user_created_at
    ON api_usage_log (user_id, created_at DESC);

-- Cost analysis: sum API spend per screening
CREATE INDEX idx_api_usage_log_screening_created_at
    ON api_usage_log (screening_id, created_at DESC);

-- Provider + model cost reporting
CREATE INDEX idx_api_usage_log_provider_model
    ON api_usage_log (provider, model, created_at DESC);

-- Override history per screening (ordered by time)
CREATE INDEX idx_screening_overrides_screening_created_at
    ON screening_overrides (screening_id, created_at DESC);

-- Override history per reviewer
CREATE INDEX idx_screening_overrides_overridden_by
    ON screening_overrides (overridden_by, created_at DESC);

-- Active system prompts by type (prompt selection at runtime)
CREATE INDEX idx_system_prompts_type_active
    ON system_prompts (prompt_type, is_active);

-- Active scoring config lookup
CREATE INDEX idx_scoring_config_active
    ON scoring_config (is_active)
    WHERE is_active = TRUE;

-- Active disqualifiers ordered by priority
CREATE INDEX idx_disqualifiers_active_priority
    ON disqualifiers (is_active, priority)
    WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Full-text search indexes
-- ---------------------------------------------------------------------------

-- Full-text search on candidate name, position, department within screenings
CREATE INDEX idx_screenings_fts
    ON screenings
    USING GIN (
        to_tsvector(
            'english',
            COALESCE(candidate_name,  '') || ' ' ||
            COALESCE(candidate_email, '') || ' ' ||
            COALESCE(position_title,  '') || ' ' ||
            COALESCE(department,      '')
        )
    );

-- Full-text search on AI-generated summaries / recommendations
CREATE INDEX idx_screenings_ai_text_fts
    ON screenings
    USING GIN (
        to_tsvector(
            'english',
            COALESCE(ai_summary,         '') || ' ' ||
            COALESCE(ai_recommendation,  '')
        )
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
        to_tsvector('english', COALESCE(content, ''))
    );

-- Full-text search on override reason / notes
CREATE INDEX idx_screening_overrides_reason_fts
    ON screening_overrides
    USING GIN (
        to_tsvector('english', COALESCE(reason, '') || ' ' || COALESCE(notes, ''))
    );

-- Trigram index for prefix / fuzzy search on candidate name
CREATE INDEX idx_screenings_candidate_name_trgm
    ON screenings
    USING GIN (candidate_name gin_trgm_ops);

-- Trigram index for prefix / fuzzy search on document file names
CREATE INDEX idx_screening_documents_file_name_trgm
    ON screening_documents
    USING GIN (file_name gin_trgm_ops);

-- =============================================================================
-- Row-Level Security (enabled but policies are defined per-feature)
-- =============================================================================
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config       ENABLE ROW LEVEL SECURITY;
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

CREATE TRIGGER set_updated_at_disqualifiers
    BEFORE UPDATE ON disqualifiers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_system_prompts
    BEFORE UPDATE ON system_prompts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
