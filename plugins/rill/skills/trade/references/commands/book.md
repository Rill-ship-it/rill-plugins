---
type: Command Reference
title: "/rill:trade book <COIN>"
description: The order book as a size question — spread in bps, USD within ±1% on each side, slippage for a stated size, and the largest size the book can carry without becoming the market.
tags: [command, book, liquidity, depth, slippage, spread]
timestamp: 2026-09-21T00:00:00Z
---

# /rill:trade book <COIN>

**Question it answers:** can this book take my size — on the way in, on the way out, and at the stop? It never answers direction.

## Arguments

- Coin (perp) or spot pair (`HYPE/USDC`, `UBTC/USDC`).
- Size in USD, if the user gives one. If not, evaluate $10k, $100k and $1M and say which tier the book is built for.
- Side: the side the user would *exit* on matters most (a long exits into bids).

## Data

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" book --coin <COIN> --depth 20 --session ${CLAUDE_SESSION_ID}
```

`summary` carries `bestBid bestAsk mid spreadBps depth1pctBidUsd depth1pctAskUsd depthCoverage`; `levels` the top 20 per side. `depthCoverage.<side>: false` means the levels did not reach 1% — quote the depth as a lower bound. For a coin-level context (volume, OI) also read `markets --coin <COIN>`.

## Read order

1. **Spread** — `spreadBps`; under 1 bp on majors, 2–10 bps on mid caps, more is thin. Half the spread is paid on every fill.
2. **Depth** — `depth1pctBidUsd` / `depth1pctAskUsd` and their ratio: a book 3× deeper on one side is leaning that way (makers are protecting it, or one side has been swept).
3. **Slippage for size** — per side, `share = size / depth1pct`, `slippage ≈ share × 100 bps + spreadBps / 2`:

   | share | verdict |
   |---|---|
   | ≤ 5% | fine; slippage is noise |
   | 5–20% | tradeable; widen the stop by the slippage and size down accordingly |
   | > 20% | the book sets the size, not the account; a liquidation here gaps |

4. **Max size** — the notional at 5% share on the *exit* side; say it as "this book is built for ≈ $X positions".
5. **Shape** — from `levels`: is size concentrated at level 1 (a thin-depth trap, [pitfall 07](../pitfalls/07-tight-spread-thin-depth.md)) or spread across levels? Large single orders at round numbers are where liquidation clusters sit ([pitfall 04](../pitfalls/04-liquidation-clusters-and-round-numbers.md)).
6. **Clock** — weekend or within minutes of a funding hour → halve the trust in these numbers ([pitfall 10](../pitfalls/10-weekend-and-funding-hour-liquidity-illusion.md)).

## Output

```
**<COIN> book · <as_of UTC>** — spread … bps · ±1% depth $… bid / $… ask (coverage …)
Size <S>: …% of bid depth → ~… bps to exit · …% of ask depth → ~… bps to enter
Built for ≈ $… positions (5% share); > $… and the book decides
Shape: …
Not financial advice — Hyperliquid public data, read-only; no orders are placed.
```

No level dumps unless asked. Mirror the user's language.

## Record

`command: "book"`, `symbols: ["<COIN>"]`, `question.type: "liquidity"`, `read.state`: `"liquidity-read"` plus `+thin-book` when the 5%-share size is under ~$10k or `depth1pct` under ~$200k on either side. `read.bias: "neutral"`. `data`: `as_of`, `price` (mid), `spreadBps`. `scenarios: null`, `risk: null`. `pitfalls`: `["07"]` (+ `"04"`, `"10"` when cited).
