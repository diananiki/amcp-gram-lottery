import { loadConfig } from "./config";
import { mnemonicToPrivateKey, mnemonicValidate } from "@ton/crypto";
import { fromNano } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";

export function client() {
  const config = loadConfig();

  return new TonClient({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
  });
}

export async function signer(api: TonClient) {
  const words = loadConfig().walletMnemonic.trim().split(/\s+/);

  if (!(await mnemonicValidate(words))) {
    throw new Error(
      "Set WALLET_MNEMONIC in .env to valid wallet recovery words",
    );
  }

  const keys = await mnemonicToPrivateKey(words);
  const wallet = api.open(
    WalletContractV4.create({ workchain: 0, publicKey: keys.publicKey }),
  );

  return { wallet, sender: wallet.sender(keys.secretKey) };
}

export async function waitFor(check: () => Promise<boolean>, label: string) {
  const config = loadConfig();

  for (let attempt = 0; attempt < config.pollAttempts; attempt++) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for ${label}; inspect the explorer before retrying`,
  );
}

export async function requireBalance(
  wallet: { getBalance(): Promise<bigint> },
  value: bigint,
  gasBuffer: bigint,
) {
  const balance = await wallet.getBalance();
  const required = value + gasBuffer;

  if (balance < required) {
    throw new Error(
      `Not enough coins: wallet has ${fromNano(balance)}, needs at least ${fromNano(required)} including the fee buffer`,
    );
  }
}
