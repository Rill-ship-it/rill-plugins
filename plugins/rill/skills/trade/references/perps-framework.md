---
type: Framework
title: Rill perps framework — from snapshot to a named state, scenarios and size
description: The fixed reading order for one perpetual — price → funding (level, APR, persistence, second derivative) → OI × price quadrant → premium / basis → liquidity and slippage for a stated size → multi-timeframe structure → one of eight named states → base / bull / bear scenarios → stop distance → size and leverage ceiling. Load for every analysis and whenever a state is named or a trade is sized.
tags: [framework, perps, funding, open-interest, premium, liquidity, structure, scenarios, sizing, leverage]
timestamp: 2026-09-21T00:00:00Z
---

# Rill perps framework

One perp, one fixed order, one named state. Every step reads a field of `snapshot` ([`hyperliquid.md`](hyperliquid.md)); nothing here needs data the script does not return. Four generic disciplines are folded in from `himself65/trade-skills` (MIT) — flip on invalidation (p4), priced-in is a percentage (p5), a correct read is not a profitable trade (p28), read the second derivative (p29) — rewritten for perps.

## 0. Pricing before forecasting

State what the market is already paying for before any view. In a perp, "priced in" is literally visible: funding is the price of being long, premium is how far the perp trades from index, OI is how much leverage is committed, the cross-venue gap is where the crowd sits relative to CEX. Write these four numbers down first; the forecast is only what you think happens *relative* to them. A view identical to the funding sign with no gap to the 7-day mean has no edge, however correct.

## 1. Price and change

`market.markPx`, `change24hPct`, and where the price sits inside each candle window: `pos = (markPx − low) / (high − low)` for 1d, 4h, 1h. Level (`pos` near 0 or 1 = at an extreme), direction (sign of `changePct`), acceleration (1h change vs 4h change on a per-hour basis). Say all three. "Up 6% on the month, flat on the day, fading on the hour" is one sentence and three facts.

## 2. Funding

| Read | Field | Rule |
|---|---|---|
| Cost now | `funding.hrPct` | what a long pays a short this hour (negative: shorts pay) |
| Carry | `funding.aprPct` | `hr × 24 × 365`; the number to compare across coins |
| Persistence | `hist7d.hoursPositive / hoursNegative`, `signStreakHours` | 150+ positive hours of 168 with a long streak = an established regime, not a spike |
| Level vs own history | `aprPct` vs `hist7d.meanAprPct / minAprPct / maxAprPct` | at or beyond the 7-day extreme → `+funding-extreme` |
| Second derivative | current `aprPct` vs `meanAprPct` and the last few `funding` prints | *"high but falling"* is a different state from *"high"* — the turn trades, the level does not |
| Cross-venue | `funding.predicted.*` | HL above CEX = the leverage lives here; below = it lives there (see [`commands/funding.md`](commands/funding.md)) |

Crowding bands (APR): `|apr| < 10` neutral · `10–30` leaning · `30–60` crowded · `> 60` extreme. Funding is **cost and crowding**, never direction ([pitfall 01](pitfalls/01-funding-is-not-direction.md)). At +60% APR a long pays 0.16% a day: fine for a two-day trade, fatal for a two-month one — say the holding-period cost explicitly.

## 3. OI × price quadrant

Needs `market.oiChange24hPct` (and `oiChange1hPct` for the intraday version) from the local ledger. Thresholds: flat = `|ΔOI| < 3%` and `|Δpx| < 2%` (or < 0.5 × daily ATR%).

| ΔOI | Δpx | Quadrant | What is happening |
|---|---|---|---|
| ↑ | ↑ | **new longs** | fresh leverage buying; durable while funding stays moderate |
| ↑ | ↓ | **new shorts** | fresh leverage selling; squeeze fuel if funding goes negative |
| ↓ | ↑ | **short covering** | the rally is closing positions, not opening them; weak follow-through |
| ↓ | ↓ | **long liquidation** | forced selling; ends when OI stops falling, not when price looks cheap |

The quadrant is a *state*. It says who is doing what; it never says what comes next on its own ([pitfall 02](pitfalls/02-oi-quadrant-is-state-not-forecast.md)). When `oiChange24hPct` is `null` (first run on this machine), say the quadrant is unavailable, tag the state `+no-oi-history`, and lean on funding + premium.

## 4. Premium / basis

`market.premiumPct` = (mark − oracle) / oracle. It is the *instantaneous* pressure that funding later charges for. Rules:

- Premium persistently positive **and** OI rising **and** funding rising = leverage stacking. It mean-reverts at funding timestamps, often violently ([pitfall 03](pitfalls/03-premium-plus-oi-is-leverage-stacking.md)).
- Premium ≈ 0 with a large move = the move is spot/oracle-led, not perp-led → the more durable kind.
- Spot ≠ oracle: for HL-native tokens compare `spot.markPx` with `market.markPx` and `market.oraclePx` ([pitfall 09](pitfalls/09-hl-native-spot-volume-vs-perp-oi.md)).

## 5. Liquidity for a size

From `book`: `spreadBps`, `depth1pctBidUsd` (support for a sell), `depth1pctAskUsd` (supply for a buy). For a stated size `S` (USD) on the side you would trade:

```
share    = S / depth1pct(side)
slippage ≈ share × 100 bps + spreadBps / 2          (linear walk; a lower bound)
share ≤ 5%   → fine        5–20% → widen the stop by the slippage        > 20% → the book cannot carry it
```

Liquidations exit at market into this book. A tight top-of-book spread with thin ±1% depth is the classic long-tail trap ([pitfall 07](pitfalls/07-tight-spread-thin-depth.md)); a coin whose `depth1pct` on either side is under ~$200k is tagged `+thin-book`, and its leverage ceiling drops to 2×. Weekends and the minutes around funding timestamps are thinner than the numbers suggest ([pitfall 10](pitfalls/10-weekend-and-funding-hour-liquidity-illusion.md)).

## 6. Structure from the candle summaries

| Window | Role | Use |
|---|---|---|
| `1d` (30 candles) | regime | trend direction, monthly range, `atr14` in $ for swing stops |
| `4h` (60 candles = 10 days) | swing | where price sits in the 10-day range, the level that must hold |
| `1h` (48 candles) | execution | today's range, `atr14` for intraday stops, acceleration |

`atr14` is the noise unit for that timeframe. A stop closer than `0.2 × atr14` of the timeframe you hold on is noise. Round numbers and the previous day's / week's extremes are where liquidation clusters sit ([pitfall 04](pitfalls/04-liquidation-clusters-and-round-numbers.md)); place invalidation beyond them, not at them.

## 7. Name the state

Exactly one of these eight, plus zero or more modifiers. The record's `read.state` uses these strings.

| State | ΔOI | Δpx | Funding (APR) | Premium | Read |
|---|---|---|---|---|---|
| `new-longs` | ↑ | ↑ | 0 … +30 | ≥ 0 | leverage buying, still moderate |
| `crowded-long` | ↑ / flat | ↑ / flat | > +30, or at 7-day max with a long positive streak | persistently + | everyone is already long; both sides squeezable |
| `new-shorts` | ↑ | ↓ | ≤ 0 or falling fast | ≤ 0 | leverage selling |
| `crowded-short` | ↑ / flat | ↓ / flat | < −20 | persistently − | short-squeeze fuel |
| `short-covering` | ↓ | ↑ | any (often − → 0) | any | positions closing; rally lacks new buyers |
| `long-liquidation` | ↓ | ↓ | + → 0 | any | forced selling; wait for OI to stop falling |
| `balanced-range` | flat | flat | −10 … +10 | ≈ 0 | no positioning edge; carry only |
| `spot-led` | flat / ↓ | ↑ or ↓ | −10 … +10 | ≈ 0 | move driven by spot/oracle, perp following |

Modifiers: `+funding-extreme` (APR at or beyond the 7-day range, or `|apr| > 60`) · `+thin-book` (§5) · `+no-oi-history` (§3) · `+weekend` / `+funding-hour` (§5, pitfall 10) · `+spot-divergence` (HL-native, pitfall 09).

Write it as `crowded-long +funding-extreme`. Then one or two sentences on *why* — the numbers that put it there.

## 8. Scenarios

Three, probabilities summing to 1, each with a **trigger** (what has to print), a **target** (a level from §6), and an **invalidation** (the level or reading that kills it). Anchor each on the state:

| State | Base usually | Bull usually | Bear usually |
|---|---|---|---|
| crowded-long | chop while funding bleeds longs | spot-led breakout that resets funding | funding-hour flush toward the 4h low |
| crowded-short | grind up on covering | squeeze through the 1d high | fresh shorts win, OI keeps rising as price falls |
| short-covering | rally stalls when OI stops falling | OI turns up at the highs (new longs) | reversal once covering is done |
| long-liquidation | bleed until OI flattens | sharp reclaim once OI has reset | cascade through the next cluster |
| balanced-range | range holds | range break with OI↑ | range break with OI↑ |
| spot-led | trend continues at spot's pace | perp joins (OI↑, funding↑) → faster | spot stalls, perp premium stays → reversal |

If a scenario's invalidation prints, the read is wrong: flip or stand aside. Never widen the invalidation to keep a view alive.

## 9. Sizing (only when a trade is asked)

Order of operations is fixed; leverage is the last number, not the first ([pitfall 05](pitfalls/05-size-from-stop-distance-not-margin.md)):

```
invalidation       from §6 / §8, beyond the cluster, not on it
stop_distance_pct  = |entry − invalidation| / entry
noise check        stop_distance ≥ 0.2 × atr14(holding timeframe) / entry   — else no trade at any size
risk$              = equity × per-trade risk (default 1%; never above 2%)
notional           = risk$ ÷ stop_distance_pct
leverage           = notional ÷ equity
ceiling            = min(5× majors (BTC ETH SOL), 3× everything else, 2× if +thin-book, maxLeverage ÷ 4)
                     leverage > ceiling → cut notional to ceiling × equity (risk falls; the stop does not move)
slippage           §5 with S = notional; > 20% share → the book decides the size, not the account
daily loss limit   2–3 × risk$; three stops in a row → flat for the day (pitfall 06)
carry              funding.aprPct ÷ 365 × days held, as a % of notional — subtract it from the target
```

State the plan as: side · entry zone · invalidation · stop % · size (USD and coins) · leverage · daily limit · carry per day. The user executes; the skill never does.

## 10. A correct read is not a profitable trade

Four independent kill switches (from trade-skills p28): **already priced** (funding/premium already sit where your view says they will go), **no catalyst inside the holding period** (you pay funding while waiting), **contaminated expression** (a beta trade dressed as an idiosyncratic one — check BTC's state before an alt's), **vol-inappropriate size** (§9 says 1×, conviction says 5×: §9 wins). Any one failing is a no-trade, not a smaller trade.

## Output template for `analysis`

```
**<COIN> · Hyperliquid perp · <as_of UTC>** — `<state> +modifiers`

1. Priced in: mark $… (24h …%) · funding …%/h = … APR (7d mean …, streak …h) · OI $… (24h …%) · premium …% · HL vs Binance … pts
2. State: <state> — <two sentences with the numbers>
3. Structure: 1d … (pos …, ATR $…) · 4h … · 1h …
4. Liquidity: spread … bps · ±1% depth $… / $… · <size> → ~… bps slippage
5. Scenarios: base p=… (trigger / target / invalidation) · bull p=… · bear p=…
6. Plan (only if asked): side · entry zone · invalidation · stop …% · size … · leverage …× (ceiling …×) · daily limit … · carry …%/day
7. Pitfalls in play: NN, NN
Not financial advice — Hyperliquid public data, read-only; no orders are placed.
```

Mirror the user's language for the prose; keep the state string, field names and the disclaimer line in English.
