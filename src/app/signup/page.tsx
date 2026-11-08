import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | PACTUM",
  description: "Create your PACTUM account for verifiable autonomous procurement.",
};

export default function SignupPage() {
  return <AnimatedAuth initialMode="signup" />;
}
