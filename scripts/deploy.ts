import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Lottery } from "../wrappers/Lottery";
import { compileLottery } from "./compile";
import { client, requireBalance, signer, waitFor } from "./network";
import { getLotteryDeadline, loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const api = client();
  const { wallet, sender } = await signer(api);

  const salt = config.lotterySalt ?? BigInt("0x" + randomBytes(32).toString("hex"));

  const lottery = api.open(
    Lottery.createFromCode(await compileLottery(), wallet.address, salt),
  );

  const address = lottery.address.toString({ testOnly: config.testOnly });

  console.log(
    `Network: ${config.network}\nLottery: ${address}\nDeployment ID: ${salt}`,
  );

  if (await api.isContractDeployed(lottery.address)) {
    throw new Error(
      "This lottery is already deployed. Use a new LOTTERY_SALT or leave it blank.",
    );
  }

  const deadline = getLotteryDeadline(config);

  await requireBalance(wallet, config.deployValue, config.gasBuffer);

  console.log(`Sending ${config.deployValue} nano; deadline ${deadline}`);
  await lottery.sendInit(sender, config.deployValue, deadline);
  await waitFor(() => api.isContractDeployed(lottery.address), "deployment");
  const info = await lottery.getLotteryInfo();

  if (info.deadline !== deadline) {
    throw new Error("The stored deadline is different. Check the transaction.");
  }

  const deployedAt = new Date().toISOString();
  const record =
    JSON.stringify(
      {
        network: config.network,
        address,
        wallet: wallet.address.toString({ testOnly: config.testOnly }),
        salt: salt.toString(),
        deadline: deadline.toString(),
        deployedAt,
        codeHash: lottery.init!.code.hash().toString("hex"),
      },
      null,
      2,
    ) + "\n";

  mkdirSync("deployments", { recursive: true });
  const archive = `deployments/${config.network}-${deployedAt.replace(/[:.]/g, "-")}-${lottery.address.hash.toString("hex")}.json`;
  writeFileSync(archive, record, { flag: "wx" });
  writeFileSync(config.latestDeployment, record);

  console.log(
    `Deployed: ${config.explorer}/${address}\nSaved ${archive}\nLatest: ${config.latestDeployment}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
