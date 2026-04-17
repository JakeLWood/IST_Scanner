import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "./sign-out-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <main className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 shadow-md">
        <h1 className="mb-2 text-2xl font-semibold text-slate-50">
          IST Scanner
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          Signed in as{" "}
          <span className="font-medium text-slate-300">{user.email}</span>
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="/upload"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Screen a Deal
          </a>
          <a
            href="/screenings"
            className="rounded-lg border border-slate-700 px-4 py-2 text-center text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
          >
            Deal Log
          </a>
          <a
            href="/compare"
            className="rounded-lg border border-slate-700 px-4 py-2 text-center text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
          >
            Compare Deals
          </a>
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
