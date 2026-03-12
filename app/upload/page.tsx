"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

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

type ProcessingStep = "idle" | "extracting" | "classifying" | "analyzing" | "scoring" | "done";

const PROCESSING_STEPS: { key: ProcessingStep; label: string }[] = [
  { key: "extracting", label: "Extracting" },
  { key: "classifying", label: "Classifying" },
  { key: "analyzing", label: "Analyzing" },
  { key: "scoring", label: "Scoring" },
];

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

function stepIndex(step: ProcessingStep): number {
  const steps = PROCESSING_STEPS.map((s) => s.key);
  return steps.indexOf(step);
}

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dealText, setDealText] = useState("");
  const [dealSource, setDealSource] = useState("");
  const [dealNameOverride, setDealNameOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function validateFile(f: File): string | null {
    if (!Object.keys(ACCEPTED_TYPES).includes(f.type)) {
      return `Unsupported file type. Please upload a PDF, DOCX, PPTX, PNG, or JPG file.`;
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
  }, []);

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
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset so the same file can be re-selected after removal
      e.target.value = "";
    },
    [handleFiles]
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit()) return;
    setSubmitError(null);

    // Simulate the 4-step processing pipeline
    const steps: ProcessingStep[] = [
      "extracting",
      "classifying",
      "analyzing",
      "scoring",
    ];

    for (const step of steps) {
      setProcessingStep(step);
      // Simulate async work for each step (replace with real API calls)
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    setProcessingStep("done");
  }

  const isProcessing =
    processingStep !== "idle" && processingStep !== "done";
  const isDone = processingStep === "done";

  return (
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
            Upload a document or paste a deal description to begin IST analysis.
          </p>
        </div>

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
              {/* Deal Source */}
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

              {/* Deal Name Override */}
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

              {/* Notes */}
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

          {/* Submit */}
          {submitError && (
            <p className="text-sm text-red-400" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit()}
            className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Screen This Deal
          </button>
        </form>

        {/* Processing Progress */}
        {(isProcessing || isDone) && (
          <ProcessingIndicator currentStep={processingStep} />
        )}
      </div>
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

function ProcessingIndicator({ currentStep }: { currentStep: ProcessingStep }) {
  const activeIndex = stepIndex(currentStep);
  const isDone = currentStep === "done";

  return (
    <div className="mt-8 rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Processing
      </h2>

      <ol className="relative flex flex-col gap-0">
        {PROCESSING_STEPS.map((step, i) => {
          const isActive = !isDone && i === activeIndex;
          const isComplete = isDone || i < activeIndex;

          return (
            <li key={step.key} className="flex items-start gap-4">
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <StepDot active={isActive} complete={isComplete} index={i} />
                {i < PROCESSING_STEPS.length - 1 && (
                  <div
                    className={`mt-1 h-8 w-px ${
                      isComplete ? "bg-indigo-500" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>

              {/* Step label */}
              <div className="pb-8 last:pb-0">
                <p
                  className={`mt-0.5 text-sm font-medium ${
                    isActive
                      ? "text-indigo-400"
                      : isComplete
                        ? "text-slate-300"
                        : "text-slate-600"
                  }`}
                >
                  {step.label}
                  {isActive && (
                    <span className="ml-2 animate-pulse text-indigo-400">
                      …
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}

        {/* Done state */}
        {isDone && (
          <li className="flex items-start gap-4">
            <div className="flex flex-col items-center">
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
            </div>
            <p className="mt-0.5 text-sm font-semibold text-emerald-400">
              Analysis complete
            </p>
          </li>
        )}
      </ol>

      {/* Financial figure placeholder */}
      {isDone && (
        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
          <p className="mb-1 text-xs text-slate-500">Overall IST Score</p>
          <p className="font-mono text-2xl font-bold text-indigo-400">
            —
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Results will appear on the screening detail page.
          </p>
        </div>
      )}
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
