import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { CurrencyDisplay, SectionHeader, StatusBadge, CopyableHash, FormInput } from "@/components/SharedUI";

describe("PACTUM Typography System Verification", () => {
  it("renders SectionHeader using standardized section heading and body classes", () => {
    render(
      <SectionHeader
        title="Audit Invariants"
        subtitle="Independent ACWORLD verification gate evaluating 5 invariants"
      />
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Audit Invariants");
    expect(heading.className).toContain("type-section-heading");

    const subtitle = screen.getByText(/Independent ACWORLD verification gate/i);
    expect(subtitle.className).toContain("type-body");
  });

  it("renders CurrencyDisplay with tabular-nums and type-financial styling", () => {
    render(<CurrencyDisplay amount={8500} currency="USD" size="xl" />);

    const currencyElement = screen.getByText("$8,500.00");
    expect(currencyElement).toBeDefined();
    expect(currencyElement.className).toContain("type-financial");
  });

  it("renders FormInput with standard label typography and accessible error state", () => {
    render(
      <FormInput
        id="test-budget"
        label="Mandate Ceiling Budget"
        value={8500}
        onChange={() => {}}
        error="Exceeds maximum allowable procurement budget"
      />
    );

    const label = screen.getByText("Mandate Ceiling Budget");
    expect(label.className).toContain("type-form-label");

    const input = screen.getByLabelText("Mandate Ceiling Budget");
    expect(input.className).toContain("type-body");

    const error = screen.getByRole("alert");
    expect(error.className).toContain("type-secondary-meta");
  });

  it("restricts monospace font-mono-token strictly to technical identifiers", () => {
    const merkleRoot = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    render(<CopyableHash hash={merkleRoot} label="Merkle Root" truncate={true} />);

    // The container uses font-mono-token for the hash digest
    const container = screen.getByText("Merkle Root:").parentElement;
    expect(container?.className).toContain("font-mono-token");

    // But the label text itself specifies font-sans
    const label = screen.getByText("Merkle Root:");
    expect(label.className).toContain("font-sans");
  });

  it("renders StatusBadge with accessible semantic text and restrained contrast", () => {
    render(<StatusBadge status="verified" label="Verified Active" />);

    const badge = screen.getByText("Verified Active");
    expect(badge).toBeDefined();
    expect(badge.parentElement?.className).toContain("text-[11.5px]");
  });
});
