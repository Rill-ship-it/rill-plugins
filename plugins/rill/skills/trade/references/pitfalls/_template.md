---
type: Trading Pitfall
title: Rule title — one line a trader would say
description: One-line relevance summary — what an agent reads to decide whether to load this file.
severity: HIGH | MEDIUM | LOW
appliesTo: comma-separated situations (e.g. funding, sizing, liquidity, cross-venue)
ported_from: (optional) source rule, e.g. trade-skills p30
tags: [short, tags]
timestamp: YYYY-MM-DDTHH:MM:SSZ
---

## Rule title

**Severity: HIGH — one-line impact.**

**The mistake**: what the trader does, in one or two sentences, in their own words.

**Why it happens**: the mechanism in the perp market that makes the mistake feel right — funding, OI, premium, liquidation engine, book shape, clock.

**The check**: two to five mechanical steps, with the `hl.mjs` field names and numeric thresholds that decide.

**Example**: real or realistic numbers, the wrong reading, the right reading, and the difference in dollars or percent.

**See also**: relative links to the framework section and neighbouring pitfalls.
