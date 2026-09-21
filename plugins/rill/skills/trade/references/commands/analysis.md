---
type: Command Reference
title: "/rill:trade analysis <COIN>"
description: The default flow — one perp, one snapshot, the framework's fixed order, a named state, three scenarios, and a sized plan only when a trade is asked.
tags: [command, analysis, snapshot, state, scenarios, sizing]
timestamp: 2026-09-21T00:00:00Z
---

# /rill:trade analysis <COIN>

Runs for `analysis BTC`, for a bare coin, and for any question that does not match another command ("BTC 现在怎么样", "can I short ETH here", "is HYPE funding going to flip"). Load [`../perps-framework.md`](../perps-framework.md) before reading the data.

## Arguments

- **Coin** — bare perp name, upper-cased (`btc` → `BTC`). "Bitcoin" → `BTC`, "以太" → `ETH`, "sol" → `SOL`. Not sure it exists → `mids --coin <substring>` first.
- **Question type** — infer for the record: `direction` (which way), `entry` (where to get in), `exit` (hold / close), `funding` (will funding flip, carry), `liquidity` (can the book take size), `overview` (how is it), `other`.
- **Horizon** — from wording (`今天` / "today" → intraday; "this week" → days; "swing" → weeks; else `unspecified`). It picks the stop timeframe in §6 of the framework.
- **Trade asked?** — "should I long", "帮我开仓", "size", "leverage", "stop" → yes: run §9. Otherwise stop at scenarios. An explicit "open it for me" → decline (hard rule 7) and still give the manual parameters.
- **Size / equity** — if a trade is asked and neither is given, ask once; if the user declines, size per $10k equity at 1% risk and say so.

## Data

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" snapshot --coin <COIN> --session ${CLAUDE_SESSION_ID}
```

One call, ~1 s, everything in [`../hyperliquid.md`](../hyperliquid.md#snapshot---coin-c). Add `book --coin <COIN> --depth 20` only when the user names a size above ~2% of `depth1pct`, and `funding --coin <COIN> --hours 168` only when the funding second derivative is the question (the 7-day summary is already in the snapshot).

## Read order (framework sections)

1. §0 Pricing — the four numbers, before any view.
2. §1 Price — level, direction, acceleration across 1d / 4h / 1h.
3. §2 Funding — cost, carry, persistence, level vs 7-day range, second derivative, cross-venue.
4. §3 Quadrant — from `oiChange24hPct`; `null` → say so, tag `+no-oi-history`.
5. §4 Premium — stacking check; spot vs perp if `spot` is not null.
6. §5 Liquidity — spread, ±1% depth; slippage for the stated size or, absent one, for 1% of `depth1pct`.
7. §6 Structure — range position and ATR per timeframe; where the clusters sit.
8. §7 **State** — one of the eight, plus modifiers, plus two sentences of why.
9. §8 Scenarios — base / bull / bear, probabilities to one decimal, trigger / target / invalidation.
10. §9 Plan — only if a trade was asked.
11. §10 Kill switches — one line each when a trade was asked; skip when not.

## Output

Use the template at the end of [`../perps-framework.md`](../perps-framework.md#output-template-for-analysis). Headline = coin, venue, `as_of`, state. Numbers with units. Mirror the user's language; keep the state string and the disclaimer in English.

## Record

`command: "analysis"`, `symbols: ["<COIN>"]`, `question: { type, horizon, language }`, `read: { state, bias, confidence, summary }` — `bias` follows the base scenario's direction (`neutral` for range/chop), `confidence` = base-scenario probability. `data`: `as_of`, `price` (`markPx`), `change24hPct`, `fundingAprPct`, `oiNotionalUsd`, `premiumPct`, `spreadBps`. `scenarios`: the three you gave. `risk`: the §9 plan (`entry_zone`, `invalidation`, `stop_distance_pct`, `size_rule`, `max_leverage`) or `null`. `pitfalls`: the numbers you cited.
