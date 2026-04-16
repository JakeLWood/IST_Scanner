"use client";

import Link from "next/link";
import { Component, useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { extractTextWithMetadata } from "@/lib/extractTextFromFile";
import { saveScreening } from "@/lib/actions/saveScreening";
import { useAuthContext } from "@/app/providers/auth-provider";
import { callEdgeFunction } from "@/lib/api/edgeFunctions";
import type { DealTypeClassificationResult } from "@/lib/prompts/classify-deal-type";
import type { ISTAnalysis } from "@/types/ist-analysis";

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "image/png": "PNG",
  "image/jpeg": "JPG",
};

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type DealType = "traditional_pe" | "ip_technology";

type ProcessingStep =
  | "idle"
  | "extracting"
  | "classifying"
  | "confirming"
  | "analyzing"
  | "saving"
  | "done";

const PROGRESS_STEPS: { key: ProcessingStep; label: string }[] = [
  { key: "extracting", label: "Extracting text" },
  { key: "classifying", label: "Classifying deal type" },
  { key: "analyzing", label: "Running IST analysis" },
  { key: "saving", label: "Saving results" },
];

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  traditional_pe: "Traditional PE",
  ip_technology: "IP / Technology Commercialisation",
};

const DEAL_SOURCES = [
  "Proprietary / Sourced Direct",
  "Investment Bank / Advisor",
  "Broker Network",
  "Family Office Referral",
  "Management Referral",
  "Co-Investor Referral",
  "Trade Association",
  "Other",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const router = useRouter();
  const { session } = useAuthContext();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dealText, setDealText] = useState("");
  const [dealSource, setDealSource] = useState("");
  const [dealNameOverride, setDealNameOverride] = useState("");
  const [notes, setNotes] = useState("");

  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [classification, setClassification] =
    useState<DealTypeClassificationResult | null>(null);
  const [confirmedDealType, setConfirmedDealType] = useState<DealType | null>(
    null,
  );

  // Persist extracted text between the classify and analyse phases
  const extractedTextRef = useRef<string>("");
  // Track whether OCR was used during extraction (forwarded to edge function)
  const isOCRDerivedRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File validation ──────────────────────────────────────────────────────

  function validateFile(f: File): string | null {
    if (!Object.keys(ACCEPTED_TYPES).includes(f.type)) {
      return "Unsupported file type. Please upload a PDF, DOCX, PPTX, PNG, or JPG file.";
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File exceeds the ${MAX_FILE_SIZE_MB} MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB).`;
    }
    return null;
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    const error = validateFile(f);
    if (error) {
      setFileError(error);
      setFile(null);
    } else {
      setFileError(null);
      setFile(f);
    }
  }, []); // validateFile is stable (no external deps)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      e.target.value = "";
    },
    [handleFiles],
  );

  function removeFile() {
    setFile(null);
    setFileError(null);
  }

  function canSubmit() {
    return (
      (file !== null || dealText.trim().length > 0) &&
      processingStep === "idle"
    );
  }

  // ── Step 1 + 2: Extract then classify ───────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit()) return;
    setSubmitError(null);

    if (!session?.access_token) {
      setSubmitError(
        "You must be signed in to screen a deal. Please log in and try again.",
      );
      return;
    }

    try {
      // Step 1 — Extract text
      setProcessingStep("extracting");
      let rawText: string;
      if (file) {
        const extraction = await extractTextWithMetadata(file);
        isOCRDerivedRef.current = extraction.usedOCR;
        rawText = [extraction.text, dealText.trim()].filter(Boolean).join("\n\n");
      } else {
        isOCRDerivedRef.current = false;
        rawText = dealText.trim();
      }
      extractedTextRef.current = rawText;

      // Step 2 — Classify deal type
      setProcessingStep("classifying");
      const result = await callEdgeFunction<DealTypeClassificationResult>(
        "classify-deal",
        { extractedText: rawText },
        session.access_token,
      );

      setClassification(result);
      setConfirmedDealType(result.deal_type);
      setProcessingStep("confirming");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
      setProcessingStep("idle");
    }
  }

  // ── Step 3: Confirm deal type, then analyse + save ───────────────────────

  async function handleConfirm() {
    if (!confirmedDealType || !session?.access_token) return;
    setSubmitError(null);

    try {
      // Step 4 — Analyse
      setProcessingStep("analyzing");
      const analysis = await callEdgeFunction<ISTAnalysis>(
        "analyze-deal",
        {
          extractedText: extractedTextRef.current,
          dealType: confirmedDealType,
          isOCRDerived: isOCRDerivedRef.current,
        },
        session.access_token,
      );

      // Step 5 — Save
      setProcessingStep("saving");
      const screeningId = await saveScreening(
        analysis,
        extractedTextRef.current,
        session.user.id,
        {
          dealSource: dealSource || null,
          dealNameOverride: dealNameOverride || null,
          notes: notes || null,
        },
      );

      setProcessingStep("done");
      router.push(`/screenings/${screeningId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
      setProcessingStep("idle");
      setClassification(null);
      setConfirmedDealType(null);
    }
  }

  // ── Derived flags ────────────────────────────────────────────────────────

  const isIdle = processingStep === "idle";
  const isConfirming = processingStep === "confirming";
  const isProcessing =
    processingStep !== "idle" &&
    processingStep !== "confirming" &&
    processingStep !== "done";
  const isDone = processingStep === "done";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Back
            </Link>
            <h1 className="text-3xl font-bold text-slate-50">Screen a Deal</h1>
            <p className="mt-1 text-slate-400">
              Upload a document or paste a deal description to begin IST
              analysis.
            </p>
          </div>

          {/* Error banner */}
          {submitError && (
            <div
              className="mb-6 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3"
              role="alert"
            >
              <p className="text-sm font-medium text-red-400">{submitError}</p>
            </div>
          )}

          {/* Deal Type Confirmation */}
          {isConfirming && classification && confirmedDealType && (
            <DealTypeConfirmation
              classification={classification}
              confirmedDealType={confirmedDealType}
              onChangeDealType={setConfirmedDealType}
              onConfirm={handleConfirm}
              onCancel={() => {
                setProcessingStep("idle");
                setClassification(null);
                setConfirmedDealType(null);
              }}
            />
          )}

          {/* Processing progress */}
          {(isProcessing || isDone) && (
            <ProcessingIndicator currentStep={processingStep} />
          )}

          {/* Upload Form — only shown when idle */}
          {isIdle && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Drop Zone */}
              <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Document Upload
                </h2>

                {file ? (
                  <div className="flex items-center justify-between rounded-lg border border-indigo-500/40 bg-indigo-950/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileIcon type={file.type} />
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {file.name}
                        </p>
                        <p className="font-mono text-xs text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                          {ACCEPTED_TYPES[file.type]}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="ml-4 rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
                      aria-label="Remove file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      dragActive
                        ? "border-indigo-400 bg-indigo-950/30"
                        : "border-slate-600 hover:border-indigo-500 hover:bg-slate-800/50"
                    }`}
                  >
                    <UploadIcon active={dragActive} />
                    <p className="mt-3 text-sm font-medium text-slate-300">
                      {dragActive
                        ? "Drop your file here"
                        : "Drag & drop a file, or click to browse"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PDF, DOCX, PPTX, PNG, JPG · Max {MAX_FILE_SIZE_MB} MB
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  onChange={handleInputChange}
                  className="hidden"
                  aria-hidden="true"
                />

                {fileError && (
                  <p className="mt-2 text-sm text-red-400" role="alert">
                    {fileError}
                  </p>
                )}
              </section>

              {/* Text Input */}
              <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Deal Description
                </h2>
                <label htmlFor="deal-text" className="sr-only">
                  Paste deal description
                </label>
                <textarea
                  id="deal-text"
                  value={dealText}
                  onChange={(e) => setDealText(e.target.value)}
                  rows={7}
                  placeholder="Paste a deal memo, CIM summary, or any descriptive text about the deal…"
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  You may provide a document, a description, or both.
                </p>
              </section>

              {/* Metadata */}
              <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Metadata{" "}
                  <span className="ml-1 normal-case tracking-normal text-slate-600">
                    (optional)
                  </span>
                </h2>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="deal-source"
                      className="text-sm font-medium text-slate-300"
                    >
                      Deal Source
                    </label>
                    <select
                      id="deal-source"
                      value={dealSource}
                      onChange={(e) => setDealSource(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select source…</option>
                      {DEAL_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="deal-name"
                      className="text-sm font-medium text-slate-300"
                    >
                      Deal Name Override
                    </label>
                    <input
                      id="deal-name"
                      type="text"
                      value={dealNameOverride}
                      onChange={(e) => setDealNameOverride(e.target.value)}
                      placeholder="e.g. Acme Corp Platform Add-on"
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label
                      htmlFor="notes"
                      className="text-sm font-medium text-slate-300"
                    >
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Any additional context for this screening…"
                      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </section>

              <button
                type="submit"
                disabled={!canSubmit()}
                className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Screen This Deal
              </button>
            </form>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ─── DealTypeConfirmation ─────────────────────────────────────────────────────

interface DealTypeConfirmationProps {
  classification: DealTypeClassificationResult;
  confirmedDealType: DealType;
  onChangeDealType: (dt: DealType) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function DealTypeConfirmation({
  classification,
  confirmedDealType,
  onChangeDealType,
  onConfirm,
  onCancel,
}: DealTypeConfirmationProps) {
  const confidencePct = Math.round(classification.confidence * 100);
  const confidenceColor =
    classification.confidence >= 0.9
      ? "text-emerald-400"
      : classification.confidence >= 0.7
        ? "text-amber-400"
        : "text-orange-400";

  return (
    <div
      className="mb-6 rounded-xl border border-indigo-500/40 bg-slate-900 p-6"
      role="region"
      aria-label="Deal type confirmation"
    >
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Confirm Deal Type
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Claude classified this document. Review and override if needed, then
        confirm to proceed with the full IST analysis.
      </p>

      <p className="mb-4 text-sm text-slate-300">
        Confidence:{" "}
        <span className={`font-mono font-semibold ${confidenceColor}`}>
          {confidencePct}%
        </span>
      </p>

      <blockquote className="mb-6 border-l-2 border-slate-600 pl-4 text-sm italic text-slate-400">
        {classification.reasoning}
      </blockquote>

      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-medium text-slate-300">
          Deal Type
        </legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(["traditional_pe", "ip_technology"] as DealType[]).map((dt) => (
            <label
              key={dt}
              className={`flex flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                confirmedDealType === dt
                  ? "border-indigo-500 bg-indigo-950/40 text-slate-100"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
              }`}
            >
              <input
                type="radio"
                name="deal-type-confirm"
                value={dt}
                checked={confirmedDealType === dt}
                onChange={() => onChangeDealType(dt)}
                className="sr-only"
              />
              <span
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                  confirmedDealType === dt
                    ? "border-indigo-400 bg-indigo-400"
                    : "border-slate-500 bg-transparent"
                }`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">
                {DEAL_TYPE_LABELS[dt]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          Confirm &amp; Analyse
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ProcessingIndicator ──────────────────────────────────────────────────────

function ProcessingIndicator({ currentStep }: { currentStep: ProcessingStep }) {
  const activeIndex = PROGRESS_STEPS.findIndex((s) => s.key === currentStep);
  const isDone = currentStep === "done";

  return (
    <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Processing
      </h2>

      <ol className="flex flex-col gap-4">
        {PROGRESS_STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isComplete = activeIndex > index || isDone;

          return (
            <li key={step.key} className="flex items-center gap-4">
              <StepDot active={isActive} complete={isComplete} index={index} />
              <p
                className={`text-sm font-medium ${
                  isComplete
                    ? "text-indigo-300"
                    : isActive
                      ? "text-slate-200"
                      : "text-slate-600"
                }`}
              >
                {step.label}
                {isActive && (
                  <span className="ml-2 animate-pulse text-indigo-400">
                    &hellip;
                  </span>
                )}
              </p>
            </li>
          );
        })}

        {isDone && (
          <li className="flex items-center gap-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5 text-white"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-400">
              Redirecting to results&hellip;
            </p>
          </li>
        )}
      </ol>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function UploadIcon({ active }: { active: boolean }) {
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
        active ? "bg-indigo-600" : "bg-slate-800"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-7 w-7 ${active ? "text-white" : "text-slate-400"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const label = ACCEPTED_TYPES[type] ?? "FILE";
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
      <span className="font-mono text-xs font-bold text-white">{label}</span>
    </div>
  );
}

function StepDot({
  active,
  complete,
  index,
}: {
  active: boolean;
  complete: boolean;
  index: number;
}) {
  if (complete) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5 text-white"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }

  if (active) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-400 bg-indigo-950">
        <span className="h-2 w-2 animate-ping rounded-full bg-indigo-400" />
      </div>
    );
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-800">
      <span className="font-mono text-xs text-slate-500">{index + 1}</span>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message ?? "An unexpected error occurred.",
    };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("UploadPage error boundary caught:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 px-4 py-10">
          <div className="mx-auto max-w-3xl">
            <div
              className="rounded-xl border border-red-500/40 bg-red-950/30 p-6"
              role="alert"
            >
              <h2 className="mb-2 text-lg font-semibold text-red-400">
                Something went wrong
              </h2>
              <p className="mb-4 text-sm text-slate-400">
                {this.state.errorMessage}
              </p>
              <button
                type="button"
                onClick={() =>
                  this.setState({ hasError: false, errorMessage: "" })
                }
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
