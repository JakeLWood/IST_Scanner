-- =============================================================================
-- Performance: index screenings by created_at for faster history queries
-- PRD §9.4 — target <60 s end-to-end; fast history page is part of that goal.
-- =============================================================================

-- Covering index used by the history/deal-log page query which orders all rows
-- by created_at DESC (no user filter at the DB level — RLS handles per-user
-- visibility, but an index on the sort key still eliminates a full-table sort).
CREATE INDEX IF NOT EXISTS idx_screenings_created_at
    ON screenings (created_at DESC);

-- Composite index used when querying a single user's screening history
-- (e.g. rate-limit check in analyze-deal edge function, per-user dashboards).
CREATE INDEX IF NOT EXISTS idx_screenings_user_created
    ON screenings (user_id, created_at DESC);
