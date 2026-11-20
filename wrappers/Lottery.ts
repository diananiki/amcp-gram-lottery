import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from "@ton/core";

export class Lottery implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromCode(code: Cell, creator: Address, salt: bigint) {
    const data = beginCell()
      .storeUint(0x6c617469, 32)
      .storeAddress(creator)
      .storeUint(salt, 256)
      .endCell();
    const init = { code, data };

    return new Lottery(contractAddress(0, init), init);
  }

  async sendInit(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    deadline: bigint,
  ) {
    await provider.internal(via, {
      value,
      bounce: false,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0xc674e474, 32)
        .storeUint(deadline, 64)
        .endCell(),
    });
  }

  async sendBuyTickets(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    count: number,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x6a7306a7, 32)
        .storeUint(count, 32)
        .endCell(),
    });
  }

  async sendDraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    salt: bigint,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x70f2bd0f, 32)
        .storeUint(salt, 256)
        .endCell(),
    });
  }

  async sendRefund(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x5b2c1458, 32)
        .endCell(),
    });
  }

  async getLotteryInfo(provider: ContractProvider) {
    const { stack } = await provider.get("getLotteryInfo", []);

    return {
      ticketPrice: stack.readBigNumber(),
      deadline: stack.readBigNumber(),
      ticketsSold: stack.readNumber(),
      prizePool: stack.readBigNumber(),
      players: stack.readNumber(),
      minTickets: stack.readNumber(),
      maxTicketsPerTx: stack.readNumber(),
      totalTickets: stack.readNumber(),
    };
  }

  async getWinners(provider: ContractProvider): Promise<Address[]> {
    const { stack } = await provider.get("getWinners", []);
    const winners = stack.readTuple();
    const addresses: Address[] = [];

    while (winners.remaining > 0) {
      addresses.push(winners.readAddress());
    }

    return addresses;
  }

  async getPlayerTickets(
    provider: ContractProvider,
    player: Address,
  ): Promise<number> {
    const { stack } = await provider.get("getPlayerTickets", [
      { type: "slice", cell: beginCell().storeAddress(player).endCell() },
    ]);

    return stack.readNumber();
  }

  async getTicketOwner(
    provider: ContractProvider,
    ticketId: number,
  ): Promise<Address | null> {
    const { stack } = await provider.get("getTicketOwner", [
      { type: "int", value: BigInt(ticketId) },
    ]);

    return stack.readAddressOpt();
  }

  async isDrawn(provider: ContractProvider) {
    return (await provider.get("isDrawn", [])).stack.readBoolean();
  }
}
