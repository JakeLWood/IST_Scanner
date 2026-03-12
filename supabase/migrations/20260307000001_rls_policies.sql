-- =============================================================================
-- IST Screener – Row-Level Security Policies
-- Applies to all tables created in 20260306000001_initial_schema.sql
--
-- PRD §7.3 access rules:
--   • All authenticated users can read all screenings (team is small; full transparency).
--   • Only the screening creator and admins can edit or delete a screening.
--   • Only admins can modify scoring_config, disqualifiers, and system_prompts.
--   • api_usage_log is read-only for all authenticated users; inserts are
--     performed exclusively by the service role (backend / edge functions).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is_admin()
-- Returns TRUE when the calling user has role = 'admin' in the users table.
-- SECURITY DEFINER + explicit search_path prevent RLS recursion and
-- search-path injection.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id       = auth.uid()
          AND role     = 'admin'
          AND is_active = TRUE
    );
$$;

-- =============================================================================
-- users
-- =============================================================================

-- Any authenticated user can view all user profiles.
CREATE POLICY "authenticated users can read users"
    ON users
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Users register their own profile row (id must match the JWT subject).
CREATE POLICY "users can insert own profile"
    ON users
    FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- A user may update their own profile; admins may update any profile.
CREATE POLICY "users can update own profile or admins can update any"
    ON users
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR is_admin())
    WITH CHECK (id = auth.uid() OR is_admin());

-- Only admins may delete user accounts.
CREATE POLICY "only admins can delete users"
    ON users
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =============================================================================
-- screenings
-- PRD §7.3: all authenticated users can read; only creator or admin can edit/delete
-- =============================================================================

-- All authenticated users can read all screenings.
CREATE POLICY "authenticated users can read all screenings"
    ON screenings
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Any authenticated user can start a new screening; user_id must be their own.
CREATE POLICY "authenticated users can create screenings"
    ON screenings
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Only the screening creator or an admin can update it.
CREATE POLICY "creator or admins can update screenings"
    ON screenings
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() OR is_admin())
    WITH CHECK (user_id = auth.uid() OR is_admin());

-- Only the screening creator or an admin can delete it.
CREATE POLICY "creator or admins can delete screenings"
    ON screenings
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid() OR is_admin());

-- =============================================================================
-- screening_documents
-- PRD §7.3: same ownership model as screenings
-- =============================================================================

-- All authenticated users can read screening documents.
CREATE POLICY "authenticated users can read all screening documents"
    ON screening_documents
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Inserting a document requires being the creator of the parent screening
-- or being an admin.
CREATE POLICY "creator or admins can insert screening documents"
    ON screening_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM screenings s
            WHERE s.id       = screening_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

-- Updating a document requires the same ownership check.
CREATE POLICY "creator or admins can update screening documents"
    ON screening_documents
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM screenings s
            WHERE s.id       = screening_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM screenings s
            WHERE s.id       = screening_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

-- Deleting a document requires the same ownership check.
CREATE POLICY "creator or admins can delete screening documents"
    ON screening_documents
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM screenings s
            WHERE s.id       = screening_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

-- =============================================================================
-- scoring_config
-- PRD §7.3: admins only for writes; all authenticated users can read
-- =============================================================================

-- All authenticated users can read scoring configurations.
CREATE POLICY "authenticated users can read scoring config"
    ON scoring_config
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can create scoring configurations.
CREATE POLICY "only admins can insert scoring config"
    ON scoring_config
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Only admins can modify scoring configurations.
CREATE POLICY "only admins can update scoring config"
    ON scoring_config
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins can delete scoring configurations.
CREATE POLICY "only admins can delete scoring config"
    ON scoring_config
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =============================================================================
-- scoring_thresholds
-- Same admin-only write access as scoring_config
-- =============================================================================

CREATE POLICY "authenticated users can read scoring thresholds"
    ON scoring_thresholds
    FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "only admins can insert scoring thresholds"
    ON scoring_thresholds
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "only admins can update scoring thresholds"
    ON scoring_thresholds
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "only admins can delete scoring thresholds"
    ON scoring_thresholds
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =============================================================================
-- disqualifiers
-- PRD §7.3: admins only for writes; all authenticated users can read
-- =============================================================================

-- All authenticated users can read disqualifier rules.
CREATE POLICY "authenticated users can read disqualifiers"
    ON disqualifiers
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can create disqualifier rules.
CREATE POLICY "only admins can insert disqualifiers"
    ON disqualifiers
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Only admins can modify disqualifier rules.
CREATE POLICY "only admins can update disqualifiers"
    ON disqualifiers
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins can delete disqualifier rules.
CREATE POLICY "only admins can delete disqualifiers"
    ON disqualifiers
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =============================================================================
-- system_prompts
-- PRD §7.3: admins only for writes; all authenticated users can read
-- =============================================================================

-- All authenticated users can read system prompts.
CREATE POLICY "authenticated users can read system prompts"
    ON system_prompts
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can create system prompts.
CREATE POLICY "only admins can insert system prompts"
    ON system_prompts
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Only admins can modify system prompts.
CREATE POLICY "only admins can update system prompts"
    ON system_prompts
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins can delete system prompts.
CREATE POLICY "only admins can delete system prompts"
    ON system_prompts
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =============================================================================
-- api_usage_log
-- PRD §7.3 / §2.4: read-only for all authenticated users.
-- Inserts go through the service role (backend / edge functions) only.
-- No INSERT policy for the authenticated role is intentional.
-- =============================================================================

CREATE POLICY "authenticated users can read api usage log"
    ON api_usage_log
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- =============================================================================
-- screening_overrides
-- PRD §7.3: any authenticated user may create; only admins may amend/delete
-- =============================================================================

-- All authenticated users can read override records (full audit visibility).
CREATE POLICY "authenticated users can read screening overrides"
    ON screening_overrides
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Any authenticated user may record an override, but user_id must equal
-- their own user ID to preserve the audit trail.
CREATE POLICY "authenticated users can create screening overrides"
    ON screening_overrides
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Override records are part of the audit trail; only admins may amend them.
CREATE POLICY "only admins can update screening overrides"
    ON screening_overrides
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins may delete override records.
CREATE POLICY "only admins can delete screening overrides"
    ON screening_overrides
    FOR DELETE
    TO authenticated
    USING (is_admin());
