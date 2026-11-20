import "dotenv/config";
import { readFileSync } from "node:fs";
import { Address, toNano } from "@ton/core";

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const network = env.NETWORK || "testnet";

  if (network !== "testnet" && network !== "mainnet") {
    throw new Error("NETWORK must be testnet or mainnet");
  }

  function positiveInteger(name: string, fallback: number) {
    const value = Number(env[name] || fallback);

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }

  function coins(name: string, fallback: string) {
    const value = toNano(env[name] || fallback);

    if (value <= 0n) {
      throw new Error(`${name} must be a positive coin amount`);
    }

    return value;
  }

  function optionalUint(name: string, bits: bigint) {
    if (!env[name]) {
      return undefined;
    }

    let value: bigint;

    try {
      value = BigInt(env[name]);
    } catch {
      throw new Error(`${name} must be an unsigned integer`);
    }

    if (value < 0n || value >= (1n << bits)) {
      throw new Error(`${name} must fit uint${bits}`);
    }

    return value;
  }

  const testOnly = network === "testnet";

  return {
    network,
    lotterySalt: optionalUint("LOTTERY_SALT", 256n),
    lotteryDeadline: optionalUint("LOTTERY_DEADLINE", 64n),
    lotteryAddress: env.LOTTERY_ADDRESS || undefined,
    apiKey: env.TONCENTER_API_KEY || undefined,
    walletMnemonic: env.WALLET_MNEMONIC || "",
    testOnly,
    endpoint: testOnly
      ? "https://testnet.toncenter.com/api/v2/jsonRPC"
      : "https://toncenter.com/api/v2/jsonRPC",
    explorer: testOnly
      ? "https://testnet.tonviewer.com"
      : "https://tonviewer.com",
    latestDeployment: `deployments/${network}.json`,
    pollAttempts: positiveInteger("POLL_ATTEMPTS", 40),
    pollIntervalMs: positiveInteger("POLL_INTERVAL_MS", 3000),
    deadlineSeconds: positiveInteger("LOTTERY_DURATION_SECONDS", 86400),
    deployValue: coins("DEPLOY_VALUE", "0.2"),
    gasBuffer: coins("GAS_BUFFER", "0.05"),
    buyExtra: coins("BUY_EXTRA", "0.05"),
    drawValue: coins("DRAW_VALUE", "0.15"),
    refundValue: coins("REFUND_VALUE", "0.05"),
  };
}

export function getLotteryDeadline(
  config: ReturnType<typeof loadConfig>,
  now = BigInt(Math.floor(Date.now() / 1000)),
) {
  const deadline = config.lotteryDeadline ?? now + BigInt(config.deadlineSeconds);

  if (deadline <= now || deadline >= (1n << 64n)) {
    throw new Error(
      "LOTTERY_DEADLINE must be a future Unix timestamp that fits uint64",
    );
  }

  return deadline;
}

export function getLotteryAddress(config: ReturnType<typeof loadConfig>) {
  const address =
    config.lotteryAddress ||
    JSON.parse(readFileSync(config.latestDeployment, "utf8")).address;

  if (typeof address !== "string") {
    throw new Error("Set LOTTERY_ADDRESS or deploy a lottery first");
  }

  if (
    Address.isFriendly(address) &&
    Address.parseFriendly(address).isTestOnly &&
    !config.testOnly
  ) {
    throw new Error("This is a testnet address, but NETWORK is mainnet");
  }

  return Address.parse(address);
}
