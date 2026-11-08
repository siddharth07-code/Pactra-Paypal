import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AnimatedAuth from "@/components/AnimatedAuth";
import { ThemeProvider } from "@/lib/theme-provider";

// Mock GSAP and @gsap/react
vi.mock("gsap", () => ({
  default: {
    registerPlugin: vi.fn(),
    timeline: vi.fn(() => ({
      to: vi.fn().mockReturnThis(),
    })),
    fromTo: vi.fn(),
    to: vi.fn(),
  },
}));

vi.mock("@gsap/react", () => ({
  useGSAP: (callback: () => void) => {
    callback();
  },
}));

// Mock Next.js router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Supabase
const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });
const mockResetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AnimatedAuth Component", () => {
  it("renders in Login mode by default", () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    // Login header
    expect(screen.getByRole("heading", { name: "Login", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("WELCOME BACK!")).toBeInTheDocument();
    expect(screen.getByText("HELLO FRIEND!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Login via Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot Password?" })).toBeInTheDocument();
  });

  it("renders in Sign Up mode when initialMode is signup", () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="signup" />
      </ThemeProvider>
    );

    expect(screen.getByRole("heading", { name: "Sign Up", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Signup via Google/i })).toBeInTheDocument();
  });

  it("switches to Sign Up mode when clicking Sign Up toggle link", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const signUpToggle = screen.getByText("Sign Up", { selector: "button.hover\\:underline" });
    fireEvent.click(signUpToggle);

    // Form inputs for signup are present
    expect(screen.getByPlaceholderText("Full name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Phone")).toBeInTheDocument();
  });

  it("switches back to Login mode when clicking Login toggle link", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="signup" />
      </ThemeProvider>
    );

    const loginToggle = screen.getByText("Login", { selector: "button.hover\\:underline" });
    fireEvent.click(loginToggle);

    expect(screen.getByRole("button", { name: "Forgot Password?" })).toBeInTheDocument();
  });

  it("toggles password visibility between text and password", () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const passwordInput = screen.getAllByPlaceholderText("Password")[0];
    expect(passwordInput).toHaveAttribute("type", "password");

    const showButton = screen.getAllByRole("button", { name: "Show" })[0];
    fireEvent.click(showButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getAllByRole("button", { name: "Hide" })[0]).toBeInTheDocument();
  });

  it("validates empty inputs on login", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const loginButton = screen.getAllByRole("button", { name: "Login" })[0];
    fireEvent.click(loginButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Email and password are required.");
  });

  it("calls /api/auth/login and redirects on successful credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, redirectTo: "/account" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Mock window.location.assign
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign: assignMock, origin: "http://localhost:3000", pathname: "/login", hash: "" },
      writable: true,
    });

    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const emailInputs = screen.getAllByPlaceholderText("Email");
    const passwordInputs = screen.getAllByPlaceholderText("Password");

    fireEvent.change(emailInputs[0], { target: { value: "officer@pactum.com" } });
    fireEvent.change(passwordInputs[0], { target: { value: "secure-procurement-password" } });

    const loginButton = screen.getAllByRole("button", { name: "Login" })[0];
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          body: JSON.stringify({ email: "officer@pactum.com", password: "secure-procurement-password" }),
        })
      );
      expect(assignMock).toHaveBeenCalledWith("/account");
    });
  });

  it("displays server error message on login failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Invalid email or password." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const emailInputs = screen.getAllByPlaceholderText("Email");
    const passwordInputs = screen.getAllByPlaceholderText("Password");

    fireEvent.change(emailInputs[0], { target: { value: "invalid@pactum.com" } });
    fireEvent.change(passwordInputs[0], { target: { value: "wrong-password" } });

    const loginButton = screen.getAllByRole("button", { name: "Login" })[0];
    fireEvent.click(loginButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("validates minimum password length on registration", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="signup" />
      </ThemeProvider>
    );

    const emailInputs = screen.getAllByPlaceholderText("Email");
    const passwordInputs = screen.getAllByPlaceholderText("Password");

    fireEvent.change(emailInputs[1], { target: { value: "newuser@pactum.com" } });
    fireEvent.change(passwordInputs[1], { target: { value: "short" } });

    const signupButtons = screen.getAllByRole("button", { name: "Sign Up" });
    const signupButton = signupButtons[signupButtons.length - 1];
    fireEvent.click(signupButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be between 12 and 128 characters.");
  });

  it("calls /api/auth/register and shows confirmation message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Check your email to confirm registration if this address is eligible.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="signup" />
      </ThemeProvider>
    );

    const nameInput = screen.getByPlaceholderText("Full name");
    const emailInputs = screen.getAllByPlaceholderText("Email");
    const phoneInput = screen.getByPlaceholderText("Phone");
    const passwordInputs = screen.getAllByPlaceholderText("Password");

    fireEvent.change(nameInput, { target: { value: "Procurement Lead" } });
    fireEvent.change(emailInputs[1], { target: { value: "lead@pactum.com" } });
    fireEvent.change(phoneInput, { target: { value: "+1 555 0199" } });
    fireEvent.change(passwordInputs[1], { target: { value: "valid-12-character-password" } });

    const signupButtons = screen.getAllByRole("button", { name: "Sign Up" });
    const signupButton = signupButtons[signupButtons.length - 1];
    fireEvent.click(signupButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/register",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          body: JSON.stringify({
            email: "lead@pactum.com",
            password: "valid-12-character-password",
            name: "Procurement Lead",
            phone: "+1 555 0199",
          }),
        })
      );
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Check your email to confirm registration");
  });

  it("triggers Google OAuth flow via Supabase client", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const googleBtn = screen.getByRole("button", { name: /Login via Google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringContaining("/auth/callback"),
          }),
        })
      );
    });
  });

  it("triggers forgot password recovery flow", async () => {
    render(
      <ThemeProvider>
        <AnimatedAuth initialMode="login" />
      </ThemeProvider>
    );

    const emailInputs = screen.getAllByPlaceholderText("Email");
    fireEvent.change(emailInputs[0], { target: { value: "reset@pactum.com" } });

    const forgotBtn = screen.getByRole("button", { name: "Forgot Password?" });
    fireEvent.click(forgotBtn);

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "reset@pactum.com",
        expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback"),
        })
      );
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Password reset link sent!");
  });
});
