import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | PACTRA",
  description: "Sign in to PACTRA autonomous B2B procurement and settlement.",
};

export default function LoginPage() {
  return <AnimatedAuth initialMode="login" />;
}
