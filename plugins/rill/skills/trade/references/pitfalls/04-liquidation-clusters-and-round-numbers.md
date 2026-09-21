---
type: Trading Pitfall
title: Liquidation clusters sit at round numbers and obvious lows — put invalidation beyond them
description: Placing the stop at the level everyone sees (the round number, yesterday's low, the 4h swing low) — that is where leveraged liquidations cluster, the sweep runs through it and the move resumes without you.
severity: HIGH
appliesTo: stop-placement, invalidation, entry-timing, structure
tags: [liquidation, clusters, round-numbers, stops, sweeps, atr]
timestamp: 2026-09-21T00:00:00Z
---

## Liquidation clusters sit at round numbers and obvious lows

**Severity: HIGH — the stop is hit by the sweep, not by the thesis.**

**The mistake**: invalidation "just below the 4h low" or "under 80,000" — exactly where the last thousand leveraged longs have their liquidation prices, and exactly where the liquidation engine and market makers will trade to. The wick runs 0.3–0.8 ATR through the level, fills every stop, and price is back above it within the hour.

**Why it happens**: with `maxLeverage` 40 on BTC and 10–20× common, liquidation prices are not spread evenly: they cluster at fixed distances from the entries that clustered at round numbers and breakouts (roughly `entry × (1 − 1/leverage + maintenance)`). A retail crowd that bought 81,000 at 20× is liquidated around 77,500; one that bought 80,000 at 10× around 72,800; and the visible structural lows collect the discretionary stops on top. Liquidations execute at market into the book, so once the first tier goes, the cascade reaches the next — which is why the wick overshoots the level by a fraction of an ATR and why the "support" looks broken for exactly as long as the cascade lasts.

**The check**:

1. From `candles`: the 1d / 4h / 1h `low`/`high`, and the nearest round numbers (BTC: every 1,000 and 500; alts: the two-significant-digit levels). Mark them as **cluster levels**.
2. Add the leverage bands: for the entry cluster you can see (the last consolidation), the 10× and 20× liquidation distances.
3. Invalidation = cluster level − `0.3–0.75 × atr14` of the timeframe you hold on, **beyond** the cluster, not on it. If that makes the stop wider than your size allows, size down ([`05-size-from-stop-distance-not-margin.md`](05-size-from-stop-distance-not-margin.md)); never move the stop back into the cluster.
4. In the book (`book --depth 20`): a large resting order exactly at a round number is usually a cluster marker, not support.
5. Entries: the sweep *through* a cluster with an immediate reclaim is the entry; the touch is not.

**Example** (BTC, 2026-09-21): mark 81,700, 1h `atr14` $440, 4h low 80,888, round 80,000. The naive long has its stop at 80,850 — 1.0% away and inside the cluster (the 4h low plus everyone's stops plus the 20× liquidations from the 84,000 entries at ~79,800). A routine wick to 80,700 (0.4 ATR under the low) stops it out; a full sweep to 80,000 takes out the rest. Invalidation at **80,550** (low − 0.75 × ATR) is a 1.4% stop instead of 1.0%: with $100 risk, size drops from $10,000 to $7,100 notional. The position survives the sweep; the thesis is only wrong if 80,550 holds as resistance afterwards — which is a fact about the market, not about the crowd's stops.

**See also**: [`../perps-framework.md`](../perps-framework.md) §6 (structure), §9 (sizing); [`02-oi-quadrant-is-state-not-forecast.md`](02-oi-quadrant-is-state-not-forecast.md) (a cascade is the long-liquidation quadrant); [`07-tight-spread-thin-depth.md`](07-tight-spread-thin-depth.md) (what the cascade trades into).
