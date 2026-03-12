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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md dark:bg-zinc-900">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          IST Scanner
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {user.email}
          </span>
        </p>
        <SignOutButton />
      </main>
    </div>
  );
}
