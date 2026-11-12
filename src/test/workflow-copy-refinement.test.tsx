import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

describe("Workflow copy", () => {
  it("uses the exact requested headings and descriptions in order", () => {
    const { container } = render(<WelcomeHeroScreen />);
    const sections = [...container.querySelectorAll(".cinema-story")];
    expect(sections.map(section => [section.querySelector("h2")?.textContent, section.querySelector("p")?.textContent])).toEqual([
      ["Define procurement requirements", "Set your budget, delivery expectations, and supplier criteria. PACTRA structures these requirements into a clear procurement mandate."],
      ["Negotiate supplier terms", "Compare supplier offers and negotiate better terms with AI assistance. Every proposal is checked against your purchasing limits."],
      ["Verify agreement compliance", "Verify negotiated terms against business policies. Cryptographic evidence creates an auditable record of the agreement."],
      ["Process approved payments", "Move verified agreements toward settlement through PayPal. Buyer approval and payment checks keep the process controlled."],
    ]);
    expect(sections.map(section => section.getAttribute("data-scene"))).toEqual(["mandate", "negotiation", "audit", "settlement"]);
    for (const section of sections) {
      expect(section.querySelectorAll("h2")).toHaveLength(1);
      expect(section.querySelectorAll("p")).toHaveLength(1);
      expect(section.querySelector(".workflow-copy")?.childElementCount).toBe(2);
    }
  });
});
