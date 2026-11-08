"use client";
import { useEffect, useState } from "react";
import { roles, canGrant, type Role } from "@/lib/organizations/permissions";
import { Users, UserPlus } from "lucide-react";

interface Member {
  id: string;
  userId: string;
  role: Role;
  status: string;
  version: number;
}

export function OrganizationMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.active?.permissions.includes("membership.manage")) return;
        setRole(data.active.role);
        const response = await fetch("/api/organizations/memberships", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "Memberships unavailable.");
        setMembers(body.memberships);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Membership management is unavailable.");
      });
    return () => controller.abort();
  }, [revision]);

  async function mutate(path: string, body: unknown) {
    setMessage("");
    setToken("");
    try {
      const response = await fetch(`/api/organizations/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "Membership update failed.");
      if (data.invitationToken) setToken(data.invitationToken);
      setRevision((v) => v + 1);
      setMessage("Local organization record updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Membership update failed."
      );
    }
  }

  if (!role) return null;

  return (
    <section className="space-y-4 border-t border-border-primary pt-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-text-secondary" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-tight text-text-primary">
          Organization Members &amp; Roles
        </h2>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[6px] border border-border-primary bg-surface-secondary text-xs"
          >
            <div className="min-w-0">
              <span className="font-mono text-text-primary block truncate max-w-[240px]">
                {member.userId}
              </span>
              <span className="text-[11px] text-text-secondary uppercase">
                {member.status}
              </span>
            </div>

            {canGrant(role, member.role) ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Role for ${member.userId}`}
                  value={member.role}
                  onChange={(event) =>
                    void mutate("memberships", {
                      membershipId: member.id,
                      version: member.version,
                      role: event.target.value,
                    })
                  }
                  className="px-2 py-1 rounded-[6px] border border-border-primary bg-surface-primary text-text-primary text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                >
                  {roles
                    .filter((r) => canGrant(role, r))
                    .map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                </select>
                {member.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() =>
                      void mutate("memberships", {
                        action: "revoke",
                        membershipId: member.id,
                        version: member.version,
                      })
                    }
                    className="px-2.5 py-1 rounded-[6px] border border-border-primary text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ) : (
              <span className="px-2 py-1 rounded-[6px] bg-surface-primary border border-border-primary font-mono text-[11px] text-text-secondary">
                {member.role}
              </span>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("invitations", { email, role: inviteRole });
        }}
      >
        <input
          type="email"
          aria-label="Invite email"
          required
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-[6px] border border-border-primary bg-surface-secondary text-text-primary text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
        />
        <select
          aria-label="Invitation role"
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as Role)}
          className="px-2.5 py-1.5 rounded-[6px] border border-border-primary bg-surface-secondary text-text-primary text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
        >
          {roles
            .filter((r) => canGrant(role, r))
            .map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-ember-orange hover:bg-[#a3351f] text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Invite</span>
        </button>
      </form>

      {token && (
        <div className="p-3 rounded-[6px] border border-border-primary bg-surface-secondary text-xs break-all text-text-primary">
          <span className="font-semibold block mb-1">One-Time Invitation Token:</span>
          <span className="font-mono text-ember-orange">{token}</span>
        </div>
      )}

      {message && (
        <p role="status" className="text-xs text-text-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
