"use client";

/**
 * DisqualifiersClient
 *
 * Admin UI for managing hard disqualifier rules (PRD §3.6).
 *
 * Features:
 * - Table of all disqualifiers with Name, Description, Rule, and Active toggle
 * - Inline editing of any row
 * - "New Disqualifier" form with field selector, operator, value, and active toggle
 * - Delete with confirmation
 */

import { useState, useCallback, useTransition } from "react";
import {
  createDisqualifier,
  updateDisqualifier,
  toggleDisqualifier,
  deleteDisqualifier,
  type DisqualifierRow,
  type DisqualifierInput,
} from "@/lib/actions/saveDisqualifier";

// ---------------------------------------------------------------------------
// Snapshot field options (PRD §4.2.1 — ISTSnapshot fields)
// ---------------------------------------------------------------------------

export interface SnapshotFieldOption {
  value: string;
  label: string;
  hint: string;
}

export const SNAPSHOT_FIELDS: SnapshotFieldOption[] = [
  { value: "revenue", label: "Revenue", hint: "Annual revenue in USD" },
  { value: "ebitda", label: "EBITDA", hint: "Annual EBITDA in USD" },
  { value: "ebitda_margin", label: "EBITDA Margin", hint: "EBITDA as a percentage (0–100)" },
  { value: "ev_ebitda_multiple", label: "EV/EBITDA Multiple", hint: "Asking price / EBITDA" },
  { value: "asking_price", label: "Asking Price", hint: "Asking price / valuation in USD" },
  { value: "revenue_growth_rate", label: "Revenue Growth Rate", hint: "YoY or CAGR as a percentage" },
  { value: "customer_concentration_pct", label: "Customer Concentration %", hint: "Top customer as % of revenue" },
  { value: "employee_count", label: "Employee Count", hint: "Number of employees" },
  { value: "year_founded", label: "Year Founded", hint: "Year the company was founded" },
  { value: "location", label: "Location (HQ)", hint: "City, State or country text" },
  { value: "industry", label: "Industry / Sector", hint: "Text describing the industry" },
  { value: "transaction_type", label: "Transaction Type", hint: "Acquisition / Divestiture / etc." },
  { value: "deal_source", label: "Deal Source", hint: "Broker, referral, or proprietary" },
];

// ---------------------------------------------------------------------------
// Operator options
// ---------------------------------------------------------------------------

interface OperatorOption {
  value: string;
  label: string;
  hint: string;
}

const OPERATORS: OperatorOption[] = [
  { value: "lt", label: "< less than", hint: "Numeric: field < value" },
  { value: "lte", label: "≤ less than or equal", hint: "Numeric: field ≤ value" },
  { value: "gt", label: "> greater than", hint: "Numeric: field > value" },
  { value: "gte", label: "≥ greater than or equal", hint: "Numeric: field ≥ value" },
  { value: "eq", label: "= equals", hint: "Numeric or text: exact match" },
  { value: "neq", label: "≠ not equals", hint: "Numeric or text: not an exact match" },
  { value: "contains", label: "contains", hint: "Text: field contains value (case-insensitive)" },
  { value: "not_contains", label: "does not contain", hint: "Text: field does not contain value" },
  { value: "contains_any", label: "contains any of", hint: "Text: field contains any comma-separated term" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRule(field: string, operator: string, value: string): string {
  const fieldLabel = SNAPSHOT_FIELDS.find((f) => f.value === field)?.label ?? field;
  const opLabel = OPERATORS.find((o) => o.value === operator)?.label ?? operator;
  return `${fieldLabel} ${opLabel} ${value}`;
}

function emptyInput(): DisqualifierInput {
  return {
    name: "",
    description: "",
    field: SNAPSHOT_FIELDS[0].value,
    operator: OPERATORS[0].value,
    value: "",
    is_active: true,
  };
}

// ---------------------------------------------------------------------------
// DisqualifierForm — shared form used for both create and edit
// ---------------------------------------------------------------------------

interface DisqualifierFormProps {
  initial: DisqualifierInput;
  onSubmit: (input: DisqualifierInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
}

function DisqualifierForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
  error,
}: DisqualifierFormProps) {
  const [form, setForm] = useState<DisqualifierInput>(initial);

  const set = <K extends keyof DisqualifierInput>(key: K, val: DisqualifierInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g., Revenue Below $2M"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">
          Description
        </label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Brief explanation of why this is a disqualifier"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
        />
      </div>

      {/* Rule: field + operator + value */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">
          Rule <span className="text-red-400">*</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          {/* Field selector */}
          <div>
            <label className="mb-0.5 block text-xs text-slate-500">Field</label>
            <select
              value={form.field}
              onChange={(e) => set("field", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {SNAPSHOT_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Operator */}
          <div>
            <label className="mb-0.5 block text-xs text-slate-500">Operator</label>
            <select
              value={form.operator}
              onChange={(e) => set("operator", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div>
            <label className="mb-0.5 block text-xs text-slate-500">Value</label>
            <input
              type="text"
              required
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="e.g., 2000000"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {OPERATORS.find((o) => o.value === form.operator)?.hint ?? ""}
          {form.operator === "contains_any" && (
            <span className="ml-1">Separate terms with commas.</span>
          )}
        </p>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={form.is_active}
          onClick={() => set("is_active", !form.is_active)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            form.is_active ? "bg-indigo-600" : "bg-slate-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              form.is_active ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-slate-300">
          {form.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DisqualifiersClientProps {
  initial: DisqualifierRow[];
}

export default function DisqualifiersClient({ initial }: DisqualifiersClientProps) {
  const [rows, setRows] = useState<DisqualifierRow[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const handleCreate = useCallback(async (input: DisqualifierInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createDisqualifier(input);
      if (result.success && result.disqualifier) {
        setRows((prev) => [result.disqualifier!, ...prev]);
        setShowNewForm(false);
      } else {
        setFormError(result.error ?? "Failed to create disqualifier.");
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  const handleUpdate = useCallback(async (id: string, input: DisqualifierInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateDisqualifier(id, input);
      if (result.success && result.disqualifier) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? result.disqualifier! : r)),
        );
        setEditingId(null);
      } else {
        setFormError(result.error ?? "Failed to update disqualifier.");
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle active
  // ---------------------------------------------------------------------------

  const handleToggle = useCallback((id: string, current: boolean) => {
    startTransition(async () => {
      const result = await toggleDisqualifier(id, !current);
      if (result.success && result.disqualifier) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? result.disqualifier! : r)),
        );
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deleteDisqualifier(id);
      if (result.success) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setDeleteConfirmId(null);
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">
              Hard Disqualifiers
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Rules that trigger an automatic{" "}
              <span className="font-mono font-semibold text-red-300">PASS</span>{" "}
              regardless of composite score (PRD §3.6). Active rules are
              evaluated on every new screening.
            </p>
          </div>
          {!showNewForm && (
            <button
              onClick={() => {
                setShowNewForm(true);
                setEditingId(null);
                setFormError(null);
              }}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              + New Disqualifier
            </button>
          )}
        </div>

        {/* New disqualifier form */}
        {showNewForm && (
          <div className="rounded-xl border border-indigo-500/30 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">
              New Disqualifier
            </h2>
            <DisqualifierForm
              initial={emptyInput()}
              onSubmit={handleCreate}
              onCancel={() => {
                setShowNewForm(false);
                setFormError(null);
              }}
              submitLabel="Create Disqualifier"
              submitting={isPending && !editingId}
              error={!editingId ? formError : null}
            />
          </div>
        )}

        {/* Disqualifiers table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No disqualifiers configured. Click &quot;+ New Disqualifier&quot; to add one.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="px-5 py-3 font-medium text-slate-400">Name</th>
                  <th className="hidden px-5 py-3 font-medium text-slate-400 md:table-cell">
                    Description
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">Rule</th>
                  <th className="px-5 py-3 text-center font-medium text-slate-400">
                    Active
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-slate-800/40 ${
                        editingId === row.id ? "bg-slate-800/60" : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-medium text-slate-100 align-top">
                        {row.name}
                      </td>
                      <td className="hidden px-5 py-4 text-slate-400 align-top md:table-cell max-w-xs">
                        {row.description ?? (
                          <span className="italic text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <code className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-indigo-300">
                          {formatRule(row.field, row.operator, row.value)}
                        </code>
                      </td>
                      <td className="px-5 py-4 text-center align-top">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.is_active}
                          onClick={() => handleToggle(row.id, row.is_active)}
                          disabled={isPending}
                          title={row.is_active ? "Deactivate" : "Activate"}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${
                            row.is_active ? "bg-indigo-600" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              row.is_active ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="ml-2 text-xs text-slate-500">
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(editingId === row.id ? null : row.id);
                              setFormError(null);
                            }}
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:text-slate-100"
                          >
                            {editingId === row.id ? "Cancel" : "Edit"}
                          </button>
                          {deleteConfirmId === row.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDelete(row.id)}
                                disabled={isPending}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(row.id)}
                              className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:border-red-500 hover:text-red-300"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit form */}
                    {editingId === row.id && (
                      <tr key={`${row.id}-edit`}>
                        <td colSpan={5} className="bg-slate-800/60 px-5 py-5">
                          <DisqualifierForm
                            initial={{
                              name: row.name,
                              description: row.description ?? "",
                              field: row.field,
                              operator: row.operator,
                              value: row.value,
                              is_active: row.is_active,
                            }}
                            onSubmit={(input) => handleUpdate(row.id, input)}
                            onCancel={() => {
                              setEditingId(null);
                              setFormError(null);
                            }}
                            submitLabel="Save Changes"
                            submitting={isPending && editingId === row.id}
                            error={editingId === row.id ? formError : null}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Legend */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Operator Reference
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OPERATORS.map((op) => (
              <div key={op.value} className="flex gap-2">
                <code className="shrink-0 font-mono text-xs text-indigo-300">
                  {op.label}
                </code>
                <span className="text-xs text-slate-500">{op.hint}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <p className="text-xs text-slate-400">
              <strong className="text-slate-300">Field reference:</strong> Values
              correspond to the deal snapshot extracted from uploaded documents.
              Numeric operators apply to{" "}
              <code className="font-mono text-indigo-300">revenue</code>,{" "}
              <code className="font-mono text-indigo-300">ebitda</code>,{" "}
              <code className="font-mono text-indigo-300">ev_ebitda_multiple</code>, etc.
              Text operators apply to{" "}
              <code className="font-mono text-indigo-300">location</code>,{" "}
              <code className="font-mono text-indigo-300">industry</code>, etc.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
