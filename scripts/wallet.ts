import { writeFileSync } from "node:fs";
import { mnemonicNew } from "@ton/crypto";
import { loadConfig } from "./config";
import { client, signer } from "./network";

async function main() {
  const config = loadConfig();

  if (process.argv.includes("--create")) {
    const words = await mnemonicNew(24);

    writeFileSync(
      ".env",
      `NETWORK=${config.network}\nWALLET_MNEMONIC="${words.join(" ")}"\nTONCENTER_API_KEY=\n`,
      { flag: "wx", mode: 0o600 },
    );

    process.env.WALLET_MNEMONIC = words.join(" ");

    console.log(
      "Created wallet recovery words in .env. Keep this file private.",
    );
  }

  const { wallet } = await signer(client());

  console.log("Wallet type: V4R2 (workchain 0)");
  console.log(
    `${config.network} wallet address:`,
    wallet.address.toString({ testOnly: config.testOnly, bounceable: false }),
  );
  console.log("Balance (nano):", (await wallet.getBalance()).toString());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
