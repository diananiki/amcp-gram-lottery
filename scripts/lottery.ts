import { randomBytes } from "node:crypto";
import { Lottery } from "../wrappers/Lottery";
import { client, requireBalance, signer, waitFor } from "./network";
import { getLotteryAddress, loadConfig } from "./config";

async function main() {
  const [command = "info", countArg] = process.argv.slice(2);
  if (!["info", "buy", "draw", "refund"].includes(command)) {
    throw new Error("Usage: npm run lottery -- info|buy <count>|draw|refund");
  }

  const count = Number(countArg);
  if (
    command === "buy" &&
    (!Number.isInteger(count) || count < 1 || count > 10)
  ) {
    throw new Error("Ticket count must be 1–10");
  }

  const config = loadConfig();

  const address = getLotteryAddress(config);

  const api = client();
  const lottery = api.open(new Lottery(address));

  if (command === "info") {
    console.log(
      JSON.stringify(
        {
          ...(await lottery.getLotteryInfo()),
          isDrawn: await lottery.isDrawn(),
        },
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );

    return;
  }

  const { wallet, sender } = await signer(api);
  const seqno = await wallet.getSeqno();

  switch (command) {
    case "buy": {
      const { ticketPrice } = await lottery.getLotteryInfo();

      const value = ticketPrice * BigInt(count) + config.buyExtra;

      await requireBalance(wallet, value, config.gasBuffer);
      await lottery.sendBuyTickets(
        sender,
        value,
        count,
      );

      break;
    }

    case "draw":
      await requireBalance(wallet, config.drawValue, config.gasBuffer);

      await lottery.sendDraw(
        sender,
        config.drawValue,
        BigInt("0x" + randomBytes(32).toString("hex")),
      );

      break;

    case "refund":
      await requireBalance(wallet, config.refundValue, config.gasBuffer);

      await lottery.sendRefund(
        sender,
        config.refundValue,
      );

      break;
  }

  await waitFor(
    async () => (await wallet.getSeqno()) > seqno,
    "wallet transaction",
  );

  console.log(
    `Wallet sent the message. Check the lottery result: ${config.explorer}/${lottery.address.toString({ testOnly: config.testOnly })}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
