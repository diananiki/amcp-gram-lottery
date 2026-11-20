import "@stdlib/common";

enum Err {
    AlreadyDrawn = 1001,                        // Winners have already been saved.
    TooEarly = 1002,                            // Wait until after the deadline.
    DeadlinePassed = 1003,                      // Ticket sales are closed.
    TooFewTickets = 1004,                       // The ticket total is below the draw minimum.
    TooManyTickets = 1005,                      // The ticket count is outside the allowed limits.
    TooFewPlayers = 1006,                       // The number of buyer wallets is below the draw minimum.
    WrongCoinsAttached = 1007,                  // The message does not include enough coins for the tickets.
    NothingToRefund = 1008,                     // A refund is not available for this request.
    AlreadyInitialized = 1009,                  // The lottery has already been set up.
    BadDeadline = 1010,                         // The deadline must be in the future.
    NotInitialized = 1011,                      // Set up the lottery before using it.
    UnknownMessage = 1012,                      // The message contains an unknown operation.
    UnauthorizedInitializer = 1013              // Only the chosen creator can initialize this lottery.
}

const TICKET_PRICE: coins = grams("0.2");       // Cost of one ticket.
const MAX_TICKETS_PER_TX: uint32 = 10;          // Most tickets allowed in one purchase.
const MAX_TICKETS_TOTAL: uint32 = 100;          // Most tickets allowed in this lottery.
const CREATOR_FEE_NUM: coins = grams("0.05");   // Fee rate: 0.05 / 1 = 5%.
const WINNERS_COUNT: uint32 = 3;                // Keep one prize share below for each winner.
const PRIZE_SHARDS: array<coins> = [            // Winner shares after the creator fee: 50%, 30%, 20%.
    grams("0.5"),
    grams("0.3"),
    grams("0.2"),
];
// Require at least two buyer wallets per winner. Each buyer owns at least one ticket.
const MIN_PLAYERS: uint32 = WINNERS_COUNT * 2;
const MIN_TICKETS: uint32 = MIN_PLAYERS;

struct (0x6c617473) Storage {
    creator: address;                            // Chosen creator; receives the creator fee.
    deadline: uint64;                            // Deadline in Unix seconds. Buying is allowed at this exact time.
    ticketsSold: uint32;                         // Total tickets issued; refunds do not reduce this number.
    ticketOwners: map<uint32, address>;          // Buyer address for each ticket ID.
    playerTickets: map<address, uint32>;         // Ticket count per buyer; removed after a refund.
    prizePool: coins;                            // Ticket income minus refunds; not the account balance.
    winners: array<address>;                     // Winners in prize order.
    creatorFeePaid: coins;                       // Fee calculated at the draw; not a payment receipt.
}

// Initial data makes each deployment unique and sets who may initialize it.
struct (0x6c617469) DeploymentConfig {
    creator: address;
    salt: uint256;
}

struct LotteryInfo {
    ticketPrice: coins
    deadline: uint64
    ticketsSold: uint32
    prizePool: coins
    players: uint32
    minTickets: uint32
    maxTicketsPerTx: uint32
    totalTickets: uint32
}

struct (0xc674e474) InitMsg {
    deadline: uint64;
}

struct (0x6a7306a7) BuyTicketsMsg {
    count: uint32;
}

struct (0x70f2bd0f) DrawMsg {
    userSalt: uint256;
}

struct (0x5b2c1458) RefundMsg {}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

fun Storage.playerCount(self): uint32 {
    var n: uint32 = 0;
    var r = self.playerTickets.findFirst();

    while (r.isFound) {
        n += 1;
        r = self.playerTickets.iterateNext(r);
    }

    return n;
}

fun Storage.findNewWinner(self, ticketId: uint32, picked: array<address>): address? {
    val owner = self.ticketOwners.get(ticketId);

    if (!owner.isFound) {
        return null;
    }

    val candidate = owner.loadValue();
    var i = 0;

    while (i < picked.size()) {
        if (picked.get(i) == candidate) {
            return null;
        }

        i += 1;
    }

    return candidate;
}

type AllowedMessage = InitMsg | BuyTicketsMsg | DrawMsg | RefundMsg;

contract Lottery {
    author: "https://t.me/ptptprpt"
    version: "0.1"
    description: "Educational lottery contract"
    storage: Storage
    incomingMessages: AllowedMessage
}

fun isFresh(): bool {
    return contract.getData().beginParse().preloadUint(32) == 0x6c617469;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        InitMsg => {
            if (!isFresh()) {
                throw Err.AlreadyInitialized;
            }

            val config = DeploymentConfig.fromCell(contract.getData());


            if (in.senderAddress != config.creator) {
                throw Err.UnauthorizedInitializer;
            }

            if (blockchain.now() >= msg.deadline) {
                throw Err.BadDeadline;
            }

            var st = Storage {
                creator: config.creator,
                deadline: msg.deadline,
                ticketsSold: 0,
                ticketOwners: [],
                playerTickets: [],
                prizePool: 0,
                winners: [],
                creatorFeePaid: 0,
            };

            st.save();
        }

        BuyTicketsMsg => {
            if (isFresh()) {
                throw Err.NotInitialized;
            }

            var st = lazy Storage.load();

            if (blockchain.now() > st.deadline) {
                throw Err.DeadlinePassed;
            }

            if (msg.count > MAX_TICKETS_PER_TX || msg.count < 1) {
                throw Err.TooManyTickets;
            }

            if (st.ticketsSold + msg.count > MAX_TICKETS_TOTAL) {
                throw Err.TooManyTickets;
            }

            val expected: coins = TICKET_PRICE * msg.count;

            if (in.valueCoins < expected) {
                throw Err.WrongCoinsAttached;
            }

            var i: uint32 = 0;

            while (i < msg.count) {
                var newId = st.ticketsSold + 1;
                st.ticketOwners.set(newId, in.senderAddress);
                var before = st.playerTickets.get(in.senderAddress);
                var cur: uint32 = 0;

                if (before.isFound) {
                    cur = before.loadValue();
                }

                st.playerTickets.set(in.senderAddress, cur + 1);
                st.ticketsSold = newId;
                i += 1;
            }

            st.prizePool += expected;
            st.save();

            val overpay = in.valueCoins - expected;

            if (overpay > 0) {
                createMessage({

                    bounce: BounceMode.NoBounce,
                    value: overpay,
                    dest: in.senderAddress,
                }).send(SEND_MODE_REGULAR);
            }
        }

        DrawMsg => {
            if (isFresh()) {
                throw Err.NotInitialized;
            }

            var st = lazy Storage.load();

            if (st.winners.size() > 0) {
                throw Err.AlreadyDrawn;
            }

            if (blockchain.now() <= st.deadline) {
                throw Err.TooEarly;
            }

            if (st.ticketsSold < MIN_TICKETS) {
                throw Err.TooFewTickets;
            }

            if (st.playerCount() < MIN_PLAYERS) {
                throw Err.TooFewPlayers;
            }

            random.initialize();
            random.initializeBy(msg.userSalt);

            val pool = st.prizePool;
            val fee: coins = pool * CREATOR_FEE_NUM / grams("1");
            val remaining: coins = pool - fee;

            var picked: array<address> = [];
            var attempts: uint32 = 0;

            while (picked.size() < WINNERS_COUNT && attempts < 1000) {
                attempts += 1;
                val ticketId = (random.range(st.ticketsSold) + 1) as uint32;
                val winner = st.findNewWinner(ticketId, picked);

                if (winner != null) {
                    picked.push(winner);
                }
            }

            var k: uint32 = 0;

            while (k < picked.size()) {
                val winner = picked.get(k);
                val share: coins = remaining * PRIZE_SHARDS.get(k) / grams("1");

                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: share,
                    dest: winner,
                }).send(SEND_MODE_REGULAR);

                k += 1;
            }

            createMessage({
                bounce: BounceMode.NoBounce,
                value: fee,
                dest: st.creator,
            }).send(SEND_MODE_REGULAR);

            st.winners = picked;
            st.creatorFeePaid = fee;
            st.save();
        }

        RefundMsg => {
            if (isFresh()) {
                throw Err.NotInitialized;
            }

            var st = lazy Storage.load();

            if (blockchain.now() <= st.deadline) {
                throw Err.TooEarly;
            }

            if (st.ticketsSold >= MIN_TICKETS && st.playerCount() >= MIN_PLAYERS) {
                throw Err.NothingToRefund;
            }

            var got = st.playerTickets.get(in.senderAddress);

            if (!got.isFound) {
                throw Err.NothingToRefund;
            }

            var cnt = got.loadValue();
            val refund: coins = TICKET_PRICE * cnt;

            st.playerTickets.delete(in.senderAddress);
            st.prizePool -= refund;
            st.save();

            createMessage({
                bounce: BounceMode.NoBounce,
                value: refund,
                dest: in.senderAddress,
            }).send(SEND_MODE_REGULAR);
        }

        else => {
            assert (in.body.isEmpty()) throw Err.UnknownMessage;
        }
    }
}

get fun getLotteryInfo() {
    val st = lazy Storage.load();

    return LotteryInfo {
        ticketPrice: TICKET_PRICE,
        deadline: st.deadline,
        ticketsSold: st.ticketsSold,
        prizePool: st.prizePool,
        players: st.playerCount(),
        minTickets: MIN_TICKETS,
        maxTicketsPerTx: MAX_TICKETS_PER_TX,
        totalTickets: MAX_TICKETS_TOTAL,
    };
}

get fun getWinners() {
    val st = lazy Storage.load();

    return st.winners;
}

get fun getPlayerTickets(player: address): uint32 {
    val st = lazy Storage.load();
    var r = st.playerTickets.get(player);

    if (r.isFound) {
        return r.loadValue();
    }

    return 0 as uint32;
}

get fun getTicketOwner(ticketId: uint32) {
    val st = lazy Storage.load();
    var r = st.ticketOwners.get(ticketId);

    if (r.isFound) {
        return r.loadValue();
    }

    return null;
}

get fun isDrawn() {
    val st = lazy Storage.load();

    return st.winners.size() > 0;
}
