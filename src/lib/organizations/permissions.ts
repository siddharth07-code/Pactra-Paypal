export const roles = ["OWNER", "ADMIN", "PROCUREMENT_MANAGER", "FINANCE_MANAGER", "VIEWER"] as const;
export type Role = typeof roles[number];
export const permissions = {
  "session.read": roles,
  "session.write": ["OWNER", "ADMIN", "PROCUREMENT_MANAGER"],
  "negotiation.start": ["OWNER", "ADMIN", "PROCUREMENT_MANAGER"],
  "audit.run": ["OWNER", "ADMIN", "PROCUREMENT_MANAGER", "FINANCE_MANAGER"],
  "fx.manage": ["OWNER", "FINANCE_MANAGER"],
  "payment.checkout": ["OWNER", "FINANCE_MANAGER"],
  "payment.capture": ["OWNER", "FINANCE_MANAGER"],
  "payment.reconcile": ["OWNER", "FINANCE_MANAGER"],
  "payment.cancel": ["OWNER", "FINANCE_MANAGER"],
  "dispute.open": ["OWNER", "PROCUREMENT_MANAGER", "FINANCE_MANAGER"],
  "dispute.read": ["OWNER", "PROCUREMENT_MANAGER", "FINANCE_MANAGER"],
  "dispute.evaluate": ["OWNER", "FINANCE_MANAGER"],
  "evidence.read": ["OWNER", "FINANCE_MANAGER"],
  "membership.manage": ["OWNER", "ADMIN"],
} satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof permissions;
export function permitted(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly Role[]).includes(role);
}
export function canGrant(actor: Role, target: Role): boolean {
  return actor === "OWNER" || (actor === "ADMIN" && ["PROCUREMENT_MANAGER", "VIEWER"].includes(target));
}
