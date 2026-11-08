import { Metadata } from "next";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

export const metadata: Metadata = {
  title: "PACTUM | Procurement, with proof",
  description:
    "Set buying limits, negotiate supplier terms and review recorded evidence before PayPal Sandbox settlement.",
};

export default function WelcomePage() {
  return <WelcomeHeroScreen />;
}
