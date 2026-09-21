---
type: Trading Pitfall
title: A per-trade cap without a daily loss limit is not risk management — perps never close
description: "1% per trade" bounds one trade, not one day; intraday perp trades on one coin are the same bet re-expressed, losses cluster, and a 24/7 market means "the day" never ends unless you define it — add a day stop (2–3× per-trade risk), a three-loss halt, and drawdown-tiered de-gearing.
severity: HIGH
appliesTo: risk-management, drawdown, tilt, intraday, position-sizing
ported_from: trade-skills p31, rewritten for perps
tags: [daily-loss-limit, drawdown, de-gearing, consecutive-losses, tilt, 24-7, recovery-asymmetry]
timestamp: 2026-09-21T00:00:00Z
---

## A per-trade cap without a daily loss limit is not risk management

**Severity: HIGH — five correctly-sized stops in one session is how disciplined accounts die.**

**The mistake**: risk is "1% per trade", full stop. There is no number for the day, no rule for a losing streak, and — because perps trade around the clock — no definition of what a day even is. The fifth attempt at 03:00 UTC is "just one more, the setup is finally clean".

**Why it happens**: the per-trade cap models trades as independent draws. Intraday perp trades on one coin are not independent — same instrument, same regime, same funding clock, same read. When the read is wrong it is wrong for all of them, and Hyperliquid's hourly funding print produces the *same* sweep every hour, so the same stop gets hit the same way. Losses degrade execution (tilt, size creep, chasing the funding-hour wick), so realized win rate falls as the trade count rises. Recovery is asymmetric: −10% needs +11%, −20% needs +25%, **−30% needs +43%**. And with no session close, "stop trading for the day" has no natural moment unless one is written down.

**The check**:

| governor | rule | protects against |
|---|---|---|
| **Day stop** | flat at **2–3× per-trade risk** lost (1% per trade → 2–3% day) | correlated clustering and tilt |
| **Streak halt** | **three stops in a row → flat**, regardless of dollars | a wrong regime read |
| **De-gearing** | −5% from equity high → size × 0.75 · −10% → × 0.5 · −15% → paper until a written review | slow bleed becoming terminal |
| **Define the day** | **00:00 UTC** (Hyperliquid's `dayNtlVlm` and funding clock are UTC) | "the day never ends" |

Before the first trade: bullets = day stop ÷ per-trade risk (at 1% and a 2.5% day stop: **two and a half**). Correlated positions (BTC + ETH, or HYPE perp + HYPE spot) are one bet with two tickets — sum their risk. "Stop for the day" means flat and closed, not smaller size.

**Example**: equity $10,000, 1% risk. Day stop $250. Session: three BTC longs into three funding-hour sweeps, −$100 each — the streak halt fires at −$300 (−3%) *and* the day stop was already breached at the third; flat until 00:00 UTC. The trader without governors takes a fourth and a fifth ("it has to bounce"), sizes the sixth at 2% "to get back to even", and ends the 20-hour session at **−8%** — needing +8.7% to recover, in a market that pays 0.03% a day to sit in the crowd. Two such sessions in a week trigger the −15% tier: no live trading until the read has been re-derived on paper.

**See also**: [`05-size-from-stop-distance-not-margin.md`](05-size-from-stop-distance-not-margin.md) (the per-trade layer; both are required); [`../perps-framework.md`](../perps-framework.md) §9; [`10-weekend-and-funding-hour-liquidity-illusion.md`](10-weekend-and-funding-hour-liquidity-illusion.md) (why the same sweep repeats every hour).
