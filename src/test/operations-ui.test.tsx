import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmationModal } from "@/components/SharedUI";

describe("shared confirmation dialog keyboard boundary", () => {
  it("contains tab focus, dismisses with Escape and returns focus", () => {
    const cancel = vi.fn();
    const { rerender } = render(<><button>Open confirmation</button><ConfirmationModal isOpen={false} title="Cancel mandate?" description="Review before closing this procurement." onConfirm={vi.fn()} onCancel={cancel} /></>);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    rerender(<><button>Open confirmation</button><ConfirmationModal isOpen title="Cancel mandate?" description="Review before closing this procurement." onConfirm={vi.fn()} onCancel={cancel} /></>);
    const dialog = screen.getByRole("dialog");
    const buttons = dialog.querySelectorAll("button");
    expect(buttons[0]).toHaveFocus();
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<><button>Open confirmation</button><ConfirmationModal isOpen={false} title="Cancel mandate?" description="Review before closing this procurement." onConfirm={vi.fn()} onCancel={cancel} /></>);
    expect(trigger).toHaveFocus();
  });
});
