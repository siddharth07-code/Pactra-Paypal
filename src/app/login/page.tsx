import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | PACTUM",
  description: "Sign in to PACTUM autonomous B2B procurement and settlement.",
};

export default function LoginPage() {
  return <AnimatedAuth initialMode="login" />;
}
