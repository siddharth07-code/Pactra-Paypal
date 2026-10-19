import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Security Policy and Specification Integrity Checks", () => {
  const rootDir = path.resolve(__dirname, "../../");

  it("ensures GEMINI.md exists in repository root", () => {
    const geminiPath = path.join(rootDir, "GEMINI.md");
    expect(fs.existsSync(geminiPath)).toBe(true);
  });

  it("ensures SECURITY.md exists in repository root and defines core policies", () => {
    const securityPath = path.join(rootDir, "SECURITY.md");
    expect(fs.existsSync(securityPath)).toBe(true);
    const content = fs.readFileSync(securityPath, "utf-8");
    expect(content).toContain("Secrets and Credentials");
    expect(content).toContain("Payment Security");
    expect(content).toContain("Mandatory Development Rules");
  });

  it("ensures .antigravity/rules.md mandates reading both GEMINI.md and SECURITY.md", () => {
    const rulesPath = path.join(rootDir, ".antigravity/rules.md");
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, "utf-8");
    expect(content).toContain("GEMINI.md");
    expect(content).toContain("SECURITY.md");
  });

  it("ensures .env.example exists without containing real secret keys", () => {
    const envExamplePath = path.join(rootDir, ".env.example");
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, "utf-8");
    // Ensure template variables have no real values populated
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith("PAYPAL_CLIENT_SECRET=")) {
        expect(line.trim()).toBe("PAYPAL_CLIENT_SECRET=");
      }
      if (line.startsWith("GEMINI_API_KEY=")) {
        expect(line.trim()).toBe("GEMINI_API_KEY=");
      }
    }
  });

  it("ensures .gitignore excludes secret-bearing files and databases", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain(".env*");
    expect(content).toContain("!.env.example");
    expect(content).toContain("*.key");
    expect(content).toContain("*.sqlite");
  });
});
