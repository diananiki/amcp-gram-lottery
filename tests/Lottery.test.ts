import { before, test } from "node:test";
import assert from "node:assert/strict";
import { Blockchain } from "@ton/sandbox";
import { Address, Cell, toNano } from "@ton/core";
import { compileLottery } from "../scripts/compile";
import { Lottery } from "../wrappers/Lottery";

let code: Cell;
before(async () => {
  code = await compileLottery();
});
async function setup() {
  const chain = await Blockchain.create();
  chain.now = 1_800_000_000;
  const owner = await chain.treasury("owner");
  const lottery = chain.openContract(
    Lottery.createFromCode(code, owner.address, 1n),
  );
  const result = await lottery.sendInit(
    owner.getSender(),
    toNano("0.2"),
    BigInt(chain.now + 3600),
  );
  success(result);
  return { chain, owner, lottery };
}
function success(result: { transactions: any[] }) {
  const tx = result.transactions.find(
    (tx) =>
      tx.inMessage?.info.type === "internal" &&
      tx.description.type === "generic" &&
      tx.description.computePhase.type === "vm" &&
      tx.description.computePhase.exitCode !== 0,
  );
  assert.equal(
    tx?.description.computePhase.exitCode,
    undefined,
    "All internal transactions must compute successfully",
  );
  for (const tx of result.transactions) {
    if (tx.description.type === "generic")
      assert.equal(tx.description.aborted, false, "Transaction must not abort");
  }
}

test("initializes deployment data, reads getter layout and rejects repeat initialization", async () => {
  const { chain, owner, lottery } = await setup();
  const info = await lottery.getLotteryInfo();
  assert.equal(info.deadline, BigInt(chain.now! + 3600));
  assert.equal(info.ticketPrice, toNano("0.2"));
  assert.equal(info.players, 0);
  assert.deepEqual(await lottery.getWinners(), []);
  assert.equal(await lottery.getPlayerTickets(owner.address), 0);
  assert.equal(await lottery.getTicketOwner(1), null);
  assert.equal(await lottery.isDrawn(), false);
  assert.equal(info.totalTickets, 100);
  assert.equal(info.minTickets, 6);
  const result = await lottery.sendInit(
    owner.getSender(),
    toNano("0.05"),
    BigInt(chain.now! + 7200),
  );
  assert(
    result.transactions.some(
      (tx) =>
        tx.description.type === "generic" &&
        tx.description.computePhase.type === "vm" &&
        tx.description.computePhase.exitCode === 1009,
    ),
  );
});

test("buys tickets and pays a draw after the deadline", async () => {
  const { chain, owner, lottery } = await setup();
  const players: Address[] = [];
  for (const name of ["alice", "bob", "carol", "dave", "eve", "frank"]) {
    const player = await chain.treasury(name);
    players.push(player.address);
    success(
      await lottery.sendBuyTickets(player.getSender(), toNano("0.25"), 1),
    );
  }
  for (const [index, address] of players.entries()) {
    assert.equal(await lottery.getPlayerTickets(address), 1);
    assert((await lottery.getTicketOwner(index + 1))?.equals(address));
  }
  assert.equal(await lottery.getTicketOwner(7), null);
  assert.equal((await lottery.getLotteryInfo()).ticketsSold, 6);
  assert.equal((await lottery.getLotteryInfo()).players, 6);
  assert.equal((await lottery.getLotteryInfo()).prizePool, toNano("1.2"));
  chain.now! += 3601;
  const draw = await lottery.sendDraw(owner.getSender(), toNano("0.15"), 123n);
  success(draw);
  assert.equal(await lottery.isDrawn(), true);
  const winners = await lottery.getWinners();
  assert.equal(winners.length, 3);
  assert.equal(
    new Set(winners.map((address) => address.toRawString())).size,
    3,
  );
  assert(
    winners.every((winner) => players.some((player) => player.equals(winner))),
  );
  for (const winner of winners) {
    const payout = draw.transactions
      .flatMap((tx) => [...tx.outMessages.values()])
      .find(
        (message) =>
          message.info.type === "internal" &&
          message.info.src.equals(lottery.address) &&
          message.info.dest.equals(winner),
      );
    assert(payout?.info.type === "internal");
    assert(payout.info.value.coins > toNano("0.2"));
  }
});

test("refunds insufficient participation and rejects a second refund", async () => {
  const { chain, owner, lottery } = await setup();
  success(await lottery.sendBuyTickets(owner.getSender(), toNano("0.45"), 2));
  chain.now! += 3601;
  success(await lottery.sendRefund(owner.getSender(), toNano("0.05")));
  assert.equal((await lottery.getLotteryInfo()).prizePool, 0n);
  assert.equal(await lottery.getPlayerTickets(owner.address), 0);
  assert.equal((await lottery.getLotteryInfo()).ticketsSold, 2);
  assert((await lottery.getTicketOwner(1))?.equals(owner.address));
  assert((await lottery.getTicketOwner(2))?.equals(owner.address));
  const result = await lottery.sendRefund(owner.getSender(), toNano("0.05"));
  assert(
    result.transactions.some(
      (tx) =>
        tx.description.type === "generic" &&
        tx.description.computePhase.type === "vm" &&
        tx.description.computePhase.exitCode === 1008,
    ),
  );
});

test("deployment IDs give different addresses and only the chosen creator can initialize", async () => {
  const chain = await Blockchain.create();
  chain.now = 1_800_000_000;
  const owner = await chain.treasury("owner");
  const stranger = await chain.treasury("stranger");
  const first = chain.openContract(
    Lottery.createFromCode(code, owner.address, 11n),
  );
  const second = chain.openContract(
    Lottery.createFromCode(code, owner.address, 12n),
  );
  assert(!first.address.equals(second.address));
  assert(
    first.address.equals(
      Lottery.createFromCode(code, owner.address, 11n).address,
    ),
  );
  const result = await first.sendInit(
    stranger.getSender(),
    toNano("0.2"),
    BigInt(chain.now + 3600),
  );
  assert(
    result.transactions.some(
      (tx) =>
        tx.description.type === "generic" &&
        tx.description.computePhase.type === "vm" &&
        tx.description.computePhase.exitCode === 1013,
    ),
  );
  success(
    await first.sendInit(
      owner.getSender(),
      toNano("0.2"),
      BigInt(chain.now + 3600),
    ),
  );
  success(
    await second.sendInit(
      owner.getSender(),
      toNano("0.2"),
      BigInt(chain.now + 3600),
    ),
  );
  assert.equal((await second.getLotteryInfo()).ticketsSold, 0);
});

test("enough tickets without enough different buyers still allows refunds", async () => {
  const { chain, owner, lottery } = await setup();
  const players = [];
  for (const name of ["alice", "bob", "carol", "dave", "eve"]) {
    const player = await chain.treasury(name);
    players.push(player);
    success(
      await lottery.sendBuyTickets(
        player.getSender(),
        toNano("0.45"),
        name === "alice" ? 2 : 1,
      ),
    );
  }
  const info = await lottery.getLotteryInfo();
  assert.equal(info.ticketsSold, info.minTickets);
  assert.equal(info.players, 5);
  chain.now! += 3601;
  const result = await lottery.sendDraw(
    owner.getSender(),
    toNano("0.15"),
    123n,
  );
  assert(
    result.transactions.some(
      (tx) =>
        tx.description.type === "generic" &&
        tx.description.computePhase.type === "vm" &&
        tx.description.computePhase.exitCode === 1006,
    ),
  );
  success(await lottery.sendRefund(players[0].getSender(), toNano("0.05")));
  assert.equal(await lottery.getPlayerTickets(players[0].address), 0);
  assert.equal((await lottery.getLotteryInfo()).prizePool, toNano("0.8"));
});

test("underpaid purchase is rejected without issuing tickets", async () => {
  const { owner, lottery } = await setup();
  const result = await lottery.sendBuyTickets(
    owner.getSender(),
    toNano("0.1"),
    1,
  );
  assert(
    result.transactions.some(
      (tx) =>
        tx.description.type === "generic" &&
        tx.description.computePhase.type === "vm" &&
        tx.description.computePhase.exitCode === 1007,
    ),
  );
  const info = await lottery.getLotteryInfo();
  assert.equal(info.ticketsSold, 0);
  assert.equal(info.prizePool, 0n);
  assert.equal(await lottery.getPlayerTickets(owner.address), 0);
});
