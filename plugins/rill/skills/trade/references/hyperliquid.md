---
type: Data Source
title: Hyperliquid data — hl.mjs commands and field dictionary
description: Every hl.mjs command with its flags and JSON output, what each normalized field means (funding APR, oiNotional, premium, ±1% depth, ATR), the 1 h vs 8 h funding-interval rule, the spot join, and the local OI ledger. Load on any doubt about a number.
tags: [hyperliquid, data, fields, funding, open-interest, order-book, candles, cli]
timestamp: 2026-09-21T00:00:00Z
---

# Hyperliquid data via `hl.mjs`

All data is `POST https://api.hyperliquid.xyz/info` — public, unauthenticated, read-only. `/exchange` (orders, transfers) is never called. Numbers on the wire are strings; the script converts them. `null` always means "not available", never zero.

Invocation (from `SKILL.md`; the permission rule matches commands that start with `node `):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" <command> [flags] --session ${CLAUDE_SESSION_ID}
```

Every successful call appends `{ venue, command, symbol, at }` to the session's turn file; that is how a turn gets counted. A failure prints one `hl: …` line on stderr and exits 1 (usage errors exit 2). One automatic retry on HTTP 429.

## Envelope

Row commands return `{ "as_of", "venue": "hyperliquid", "command", … }`. `as_of` is the timestamp you cite. `snapshot` returns the §Snapshot object directly.

## Commands

### `markets [--coin C] [--sort F] [--asc] [--limit N] [--include-delisted] [--boards]`

`metaAndAssetCtxs` → one row per perp (234 listed on 2026-09-21, 178 live; delisted hidden unless asked).

| Field | Meaning |
|---|---|
| `markPx` / `oraclePx` / `midPx` | mark (used for funding and liquidations), oracle (external index), book mid |
| `change24hPct` | `(markPx − prevDayPx) / prevDayPx × 100` |
| `fundingHrPct` | current hourly funding rate × 100 (HL funds every hour) |
| `fundingAprPct` | `fundingHrPct × 24 × 365` — carry per year if the rate held |
| `openInterest` | in coins (one side) |
| `oiNotional` | `openInterest × markPx`, USD |
| `dayNtlVlm` | 24 h notional volume, USD |
| `premiumPct` | `(mark − oracle) / oracle × 100` — perp rich (+) or cheap (−) vs index; feeds funding |
| `maxLeverage` | exchange cap (BTC 40) — the framework's ceiling is far below it |

Sort keys: `dayNtlVlm change24hPct fundingAprPct fundingHrPct openInterest oiNotional premiumPct markPx coin`. Numeric sorts descend; `--asc` flips. `--boards` returns six ranked lists in one call (`topVolume topGainers topLosers fundingHigh fundingLow topOi`, `--limit` rows each, default 10) — this is what `scan` uses.

### `spot [--pair P] [--sort F] [--asc] [--limit N] [--canonical-only]`

`spotMetaAndAssetCtxs` → one row per spot pair. `--pair` matches the pair name or the base token (`HYPE`, `HYPE/USDC`).

| Field | Meaning |
|---|---|
| `pair` | display name rebuilt from tokens, e.g. `HYPE/USDC` |
| `key` | the API's own name — `PURR/USDC` for the one canonical pair, `@107`-style for the rest; `book` / `candles` accept either |
| `base` / `quote` | token names; HL "unit" tokens are `UBTC`, `UETH`, `USOL` |
| `markPx` `midPx` `change24hPct` `dayNtlVlm` | as for perps |
| `circulatingSupply` / `marketCap` | supply from the API; cap = `markPx × circulatingSupply` |
| `canonical` | `isCanonical` from the API (only `PURR/USDC` today, so `--canonical-only` is rarely useful) |

The API's spot `ctxs` array is **not** parallel to `universe` (868 vs 329 rows); rows are joined on the ctx `coin` name.

### `mids [--coin SUBSTR]`

`allMids` + `spotMeta` → `{ coin, mid }` for every market (~1100). `@index` spot keys are resolved to pair names when `spotMeta.universe` lists them (329 of ~465 today; the rest pass through as `@index`); `#n` keys are builder-deployed perp-dex markets and pass through. Substring filter, case-insensitive. Use it to find a symbol.

### `book --coin C|PAIR [--depth N] [--n-sig-figs N]`

`l2Book` → `summary` + `levels`.

| Field | Meaning |
|---|---|
| `summary.bestBid` / `bestAsk` / `mid` | top of book |
| `summary.spreadBps` | `(ask − bid) / mid × 10 000` |
| `summary.depth1pctBidUsd` / `depth1pctAskUsd` | USD resting within 1% of mid on each side |
| `summary.depthCoverage.{bid,ask}` | `true` when the levels reached the 1% boundary; `false` means the number is a lower bound |
| `levels[]` | `side level px sz orders`, up to `--depth` (1–20, default 10) per side |

`l2Book` returns at most 20 levels. On a major that spans a few bps, so the script also fetches an aggregated book (`nSigFigs 3`) and uses it for the depth whenever the full-precision one does not reach 1%. `--n-sig-figs 2..5` aggregates the displayed levels instead (then depth comes from that book alone).

### `candles --coin C|PAIR [--interval 1h] [--limit N]`

`candleSnapshot` → the most recent `--limit` candles (default 100, max 5000) of `--interval` (`1m 3m 5m 15m 30m 1h 2h 4h 8h 12h 1d 3d 1w 1M`), ascending, plus `summary`:

| Field | Meaning |
|---|---|
| `summary.n` | candles returned (the last one is still forming) |
| `summary.changePct` | first open → last close |
| `summary.high` / `low` | window extremes |
| `summary.atr14` | mean true range of the last 14 candles, in price units — the noise unit for stops on that timeframe |

### `funding --coin C [--hours 24] [--limit N]`

`fundingHistory` → hourly prints (newest first in `rows`, `--limit` caps them) plus `summary` over the whole window:

| Field | Meaning |
|---|---|
| `rows[].fundingRatePct` / `fundingAprPct` / `premiumPct` | the print, annualized, and the premium that produced it |
| `summary.meanAprPct` / `minAprPct` / `maxAprPct` | level and range over the window |
| `summary.hoursPositive` / `hoursNegative` | persistence |
| `summary.signStreakHours` | consecutive hours with the current sign, **signed** (`−6` = six negative hours ending now) |

### `predicted [--coin C] [--sort F] [--asc] [--limit N]`

`predictedFundings` → one row per coin with each venue's *next* funding annualized:

| Field | Meaning |
|---|---|
| `hlAprPct` / `binanceAprPct` / `bybitAprPct` | next-interval rate ÷ its own interval hours × 24 × 365 × 100 |
| `hlVsBinancePct` / `hlVsBybitPct` | HL minus venue, in APR points; positive = HL longs pay more |
| `nextHlFunding` | ISO time of the next HL funding |
| `intervalHours` | `{ hl, binance, bybit }` — **HL is 1, Binance and Bybit are 8** (measured 2026-09-21; older docs say 4). Always annualize per row. |

Default sort is by absolute `hlVsBinancePct` (widest gaps first); `hlVs*` keys sort by magnitude, the rest signed.

### `snapshot --coin C`

Everything `analysis` needs, from nine parallel requests (~1 s): `metaAndAssetCtxs`, `fundingHistory` (7 d), `predictedFundings`, `l2Book` ×2, `candleSnapshot` ×3, `spotMetaAndAssetCtxs`.

```
as_of, venue, coin
market   markPx oraclePx midPx change24hPct premiumPct openInterest oiNotional oiChange1hPct oiChange24hPct dayNtlVlm maxLeverage
funding  hrPct aprPct
         hist7d { meanAprPct minAprPct maxAprPct hoursPositive hoursNegative signStreakHours }
         predicted { hlAprPct binanceAprPct bybitAprPct nextHlFunding }
book     bestBid bestAsk spreadBps depth1pctBidUsd depth1pctAskUsd
candles  1h { n:48 … } 4h { n:60 … } 1d { n:30 … }   each: n changePct high low atr14
spot     { pair markPx dayNtlVlm } | null
```

`spot` is the pair whose base is the coin or its unit token (`BTC` → `UBTC/USDC`), USDC quote preferred, highest volume wins; `null` when the coin has no HL spot market.

## The local OI ledger

The API reports open interest only as a current value. Every `snapshot` and `markets` call appends one `{ t, oi, px }` sample per coin to `~/.rill/oi/<COIN>.jsonl`; `snapshot` then reports `market.oiChange1hPct` (nearest sample 15 min–1 h 45 min old) and `oiChange24hPct` (16–32 h old). Both are `null` until enough history exists on this machine — say so, and use funding + premium instead of the quadrant until then. A daily `scan` keeps the 24 h delta alive for every coin.

## Symbols

Perps are bare names (`BTC`, `HYPE`, `kPEPE`, `PURR`). Spot pairs are `BASE/QUOTE` (`HYPE/USDC`, `UBTC/USDC`). `book` and `candles` take either. Unknown symbol → `mids --coin <substring>` or `markets`.
