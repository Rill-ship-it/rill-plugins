---
type: Index
title: Perp Pitfalls — Index
description: Ten perp-specific mistakes (funding, OI, premium, liquidation clusters, sizing, daily limit, depth, cross-venue funding, HL-native spot, weekend/funding-hour liquidity), one file each, with lookup by situation.
tags: [index, pitfalls, perps]
timestamp: 2026-09-21T00:00:00Z
---

# Perp Pitfalls

One file per rule, loaded only when the situation matches. Each states the mistake, why it happens, the check that prevents it, and a worked example with numbers. Frontmatter per [`../OKF.md`](../OKF.md); new entries start from [`_template.md`](_template.md).

## Index

| # | Severity | Title | File |
|---|---|---|---|
| 01 | HIGH | Funding is a cost and a crowd count, not a direction | `01-funding-is-not-direction.md` |
| 02 | HIGH | The OI × price quadrant is a state, not a forecast — and a flipped quadrant is an exit | `02-oi-quadrant-is-state-not-forecast.md` |
| 03 | HIGH | Persistent premium + rising OI = leverage stacking; it mean-reverts at funding hours | `03-premium-plus-oi-is-leverage-stacking.md` |
| 04 | HIGH | Liquidation clusters sit at round numbers and obvious lows — put invalidation beyond them | `04-liquidation-clusters-and-round-numbers.md` |
| 05 | HIGH | Size comes from stop distance, never from margin and leverage | `05-size-from-stop-distance-not-margin.md` |
| 06 | HIGH | A per-trade cap without a daily loss limit is not risk management — perps never close | `06-no-daily-loss-limit.md` |
| 07 | HIGH | A tight top-of-book spread with thin ±1% depth cannot carry the size — or the stop | `07-tight-spread-thin-depth.md` |
| 08 | HIGH | Cross-venue funding gaps ignore fees, the 1 h vs 8 h interval mismatch, and basis drift | `08-cross-venue-funding-frictions-and-intervals.md` |
| 09 | MEDIUM | On HL-native tokens the perp is the price discovery — read spot-vs-perp divergence, not just the oracle | `09-hl-native-spot-volume-vs-perp-oi.md` |
| 10 | MEDIUM | Weekend and funding-hour depth is an illusion — the 24 h numbers include Friday | `10-weekend-and-funding-hour-liquidity-illusion.md` |

## Lookup by situation

- **"Funding is positive, so it's bullish" / "资金费率为正所以看多"**: **01**, **03**
- **"OI is rising with price, continuation"**: **02**, **03**
- **Premium has been positive for hours and OI keeps climbing**: **03**, **01**
- **Where to put the stop / invalidation**: **04**, **05**
- **"How much should I size / what leverage" / 仓位 / 杠杆**: **05**, **06**, **07**
- **Several losses today, "one more to make it back"**: **06**
- **Long-tail perp, spread looks fine**: **07**, **10**
- **"HL pays X%, Binance pays Y%, free money"**: **08**, **01**
- **HYPE / PURR / any token whose main market is HL**: **09**
- **Saturday, or a few minutes before the hour**: **10**, **07**

Four generic disciplines from `himself65/trade-skills` (MIT) are folded into [`../perps-framework.md`](../perps-framework.md) rather than kept as separate files: flip on invalidation (their p4 → framework §8 and pitfall 02 here), priced-in is a percentage (p5 → §0), a correct read is not a profitable trade (p28 → §10), read the second derivative (p29 → §2). Pitfalls 05 and 06 here are perp rewrites of their p30 and p31.
