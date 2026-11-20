import { test } from "node:test";
import assert from "node:assert/strict";
import { toNano } from "@ton/core";
import { requireBalance } from "../scripts/network";

test("wallet must cover the message amount and the fee buffer", async () => {
  const value = toNano("0.25");
  const gasBuffer = toNano("0.05");

  await assert.rejects(
    requireBalance({ getBalance: async () => value }, value, gasBuffer),
    /needs at least 0.3/,
  );
  await assert.rejects(
    requireBalance({ getBalance: async () => 0n }, value, gasBuffer),
    /Not enough coins/,
  );
  await requireBalance(
    { getBalance: async () => value + gasBuffer },
    value,
    gasBuffer,
  );
});
