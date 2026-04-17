import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with the service role key.
 * Use ONLY in server-side code (Server Actions, Route Handlers).
 * Never expose this client or its key to the browser.
 *
 * Required for admin operations such as inviting users via
 * supabase.auth.admin.inviteUserByEmail().
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase service role configuration. " +
        "Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
