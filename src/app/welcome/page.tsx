import { Metadata } from "next";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

export const metadata: Metadata = {
  title: "PACTUM — Engineered For Certainty | Autonomous B2B Procurement",
  description:
    "Autonomous B2B procurement meets deterministic payment verification. Multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement.",
};

export default function WelcomePage() {
  return <WelcomeHeroScreen />;
}
