import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/ops/x-read.py");

function environmentWithoutXCredentials(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of ["X_AUTH_TOKEN", "X_CT0", "AUTH_TOKEN", "CT0"]) {
    delete environment[name];
  }
  return environment;
}

describe("Workspace X credential adoption", () => {
  it("proves read-only allowlisting, child-only delivery, and redaction", () => {
    const result = spawnSync("python3", ["-B", SCRIPT, "--self-test"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: process.env.PATH ?? "/usr/bin" },
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("x-read credential boundary self-test: PASS");
    expect(result.stdout).not.toContain("fixture-auth-secret");
    expect(result.stdout).not.toContain("fixture-ct0-secret");
    expect(result.stdout).not.toContain(
      createHash("sha256").update("fixture-auth-secret").digest("hex"),
    );
  });

  it("fails closed on missing Workspace delivery with a redacted diagnostic", () => {
    const result = spawnSync("python3", ["-B", SCRIPT, "whoami"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...environmentWithoutXCredentials(),
        WORKSPACE_CREDENTIAL_SERVICE: "trade-journal.x-read",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "x-read unavailable: workspace X credential delivery is incomplete: X_AUTH_TOKEN, X_CT0\n",
    );
  });

  it("denies writes and cross-service delivery before invoking Bird", () => {
    const baseEnvironment = {
      ...environmentWithoutXCredentials(),
      X_AUTH_TOKEN: "fixture-auth-secret",
      X_CT0: "fixture-ct0-secret",
    };
    const write = spawnSync("python3", ["-B", SCRIPT, "tweet", "not-sent"], {
      cwd: ROOT,
      encoding: "utf8",
      env: baseEnvironment,
    });
    const wrongService = spawnSync("python3", ["-B", SCRIPT, "whoami"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...baseEnvironment, WORKSPACE_CREDENTIAL_SERVICE: "another.x-service" },
    });
    const alternateCredentialSource = spawnSync(
      "python3",
      ["-B", SCRIPT, "whoami", "--chrome-profile", "Default"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: baseEnvironment,
      },
    );

    expect(write.status).toBe(2);
    expect(write.stderr).toBe(
      "x-read unavailable: Bird operation is not in the read-only allowlist\n",
    );
    expect(wrongService.status).toBe(2);
    expect(wrongService.stderr).toBe(
      "x-read unavailable: Workspace credential service is not authorized for this consumer\n",
    );
    expect(alternateCredentialSource.status).toBe(2);
    expect(alternateCredentialSource.stderr).toBe(
      "x-read unavailable: Bird credential-source option is not permitted\n",
    );
    for (const output of [
      write.stdout,
      write.stderr,
      wrongService.stdout,
      wrongService.stderr,
      alternateCredentialSource.stdout,
      alternateCredentialSource.stderr,
    ]) {
      expect(output).not.toContain(baseEnvironment.X_AUTH_TOKEN);
      expect(output).not.toContain(baseEnvironment.X_CT0);
    }
  });

  it("declares no repository-local credential source or write command", () => {
    const source = readFileSync(SCRIPT, "utf8");

    expect(source).not.toContain(".env.local");
    for (const option of [
      "--auth-token",
      "--ct0",
      "--chrome-profile",
      "--chrome-profile-dir",
      "--firefox-profile",
      "--cookie-source",
    ]) {
      expect(source).toContain(`"${option}"`);
    }
    for (const command of ["tweet", "reply", "unbookmark", "follow", "unfollow"]) {
      expect(source).not.toMatch(new RegExp(`^[^#\\n]*[\"']${command}[\"']`, "m"));
    }
    expect(source).toContain("/Users/home-hub/projects/workspace");
    expect(source).toContain("trade-journal.x-read");
    expect(source).toContain('execv(PYTHON, [PYTHON, "-B", *command])');
  });

  it("records the Workspace dependency and migration removal condition", () => {
    const inventorySource = readFileSync(
      resolve(ROOT, "docs/agents/provider-adapters/workspace-x-consumer-inventory.json"),
      "utf8",
    );
    const inventory = JSON.parse(inventorySource) as {
      schema_version: string;
      authority: string;
      support_state: string;
      consumers: Array<{
        id: string;
        workspace_service: string;
        credential_identities: string[];
        denied_credential_sources: string[];
        allowed_operations: string[];
        writes: unknown[];
        failure_behavior: string;
        validation: { deterministic: string; authenticated_probe: string };
        compatibility: string;
      }>;
    };
    const guidance = readFileSync(
      resolve(ROOT, "docs/agents/workspace-x-credential-adoption.md"),
      "utf8",
    );

    expect(inventory.schema_version).toBe("1.0.0");
    expect(inventory.authority).toBe("scope:trade-journal");
    expect(inventory.support_state).toBe("current");
    expect(inventory.consumers).toHaveLength(1);
    expect(inventory.consumers[0]).toMatchObject({
      id: "workspace-x-read",
      workspace_service: "trade-journal.x-read",
      credential_identities: ["x.auth-token", "x.ct0"],
      writes: [],
    });
    expect(inventory.consumers[0].allowed_operations).toEqual([
      "about",
      "bookmarks",
      "followers",
      "following",
      "home",
      "likes",
      "list-timeline",
      "lists",
      "mentions",
      "news",
      "read",
      "replies",
      "search",
      "thread",
      "trending",
      "user-tweets",
      "whoami",
    ]);
    expect(inventory.consumers[0].denied_credential_sources).toHaveLength(4);
    expect(inventory.consumers[0].failure_behavior).toContain("unavailable");
    expect(inventory.consumers[0].validation.deterministic).toContain("--self-test");
    expect(inventory.consumers[0].validation.authenticated_probe).toContain("whoami");
    expect(inventory.consumers[0].compatibility).toContain("projects#35");
    expect(guidance).toContain("credential diagnose");
    expect(guidance).toContain("projects#35");
    expect(guidance).not.toMatch(/(?:auth_token|ct0)=[A-Za-z0-9_-]{12,}/i);
    expect(guidance).not.toMatch(/\b[a-f0-9]{64}\b/i);
  });
});
