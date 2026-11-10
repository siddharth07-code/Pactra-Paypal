import type { Metadata } from "next";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

export const metadata: Metadata = {
  title: "PACTRA | Procurement, with proof",
  description: "Set buying limits, negotiate supplier terms and review recorded evidence before PayPal Sandbox settlement.",
};

export default function HomePage() {
  return <WelcomeHeroScreen />;
}
