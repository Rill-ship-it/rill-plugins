---
type: Command Reference
title: "/rill:trade spot [PAIR]"
description: Hyperliquid spot — price, volume, market cap and the pair behind a coin; for HL-native tokens, the spot-vs-perp divergence that says which venue is leading.
tags: [command, spot, market-cap, divergence, hl-native]
timestamp: 2026-09-21T00:00:00Z
---

# /rill:trade spot [PAIR]

**Question it answers:** what is this token doing in spot, how big is it, and — for tokens whose main market *is* Hyperliquid — is the perp leading the spot or the other way round?

## Arguments

- A pair (`HYPE/USDC`), a base token (`HYPE`, `PURR`), or nothing (the most active pairs).
- BTC / ETH / SOL spot on HL are the unit tokens `UBTC / UETH / USOL`; say so when the user asks for "BTC spot".

## Data

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" spot --pair <BASE> --session ${CLAUDE_SESSION_ID}          # one token, all its quotes
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" spot --sort dayNtlVlm --limit 15 --session ${CLAUDE_SESSION_ID}   # no argument
```

For the divergence read add `markets --coin <BASE>` (perp mark, oracle, OI, funding). `--canonical-only` hides everything but `PURR/USDC` today, so leave it off.

## Read order

1. **The pair** — `pair`, `key`, `quote`; if several quotes exist (USDC / USDT0 / USDH), the USDC one is the reference and the rest are quoted with their volume share.
2. **Price and volume** — `markPx`, `change24hPct`, `dayNtlVlm`; `marketCap` from circulating supply (say it is on-chain circulating, not fully diluted).
3. **Perp vs spot** — for the same base: perp `markPx` − spot `markPx` in bps, perp `oraclePx` vs spot, `oiNotional ÷ spot dayNtlVlm`. A ratio above ~20 means the perp is the tail wagging the dog; the premium's sign says which way ([pitfall 09](../pitfalls/09-hl-native-spot-volume-vs-perp-oi.md)).
4. **Liquidity** — if the user names a size, run `book --coin <PAIR>` and apply [`book.md`](book.md).
5. **No argument** — the top 15 by volume in one short table (pair · price · 24 h · volume · cap) and two lines on what is active.

## Output

```
**<PAIR> spot · <as_of UTC>** — $… (24 h …%) · vol $… · cap $…
Perp vs spot: mark …bps vs spot · OI/spot-volume …× · premium …% → <who is leading>
Not financial advice — Hyperliquid public data, read-only; no orders are placed.
```

## Record

`command: "spot"`, `symbols: ["<BASE>"]` (base token, upper-case), `question.type: "overview"` (or `"liquidity"` when a size was asked). `read.state`: `"spot-read"`, add `+spot-divergence` when perp mark and spot differ by more than 20 bps or OI/spot volume > 20. `read.bias: "neutral"` unless the divergence clearly loads one side. `data`: `as_of`, `price` (spot mark), `change24hPct`. `scenarios: null`, `risk: null`. `pitfalls`: `["09"]` when the divergence read was made.
