vi.mock("@/components/OrganizationMembers", () => ({ OrganizationMembers: () => null }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthForm } from "@/components/AuthForm";
import AccountPage from "@/app/account/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fillForm() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-test-password" } });
}

describe("authentication UI", () => {
  it("provides registration and login navigation without a browser token client", () => {
    render(<AuthForm mode="login" />);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });
  it("shows email confirmation instructions after registration", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    render(<AuthForm mode="register" />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("status")).toHaveTextContent("confirmation link in this browser");
    expect(fetch).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ credentials: "same-origin", method: "POST" }));
  });
  it("shows failed login without claiming an authenticated session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Authentication failed." } }, { status: 401 })));
    render(<AuthForm mode="login" />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication failed.");
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });
  it("allows retry when authentication is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AuthForm mode="login" />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled());
  });
  it("shows identity without organization privileges and does not falsely confirm failed logout", async () => {
    const fetch = vi.fn().mockImplementation(async url => String(url) === "/api/auth/session"
      ? Response.json({ principal: { email: "buyer@example.com" } })
      : String(url) === "/api/organizations" ? Response.json({ organizations: [], active: null })
        : Response.json({ success: false }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    render(<AccountPage />);
    expect(await screen.findByText("Signed in as buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText(/membership and permissions are verified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Logout could not be confirmed");
    expect(fetch).toHaveBeenLastCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST", body: "{}" }));
  });
});
