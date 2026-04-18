"use client";

/**
 * DealLogClient — interactive deal log table with search + filters.
 * PRD §6.2.3 — Screening History / Deal Log Page
 */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchScreeningsForExport } from "@/lib/actions/fetchScreeningsForExport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreeningRecommendation = "PROCEED" | "FURTHER_REVIEW" | "PASS";
export type DealType = "traditional_pe" | "ip_technology";

export interface DealLogRow {
  id: string;
  companyName: string;
  dateScreened: string; // ISO string
  dealType: DealType | null;
  compositeScore: number | null;
  recommendation: ScreeningRecommendation | null;
  sector: string | null;
  dealSource: string | null;
  screenedBy: string | null;
}

interface DealLogClientProps {
  rows: DealLogRow[];
}

// ---------------------------------------------------------------------------
// Helpers — colour coding
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 7.5) return "text-emerald-400";
  if (score >= 5.5) return "text-amber-400";
  return "text-red-400";
}

function verdictBadge(rec: ScreeningRecommendation): {
  label: string;
  classes: string;
} {
  switch (rec) {
    case "PROCEED":
      return {
        label: "Proceed",
        classes:
          "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
      };
    case "FURTHER_REVIEW":
      return {
        label: "Further Review",
        classes: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
      };
    case "PASS":
      return {
        label: "Pass",
        classes: "bg-red-500/20 text-red-300 border border-red-500/40",
      };
  }
}

function dealTypeLabel(dt: DealType | null): string {
  if (!dt) return "—";
  return dt === "traditional_pe" ? "Traditional PE" : "IP / Technology";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortKey = keyof DealLogRow;
type SortDir = "asc" | "desc";

function compareRows(a: DealLogRow, b: DealLogRow, key: SortKey, dir: SortDir): number {
  let av: string | number | null = a[key] as string | number | null;
  let bv: string | number | null = b[key] as string | number | null;

  if (av === null || av === undefined) return dir === "asc" ? 1 : -1;
  if (bv === null || bv === undefined) return dir === "asc" ? -1 : 1;

  if (typeof av === "number" && typeof bv === "number") {
    return dir === "asc" ? av - bv : bv - av;
  }
  av = String(av).toLowerCase();
  bv = String(bv).toLowerCase();
  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Filter pill component
// ---------------------------------------------------------------------------

interface FilterPillProps {
  label: string;
  active: boolean;
  color?: "green" | "amber" | "red" | "indigo";
  onClick: () => void;
}

function FilterPill({ label, active, color = "indigo", onClick }: FilterPillProps) {
  const base = "px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors select-none";
  const colors: Record<typeof color, { on: string; off: string }> = {
    green: {
      on: "bg-emerald-500/30 text-emerald-300 border-emerald-500/50",
      off: "bg-slate-800 text-slate-400 border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400",
    },
    amber: {
      on: "bg-amber-500/30 text-amber-300 border-amber-500/50",
      off: "bg-slate-800 text-slate-400 border-slate-700 hover:border-amber-500/40 hover:text-amber-400",
    },
    red: {
      on: "bg-red-500/30 text-red-300 border-red-500/50",
      off: "bg-slate-800 text-slate-400 border-slate-700 hover:border-red-500/40 hover:text-red-400",
    },
    indigo: {
      on: "bg-indigo-500/30 text-indigo-300 border-indigo-500/50",
      off: "bg-slate-800 text-slate-400 border-slate-700 hover:border-indigo-500/40 hover:text-indigo-400",
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? colors[color].on : colors[color].off}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sort header button
// ---------------------------------------------------------------------------

interface SortButtonProps {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
}

function SortButton({ col, label, sortKey, sortDir, onSort }: SortButtonProps) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
    >
      {label}
      <span className="ml-0.5 text-[10px] leading-none">
        {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DealLogClient({ rows }: DealLogClientProps) {
  const router = useRouter();

  // ── search ──
  const [search, setSearch] = useState("");

  // ── recommendation filter ──
  const [recFilter, setRecFilter] = useState<Set<ScreeningRecommendation>>(
    new Set()
  );

  // ── deal type filter ──
  const [dealTypeFilter, setDealTypeFilter] = useState<Set<DealType>>(new Set());

  // ── sector filter ──
  const allSectors = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.sector) s.add(r.sector); });
    return Array.from(s).sort();
  }, [rows]);
  const [sectorFilter, setSectorFilter] = useState<string>("");

  // ── date range ──
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── score range ──
  const [scoreMin, setScoreMin] = useState(1);
  const [scoreMax, setScoreMax] = useState(10);

  // ── sort ──
  const [sortKey, setSortKey] = useState<SortKey>("dateScreened");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── row selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── export state ──
  const [exportLoading, setExportLoading] = useState<"excel" | "pdf" | null>(null);

  const handleSort = useCallback(
    (col: SortKey) => {
      if (sortKey === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(col);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const toggleRec = useCallback((r: ScreeningRecommendation) => {
    setRecFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }, []);

  const toggleDealType = useCallback((dt: DealType) => {
    setDealTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(dt)) next.delete(dt);
      else next.add(dt);
      return next;
    });
  }, []);

  // ── row selection helpers ──
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── export helpers ──

  const handleExportExcel = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExportLoading("excel");
    try {
      const ids = Array.from(selectedIds);
      const records = await fetchScreeningsForExport(ids);
      const exportRows = records.map((rec) => {
        const summaryRow = rows.find((r) => r.id === rec.id);
        return {
          ...rec,
          dateScreened: summaryRow?.dateScreened,
          sector: summaryRow?.sector,
          screenedBy: summaryRow?.screenedBy,
        };
      });
      const { downloadBulkExcel } = await import("@/lib/export/excelExport");
      await downloadBulkExcel(exportRows);
    } catch (err) {
      console.error("Excel export failed:", err);
      alert("Excel export failed. Please try again.");
    } finally {
      setExportLoading(null);
    }
  }, [selectedIds, rows]);

  const handleExportPDF = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExportLoading("pdf");
    try {
      const ids = Array.from(selectedIds);
      const records = await fetchScreeningsForExport(ids);
      const [{ pdf }, { default: BulkScreeningPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./BulkScreeningPDF"),
      ]);
      const items = records.map((rec) => {
        const summaryRow = rows.find((r) => r.id === rec.id);
        return {
          id: rec.id,
          analysis: rec.analysis,
          scoringResult: rec.scoringResult,
          dateScreened: summaryRow?.dateScreened,
        };
      });
      const blob = await pdf(<BulkScreeningPDF items={items} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `IST_Bulk_Export_${ts}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Please try again.");
    } finally {
      setExportLoading(null);
    }
  }, [selectedIds, rows]);

  // ── derived filtered + sorted list ──
  const displayed = useMemo(() => {
    let list = rows;

    // full-text search (company name, sector, deal source)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.companyName.toLowerCase().includes(q) ||
          (r.sector ?? "").toLowerCase().includes(q) ||
          (r.dealSource ?? "").toLowerCase().includes(q) ||
          (r.screenedBy ?? "").toLowerCase().includes(q)
      );
    }

    // recommendation filter
    if (recFilter.size > 0) {
      list = list.filter((r) => r.recommendation && recFilter.has(r.recommendation));
    }

    // deal type filter
    if (dealTypeFilter.size > 0) {
      list = list.filter((r) => r.dealType && dealTypeFilter.has(r.dealType));
    }

    // sector filter
    if (sectorFilter) {
      list = list.filter((r) => r.sector === sectorFilter);
    }

    // date range
    if (dateFrom) {
      list = list.filter((r) => r.dateScreened >= dateFrom);
    }
    if (dateTo) {
      // inclusive end — add one day
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      list = list.filter((r) => r.dateScreened < end.toISOString());
    }

    // score range
    list = list.filter(
      (r) =>
        r.compositeScore === null ||
        (r.compositeScore >= scoreMin && r.compositeScore <= scoreMax)
    );

    // sort
    return [...list].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [
    rows,
    search,
    recFilter,
    dealTypeFilter,
    sectorFilter,
    dateFrom,
    dateTo,
    scoreMin,
    scoreMax,
    sortKey,
    sortDir,
  ]);

  const hasFilters =
    search.trim() ||
    recFilter.size > 0 ||
    dealTypeFilter.size > 0 ||
    sectorFilter ||
    dateFrom ||
    dateTo ||
    scoreMin > 1 ||
    scoreMax < 10;

  // These depend on `displayed` so must come after the `displayed` useMemo.
  const isAllDisplayedSelected = useMemo(
    () => displayed.length > 0 && displayed.every((r) => selectedIds.has(r.id)),
    [displayed, selectedIds]
  );

  const toggleAllDisplayed = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllDisplayedSelected) {
        displayed.forEach((r) => next.delete(r.id));
      } else {
        displayed.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [displayed, isAllDisplayedSelected]);

  function clearFilters() {
    setSearch("");
    setRecFilter(new Set());
    setDealTypeFilter(new Set());
    setSectorFilter("");
    setDateFrom("");
    setDateTo("");
    setScoreMin(1);
    setScoreMax(10);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 px-4 py-8">
      {/* ── Page header ── */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Deal Log</h1>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} screening{rows.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Export Selected — only appears when rows are checked */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exportLoading !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-600/20 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Export selected screenings to Excel"
                >
                  {exportLoading === "excel" ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span className="hidden sm:inline">Export Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exportLoading !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-600/50 bg-indigo-600/20 px-3 py-2 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Export selected screenings to PDF"
                >
                  {exportLoading === "pdf" ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                  <span className="hidden sm:inline">Export PDF</span>
                </button>
              </div>
            )}
            <a
              href="/upload"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 whitespace-nowrap"
            >
              + Screen a Deal
            </a>
          </div>
        </div>

        {/* ── Filter panel ── */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
          {/* Search */}
          <div className="flex gap-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-56">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search company, sector, source…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Recommendation pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Recommendation
            </span>
            <FilterPill
              label="Proceed"
              active={recFilter.has("PROCEED")}
              color="green"
              onClick={() => toggleRec("PROCEED")}
            />
            <FilterPill
              label="Further Review"
              active={recFilter.has("FURTHER_REVIEW")}
              color="amber"
              onClick={() => toggleRec("FURTHER_REVIEW")}
            />
            <FilterPill
              label="Pass"
              active={recFilter.has("PASS")}
              color="red"
              onClick={() => toggleRec("PASS")}
            />
          </div>

          {/* Deal type + sector */}
          <div className="flex flex-wrap gap-4 items-center">
            {/* Deal type */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Deal Type
              </span>
              <FilterPill
                label="Traditional PE"
                active={dealTypeFilter.has("traditional_pe")}
                color="indigo"
                onClick={() => toggleDealType("traditional_pe")}
              />
              <FilterPill
                label="IP / Technology"
                active={dealTypeFilter.has("ip_technology")}
                color="indigo"
                onClick={() => toggleDealType("ip_technology")}
              />
            </div>

            {/* Sector dropdown */}
            {allSectors.length > 0 && (
              <div className="flex gap-2 items-center">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Sector
                </span>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 py-1.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All sectors</option>
                  {allSectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date range + score range */}
          <div className="flex flex-wrap gap-6 items-end">
            {/* Date range */}
            <div className="flex gap-3 items-center flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Date Range
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 py-1.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 py-1.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
              />
            </div>

            {/* Score range */}
            <div className="flex gap-3 items-center min-w-64">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Score
              </span>
              <div className="flex items-center gap-2 flex-1">
                <span className="font-mono text-xs text-slate-400 w-6 text-right">
                  {scoreMin}
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={scoreMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setScoreMin(Math.min(v, scoreMax));
                  }}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-slate-500 text-xs">–</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={scoreMax}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setScoreMax(Math.max(v, scoreMin));
                  }}
                  className="flex-1 accent-indigo-500"
                />
                <span className="font-mono text-xs text-slate-400 w-6">
                  {scoreMax}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Results count ── */}
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {displayed.length} of {rows.length} result
            {rows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900">
              <tr>
                {/* Select-all checkbox */}
                <th scope="col" className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all visible rows"
                    checked={isAllDisplayedSelected}
                    onChange={toggleAllDisplayed}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 accent-indigo-500 cursor-pointer"
                  />
                </th>
                {(
                  [
                    { col: "companyName", label: "Company Name" },
                    { col: "dateScreened", label: "Date Screened" },
                    { col: "dealType", label: "Deal Type" },
                    { col: "compositeScore", label: "Score" },
                    { col: "recommendation", label: "Recommendation" },
                    { col: "sector", label: "Sector" },
                    { col: "dealSource", label: "Deal Source" },
                    { col: "screenedBy", label: "Screened By" },
                  ] as { col: SortKey; label: string }[]
                ).map(({ col, label }) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-3 text-left"
                  >
                    <SortButton
                      col={col}
                      label={label}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {displayed.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    No screenings match your filters.
                  </td>
                </tr>
              ) : (
                displayed.map((row) => {
                  const isSelected = selectedIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/screenings/${row.id}`)}
                      className={`cursor-pointer transition-colors hover:bg-slate-800/60 focus-within:bg-slate-800/60 ${isSelected ? "bg-indigo-900/20" : ""}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/screenings/${row.id}`);
                        }
                      }}
                    >
                      {/* Selection checkbox — stops row navigation when clicked */}
                      <td
                        className="px-4 py-3 w-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(row.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleRow(row.id);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.companyName}`}
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 accent-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Company Name */}
                      <td className="px-4 py-3 font-medium text-slate-100 whitespace-nowrap">
                        {row.companyName}
                      </td>

                      {/* Date Screened */}
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {formatDate(row.dateScreened)}
                      </td>

                      {/* Deal Type */}
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {dealTypeLabel(row.dealType)}
                      </td>

                      {/* Composite Score */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.compositeScore !== null ? (
                          <span
                            className={`font-mono text-base font-semibold ${scoreColor(row.compositeScore)}`}
                          >
                            {row.compositeScore.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Recommendation */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.recommendation ? (
                          (() => {
                            const { label, classes } = verdictBadge(
                              row.recommendation
                            );
                            return (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
                              >
                                {label}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Sector */}
                      <td className="px-4 py-3 text-slate-300">
                        {row.sector ?? <span className="text-slate-600">—</span>}
                      </td>

                      {/* Deal Source */}
                      <td className="px-4 py-3 text-slate-400">
                        {row.dealSource ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Screened By */}
                      <td className="px-4 py-3 text-slate-400">
                        {row.screenedBy ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Empty state — no screenings at all ── */}
        {rows.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <div className="text-4xl">📋</div>
            <h2 className="text-lg font-semibold text-slate-300">
              No screenings yet
            </h2>
            <p className="text-sm text-slate-500">
              Upload a deal document to create your first screening.
            </p>
            <a
              href="/upload"
              className="mt-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Screen a Deal
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
