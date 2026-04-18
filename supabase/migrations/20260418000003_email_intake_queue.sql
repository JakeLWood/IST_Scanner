-- =============================================================================
-- IST Screener – Email Intake Queue
-- PRD §8.2: Email Forwarding (Stretch Goal)
--
-- Stores inbound emails from unregistered senders so an admin can process
-- them manually (or they can be re-triggered once the sender registers).
-- Also serves as an audit log for all inbound email screening requests.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- email_intake_queue
-- One row per inbound email received at screen@catalyze.partners.
-- Rows for registered users are immediately converted to a screening and
-- marked processed_at; rows for unregistered senders remain pending until
-- an admin resolves them.
-- ---------------------------------------------------------------------------

CREATE TABLE email_intake_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Sender info (may not match any user in the users table)
    sender_email    TEXT        NOT NULL,
    sender_name     TEXT,
    subject         TEXT,
    -- Raw text extracted from attachments or the email body
    raw_text        TEXT        NOT NULL,
    -- 'pending'   – unregistered sender; awaiting admin action
    -- 'processed' – screening was created; see screening_id
    -- 'rejected'  – admin decided not to process
    status          TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processed', 'rejected')),
    -- Filled once the email is converted into a full screening
    screening_id    UUID        REFERENCES screenings(id) ON DELETE SET NULL,
    -- True once at least one admin notification email has been sent
    admin_notified  BOOLEAN     NOT NULL DEFAULT FALSE,
    -- ISO 8601 string of the original email's date header (if provided)
    email_date      TEXT,
    -- Resend email_id for reference / deduplication
    resend_email_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

-- Index for admin dashboard queries (most recent first, filter by status)
CREATE INDEX idx_email_intake_queue_status_created
    ON email_intake_queue (status, created_at DESC);

-- Index to prevent processing the same Resend email_id twice
CREATE UNIQUE INDEX idx_email_intake_queue_resend_email_id
    ON email_intake_queue (resend_email_id)
    WHERE resend_email_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Service role performs all inserts (the webhook handler uses the service key).
-- Authenticated admins can read all rows and update status/screening_id.
-- No INSERT policy for authenticated role — inserts come from the webhook.
-- ---------------------------------------------------------------------------

ALTER TABLE email_intake_queue ENABLE ROW LEVEL SECURITY;

-- Admins can read all queued emails.
CREATE POLICY "admins can read email intake queue"
    ON email_intake_queue
    FOR SELECT
    TO authenticated
    USING (is_admin());

-- Admins can update status and screening_id fields.
CREATE POLICY "admins can update email intake queue"
    ON email_intake_queue
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete entries (e.g. spam).
CREATE POLICY "admins can delete from email intake queue"
    ON email_intake_queue
    FOR DELETE
    TO authenticated
    USING (is_admin());
