import AnimatedAuth from "@/components/AnimatedAuth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | PACTUM",
  description: "Register for PACTUM autonomous B2B procurement.",
};

export default function RegisterPage() {
  return <AnimatedAuth initialMode="signup" />;
}
