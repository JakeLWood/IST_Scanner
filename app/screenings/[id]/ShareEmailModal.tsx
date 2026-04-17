"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { shareViaEmail } from "@/lib/actions/shareViaEmail";
import type { ISTAnalysis } from "@/types/ist-analysis";
import type { ScoringResult } from "@/lib/scoringEngine";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ShareEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  screeningId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShareEmailModal({
  isOpen,
  onClose,
  analysis,
  scoringResult,
  screeningId,
}: ShareEmailModalProps) {
  const [emailInput, setEmailInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the email input when the modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const addRecipient = useCallback(() => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(trimmed)) {
      setErrorMsg(`"${trimmed}" is not a valid email address.`);
      return;
    }
    if (recipients.includes(trimmed)) {
      setEmailInput("");
      return;
    }
    if (recipients.length >= 10) {
      setErrorMsg("Maximum 10 recipients allowed.");
      return;
    }
    setErrorMsg(null);
    setRecipients((prev) => [...prev, trimmed]);
    setEmailInput("");
  }, [emailInput, recipients]);

  const removeRecipient = useCallback((addr: string) => {
    setRecipients((prev) => prev.filter((r) => r !== addr));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addRecipient();
      }
    },
    [addRecipient],
  );

  const handleSend = useCallback(async () => {
    // Attempt to add the current input as a recipient before sending
    const pendingEmail = emailInput.trim().toLowerCase();
    let finalRecipients = recipients;
    if (pendingEmail) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(pendingEmail)) {
        setErrorMsg(`"${pendingEmail}" is not a valid email address.`);
        return;
      }
      if (!recipients.includes(pendingEmail)) {
        finalRecipients = [...recipients, pendingEmail];
        setRecipients(finalRecipients);
        setEmailInput("");
      }
    }

    if (finalRecipients.length === 0) {
      setErrorMsg("Please add at least one recipient.");
      return;
    }

    setStatus("sending");
    setErrorMsg(null);

    const result = await shareViaEmail({
      recipients: finalRecipients,
      note: note.trim() || undefined,
      analysis,
      scoringResult,
      screeningId,
    });

    if (result.success) {
      setStatus("success");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "An unexpected error occurred.");
    }
  }, [emailInput, recipients, note, analysis, scoringResult, screeningId]);

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <h2 id="share-modal-title" className="font-semibold text-slate-100 text-base">
            Share via Email
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {status === "success" ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-slate-100">Email sent successfully!</p>
            <p className="text-slate-400 text-sm">
              Sent to {recipients.join(", ")}
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Screening preview */}
            <div className="rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">{analysis.companyName}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Composite score:{" "}
                  <span className="font-mono font-bold text-slate-200">{scoringResult.compositeScore.toFixed(1)}/10</span>
                  {" · "}
                  <span
                    className={
                      scoringResult.recommendation === "PROCEED"
                        ? "text-emerald-400"
                        : scoringResult.recommendation === "FURTHER_REVIEW"
                          ? "text-amber-400"
                          : "text-red-400"
                    }
                  >
                    {scoringResult.recommendation === "PROCEED"
                      ? "Proceed"
                      : scoringResult.recommendation === "FURTHER_REVIEW"
                        ? "Further Review"
                        : "Pass"}
                  </span>
                </p>
              </div>
              <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            {/* Recipients input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Recipients <span className="text-slate-500 normal-case">(press Enter or comma to add)</span>
              </label>

              {/* Chips + input */}
              <div
                className="flex flex-wrap gap-1.5 min-h-[42px] rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-colors cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {recipients.map((addr) => (
                  <span
                    key={addr}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-mono"
                  >
                    {addr}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeRecipient(addr); }}
                      className="ml-0.5 text-indigo-400 hover:text-indigo-200 transition-colors"
                      aria-label={`Remove ${addr}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setErrorMsg(null); }}
                  onKeyDown={handleKeyDown}
                  onBlur={addRecipient}
                  placeholder={recipients.length === 0 ? "analyst@example.com" : ""}
                  className="flex-1 min-w-[140px] bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Note <span className="text-slate-500 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Add a note for the recipients…"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none resize-none transition-colors"
              />
            </div>

            {/* Error */}
            {errorMsg && (
              <p className="text-red-400 text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        {status !== "success" && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700/60">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              disabled={status === "sending"}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={status === "sending"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Email
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
