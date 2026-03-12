"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuthContext } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";

/**
 * useAuth – client-side hook that exposes the current auth state and helper
 * methods for signing in / out.
 *
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const { user, session, loading } = useAuthContext();
  const router = useRouter();

  async function signInWithEmail(email: string, password: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return {
    user,
    session,
    loading,
    signInWithEmail,
    signOut,
  };
}
