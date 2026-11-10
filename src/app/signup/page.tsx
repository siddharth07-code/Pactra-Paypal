import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | PACTRA",
  description: "Create your PACTRA account for verifiable autonomous procurement.",
};

export default function SignupPage() {
  return <AnimatedAuth initialMode="signup" />;
}
