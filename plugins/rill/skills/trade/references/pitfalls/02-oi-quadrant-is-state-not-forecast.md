---
type: Trading Pitfall
title: The OI × price quadrant is a state, not a forecast — and a flipped quadrant is an exit
description: Treating "OI up + price up" as a continuation signal — the quadrant says who is positioning (new longs / new shorts / covering / liquidation), never whether they are right; when it flips against a held view the view is dead and the position is closed, not averaged.
severity: HIGH
appliesTo: open-interest, direction, invalidation, averaging-down
ported_from: trade-skills p4 (flip on invalidation), rewritten for perps
tags: [open-interest, quadrant, state, invalidation, flip]
timestamp: 2026-09-21T00:00:00Z
---

## The OI × price quadrant is a state, not a forecast

**Severity: HIGH — the new longs you are cheering are the fuel for the next liquidation.**

**The mistake**: "OI is up 9% and price is up 4% — new money is buying, this continues." The quadrant (OI↑ px↑ new longs · OI↑ px↓ new shorts · OI↓ px↑ short covering · OI↓ px↓ long liquidation) is read as a prediction. The second half of the mistake: when the quadrant later flips to OI↓ px↓, the trader who was long "because OI was rising" adds to the position instead of leaving.

**Why it happens**: rising OI with rising price *looks* like conviction. It is also, mechanically, the largest possible stock of leveraged longs sitting above their liquidation prices. Whether it resolves as continuation or as a cascade depends on things the quadrant does not contain: funding level (how expensive it is to keep those longs), premium (how far the perp is stretched from index), depth (what the exits look like), and structure (how far the nearest cluster is). The quadrant is one axis of the state; the state is not a call.

**The check**:

1. Read `market.oiChange24hPct` and `change24hPct` (thresholds: flat = `|ΔOI| < 3%`, `|Δpx| < 2%`). Name the quadrant. Stop there — it is a *label*.
2. Combine it with funding and premium into one of the framework's eight states, then build base / bull / bear with probabilities. The quadrant appears in the **trigger** and **invalidation** of scenarios, never as the conclusion.
3. Write the invalidation as a quadrant flip: for a view built on new longs, "OI falls > 3% while price falls > 2%" means those longs are being liquidated — the reason for the trade is gone.
4. When that prints: **flip or stand aside**. Adding to a position whose premise flipped is the perp version of averaging down, and it shrinks the remaining stop distance with every add (see [`05-size-from-stop-distance-not-margin.md`](05-size-from-stop-distance-not-margin.md)).
5. If `oiChange24hPct` is `null` (no local history yet), say the quadrant is unavailable and tag `+no-oi-history`; do not infer it from a day's price change alone.

**Example**: BTC OI $3.50B → $3.80B (+8.6%) while price +4% over 24 h, funding 25% APR, premium +0.08%. Quadrant: **new longs**. As a forecast it is 50/50. As a state it says: $300M of fresh leveraged longs sit within one daily ATR (~$2,100, 2.6%) of their liquidation band if they are 20×+. Base scenario: chop while funding bleeds them (p 0.5); bull: spot-led push that resets funding (p 0.3); bear: funding-hour flush through the 4h low (p 0.2). Next day prints OI −6%, price −3%: the state is now **long-liquidation**. The trader who held "because OI was rising" has become the liquidity; the trader who wrote the flip as the invalidation is flat, watching for OI to stop falling before considering the reclaim.

**See also**: [`../perps-framework.md`](../perps-framework.md) §3 (quadrant), §7 (states), §8 (scenarios); [`03-premium-plus-oi-is-leverage-stacking.md`](03-premium-plus-oi-is-leverage-stacking.md); [`04-liquidation-clusters-and-round-numbers.md`](04-liquidation-clusters-and-round-numbers.md).
