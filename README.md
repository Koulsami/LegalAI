# Reasonex — LegalAI Engine

Deterministic legal reasoning for Singapore's Misrepresentation Act 1967.

> **"Same facts → same answer, every time."**

---

## What This Is

A hybrid AI system that separates language understanding from legal reasoning:

- **LLM layer** — extracts structured facts from contract documents, emails, and statements
- **Deterministic layer** — classifies misrepresentation type and available remedies via a rule graph; no probability, no hallucination
- **Validation Firewall** — SHA-256 hashes protect legal classifications before any explanation is generated; LLM cannot corrupt the outcome

Built for Singapore lawyers, litigation teams, and legal tech platforms handling property, commercial, and contract disputes.

---

## Architecture

```
Documents → [LLM Extraction] → FactBundle → [Deterministic Reasoning] → ReasoningResult
                                                      ↓
                                          [Validation Firewall]
                                                      ↓
                                              FinalReport (auditable)
```

| Module | Role | LLM? |
|---|---|---|
| `src/extraction/` | Structured fact extraction from documents | ✅ Only here |
| `src/knowledge/` | Loads YAML rule graph (23 nodes) | ❌ |
| `src/validation/` | Validates FactBundle completeness | ❌ |
| `src/reasoning/` | DAG traversal → classification + remedies | ❌ |
| `src/firewall/` | SHA-256 hash/verify protected fields | ❌ |
| `src/orchestrator/` | Sequences the pipeline | ❌ |
| `src/api/` | Express REST endpoint | ❌ |

---

## Domain Coverage

Singapore Misrepresentation Act 1967 — 23-node Conditional Reasoning Graph:

- **Elements layer (E1–E7):** Was a representation made? Was it false? Was it relied on?
- **Classification layer (C1–C4):** Fraudulent / Negligent (statutory) / Negligent (common law) / Innocent
- **Remedies layer (R1–R3):** Rescission, damages, indemnity
- **Bars layer (B1–B7):** Affirmation, lapse of time, third-party rights, UCTA reasonableness

---

## Tech Stack

- **Runtime:** Node.js 20 / TypeScript 5.3
- **Knowledge base:** YAML files (version-controlled, expert-editable)
- **LLM:** Azure OpenAI (extraction only)
- **Hashing:** Node.js built-in `crypto` (SHA-256)
- **API:** Express
- **Tests:** Jest + fast-check (property-based)

---

## Repository Structure

```
LegalAI/
├── CLAUDE.md                          ← Architect instructions (read first)
├── src/
│   ├── types/index.ts                 ← Canonical types — single source of truth
│   ├── knowledge/                     ← YAML loader + graph builder
│   ├── extraction/                    ← LLM extraction (only LLM calls here)
│   ├── validation/                    ← FactBundle validation
│   ├── reasoning/                     ← Deterministic DAG traversal
│   ├── firewall/                      ← Validation Firewall (SHA-256)
│   ├── orchestrator/                  ← Pipeline sequencer
│   ├── api/                           ← Express routes
│   └── utils/                         ← Logger, helpers
├── knowledge/
│   └── misrepresentation/             ← 23 YAML rule files
│       ├── E1-representation-made.yaml
│       └── ...
└── tests/
    ├── gold/                          ← Riviera Bay canonical test case
    ├── unit/                          ← Per-module tests
    └── property/                      ← fast-check property tests
```

---

## Getting Started

```bash
npm install
npm run typecheck    # must pass before any commit
npm test             # run all tests
npm run test:gold    # run Riviera Bay gold test
```

---

## Development Workflow

This repository uses an **Architect + Claude Code** model:

- **Architect** (Claude via GitHub access) — reviews code state, writes specs, authors types and YAML rules, produces session briefs
- **Claude Code** (terminal) — implements one bounded module per session, guided by `CLAUDE.md`
- **Human** — runs Claude Code sessions, reviews output, pushes commits

**Every Claude Code session starts with:**
```
Read CLAUDE.md first. Then read src/types/index.ts. Then [specific file].
```

**Every session ends with:**
```bash
npm run typecheck    # zero errors required
npm run test:gold    # must pass if reasoning layer was touched
```

---

## The Gold Test

`tests/gold/riviera-bay.test.ts` — canonical acceptance test.

Seller Chen Wei, buyer Priya Nair, $1.85M Singapore residential property:

| Representation | Claim | Actual | Expected Classification |
|---|---|---|---|
| R1 — Rental income | $4,800/month | $3,200/month (knew) | `FRAUDULENT` |
| R2 — MC arrears | No disputes | $18,000 dispute active | `NEGLIGENT_STATUTORY` |
| R3 — Roof repairs | Fully replaced, warranty | Partial repairs, no warranty | Multi-path |

Any commit touching `src/reasoning/` must pass this test.

---

## Status

**Week 1 — Foundations in progress**

- [x] `src/types/index.ts` — complete
- [x] `CLAUDE.md` — complete  
- [x] `knowledge/misrepresentation/E1-representation-made.yaml` — template rule
- [ ] YAML loader (`src/knowledge/loader.ts`)
- [ ] Graph builder (`src/knowledge/graph-builder.ts`)
- [ ] E2–E23 YAML rule files (Aashna authoring)
- [ ] Reasoning engine
- [ ] Extraction layer
- [ ] Validation Firewall
- [ ] Gold test passing end-to-end

---

## IP Notice

Patent-pending hybrid AI-symbolic reasoning architecture. Rule graph structure, 
dimensional decomposition methodology, and validation architecture are proprietary.
© 2025 Reshuffle.AI Pte. Ltd. All rights reserved.
