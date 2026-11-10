import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import gsap from "gsap";
import AccountPage from "@/app/account/page";
import { OrganizationMembers } from "@/components/OrganizationMembers";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

describe("AccountPage & OrganizationMembers — Cinematic Motion Tests", () => {
  describe("1. AccountPage Coordinated Entrance", () => {
    it("coordinates card, masked heading, and settings sections via GSAP timeline", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes("/api/auth/session")) {
            return Promise.resolve(
              Response.json({ principal: { email: "officer@procure.internal" } })
            );
          }
          if (String(url).includes("/api/organizations")) {
            return Promise.resolve(Response.json({ organizations: [], active: null }));
          }
          return Promise.resolve(Response.json({}));
        })
      );

      const gsapTimelineSpy = vi.spyOn(gsap, "timeline");

      render(<AccountPage />);

      expect(gsapTimelineSpy).toHaveBeenCalled();
      expect(
        await screen.findByText(/Signed in as officer@procure\.internal/)
      ).toBeInTheDocument();

      const heading = screen.getByRole("heading", { name: "Account & Workspace", level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.parentElement?.className).toContain("overflow-hidden");
    });

    it("respects prefers-reduced-motion on AccountPage entrance", async () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes("/api/auth/session")) {
            return Promise.resolve(
              Response.json({ principal: { email: "officer@procure.internal" } })
            );
          }
          return Promise.resolve(Response.json({ organizations: [], active: null }));
        })
      );

      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(<AccountPage />);

      expect(
        await screen.findByText(/Signed in as officer@procure\.internal/)
      ).toBeInTheDocument();

      expect(gsapFromToSpy).not.toHaveBeenCalled();
    });

    it("animates error banner when an operation error is encountered", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
          if (String(url).includes("/api/auth/session")) {
            return Promise.resolve(
              Response.json({ principal: { email: "officer@procure.internal" } })
            );
          }
          if (String(url).includes("/api/auth/logout") && opts?.method === "POST") {
            return Promise.resolve(Response.json({ success: false }, { status: 503 }));
          }
          return Promise.resolve(Response.json({ organizations: [], active: null }));
        })
      );

      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(<AccountPage />);

      expect(
        await screen.findByText(/Signed in as officer@procure\.internal/)
      ).toBeInTheDocument();

      gsapFromToSpy.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Logout could not be confirmed. Please retry."
      );

      expect(gsapFromToSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ opacity: 0, y: -4 }),
        expect.objectContaining({ opacity: 1, y: 0, clearProps: "transform,opacity" })
      );
    });
  });

  describe("2. OrganizationMembers Cinematic Motion", () => {
    it("coordinates member rows entrance and form reveal when role is authorized", async () => {
      const activeOrg = {
        id: "org-1",
        name: "Acme Enterprise",
        role: "OWNER",
        permissions: ["membership.manage"],
      };

      const memberships = [
        { id: "m-1", userId: "user-1@acme.com", role: "OWNER", status: "ACTIVE", version: 1 },
        { id: "m-2", userId: "user-2@acme.com", role: "VIEWER", status: "ACTIVE", version: 1 },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).endsWith("/api/organizations")) {
            return Promise.resolve(Response.json({ active: activeOrg }));
          }
          if (String(url).includes("/api/organizations/memberships")) {
            return Promise.resolve(Response.json({ memberships }));
          }
          return Promise.resolve(Response.json({}));
        })
      );

      const gsapTimelineSpy = vi.spyOn(gsap, "timeline");

      render(<OrganizationMembers />);

      expect(
        await screen.findByText("Organization Members & Roles")
      ).toBeInTheDocument();

      expect(gsapTimelineSpy).toHaveBeenCalled();
      expect(screen.getByText("user-1@acme.com")).toBeInTheDocument();
      expect(screen.getByText("user-2@acme.com")).toBeInTheDocument();
    });

    it("animates save confirmation feedback and invitation token generation", async () => {
      const activeOrg = {
        id: "org-1",
        name: "Acme Enterprise",
        role: "OWNER",
        permissions: ["membership.manage"],
      };

      const memberships = [
        { id: "m-1", userId: "user-1@acme.com", role: "OWNER", status: "ACTIVE", version: 1 },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
          if (String(url).endsWith("/api/organizations")) {
            return Promise.resolve(Response.json({ active: activeOrg }));
          }
          if (String(url).includes("/api/organizations/invitations") && opts?.method === "POST") {
            return Promise.resolve(
              Response.json({
                success: true,
                invitationToken: "INV-SECRET-TOKEN-12345",
              })
            );
          }
          if (String(url).includes("/api/organizations/memberships")) {
            return Promise.resolve(Response.json({ memberships }));
          }
          return Promise.resolve(Response.json({}));
        })
      );

      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(<OrganizationMembers />);

      expect(
        await screen.findByText("Organization Members & Roles")
      ).toBeInTheDocument();

      gsapFromToSpy.mockClear();

      const inviteInput = screen.getByLabelText("Invite email");
      fireEvent.change(inviteInput, { target: { value: "newbie@acme.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Invite" }));

      // Token display appears and animates
      expect(
        await screen.findByText("INV-SECRET-TOKEN-12345")
      ).toBeInTheDocument();

      // Feedback message appears and animates
      expect(
        await screen.findByText("Local organization record updated.")
      ).toBeInTheDocument();

      expect(gsapFromToSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ opacity: 0, scale: 0.98, y: 4 }),
        expect.objectContaining({ opacity: 1, scale: 1, y: 0, clearProps: "transform,opacity" })
      );
    });
  });
});
