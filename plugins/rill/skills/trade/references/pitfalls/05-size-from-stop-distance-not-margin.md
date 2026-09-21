---
type: Trading Pitfall
title: Size comes from stop distance, never from margin and leverage
description: "$1,000 at 10×" picks the size from the account and lets the exchange's liquidation price be the stop — the correct order is invalidation level → stop distance → size = risk$ ÷ stop distance, with leverage as the last number, and a stop under 0.2 ATR rejected as noise.
severity: HIGH
appliesTo: position-sizing, leverage, stop-placement, averaging-down, risk-management
ported_from: trade-skills p30, rewritten for perps
tags: [sizing, leverage, stop-distance, atr, noise-band, liquidation, averaging-down]
timestamp: 2026-09-21T00:00:00Z
---

## Size comes from stop distance, never from margin and leverage

**Severity: HIGH — the perp UI asks for margin and leverage first, which is exactly the wrong order.**

**The mistake**: "I'll put $1,000 in at 10×." Size is chosen from margin and a leverage slider; the stop is either back-solved from the dollar loss the trader can stomach (and lands inside the noise) or not set at all — the liquidation price *is* the stop. Then, when it goes against them, "add $500 to lower the average".

**Why it happens**: the interface. Every perp DEX presents leverage as the input. But the liquidation price is a function of leverage and the maintenance tier, not of the chart; at 10× on Hyperliquid a roughly 9% adverse move liquidates, at 20× roughly 4.5%. Neither number has anything to do with where the thesis is wrong. A stop chosen from the account balance sits at a volatility-arbitrary distance — usually under 0.2 ATR — where ordinary oscillation hits it. Win rate collapses while every individual rule ("I always cut at 2%") looks disciplined.

**The check** (the framework's §9, in order):

1. **Invalidation** from structure (beyond the cluster, [`04-liquidation-clusters-and-round-numbers.md`](04-liquidation-clusters-and-round-numbers.md)) → `stop_distance_pct = |entry − invalidation| / entry`.
2. **Noise test**: `stop_distance ≥ 0.2 × atr14(holding timeframe) / entry`. Fails → no trade at any size; do not "fix" it by tightening.
3. **Size** = `risk$ ÷ stop_distance_pct` (risk$ = 1% of equity by default, never above 2%). Round down.
4. **Leverage** = `notional ÷ equity` — an *output*. Compare with the ceiling (5× majors, 3× alts, 2× thin book, and never above `maxLeverage ÷ 4`). Over the ceiling → cut notional; the stop does not move.
5. **Liquidation sanity**: the exchange's liquidation price must be *far beyond* the stop (at least 3× the stop distance). If it is not, leverage is too high for the stop, whatever the size says.
6. **Adds**: only a pre-planned scale-in at a pre-identified second level, sized so the *combined* position still fits the risk budget. Never an add to a loser.

**Example**: equity $10,000, risk 1% = **$100**. ETH at $3,000, 4h `atr14` $60, invalidation $2,910 (below the 4h low and the round 2,950 cluster) → stop **3.0%** = 1.5 ATR, passes the noise test. Size = $100 ÷ 0.03 = **$3,333 notional = 1.11 ETH**, leverage **0.33×**, liquidation nowhere near. The "$1,000 at 10×" trader holds $10,000 notional = 3.33 ETH: the same 3% move costs $300 = 3% of equity, and the real stop is the liquidation at ~$2,730 = **−$900, 9% of equity**. Same account, same view, nine times the risk — and the $1,000-at-10× position has a *tighter* effective stop than it thinks, because the trader will panic long before 2,730.

The averaging-down corollary, with the fixed $100 budget: one unit down 1.5% has spent $50 → 1.5% of room left. Add two more units (three total) → the remaining $50 covers **0.5%** of room. The add "for a better average" cut the survival distance by two-thirds.

**See also**: [`../perps-framework.md`](../perps-framework.md) §9; [`06-no-daily-loss-limit.md`](06-no-daily-loss-limit.md) (the per-trade cap's missing other half); [`07-tight-spread-thin-depth.md`](07-tight-spread-thin-depth.md) (when the book, not the account, sets the size).
