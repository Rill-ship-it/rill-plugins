---
type: Trading Pitfall
title: Weekend and funding-hour depth is an illusion — the 24 h numbers include Friday
description: Reading depth1pct and dayNtlVlm on a Saturday afternoon or two minutes before the hour as representative — weekend volume runs at half of weekday, makers pull quotes into the hourly funding print, and the 24 h volume still contains Friday; halve the trust, widen the stop, avoid the print.
severity: MEDIUM
appliesTo: liquidity, entry-timing, weekend, funding-hour, stop-placement
tags: [weekend, funding-hour, liquidity, volume, clock, utc]
timestamp: 2026-09-21T00:00:00Z
---

## Weekend and funding-hour depth is an illusion

**Severity: MEDIUM — the same size that was 1.5% of the book on Friday is 3% on Sunday and 6% at 59 minutes past.**

**The mistake**: sizing from `depth1pct` and `dayNtlVlm` without looking at the clock. The Sunday-morning book is read as if it were Tuesday's; the entry goes in at :58 because "the level is here", straight into the funding print.

**Why it happens**: Hyperliquid never closes and its funding is hourly, so two clocks matter. **Weekly**: weekend perp volume runs at roughly 40–60% of weekday, no CEX cash-market arb absorbs a cascade, and a 24 h rolling `dayNtlVlm` read on Saturday still contains Friday's session — the number is honest and stale at the same time. **Hourly**: the premium is charged and tends to revert at the top of every hour; makers widen or pull quotes into the print; liquidation sweeps cluster in the minutes around it ([`03-premium-plus-oi-is-leverage-stacking.md`](03-premium-plus-oi-is-leverage-stacking.md)). A book snapshot at :57 is not the book you will exit into at :02.

**The check**:

1. Read the weekday and UTC time off `as_of`. Saturday / Sunday (and the Friday-evening-UTC roll) → tag `+weekend`. Within ±5 minutes of the hour → tag `+funding-hour`.
2. Recent volume vs baseline from `candles --interval 1h --limit 48`: mean `volume` of the last 6 candles ÷ mean of all 48. Under 0.6 → treat `depth1pct` as ~half of what `book` shows; recompute the share and slippage ([`07-tight-spread-thin-depth.md`](07-tight-spread-thin-depth.md)).
3. Widen the stop by ~0.25 × `atr14(1h)` on weekends; the sweeps are the same size into a thinner book.
4. Enter and exit away from the print: not in the five minutes before or after the hour unless the trade *is* the reversion.
5. Do not compare a weekend `dayNtlVlm` to a weekday one when ranking coins in `scan`; compare Saturday to Saturday.

**Example**: `as_of` Sunday 03:00 UTC. BTC `dayNtlVlm` $1.78B (Friday is still in it); ±1% depth $118M bid. The last six 1h candles average 210 BTC of volume against a 48 h mean of 450 → ratio 0.47. A $2M sell that was 1.7% of bid depth on the snapshot is effectively ~3.4% — still fine for BTC, but the same arithmetic on a long-tail coin with $120k of depth turns a $6k "5% share" position into a 10% one, and a stop-market at 02:59 into a fill several ticks worse than the level. Read the clock first, then the book.

**See also**: [`../perps-framework.md`](../perps-framework.md) §5; [`../commands/book.md`](../commands/book.md); [`06-no-daily-loss-limit.md`](06-no-daily-loss-limit.md) (define the day in UTC).
