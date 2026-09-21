---
type: Trading Pitfall
title: Funding is a cost and a crowd count, not a direction
description: Reading positive funding as bullish (or negative as bearish) — funding is what the crowded side pays to stay in, so it tells you who is already positioned and what holding costs, never which way price goes next.
severity: HIGH
appliesTo: funding, direction, carry, crowding, every analysis
tags: [funding, crowding, carry, direction]
timestamp: 2026-09-21T00:00:00Z
---

## Funding is a cost and a crowd count, not a direction

**Severity: HIGH — the most common way to be on the crowded side and pay for the privilege.**

**The mistake**: "Funding is +60% APR, longs are paying — everyone is bullish, so it goes up." Or the mirror: "funding is deeply negative, it's going down." Funding gets read as a vote on direction.

**Why it happens**: funding *is* a vote — but it is a vote that has already been cast and paid for. Hyperliquid charges the side whose premium pulled mark away from oracle, every hour. Positive funding means the marginal buyer is already long and is now paying to stay long; the information is "the crowd is here", not "the crowd is right". When the crowd is long, the flush comes from long liquidations, not from shorts being squeezed — and the flush is what the funding was warning about.

**The check**:

1. Classify `funding.aprPct` as **cost and crowding** (`|apr| < 10` neutral · 10–30 leaning · 30–60 crowded · > 60 extreme) and write it as a daily cost: `apr ÷ 365`.
2. Ask "who gets hurt at the next funding hour?" — the side paying. That side is the one whose stops cluster below (or above) price.
3. Look at persistence (`hist7d.hoursPositive`, `signStreakHours`) and at the *change* (`aprPct` vs `hist7d.meanAprPct`). Only a change in funding together with a change in OI says anything about what happens next, and even then only as a scenario.
4. Never write a `read.bias` that equals the funding sign without an independent reason from structure or the quadrant.

**Example** (2026-09-21): XMR +17.3% on the day, funding **277.6% APR**, premium +0.32%, OI $79M, volume $35M. The direction read says "strong, bullish". The cost read says: a long pays **0.76% per day** — a 10-day hold costs 7.6% of notional, more than most targets — and the crowded side is long, so a 3% dip triggers *long* liquidations into a book that does $35M a day. Same numbers, BTC the same morning: funding 10.95% APR, 167 of 168 hours positive, streak 142 h. That is not "bullish"; that is "an established, moderately crowded long carry costing 0.03%/day" — and the sensible question is what happens if it goes to zero, not whether it confirms the trend.

**See also**: [`../perps-framework.md`](../perps-framework.md) §2 (funding read) and §0 (pricing before forecasting); [`03-premium-plus-oi-is-leverage-stacking.md`](03-premium-plus-oi-is-leverage-stacking.md) for the stacking version; [`08-cross-venue-funding-frictions-and-intervals.md`](08-cross-venue-funding-frictions-and-intervals.md) for the carry-trade version.
