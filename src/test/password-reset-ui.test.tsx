import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ResetPasswordPage from "@/app/auth/reset-password/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fill(password = "new-private-password", confirmation = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

describe("password reset completion", () => {
  it("checks confirmation before submitting credentials", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordPage />);
    fill("new-private-password", "different-private-password");
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows a pending state and successful completion", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    render(<ResetPasswordPage />); fill();
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    finish(Response.json({ success: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("password has been updated");
    expect(screen.getByRole("link", { name: "Continue to account" })).toHaveAttribute("href", "/account");
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
  it("preserves retry after an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Sign in or request a new recovery link." } }, { status: 401 })));
    render(<ResetPasswordPage />); fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("new recovery link");
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
  });
});
