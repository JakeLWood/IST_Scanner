"use client";

/**
 * TeamClient — Admin Team Management UI
 *
 * Features:
 * - Table of all team members with columns: Name, Email, Role, Last Active,
 *   Actions (Edit Role, Remove / Reactivate)
 * - Inline role selector per row that calls updateUserRole on change
 * - Remove (soft-delete) / Reactivate button per row
 * - Invite form: email + name + role → sends a Supabase magic-link invitation
 *
 * PRD §6.2.5 — Team management
 * PRD §7.3   — role values: admin | analyst | read_only
 */

import { useState, useTransition, useCallback } from "react";
import {
  updateUserRole,
  removeUser,
  reactivateUser,
  inviteTeamMember,
  type TeamMemberRow,
  type UserRole,
} from "@/lib/actions/teamManagement";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  analyst: "Analyst",
  read_only: "Read-Only",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "text-indigo-400 bg-indigo-900/40 border-indigo-700",
  analyst: "text-sky-400 bg-sky-900/40 border-sky-700",
  read_only: "text-slate-400 bg-slate-800/60 border-slate-600",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLastActive(ts: string | null): string {
  if (!ts) return "Never";
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return email[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RoleBadgeProps {
  role: UserRole;
}

function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

interface MemberRowProps {
  member: TeamMemberRow;
  isSelf: boolean;
  onRoleChange: (memberId: string, role: UserRole) => void;
  onRemove: (memberId: string) => void;
  onReactivate: (memberId: string) => void;
  isPending: boolean;
}

function MemberRow({
  member,
  isSelf,
  onRoleChange,
  onRemove,
  onReactivate,
  isPending,
}: MemberRowProps) {
  const [editingRole, setEditingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(member.role);

  const handleRoleSubmit = () => {
    if (selectedRole !== member.role) {
      onRoleChange(member.id, selectedRole);
    }
    setEditingRole(false);
  };

  const handleRoleCancel = () => {
    setSelectedRole(member.role);
    setEditingRole(false);
  };

  return (
    <tr
      className={`border-b border-slate-800 transition-colors hover:bg-slate-800/40 ${!member.is_active ? "opacity-50" : ""}`}
    >
      {/* Name / Avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-900 text-xs font-semibold text-indigo-300">
            {getInitials(member.name, member.email)}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">
              {member.name ?? <span className="italic text-slate-500">No name</span>}
              {isSelf && (
                <span className="ml-2 text-xs text-indigo-400">(You)</span>
              )}
            </p>
            {!member.is_active && (
              <span className="text-xs text-amber-500">Deactivated</span>
            )}
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-slate-300">{member.email}</span>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        {editingRole ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              disabled={isPending}
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="read_only">Read-Only</option>
            </select>
            <button
              onClick={handleRoleSubmit}
              disabled={isPending}
              className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleRoleCancel}
              disabled={isPending}
              className="rounded border border-slate-600 px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </td>

      {/* Last Active */}
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-slate-400">
          {formatLastActive(member.last_login_at)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!editingRole && (
            <button
              onClick={() => setEditingRole(true)}
              disabled={isPending || isSelf}
              title={isSelf ? "You cannot change your own role" : "Edit role"}
              className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Edit Role
            </button>
          )}
          {member.is_active ? (
            <button
              onClick={() => onRemove(member.id)}
              disabled={isPending || isSelf}
              title={isSelf ? "You cannot remove your own account" : "Deactivate user"}
              className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:border-red-700 hover:bg-red-900/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove
            </button>
          ) : (
            <button
              onClick={() => onReactivate(member.id)}
              disabled={isPending}
              className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:border-green-700 hover:bg-green-900/20 hover:text-green-300 disabled:opacity-40"
            >
              Reactivate
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Invite Form
// ---------------------------------------------------------------------------

interface InviteFormProps {
  onInvited: () => void;
}

function InviteForm({ onInvited }: InviteFormProps) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("analyst");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    startTransition(async () => {
      const result = await inviteTeamMember(email.trim(), role, name.trim() || undefined);
      if (result.success) {
        setStatus({ type: "success", message: `Invitation sent to ${email.trim()}.` });
        setEmail("");
        setName("");
        setRole("analyst");
        onInvited();
      } else {
        setStatus({ type: "error", message: result.error ?? "Failed to send invitation." });
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-100">
        Invite Team Member
      </h2>
      <p className="mb-5 text-sm text-slate-400">
        Send a magic-link invitation email. The invitee will be asked to set a
        password on their first sign-in.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Email */}
          <div>
            <label
              htmlFor="invite-email"
              className="mb-1.5 block text-xs font-medium text-slate-400"
            >
              Email address <span className="text-red-400">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="analyst@example.com"
              disabled={isPending}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>

          {/* Name */}
          <div>
            <label
              htmlFor="invite-name"
              className="mb-1.5 block text-xs font-medium text-slate-400"
            >
              Full name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              disabled={isPending}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>

          {/* Role */}
          <div>
            <label
              htmlFor="invite-role"
              className="mb-1.5 block text-xs font-medium text-slate-400"
            >
              Role <span className="text-red-400">*</span>
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={isPending}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="admin">Admin — full access + team management</option>
              <option value="analyst">Analyst — create and view screenings</option>
              <option value="read_only">Read-Only — view screenings only</option>
            </select>
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              status.type === "success"
                ? "border-green-700 bg-green-900/20 text-green-300"
                : "border-red-700 bg-red-900/20 text-red-300"
            }`}
          >
            {status.message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !email.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TeamClientProps {
  initialMembers: TeamMemberRow[];
  currentUserId: string;
}

export default function TeamClient({
  initialMembers,
  currentUserId,
}: TeamClientProps) {
  const [members, setMembers] = useState<TeamMemberRow[]>(initialMembers);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  const handleRoleChange = useCallback(
    (memberId: string, role: UserRole) => {
      startTransition(async () => {
        const result = await updateUserRole(memberId, role);
        if (result.success && result.member) {
          setMembers((prev) =>
            prev.map((m) => (m.id === memberId ? result.member! : m)),
          );
          showToast("success", `Role updated to ${ROLE_LABELS[role]}.`);
        } else {
          showToast("error", result.error ?? "Failed to update role.");
        }
      });
    },
    [showToast],
  );

  const handleRemove = useCallback(
    (memberId: string) => {
      startTransition(async () => {
        const result = await removeUser(memberId);
        if (result.success && result.member) {
          setMembers((prev) =>
            prev.map((m) => (m.id === memberId ? result.member! : m)),
          );
          showToast("success", "User deactivated.");
        } else {
          showToast("error", result.error ?? "Failed to remove user.");
        }
      });
    },
    [showToast],
  );

  // Reactivate = set is_active back to true
  const handleReactivate = useCallback(
    (memberId: string) => {
      startTransition(async () => {
        const result = await reactivateUser(memberId);
        if (result.success && result.member) {
          setMembers((prev) =>
            prev.map((m) => (m.id === memberId ? result.member! : m)),
          );
          showToast("success", "User reactivated.");
        } else {
          showToast("error", result.error ?? "Failed to reactivate user.");
        }
      });
    },
    [showToast],
  );

  const activeCount = members.filter((m) => m.is_active).length;
  const totalCount = members.length;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              Team Management
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage team members, assign roles, and send invitations.{" "}
              <span className="font-mono text-slate-500">
                {activeCount} active · {totalCount} total
              </span>
            </p>
          </div>
          <a
            href="/admin/settings"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
          >
            ← Settings
          </a>
        </div>

        {/* Toast notification */}
        {toast && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-green-700 bg-green-900/20 text-green-300"
                : "border-red-700 bg-red-900/20 text-red-300"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Team Members Table */}
        <div className="rounded-xl border border-slate-700 bg-slate-900">
          <div className="border-b border-slate-700 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-100">
              Team Members
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Role definitions map to RLS policies: Admin can manage all data;
              Analyst can create screenings; Read-Only can view only.
            </p>
          </div>

          {members.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No team members found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Email
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Role
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Last Active
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isSelf={member.id === currentUserId}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemove}
                      onReactivate={handleReactivate}
                      isPending={isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Invite Form */}
        <InviteForm onInvited={() => {}} />

        {/* Role Reference */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-100">
            Role Reference
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["admin", "analyst", "read_only"] as UserRole[]).map((r) => (
              <div
                key={r}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
              >
                <RoleBadge role={r} />
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {r === "admin" && (
                    <>
                      <li>• Full read/write access to all data</li>
                      <li>• Manage team members and roles</li>
                      <li>• Edit scoring config and system prompts</li>
                      <li>• Delete any screening</li>
                    </>
                  )}
                  {r === "analyst" && (
                    <>
                      <li>• Create and submit new screenings</li>
                      <li>• View all screenings (team-wide)</li>
                      <li>• Edit and delete own screenings</li>
                      <li>• No access to admin settings</li>
                    </>
                  )}
                  {r === "read_only" && (
                    <>
                      <li>• View all screenings (team-wide)</li>
                      <li>• No ability to create or modify data</li>
                      <li>• No access to admin settings</li>
                    </>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
