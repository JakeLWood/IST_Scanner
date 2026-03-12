// PRD §6.2.1: Upload / New Screening Page — entry point for initiating a new screening
// This is a placeholder; full implementation is in Phase 1 (PRD §1.4)

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-accent">
          Catalyze Partners
        </p>
        <h1 className="text-4xl font-bold text-foreground">IST Screener</h1>
        <p className="mt-3 max-w-md text-foreground-muted">
          AI-powered Investment Screening Test platform. Upload a deal document to receive a
          complete, scored IST analysis in under 60 seconds.
        </p>
      </div>

      {/* PRD §6.2.1: Upload zone placeholder */}
      <div className="w-full max-w-xl rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/50 p-12 text-center transition-colors hover:border-accent">
        <div className="mb-4 text-4xl text-foreground-muted">📄</div>
        <p className="text-lg font-medium text-foreground">Drop your deal document here</p>
        <p className="mt-1 text-sm text-foreground-muted">
          PDF, DOCX, PPTX, PNG, JPG — up to 25 MB
        </p>
        <button className="mt-6 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
          Browse Files
        </button>
      </div>

      {/* PRD §6.2.1: Text paste alternative */}
      <div className="mt-6 w-full max-w-xl">
        <p className="mb-2 text-center text-xs text-foreground-muted">
          or paste deal text directly
        </p>
        <textarea
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-foreground placeholder-foreground-muted focus:border-accent focus:outline-none"
          rows={4}
          placeholder="Paste a deal description, email, or teaser text here..."
        />
      </div>

      {/* PRD §6.2.1: Screen This Deal button */}
      <button className="mt-6 w-full max-w-xl rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover">
        Screen This Deal
      </button>

      {/* Navigation hint */}
      <nav className="mt-10 flex gap-6 text-sm text-foreground-muted">
        {/* PRD §6.2.3: Screening History / Deal Log */}
        <a href="/history" className="hover:text-accent hover:underline">
          Deal History
        </a>
        {/* PRD §6.2.4: Deal Comparison */}
        <a href="/compare" className="hover:text-accent hover:underline">
          Compare Deals
        </a>
        {/* PRD §6.2.5: Settings / Admin */}
        <a href="/settings" className="hover:text-accent hover:underline">
          Settings
        </a>
      </nav>
    </main>
  );
}
