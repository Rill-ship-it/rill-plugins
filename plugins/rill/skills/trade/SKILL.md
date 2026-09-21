---
name: trade
description: >-
  Hyperliquid perp & spot analysis with Rill's perps framework (read-only public data; needs /rill:login).
  Use for: Hyperliquid, HL, perp, perpetual, perps, contract, funding, funding rate, carry, OI, open interest,
  order book, depth, slippage, leverage, liquidation, basis, premium, cross-venue funding (HL vs Binance vs
  Bybit), market scan, "how is BTC", "can I short ETH", "which funding is most extreme", a bare coin like
  HYPE / SOL. 中文: 永续 / 合约 / 资金费率 / funding / 持仓量 / OI / 盘口 / 深度 / 杠杆 / 爆仓 / 溢价 / 基差 /
  套利 / "BTC 现在怎么样" / "ETH 能不能空" / "资金费率哪个最极端" / "扫一眼 HL". Aster and Lighter: answers
  "not connected yet". Commands: scan | analysis <COIN> | funding [COIN] | book <COIN> | spot [PAIR].
allowed-tools: Bash(node *scripts/hl.mjs*) Bash(node *scripts/rill.mjs*)
argument-hint: "[scan | analysis <COIN> | funding [COIN] | book <COIN> | spot [PAIR] | <COIN or question>]"
metadata:
  okf_version: "0.1"
  okf_conformance: references/OKF.md
---

# Rill Trade — Hyperliquid perps

Read-only perp/spot analysis on Hyperliquid's public info API, in Rill's perps framework. The bundled scripts pull the numbers; you read them in a fixed order, name the state, give scenarios, and write the record. Nothing here places orders.

## Login status

Rill status: !`node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" status --brief`

- `SIGNED_IN uid=… daily=v/t` → proceed.
- `NOT_SIGNED_IN` → **do not analyse and do not run `hl.mjs`.** Say that Hyperliquid analysis is a Rill feature that needs a signed-in Rill account, and point to `/rill:login` (it opens the browser for a wallet login and takes under a minute). Do not answer the market question.
- `SIGNED_IN uid=… daily=?/?` → signed in, progress temporarily unavailable; proceed normally.

## Hard rules (apply to every command)

1. **Price it before you predict it.** Before any view, state what the market is already trading: funding sign and size, OI change, premium, cross-venue funding gap. "Priced in" is a percentage, not yes/no.
2. **Funding is not a direction signal.** High positive funding = crowded longs = both sides can get squeezed. Read it as cost of carry and crowding only ([pitfall 01](references/pitfalls/01-funding-is-not-direction.md)).
3. **OI × price is a state, not a forecast.** OI↑ px↑ new longs · OI↑ px↓ new shorts · OI↓ px↑ short covering · OI↓ px↓ long liquidation. Name the quadrant; never turn it into a call on its own ([pitfall 02](references/pitfalls/02-oi-quadrant-is-state-not-forecast.md)).
4. **Depth ≠ liquidity.** Report spread (bps) and ±1% depth (USD) and compute slippage for a stated size. Long-tail perps usually cannot carry the size the analysis implies ([pitfall 07](references/pitfalls/07-tight-spread-thin-depth.md)).
5. **Stop distance sets size, never the reverse.** Invalidation level → stop distance → `size = risk$ ÷ stop distance`. A stop under 0.2 ATR is noise. Give a daily loss limit. Leverage is an output, not an input ([pitfalls 05](references/pitfalls/05-size-from-stop-distance-not-margin.md), [06](references/pitfalls/06-no-daily-loss-limit.md)).
6. **Funding arbitrage is a screen, not a return.** A cross-venue gap must survive fees on both legs, interval mismatch (HL 1 h vs Binance/Bybit 8 h) and basis drift ([pitfall 08](references/pitfalls/08-cross-venue-funding-frictions-and-intervals.md)).
7. **Read-only.** Never call `/exchange`, never sign, never generate order code. "Open the position for me" → decline and give the manual parameters (side, size, entry zone, stop, leverage).
8. **Scenarios, not a point.** Always base / bull / bear with probabilities that sum to 1, each with a trigger, target and invalidation. A broken invalidation means flip or stand aside, never hold.
9. **Mirror the user's language** (Chinese in → Chinese out). Every number cites its timestamp: the `as_of` the script returned.
10. **End every reply with exactly this line:** `Not financial advice — Hyperliquid public data, read-only; no orders are placed.`

## Commands

| Command | What it answers | Data | Reference |
|---|---|---|---|
| `scan` | The whole market at a glance: volume top, gainers / losers, funding both extremes, OI notional top | `markets --boards` | [commands/scan.md](references/commands/scan.md) |
| `analysis <COIN>` (default) | One symbol, full read: price / 24 h → funding (hourly, APR, 7-day persistence) → OI × price quadrant → premium / basis → book → multi-timeframe structure → **named state** → scenarios → (if a trade is asked) stop distance → size | `snapshot` | [commands/analysis.md](references/commands/analysis.md) |
| `funding [COIN]` | Funding / carry / cross-venue screen (HL vs Binance vs Bybit) | `predicted` + `funding` | [commands/funding.md](references/commands/funding.md) |
| `book <COIN>` | Order book: spread bps, ±1% depth, slippage for a given size | `book` | [commands/book.md](references/commands/book.md) |
| `spot [PAIR]` | Spot: price, volume, market cap, the pair behind a coin; spot vs perp divergence for HL-native tokens | `spot` | [commands/spot.md](references/commands/spot.md) |

### Routing

1. **No argument** → show the table above as a menu and ask what to look at.
2. **First word is `scan`, `analysis`, `funding`, `book` or `spot`** → load that reference file and follow it; the rest of the input is the argument.
3. **Anything else** → `analysis`, with the whole input as the target ("BTC 怎么样", "ETH 能不能空", "HYPE", "is SOL funding about to flip"). Extract the coin; if none is named, ask.
4. **Aster / Lighter** (or any venue other than Hyperliquid) → say it is not connected yet (Hyperliquid only for now) and offer the Hyperliquid read of the same symbol.

## Running the data scripts

Only these two scripts touch the network. Invoke them exactly like this — absolute path, `--session` on every `hl.mjs` call, no `cd`, no env prefix (the permission rule matches commands that start with `node `):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" <command> [flags] --session ${CLAUDE_SESSION_ID}
node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" <command> [flags]
```

- Output is JSON; you do the formatting. Never paste raw JSON to the user.
- A non-zero exit prints one `hl: …` line on stderr. Relay it and stop; never invent numbers. Unknown symbol → run `markets` (or `mids --coin <substring>`) to find the right one.
- Field meanings and every flag: [references/hyperliquid.md](references/hyperliquid.md). The framework: [references/perps-framework.md](references/perps-framework.md).

## Mandatory last step — write the record

Every command (`scan`, `analysis`, `funding`, `book`, `spot`) ends by writing one `rill.analysis/1` record to this turn. Do it **after** your final read is settled and **before** the closing reply. Use exactly this heredoc form (single-quoted delimiter so nothing expands), JSON on stdin:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" record --session ${CLAUDE_SESSION_ID} <<'JSON'
{
  "schema": "rill.analysis/1",
  "venue": "hyperliquid",
  "symbols": ["BTC"],
  "command": "analysis",
  "question": { "type": "direction", "horizon": "days", "language": "zh" },
  "read": { "state": "crowded-long", "bias": "neutral", "confidence": 0.62, "summary": "One-sentence conclusion, ≤ 280 chars." },
  "data": { "as_of": "2026-09-21T06:12:51Z", "price": 81708, "change24hPct": 1.46, "fundingAprPct": 10.95, "oiNotionalUsd": 3.53e9, "premiumPct": 0.056, "spreadBps": 0.12 },
  "scenarios": [
    { "name": "base", "probability": 0.5, "trigger": "…", "target": "…", "invalidation": "…" },
    { "name": "bull", "probability": 0.3, "trigger": "…", "target": "…", "invalidation": "…" },
    { "name": "bear", "probability": 0.2, "trigger": "…", "target": "…", "invalidation": "…" }
  ],
  "risk": { "entry_zone": "…", "invalidation": "…", "stop_distance_pct": 2.1, "size_rule": "risk$ ÷ 2.1%", "max_leverage": 5 },
  "pitfalls": ["01", "03"]
}
JSON
```

Required: `schema`, `venue`, `symbols`, `command`, `read.state`, `read.bias` (`long | short | neutral`), `read.summary`. `read.state` is one of the named states in [perps-framework.md](references/perps-framework.md) (plus modifiers). `risk` is `null` when no trade was asked. `question.type` ∈ `direction | entry | exit | funding | liquidity | overview | other`; `horizon` ∈ `intraday | days | weeks | unspecified`. For `scan`, `symbols` lists the coins you actually discussed. Each command file says which fields it fills. If the script rejects the record, fix the listed keys and run it again — do not skip it.

## Reply shape

Short headline with the state, then the numbered read in the order the command file gives, then scenarios, then (only if asked) the plan, then the pitfalls in play, then the disclaimer line. Numbers carry units and the `as_of` time. No tables wider than five columns. No raw JSON.

## References (load lazily)

| File | Load when |
|---|---|
| [references/perps-framework.md](references/perps-framework.md) | Every `analysis`; any time you name a state, size a trade, or build scenarios |
| [references/hyperliquid.md](references/hyperliquid.md) | Any doubt about a field, a flag, or what a number means |
| [references/commands/*.md](references/commands/) | The command being run |
| [references/pitfalls/index.md](references/pitfalls/index.md) | Lookup by situation; load the individual pitfall files that apply |
| [references/index.md](references/index.md) | Bundle root (OKF) |
