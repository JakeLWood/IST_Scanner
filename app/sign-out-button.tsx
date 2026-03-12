"use client";

import { useAuth } from "@/hooks/use-auth";

export default function SignOutButton() {
  const { signOut } = useAuth();

  return (
    <button
      onClick={signOut}
      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
    >
      Sign out
    </button>
  );
}
