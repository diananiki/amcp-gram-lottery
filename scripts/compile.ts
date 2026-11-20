import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Cell } from "@ton/core";
import { runTolkCompiler, getTolkCompilerVersion } from "@ton/tolk-js";

export async function compileLottery(): Promise<Cell> {
  const result = await runTolkCompiler({
    entrypointFileName: "smart-contract/Lottery.tolk",
    fsReadCallback: (path) => readFileSync(resolve(path), "utf8"),
  });

  if (result.status === "error") {
    throw new Error(result.message);
  }

  const code = Cell.fromBase64(result.codeBoc64);

  mkdirSync("build", { recursive: true });
  writeFileSync("build/Lottery.code.boc", code.toBoc());
  writeFileSync("build/Lottery.fif", result.fiftCode);
  writeFileSync(
    "build/Lottery.compiled.json",
    JSON.stringify(
      {
        compilerVersion: await getTolkCompilerVersion(),
        codeBoc64: result.codeBoc64,
        codeHashHex: code.hash().toString("hex"),
      },
      null,
      2,
    ) + "\n",
  );

  return code;
}
