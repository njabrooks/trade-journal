import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("IBKR requested-contract quote process boundary", () => {
  it("reports gateway and market-data unavailability without leaving the client range", () => {
    const result = spawnSync(
      "python3",
      [resolve(process.cwd(), "tests/python/test_ibkr_option_quote_boundary.py")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
