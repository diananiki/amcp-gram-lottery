import { compileLottery } from "./compile";

compileLottery()
  .then((code) =>
    console.log(
      `Built build/Lottery.code.boc\nCode hash: ${code.hash().toString("hex")}`,
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
