"use client";

/**
 * PromptsClient — app/admin/prompts/PromptsClient.tsx
 *
 * Admin UI for editing and versioning Claude system prompts (PRD §5.1).
 *
 * Features:
 * - Track tab switcher: Traditional PE ↔ IP/Technology
 * - Large textarea with the current active system prompt (editable)
 * - Version history panel: past prompt versions with timestamp, author,
 *   version number, and a "Restore" button to re-activate older versions
 * - "Test Prompt" panel: paste a text snippet, click Run, see the raw
 *   JSON output returned by Claude (prompt is tested server-side via the
 *   test-prompt Edge Function — API key is never exposed to the client)
 * - "Save" button (admin only): creates a new version row in system_prompts
 *
 * PRD §5.1   — system prompt editor in admin settings
 * PRD §6.1   — dark theme: navy/slate backgrounds, indigo accents
 * PRD §6.2.5 — Settings / Admin Page
 * PRD §7.3   — only admins can write system_prompts
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  saveSystemPrompt,
  activatePromptVersion,
  type PromptVersionRow,
  type PromptTrack,
} from "@/lib/actions/saveSystemPrompt";
import { callEdgeFunction } from "@/lib/api/edgeFunctions";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PromptsClientProps {
  peActivePrompt: string;
  ipActivePrompt: string;
  peHistory: PromptVersionRow[];
  ipHistory: PromptVersionRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Display labels for each track tab. */
const TRACK_LABELS: Record<PromptTrack, string> = {
  traditional_pe: "Traditional PE",
  ip_technology: "IP / Technology",
};

/** Prompt name written to system_prompts.name for each track. */
const PROMPT_NAMES: Record<PromptTrack, string> = {
  traditional_pe: "PE System Prompt",
  ip_technology: "IP/Tech System Prompt",
};

// ---------------------------------------------------------------------------
// Helper: format a date string for display
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-component: VersionHistoryPanel
// ---------------------------------------------------------------------------

interface VersionHistoryPanelProps {
  history: PromptVersionRow[];
  track: PromptTrack;
  onRestore: (row: PromptVersionRow) => void;
  restoring: string | null; // id of row being restored
}

function VersionHistoryPanel({
  history,
  track,
  onRestore,
  restoring,
}: VersionHistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center text-sm text-slate-500">
        No version history yet. Save a change to create the first version.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800">
            <th className="px-4 py-2 text-left font-medium text-slate-400">
              Version
            </th>
            <th className="px-4 py-2 text-left font-medium text-slate-400">
              Saved
            </th>
            <th className="px-4 py-2 text-left font-medium text-slate-400">
              Author
            </th>
            <th className="px-4 py-2 text-left font-medium text-slate-400">
              Status
            </th>
            <th className="px-4 py-2 text-right font-medium text-slate-400">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-slate-700/50 transition-colors last:border-0 ${
                row.is_active ? "bg-indigo-950/30" : "hover:bg-slate-800/50"
              }`}
            >
              {/* Version number */}
              <td className="px-4 py-3">
                <span className="font-mono text-slate-200">
                  v{row.version}
                </span>
              </td>

              {/* Timestamp */}
              <td className="px-4 py-3 text-slate-400">
                {formatDate(row.created_at)}
              </td>

              {/* Author */}
              <td className="px-4 py-3 text-slate-400">
                {row.creator_name ?? (
                  <span className="text-slate-600 italic">System</span>
                )}
              </td>

              {/* Active badge */}
              <td className="px-4 py-3">
                {row.is_active ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    Active
                  </span>
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </td>

              {/* Restore button */}
              <td className="px-4 py-3 text-right">
                {!row.is_active && (
                  <button
                    onClick={() => onRestore(row)}
                    disabled={restoring !== null}
                    className="rounded px-2 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-300 disabled:opacity-40"
                    title={`Restore ${TRACK_LABELS[track as PromptTrack]} to v${row.version}`}
                  >
                    {restoring === row.id ? "Restoring…" : "Restore"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TestPromptPanel
// ---------------------------------------------------------------------------

interface TestPromptPanelProps {
  systemPrompt: string;
  track: PromptTrack;
  onClose: () => void;
}

function TestPromptPanel({ systemPrompt, track, onClose }: TestPromptPanelProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, startRunning] = useTransition();

  const handleRun = useCallback(() => {
    setResult(null);
    setError(null);

    startRunning(async () => {
      try {
        const supabase = createClient();
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) {
          setError("Not authenticated. Please refresh the page and try again.");
          return;
        }

        const response = await callEdgeFunction<{ rawOutput: string; error?: string }>(
          "test-prompt",
          { systemPrompt, text, track },
          token,
        );

        if (response.error) {
          setError(response.error);
        } else {
          // Pretty-print if valid JSON, otherwise show raw text
          try {
            const parsed: unknown = JSON.parse(response.rawOutput);
            setResult(JSON.stringify(parsed, null, 2));
          } catch {
            setResult(response.rawOutput);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
      }
    });
  }, [systemPrompt, text, track]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Test Prompt — {TRACK_LABELS[track]}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Paste a deal text snippet below and run the draft system prompt
              against it. The raw Claude response is shown for inspection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close test panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Two-column layout: input | output */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-400">
              Deal Text Snippet{" "}
              <span className="text-slate-600">(paste email, one-pager excerpt, etc.)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              placeholder="Paste deal text here…"
              className="w-full flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Output */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-400">
              Raw Claude Response
            </label>
            <div className="relative flex-1">
              {running && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/80">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    Waiting for Claude…
                  </div>
                </div>
              )}
              <pre
                className={`h-64 overflow-auto rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed lg:h-full ${
                  error
                    ? "border-red-800 bg-red-950/30 text-red-400"
                    : "border-slate-700 bg-slate-800 text-slate-300"
                }`}
              >
                {error
                  ? `Error: ${error}`
                  : result ?? (
                    <span className="text-slate-600 italic">
                      Output will appear here after you click Run.
                    </span>
                  )}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            Close
          </button>
          <button
            onClick={handleRun}
            disabled={running || !text.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {running ? "Running…" : "Run Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: PromptsClient
// ---------------------------------------------------------------------------

export default function PromptsClient({
  peActivePrompt,
  ipActivePrompt,
  peHistory,
  ipHistory,
}: PromptsClientProps) {
  const router = useRouter();

  // Active track tab
  const [activeTrack, setActiveTrack] = useState<PromptTrack>("traditional_pe");

  // Draft prompt text — starts with the currently active text
  const [peDraft, setPeDraft] = useState(peActivePrompt);
  const [ipDraft, setIpDraft] = useState(ipActivePrompt);

  // Derived per-track state helpers
  const currentDraft = activeTrack === "traditional_pe" ? peDraft : ipDraft;
  const setCurrentDraft = activeTrack === "traditional_pe" ? setPeDraft : setIpDraft;
  const currentHistory =
    activeTrack === "traditional_pe" ? peHistory : ipHistory;
  const activeVersion = currentHistory.find((r) => r.is_active);

  // Save state
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Restore state
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Test prompt panel
  const [testOpen, setTestOpen] = useState(false);

  // Has the draft changed from the active version?
  const isDirty =
    activeTrack === "traditional_pe"
      ? peDraft !== peActivePrompt
      : ipDraft !== ipActivePrompt;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    setSaveError(null);
    setSaveSuccess(null);

    startSave(async () => {
      const name = PROMPT_NAMES[activeTrack];
      const result = await saveSystemPrompt(name, currentDraft, activeTrack);
      if (result.success) {
        setSaveSuccess(`Saved as v${result.newVersion ?? "?"}.`);
        router.refresh();
      } else {
        setSaveError(result.error ?? "Unknown error.");
      }
    });
  }, [activeTrack, currentDraft, router]);

  const handleRestore = useCallback(
    (row: PromptVersionRow) => {
      setSaveError(null);
      setSaveSuccess(null);
      setRestoringId(row.id);

      activatePromptVersion(row.id, activeTrack)
        .then((result) => {
          if (result.success) {
            setSaveSuccess(`Restored to v${row.version}.`);
            router.refresh();
          } else {
            setSaveError(result.error ?? "Unknown error.");
          }
        })
        .catch((err: unknown) => {
          setSaveError(err instanceof Error ? err.message : "Unknown error.");
        })
        .finally(() => setRestoringId(null));
    },
    [activeTrack, router],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      {/* Test prompt modal */}
      {testOpen && (
        <TestPromptPanel
          systemPrompt={currentDraft}
          track={activeTrack}
          onClose={() => setTestOpen(false)}
        />
      )}

      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            System Prompt Editor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Edit the Claude system prompts used by the IST screening engine.
            Each save creates a new version — previous versions can be
            restored from the history panel. Only admins can save changes.
          </p>
        </div>

        {/* Track tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
          {(["traditional_pe", "ip_technology"] as PromptTrack[]).map(
            (track) => (
              <button
                key={track}
                onClick={() => {
                  setActiveTrack(track);
                  setSaveError(null);
                  setSaveSuccess(null);
                }}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTrack === track
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {TRACK_LABELS[track]}
              </button>
            ),
          )}
        </div>

        {/* Active version badge */}
        {activeVersion && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Active: v{activeVersion.version}
            </span>
            <span>
              Saved{" "}
              {formatDate(activeVersion.created_at)}
              {activeVersion.creator_name
                ? ` by ${activeVersion.creator_name}`
                : ""}
            </span>
          </div>
        )}

        {/* Prompt textarea */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">
            {TRACK_LABELS[activeTrack]} — System Prompt
            {isDirty && (
              <span className="ml-2 text-xs font-normal text-amber-400">
                (unsaved changes)
              </span>
            )}
          </label>
          <textarea
            value={currentDraft}
            onChange={(e) => {
              setCurrentDraft(e.target.value);
              setSaveError(null);
              setSaveSuccess(null);
            }}
            rows={24}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm leading-relaxed text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            placeholder="Enter the Claude system prompt here…"
          />
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Test Prompt button */}
          <button
            onClick={() => setTestOpen(true)}
            disabled={!currentDraft.trim()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:border-indigo-500 hover:text-slate-100 disabled:opacity-40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Test Prompt
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Reset to active version */}
          {isDirty && (
            <button
              onClick={() => {
                setCurrentDraft(
                  activeTrack === "traditional_pe"
                    ? peActivePrompt
                    : ipActivePrompt,
                );
                setSaveError(null);
                setSaveSuccess(null);
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Discard Changes
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !currentDraft.trim() || !isDirty}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Saving…
              </>
            ) : (
              "Save New Version"
            )}
          </button>
        </div>

        {/* Save feedback */}
        {saveSuccess && (
          <div className="rounded-lg border border-green-800 bg-green-950/40 px-4 py-3 text-sm text-green-400">
            ✓ {saveSuccess}
          </div>
        )}
        {saveError && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            Error: {saveError}
          </div>
        )}

        {/* Version history */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-300">
            Version History — {TRACK_LABELS[activeTrack]}
          </h2>
          <VersionHistoryPanel
            history={currentHistory}
            track={activeTrack}
            onRestore={handleRestore}
            restoring={restoringId}
          />
        </div>
      </div>
    </div>
  );
}
