import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | PACTRA",
  description: "Register for PACTRA autonomous B2B procurement.",
};

export default function RegisterPage() {
  return <AnimatedAuth initialMode="signup" />;
}
