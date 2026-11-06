"use client";
import { useEffect, useState } from "react";
import { roles, canGrant, type Role } from "@/lib/organizations/permissions";
interface Member { id: string; userId: string; role: Role; status: string; version: number }
export function OrganizationMembers() {
  const [members, setMembers] = useState<Member[]>([]), [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState(""), [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [message, setMessage] = useState(""), [token, setToken] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(async data => {
      if (!data.active?.permissions.includes("membership.manage")) return;
      setRole(data.active.role);
      const response = await fetch("/api/organizations/memberships", { cache: "no-store", signal: controller.signal });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Memberships unavailable.");
      setMembers(body.memberships);
    }).catch(() => { if (!controller.signal.aborted) setMessage("Membership management is unavailable."); });
    return () => controller.abort();
  }, [revision]);
  async function mutate(path: string, body: unknown) {
    setMessage(""); setToken("");
    try {
      const response = await fetch(`/api/organizations/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? "Membership update failed.");
      if (data.invitationToken) setToken(data.invitationToken);
      setRevision(v => v + 1); setMessage("Local organization record updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Membership update failed."); }
  }
  if (!role) return null;
  return <section className="space-y-3 border-t border-smoke pt-4">
    <h2 className="text-xl">Organization members</h2>
    {members.map(member => <div key={member.id} className="flex flex-wrap gap-2 text-sm">
      <span>{member.userId} · {member.status}</span>
      {canGrant(role, member.role) ? <>
        <select aria-label={`Role for ${member.userId}`} value={member.role} onChange={event => void mutate("memberships", { membershipId: member.id, version: member.version, role: event.target.value })}>
          {roles.filter(r => canGrant(role, r)).map(r => <option key={r}>{r}</option>)}
        </select>
        {member.status === "ACTIVE" && <button onClick={() => void mutate("memberships", { action: "revoke", membershipId: member.id, version: member.version })}>Revoke</button>}
      </> : <span>{member.role}</span>}
    </div>)}
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void mutate("invitations", { email, role: inviteRole }); }}>
      <input type="email" aria-label="Invite email" required value={email} onChange={e => setEmail(e.target.value)} />
      <select aria-label="Invitation role" value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}>{roles.filter(r => canGrant(role, r)).map(r => <option key={r}>{r}</option>)}</select>
      <button>Create invitation</button>
    </form>
    {token && <p className="break-all">Deliver this one-time invitation token securely. No email was sent: {token}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
