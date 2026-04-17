import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// Type for the deals row from Supabase
// ---------------------------------------------------------------------------

type DealRow = {
  id: string;
  company_name: string;
  sector: string | null;
  revenue: string | null;
  ebitda: string | null;
  location: string | null;
  deal_source: string | null;
  deal_type: "traditional_pe" | "ip_technology" | null;
  ist_screening_id: string | null;
  status: "active" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dealTypeLabel(dt: string | null): string {
  const map: Record<string, string> = {
    traditional_pe: "Traditional PE",
    ip_technology: "IP / Technology",
  };
  return dt ? (map[dt] ?? dt) : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

async function loadDeal(id: string): Promise<DealRow | null> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("deals")
      .select(
        "id, company_name, sector, revenue, ebitda, location, deal_source, deal_type, ist_screening_id, status, notes, created_at, updated_at"
      )
      .eq("id", id)
      .single<DealRow>();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await loadDeal(id);

  if (!deal) {
    notFound();
  }

  const fields: { label: string; value: string | null }[] = [
    { label: "Company", value: deal.company_name },
    { label: "Sector", value: deal.sector },
    { label: "Revenue", value: deal.revenue },
    { label: "EBITDA", value: deal.ebitda },
    { label: "Location", value: deal.location },
    { label: "Deal Source", value: deal.deal_source },
    { label: "Deal Type", value: dealTypeLabel(deal.deal_type) },
    { label: "Status", value: deal.status.charAt(0).toUpperCase() + deal.status.slice(1) },
    { label: "Added", value: formatDate(deal.created_at) },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/screenings"
                className="text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                title="Back to Screenings"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-100 truncate leading-tight">
                  {deal.company_name}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 whitespace-nowrap">
                    DealFlow Pipeline
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      deal.status === "active"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-500/20 text-slate-400 border border-slate-500/40"
                    }`}
                  >
                    {deal.status.charAt(0).toUpperCase() + deal.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* IST Screening backlink (PRD §8.1) */}
            {deal.ist_screening_id && (
              <Link
                href={`/screenings/${deal.ist_screening_id}`}
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0"
                title="View IST Screening"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                View IST Screening
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Deal details card */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
            Deal Details
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
            <dl className="divide-y divide-slate-700/60">
              {fields.map(({ label, value }) => (
                <div key={label} className="flex px-5 py-3.5 gap-4">
                  <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 shrink-0 pt-0.5">
                    {label}
                  </dt>
                  <dd className="text-sm text-slate-200 font-mono">
                    {value ?? <span className="text-slate-600">—</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Notes */}
        {deal.notes && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Notes
            </h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {deal.notes}
              </p>
            </div>
          </section>
        )}

        {/* IST Screening backlink — mobile (shown below the fold on small screens) */}
        {deal.ist_screening_id && (
          <section className="sm:hidden">
            <Link
              href={`/screenings/${deal.ist_screening_id}`}
              className="flex items-center justify-center gap-2 w-full text-sm px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              View IST Screening
            </Link>
          </section>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
          <span>Deal ID: {deal.id}</span>
          {deal.ist_screening_id && (
            <span>Screening ID: {deal.ist_screening_id}</span>
          )}
          <span>Last updated: {formatDate(deal.updated_at)}</span>
        </div>
      </main>
    </div>
  );
}
