---
type: Trading Pitfall
title: Persistent premium + rising OI = leverage stacking; it mean-reverts at funding hours
description: Reading a perp that trades persistently above index while OI climbs as strength — it is leverage piling onto the side the funding mechanism is about to charge, and the premium is pulled back to oracle at every hourly funding print.
severity: HIGH
appliesTo: premium, basis, open-interest, funding-hour, entry-timing
tags: [premium, basis, open-interest, funding-hour, mean-reversion, stacking]
timestamp: 2026-09-21T00:00:00Z
---

## Persistent premium + rising OI = leverage stacking

**Severity: HIGH — you pay the carry and eat the reversion, every hour, on the same position.**

**The mistake**: mark above oracle for hours, OI rising, funding climbing — read as "demand is strong, buyers keep coming". The trader goes long into the premium.

**Why it happens**: `premiumPct = (mark − oracle) / oracle` is the perp's instantaneous stretch from index. Hyperliquid's funding rate is computed *from* that premium and charged every hour; the mechanism exists to pull mark back to oracle. Premium that persists means the buying is leveraged perp demand, not spot demand — the oracle (external index) is not moving with it. Rising OI into that premium means more leverage on the paying side. At each funding timestamp two things happen to that side: it pays the print, and mark tends to snap toward oracle (the premium reverts), so it also marks down. With hourly funding on HL, that is 24 reversion events a day, not one.

**The check**:

1. `funding --coin X --hours 24`: the `premiumPct` column. The tell is **premium > 0.1% for 6+ consecutive prints** with `oiChange24hPct > +5%` and `aprPct` above the 7-day mean.
2. Compare `market.markPx` with `oraclePx` now, and — for HL-native tokens — with `spot.markPx` ([`09-hl-native-spot-volume-vs-perp-oi.md`](09-hl-native-spot-volume-vs-perp-oi.md)). Premium ≈ 0 with a big move means the move is spot-led and durable; premium large and persistent means it is perp-led and rented.
3. Expected cost of being on the paying side over the horizon = `apr ÷ 365 × days` **plus** the premium you bought at (it reverts toward zero on you).
4. If you still want the direction, wait for the premium to reset (a print with premium ≈ 0 and funding falling) — the state changes from `crowded-long` to `new-longs` or `spot-led`, and the entry is the same price without the stacking.

**Example**: mid-cap perp, mark $2.000, oracle $1.994 → premium **+0.30%**; last six hourly prints all > +0.2%; funding 0.03%/h (**263% APR**); OI +12% in 24 h. Reading it as strength and going long 5×: at the top of the hour mark reverts toward $1.994 (−0.30%, −1.5% of equity at 5×) and the position pays 0.03% (−0.15% of equity). Ten such hours ≈ −1.5% carry plus repeated −0.3% wicks; the position is down 3–4% of equity while price is "flat". The trader who waited for a print with premium ≈ 0 buys the same $2.00 without paying for it.

**See also**: [`../perps-framework.md`](../perps-framework.md) §4 (premium / basis), §2 (funding); [`01-funding-is-not-direction.md`](01-funding-is-not-direction.md); [`10-weekend-and-funding-hour-liquidity-illusion.md`](10-weekend-and-funding-hour-liquidity-illusion.md) for what the book looks like at the print.
