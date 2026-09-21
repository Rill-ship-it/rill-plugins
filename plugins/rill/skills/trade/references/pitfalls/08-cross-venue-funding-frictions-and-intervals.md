---
type: Trading Pitfall
title: Cross-venue funding gaps ignore fees, the 1 h vs 8 h interval mismatch, and basis drift
description: "HL pays 40% APR, Binance 10% — a 30% arb" is a screen, not a return — four taker legs cost ~0.2%, the HL leg reprices eight times before the CEX leg settles once, the two marks drift, and the gap closes precisely because it is visible. Compute break-even days from the 7-day mean, not the next print.
severity: HIGH
appliesTo: cross-venue, funding-arbitrage, carry, basis
tags: [funding-arb, cross-venue, binance, bybit, interval, fees, basis, break-even]
timestamp: 2026-09-21T00:00:00Z
---

## Cross-venue funding gaps ignore fees, intervals, and basis

**Severity: HIGH — the annualized number is real; the trade that captures it usually is not.**

**The mistake**: `predicted` shows HL at +40% APR and Binance at +10% for the same coin. "Short HL, long Binance, collect 30% a year." The gap is presented as a return.

**Why it happens**: the APR is an honest annualization of *one* interval, and the two venues are on different clocks. Hyperliquid funds every hour; Binance and Bybit every **8 hours** (`intervalHours` from `predictedFundings`, measured 2026-09-21; older docs still say 4). So the HL leg reprices eight times before the CEX leg settles once — the "next print" gap is not a rate you receive, it is a snapshot that will be re-taken eight times. On top of that: four taker legs in and out (HL ~0.035% each, CEX ~0.05%) ≈ **0.17–0.20% round trip**; the two perps' mark prices drift apart (basis), so a "neutral" pair carries mark-to-market risk; collateral sits on two venues; and the visible gaps are the ones arbs are already closing — the 7-day mean is a fraction of the print.

**The check**:

1. Annualize **per row interval** (the script does). Read `intervalHours` and `nextHlFunding`; note when the CEX settles.
2. Daily gap = `|hlVsBinancePct| ÷ 365`. Break-even days = round-trip fees ÷ daily gap. Anything above ~10 days is not a trade.
3. Persistence: `funding --coin X --hours 168` → `summary.meanAprPct`; use the **7-day mean gap**, not the print. A one-hour spike at 300% APR often has a 7-day mean under 40%.
4. Drop gaps under **15 APR points** — they do not survive fees plus one adverse basis move.
5. State the basis risk: the two marks can move 0.3–0.5% apart in a fast market, which is a month of the gap.
6. Present it as a **screen** with columns coin · HL APR · CEX APR · gap · 7-day mean · break-even days, and one line per row on why it is or is not real. No "expected return".

**Example** (2026-09-21): BTC HL **10.95%** vs Bybit **8.45%** → 2.5 points → 0.0068% per day → with 0.17% fees, **25 days to break even**, before basis. Not a trade. XMR the same morning: HL **278%** APR on the print → daily 0.76%. Against a CEX at (say) 60%, the gap is 218 points → break-even **under one day** — but the 7-day mean on HL is what decides whether the print exists tomorrow, and a 278% print typically means the premium is already reverting ([`03-premium-plus-oi-is-leverage-stacking.md`](03-premium-plus-oi-is-leverage-stacking.md)). The honest screen line: "real for hours, not for weeks; size for the basis, and expect the gap to halve by the CEX settle."

**See also**: [`../commands/funding.md`](../commands/funding.md); [`01-funding-is-not-direction.md`](01-funding-is-not-direction.md); [`../hyperliquid.md`](../hyperliquid.md) (`predicted`).
