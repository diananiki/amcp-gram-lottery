import { test } from "node:test";
import assert from "node:assert/strict";
import { Address } from "@ton/core";
import {
  getLotteryAddress,
  getLotteryDeadline,
  loadConfig,
} from "../scripts/config";

test("network settings stay consistent", () => {
  const testnet = loadConfig({});
  assert.equal(testnet.network, "testnet");
  assert.equal(testnet.testOnly, true);
  const mainnet = loadConfig({
    NETWORK: "mainnet",
    POLL_ATTEMPTS: "7",
    DRAW_VALUE: "0.3",
  });
  assert.equal(mainnet.endpoint, "https://toncenter.com/api/v2/jsonRPC");
  assert.equal(mainnet.testOnly, false);
  assert.equal(mainnet.latestDeployment, "deployments/mainnet.json");
  assert.equal(mainnet.pollAttempts, 7);
  assert.equal(mainnet.drawValue, 300000000n);
  assert.throws(() => loadConfig({ NETWORK: "typo" }));
  assert.throws(() => loadConfig({ POLL_INTERVAL_MS: "0" }));
  assert.throws(() => loadConfig({ DEPLOY_VALUE: "-1" }));
});

test("optional lottery settings come from config and keep zero as a valid ID", () => {
  const defaults = loadConfig({});
  assert.equal(defaults.lotterySalt, undefined);
  assert.equal(defaults.lotteryDeadline, undefined);
  assert.equal(defaults.lotteryAddress, undefined);

  const config = loadConfig({
    LOTTERY_SALT: "0",
    LOTTERY_DEADLINE: "1800003600",
    LOTTERY_ADDRESS: "saved-address",
  });
  assert.equal(config.lotterySalt, 0n);
  assert.equal(config.lotteryDeadline, 1800003600n);
  assert.equal(config.lotteryAddress, "saved-address");
  assert.throws(() => loadConfig({ LOTTERY_SALT: "-1" }));
  assert.throws(() => loadConfig({ LOTTERY_SALT: (1n << 256n).toString() }));
  assert.throws(() => loadConfig({ LOTTERY_DEADLINE: "tomorrow" }));
  assert.throws(() => loadConfig({ LOTTERY_DEADLINE: (1n << 64n).toString() }));
});

test("deployment deadline checks are applied only when deploying", () => {
  const now = 1800000000n;
  assert.equal(getLotteryDeadline(loadConfig({}), now), now + 86400n);
  assert.equal(
    getLotteryDeadline(loadConfig({ LOTTERY_DEADLINE: "1800003600" }), now),
    now + 3600n,
  );
  const expired = loadConfig({ LOTTERY_DEADLINE: "1" });
  assert.throws(
    () => getLotteryDeadline(expired, now),
    /future Unix timestamp/,
  );
  assert.throws(() =>
    getLotteryDeadline(loadConfig({ LOTTERY_DEADLINE: now.toString() }), now),
  );
  assert.throws(() => getLotteryDeadline(loadConfig({}), (1n << 64n) - 1n));
});

test("lottery address checks reject a test-only address on mainnet", () => {
  const address = new Address(0, Buffer.alloc(32, 1));
  const testAddress = address.toString({ testOnly: true });
  assert(
    getLotteryAddress(loadConfig({ LOTTERY_ADDRESS: testAddress })).equals(
      address,
    ),
  );
  assert.throws(
    () =>
      getLotteryAddress(
        loadConfig({ NETWORK: "mainnet", LOTTERY_ADDRESS: testAddress }),
      ),
    /testnet address/,
  );
  assert.throws(() =>
    getLotteryAddress(loadConfig({ LOTTERY_ADDRESS: "not-an-address" })),
  );
  assert(
    getLotteryAddress(
      loadConfig({
        NETWORK: "mainnet",
        LOTTERY_ADDRESS: address.toRawString(),
      }),
    ).equals(address),
  );
});
