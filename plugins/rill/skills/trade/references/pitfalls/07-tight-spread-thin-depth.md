---
type: Trading Pitfall
title: A tight top-of-book spread with thin ±1% depth cannot carry the size — or the stop
description: A 1 bp spread looks liquid, but if ±1% depth is $150k the intended $50k position is a third of the book — the exit eats 30+ bps, the stop fills far below the level, and a liquidation gaps. Size from depth1pct, not from the spread.
severity: HIGH
appliesTo: liquidity, position-sizing, long-tail, stop-placement, exit
tags: [order-book, depth, spread, slippage, long-tail, liquidation]
timestamp: 2026-09-21T00:00:00Z
---

## A tight top-of-book spread with thin ±1% depth cannot carry the size

**Severity: HIGH — the loss is taken at the stop fill, not at the stop level.**

**The mistake**: "spread is 1 bp, it's liquid." The trader sizes a long-tail perp like a major, enters fine (a small order at the top of book), and discovers on the way out that the second level is 20 bps away and the tenth is 1.5% away. The stop at −2% fills at −2.8%; the liquidation, if it comes, fills wherever the cascade stops.

**Why it happens**: on many Hyperliquid long-tail perps market makers quote tight at level 1 with tiny size and back off sharply behind it. Top-of-book is a marketing number; depth is the real one. Liquidations execute as market orders into that depth, so a thin book converts a 2% stop into a 3% fill and a cascade into a 10% wick. The framework's `size = risk$ ÷ stop` assumes the stop fills near the stop — which is only true when the size is small relative to depth.

**The check**:

1. `book --coin X --depth 20` → `summary.depth1pctBidUsd` (what a *sell* exits into) and `depth1pctAskUsd`. Check `depthCoverage` — `false` means the number is a lower bound.
2. `share = size ÷ depth1pct(exit side)`, `slippage ≈ share × 100 bps + spreadBps ÷ 2`:
   - ≤ 5% fine · 5–20% widen the stop by the slippage and size down · > 20% **the book sets the size**.
3. The book-limited size is `5% × depth1pct(exit side)`; if it is below the account-limited size from §9, the book wins.
4. Cross-check with volume: a position above ~1% of `dayNtlVlm` is the market, not a participant in it.
5. `depth1pct` under ~$200k on either side → tag `+thin-book`, leverage ceiling 2×, stop widened by the slippage estimate.

**Example** (2026-09-21): HYPE/USDC spread 0.11 bps, ±1% depth **$3.1M bid / $3.7M ask** → a $100k long is 3% of bid depth on exit: fine. A long-tail perp the same morning: spread 2 bps, ±1% depth **$120k bid / $90k ask**. The intended $50k long exits into 42% of bid depth → ~42 bps of slippage on the stop fill, ~50 bps if the stop is a market order in a cascade. At 5× that is **2.1–2.5% of equity in slippage alone**, on top of the 2% stop. Book-limited size at 5% share = **$6,000** — one-eighth of what the account arithmetic allowed. The "tight spread" said nothing about any of this.

**See also**: [`../perps-framework.md`](../perps-framework.md) §5 (liquidity for a size); [`../commands/book.md`](../commands/book.md); [`04-liquidation-clusters-and-round-numbers.md`](04-liquidation-clusters-and-round-numbers.md); [`10-weekend-and-funding-hour-liquidity-illusion.md`](10-weekend-and-funding-hour-liquidity-illusion.md).
