# GRAM lottery

This project helps you learn how to build a lottery smart contract. The contract uses Tolk. The build and deployment scripts use TypeScript.

Use **testnet** while learning. Testnet is a separate blockchain for tests. Its coins are free. This project uses native GRAM coins on TON.

## Start learning

Read the [learning guide](learn/README.md). It has diagrams of the lottery, examples of user messages, and the deployment steps.

Useful words:

| Word     | Meaning here                                                  |
| -------- | ------------------------------------------------------------- |
| Contract | A program stored on the blockchain                            |
| Wallet   | An account that can sign requests and send coins              |
| Gas      | Coins used to pay for running code                            |
| Deploy   | Send code and starting data to the blockchain                 |
| Getter   | A function that reads contract data                           |
| Faucet   | A service that gives free testnet coins                       |
| Mnemonic | Recovery words that give access to a wallet                   |
| Salt     | A number used to make a deployment different from another one |

## 1. Install and check the project

Install Node.js 22 or newer. You can use nvm to install and switch Node.js versions.

On macOS with zsh, run:

```sh
touch ~/.zshrc
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
source ~/.zshrc
nvm install --lts
node --version
npm --version
```

On Windows, install the latest stable [nvm-windows](https://github.com/nvm-windows/nvm/releases) using its setup installer. It is a separate program from macOS nvm. If Node.js is already installed, follow the installer's instructions to avoid a PATH conflict.

Open a new PowerShell window as Administrator, then run:

```powershell
nvm install lts
nvm use lts
node --version
npm --version
```

See the [official Windows command guide](https://github.com/nvm-windows/docs/blob/main/docs/guide/command-workflows.md). Use Node.js 22 or newer. You can run the project commands below in PowerShell too.

Then run these commands in the project directory:

```sh
npm install
npm run build
npm run typecheck
npm test
```

`npm install` downloads the libraries listed in `package.json` and creates or updates `package-lock.json`.

`build` compiles the Tolk code. `typecheck` checks the TypeScript code. `test` runs a local blockchain. Tests do not need a wallet or testnet coins.

The build creates three files:

| File                          | Content                                         |
| ----------------------------- | ----------------------------------------------- |
| `build/Lottery.code.boc`      | Compiled contract code                          |
| `build/Lottery.compiled.json` | Code in base64, compiler version, and code hash |
| `build/Lottery.fif`           | Fift code made by the compiler                  |

BOC means “Bag of Cells”. It is a format for saving blockchain code and data. To deploy, we need the code, starting data, an initialization message, and a funded wallet.

## 2. Create a testnet wallet

Run:

```sh
npm run wallet -- --create
```

The script creates 24 recovery words and saves them in `.env`. It also prints the wallet address and balance.

[TON Center](https://toncenter.com/) is the RPC service used by these scripts. It connects them to the blockchain so they can read balances and send messages. If requests fail because of rate limits, get an API key for the selected network and add it to `TONCENTER_API_KEY` in `.env`.

Keep `.env` private and make a safe backup. Anyone with the recovery words can use the wallet. Git ignores this file.

The command will not replace an existing `.env`. If `.env` already has your recovery words, use:

```sh
npm run wallet
```

The scripts use wallet version **V4R2**, in workchain 0. A wallet app may use a different version and show another address for the same words. Always send coins to the address printed by this script. You do not need a wallet app to use these scripts.

## 3. Get free testnet coins

1. Open [Testgiver TON bot](https://t.me/testgiver_ton_bot) in Telegram.
2. Start the bot and ask for testnet coins.
3. Send the address printed by `npm run wallet`.
4. Wait, then run `npm run wallet` again to check the balance.

You can also check your address on [testnet Tonviewer](https://testnet.tonviewer.com/).

See the [official faucet guide](https://github.com/ton-blockchain/docs/blob/main/content/onboarding/wallet-apps/get-coins.mdx) for more details.

## 4. Deploy the lottery

Run:

```sh
npm run deploy
```

This command spends coins from your wallet. It builds the contract, creates a new deployment ID, and sends the deployment message.

With the default settings:

- Ticket sales last for one day.
- The script sends 0.2 GRAM to the contract.
- Your wallet needs at least 0.25 GRAM: the amount to send plus a fee buffer.

The script prints an explorer link after checking the stored deadline. It saves a dated record in `deployments/` and updates `deployments/testnet.json`. CLI means “command-line interface”: here, the commands you run in the terminal. The lottery commands use that latest record to find the contract address. The old dated records stay in the directory.

If the command times out, check the explorer before trying again. The transaction may already have reached the blockchain.

### Deploy more than once

Leave `LOTTERY_SALT` blank to get a new random deployment ID each time you run `npm run deploy`. A different ID gives a different address, even with the same code and wallet.

To use a fixed ID, set it in `.env`:

```dotenv
LOTTERY_SALT=12345
```

The same code, creator address, and ID give the same contract address. You cannot start another round at an address that is already initialized. Use a new ID for a new lottery.

## 5. Use the lottery

```sh
npm run lottery -- info
npm run lottery -- buy 1
npm run lottery -- draw
npm run lottery -- refund
```

| Command  | What it does                                                  |
| -------- | ------------------------------------------------------------- |
| `info`   | Reads settings and ticket totals. It needs no recovery words. |
| `buy 1`  | Buys one ticket using the wallet in `.env`.                   |
| `draw`   | Asks the contract to choose winners after the deadline.       |
| `refund` | Asks for your ticket money back if too few people joined.     |

`info` shows coin amounts in nano-units. One GRAM is 1,000,000,000 nano.

Use different wallets for different players. Run one transaction at a time from each wallet. The wallet uses a sequence number to keep requests in order.

By default, buying sends the ticket cost plus 0.05 GRAM. The contract returns the extra amount, minus transfer fees. Drawing sends 0.15 GRAM. Refunding sends 0.05 GRAM. These amounts help pay for execution; they are not exact fee estimates.

After sending, check the lottery transaction in the explorer. A successful wallet transaction does not always mean the lottery accepted its message.

To use an older deployment, copy its address from a dated record into `LOTTERY_ADDRESS` in `.env`. Keep the correct `NETWORK` selected.

## Settings in .env

Optional settings have defaults. You do not need to copy all of them to use the project.

| Setting                    | Default       | Meaning                                                                                     |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `NETWORK`                  | `testnet`     | `testnet` or `mainnet`; controls RPC, explorer links, address display, and record selection |
| `WALLET_MNEMONIC`          | None          | Wallet recovery words, separated by spaces                                                  |
| `TONCENTER_API_KEY`        | None          | API key for the selected network                                                            |
| `LOTTERY_ADDRESS`          | Latest record | Address used by the interaction CLI                                                         |
| `LOTTERY_SALT`             | Random        | Deployment ID; an integer from 0 to 2²⁵⁶ − 1                                                |
| `LOTTERY_DEADLINE`         | From duration | End of sales, as Unix time in seconds                                                       |
| `LOTTERY_DURATION_SECONDS` | `86400`       | Sales duration when no deadline is set                                                      |
| `DEPLOY_VALUE`             | `0.2`         | Coins sent when deploying                                                                   |
| `GAS_BUFFER`               | `0.05`        | Extra wallet balance required before deployment                                             |
| `BUY_EXTRA`                | `0.05`        | Extra coins sent with a purchase                                                            |
| `DRAW_VALUE`               | `0.15`        | Coins sent with a draw request                                                              |
| `REFUND_VALUE`             | `0.05`        | Coins sent with a refund request                                                            |
| `POLL_ATTEMPTS`            | `40`          | Most times to check for confirmation                                                        |
| `POLL_INTERVAL_MS`         | `3000`        | Time between checks, in milliseconds                                                        |

`NETWORK=mainnet` uses real coins. Use a separate wallet and an API key for that network.

Contract rules, such as ticket price and player limits, are in `smart-contract/Lottery.tolk`. Changing `.env` does not change an on-chain contract. Build and deploy again to change those rules.

## Lottery rules

- One ticket costs 0.2 GRAM.
- A purchase can include 1–10 tickets. A lottery can sell up to 100.
- Buying is allowed at the exact deadline. Drawing and refunds require a later time.
- A draw needs enough tickets and different buyer wallets to meet `MIN_TICKETS` and `MIN_PLAYERS` in the contract code. The minimum is twice the winner count.
- Anyone can request a draw. The creator does not have to do it.
- The creator gets 5% of the pool. The winner shares are 50%, 30%, and 20% of what remains.
- If there are too few tickets or players, each buyer can request a refund after the deadline.
- Drawing and refunds do not happen automatically. Someone must send a message.

## Code map

| Path                          | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `smart-contract/Lottery.tolk` | Contract rules and stored data                     |
| `wrappers/Lottery.ts`         | TypeScript message builders and all five getters   |
| `scripts/compile.ts`          | Tolk compiler and build files                      |
| `scripts/config.ts`           | Settings and network selection                     |
| `scripts/network.ts`          | RPC client, wallet signer, and confirmation checks |
| `scripts/deploy.ts`           | Deployment and saved records                       |
| `scripts/lottery.ts`          | Read, buy, draw, and refund commands               |
| `tests/`                      | Local tests                                        |

In the wrapper, `PAY_GAS_SEPARATELY` means the sending wallet pays transfer fees in addition to the message value. The lottery still pays for its own execution.

Messages start with a 32-bit operation code:

| Message     | Operation code | Other fields        |
| ----------- | -------------- | ------------------- |
| Initialize  | `0xc674e474`   | `deadline`: uint64  |
| Buy tickets | `0x6a7306a7`   | `count`: uint32     |
| Draw        | `0x70f2bd0f`   | `userSalt`: uint256 |
| Refund      | `0x5b2c1458`   | None               |

## What does bounce mean?

A message with `bounce: true` can send its remaining value back if the receiving contract fails to process it. Fees are still spent, so this is not a full refund. A failed outgoing action only causes a bounce when the relevant send flags allow it.

`bounce: false` disables that return. The deployment message uses this setting while sending the new contract's code and starting data. If initialization fails, the coins may stay at the destination instead of coming back. Check the transaction before sending again.
