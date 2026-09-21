---
type: Command Reference
title: "/rill:trade funding [COIN]"
description: Funding as cost and crowding — one coin's carry with its 7-day persistence, or the cross-venue screen (HL vs Binance vs Bybit) with fees, interval mismatch and basis applied before any "arb" is called one.
tags: [command, funding, carry, cross-venue, arbitrage, persistence]
timestamp: 2026-09-21T00:00:00Z
---

# /rill:trade funding [COIN]

Two modes. **With a coin**: what does it cost to hold, is it persistent, where does HL sit vs CEX. **Without**: the cross-venue screen, widest dislocations first, with the frictions that make most of them untradeable.

## Data

With a coin:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" predicted --coin <COIN> --session ${CLAUDE_SESSION_ID}
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" funding --coin <COIN> --hours 168 --limit 24 --session ${CLAUDE_SESSION_ID}
```

Without a coin:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" predicted --limit 15 --session ${CLAUDE_SESSION_ID}
```

then `funding --coin X --hours 168 --limit 6` for the two or three candidates worth checking (persistence is the whole question).

## Read order — one coin

1. **Cost now and per day** — `rows[0].fundingRatePct` per hour, `summary.meanAprPct ÷ 365` per day, and over the user's horizon. Say who pays whom.
2. **Persistence** — `hoursPositive / hoursNegative` out of 168 and `signStreakHours`. 160/168 with a 100 h streak is a regime; 90/78 is noise around zero.
3. **Level vs range** — current APR against `minAprPct / maxAprPct`; at the edge → `+funding-extreme`.
4. **Second derivative** — the last six prints against the 7-day mean: rising, flat, or falling? "High and falling" is the beginning of the unwind, not the top of the crowd.
5. **Cross-venue** — `predicted`: HL vs Binance vs Bybit in APR points, and `intervalHours` (HL 1, CEX 8). Positive gap = HL longs pay more = the leverage lives here.
6. **Will it flip?** — only answerable as a scenario: funding flips when premium flips; give the premium level and OI behaviour that would do it, with a probability.

Never turn any of this into a direction ([pitfall 01](../pitfalls/01-funding-is-not-direction.md)). Output: five to eight lines, then the disclaimer.

## Read order — screen

1. Take the top rows by `|hlVsBinancePct|`; drop anything under 15 APR points.
2. For each survivor, **frictions** ([pitfall 08](../pitfalls/08-cross-venue-funding-frictions-and-intervals.md)):
   - daily gap = gap ÷ 365; round-trip fees ≈ 0.17–0.20% (four taker legs) → break-even days = fees ÷ daily gap;
   - interval mismatch: the HL leg reprices hourly, the CEX leg every 8 h — the *next* HL print is one of eight before the CEX settles;
   - basis: the two marks drift; a "neutral" pair is not neutral in mark terms.
3. **Persistence** — `funding --hours 168` for the candidates: a one-hour spike at 300% APR has a 7-day mean of 40%; the mean is the number.
4. Present it as a **screen**: a short table (coin · HL APR · CEX APR · gap · 7-day mean · break-even days) and one line per row on why it is or is not real. No "expected return".

## Record

`command: "funding"`, `symbols`: the coin, or the screen's candidates. `question.type: "funding"`. `read.state`: the coin's state if it is obvious from funding + premium alone (`crowded-long`, `crowded-short`, `balanced-range`) plus modifiers, or `"funding-screen"` for the screen. `read.bias`: `neutral` unless the persistence read clearly favours one side being squeezed. `data.fundingAprPct` and `premiumPct` from the latest print. `scenarios`: the flip scenario when asked, else `null`. `risk: null`. `pitfalls`: `["01"]`, plus `"08"` for the screen.
