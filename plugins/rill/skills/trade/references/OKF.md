---
type: Specification
title: Open Knowledge Format (OKF) Conformance
description: How this bundle maps to OKF v0.1 — type vocabulary, frontmatter schema, and file conventions. Read when adding or editing a reference file.
tags: [okf, conformance, schema, meta]
timestamp: 2026-09-21T00:00:00Z
---

# OKF Conformance

This `references/` tree is an [Open Knowledge Format v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) bundle: one concept per markdown file, YAML frontmatter, relative links between files, and a reserved `index.md` in every directory. The layout follows `himself65/trade-skills` (MIT); the content is Rill's perps framework.

## Frontmatter

| Field | Role | Notes |
|---|---|---|
| `type` | required | one of the types below |
| `title` | recommended | human-readable |
| `description` | recommended | one line — what an agent reads to decide whether to load the file |
| extension fields | per type | pitfalls: `severity`, `appliesTo`, `ported_from` (optional) |
| `tags` | recommended | YAML array |
| `timestamp` | recommended | ISO 8601 UTC, last substantive edit |

Order: `type`, `title`, `description`, extension fields, `tags`, `timestamp`.

## Types used here

| `type` | Location |
|---|---|
| `Framework` | `perps-framework.md` |
| `Data Source` | `hyperliquid.md` |
| `Command Reference` | `commands/*.md` |
| `Trading Pitfall` | `pitfalls/NN-slug.md` |
| `Index` | `index.md` in each directory |
| `Specification` | this file |

## Adding a pitfall

Copy [`pitfalls/_template.md`](pitfalls/_template.md), keep the `NN-slug.md` numbering, fill every frontmatter field, add a row to [`pitfalls/index.md`](pitfalls/index.md), and link it from the command file(s) where it applies.
