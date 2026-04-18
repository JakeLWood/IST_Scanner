/**
 * Loading skeleton for the Screening Results page.
 *
 * Next.js renders this automatically while the Server Component for
 * app/screenings/[id]/page.tsx is fetching data from Supabase. The sticky
 * header and card skeletons mirror the real layout so the page feels
 * responsive even on cold starts.
 *
 * PRD §9.4 — sub-60 s end-to-end; this skeleton ensures the user sees
 * meaningful structure immediately after navigation rather than a blank
 * white screen while the DB query + scoring run.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky header skeleton */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Company name + badges */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="h-5 bg-slate-700 rounded animate-pulse w-48" />
              <div className="flex gap-2">
                <div className="h-4 bg-slate-700 rounded-full animate-pulse w-24" />
                <div className="h-4 bg-slate-700 rounded-full animate-pulse w-20" />
              </div>
            </div>
            {/* Composite score */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="h-10 bg-slate-700 rounded animate-pulse w-14" />
              <div className="h-3 bg-slate-700 rounded animate-pulse w-8" />
            </div>
            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              <div className="h-8 bg-slate-700 rounded-lg animate-pulse w-24 hidden sm:block" />
              <div className="h-8 bg-slate-700 rounded-lg animate-pulse w-16 hidden sm:block" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Executive Summary */}
        <section className="space-y-2">
          <div className="h-3 bg-slate-800 rounded animate-pulse w-36" />
          <div className="h-4 bg-slate-800 rounded animate-pulse w-full" />
          <div className="h-4 bg-slate-800 rounded animate-pulse w-5/6" />
          <div className="h-4 bg-slate-800 rounded animate-pulse w-4/5" />
        </section>

        {/* Investment Snapshot */}
        <section>
          <div className="h-3 bg-slate-800 rounded animate-pulse w-40 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-700 bg-slate-800/50 h-20 animate-pulse"
              />
            ))}
          </div>
        </section>

        {/* Score Analysis */}
        <section>
          <div className="h-3 bg-slate-800 rounded animate-pulse w-32 mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 h-80 animate-pulse" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-700 bg-slate-800/50 h-14 animate-pulse"
                />
              ))}
            </div>
          </div>
        </section>

        {/* Risk Assessment */}
        <section>
          <div className="h-3 bg-slate-800 rounded animate-pulse w-36 mb-4" />
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 h-48 animate-pulse" />
        </section>
      </main>
    </div>
  );
}
