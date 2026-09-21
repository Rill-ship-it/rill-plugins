---
type: Index
title: Rill Perps Knowledge Base — Bundle Root
description: OKF v0.1 entry point for the trade skill's references — the perps framework, the Hyperliquid field dictionary, five command references, and ten perp pitfalls.
tags: [index, okf, bundle-root, perps, hyperliquid]
timestamp: 2026-09-21T00:00:00Z
---

# Rill Perps Knowledge Base

The curated bundle behind `/rill:trade`. It is an [Open Knowledge Format (OKF) v0.1](OKF.md) bundle: markdown concept files with YAML frontmatter, cross-linked with relative links, loaded lazily from [`../SKILL.md`](../SKILL.md) (the always-on rules, command table and routing).

## Framework

| File | Type | What it covers |
|---|---|---|
| [`perps-framework.md`](perps-framework.md) | Framework | The fixed reading order for one perp: price → funding (level, APR, 7-day persistence, second derivative) → OI × price quadrant → premium / basis → liquidity and slippage for a size → multi-timeframe structure → the **eight named states** and modifiers → base / bull / bear scenarios → stop distance → size and leverage ceiling. Includes the `analysis` output template. |

## Data

| File | Type | What it covers |
|---|---|---|
| [`hyperliquid.md`](hyperliquid.md) | Data Source | Every `hl.mjs` command and flag, the JSON envelope, what each field means and how it is normalized (funding APR, oiNotional, premium, ±1% depth, ATR), the 1 h vs 8 h funding-interval note, the spot join, the local OI ledger. |

## Commands

| File | Command | Ends at |
|---|---|---|
| [`commands/scan.md`](commands/scan.md) | `scan` | Six boards read into three or four lines of "where is the crowd today" plus symbols worth an `analysis` |
| [`commands/analysis.md`](commands/analysis.md) | `analysis <COIN>` (default) | Named state + scenarios (+ plan if a trade was asked) |
| [`commands/funding.md`](commands/funding.md) | `funding [COIN]` | Carry read for one coin, or a cross-venue screen with frictions applied |
| [`commands/book.md`](commands/book.md) | `book <COIN>` | Spread, ±1% depth, slippage and max size for the book |
| [`commands/spot.md`](commands/spot.md) | `spot [PAIR]` | Spot price / volume / market cap, and spot-vs-perp divergence for HL-native tokens |

## Pitfalls

[`pitfalls/index.md`](pitfalls/index.md) — ten perp-specific mistakes (`Trading Pitfall`), one file each, with lookup by situation. Four generic rules from `himself65/trade-skills` (flip on invalidation, priced-in as a percentage, right-call-wrong-trade, second derivative) are folded into the framework and credited there.
