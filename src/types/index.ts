export * from "./pactum";
export * from "./pactra";

/**
 * System and integration status indicators for PACTRA Phase 0 & 1
 */
export type FeatureStatus = "NOT_IMPLEMENTED" | "PLANNED" | "IN_PROGRESS" | "VERIFIED";

export interface CapabilityCard {
  title: string;
  badge: string;
  description: string;
  status: FeatureStatus;
  accent: "blue" | "emerald" | "amber";
  specs: string[];
}
