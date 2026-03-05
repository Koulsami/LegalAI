# CLAUDE.md — Reasonex Misrepresentation Engine
## Read this file completely before writing any code.

---

## 1. WHAT THIS IS

A **deterministic legal reasoning engine** for Singapore's Misrepresentation Act 1967.

Given documents describing a transaction, this system:
1. Uses an LLM to extract structured facts (representations, who made them, truth value, maker knowledge)
2. Runs those facts through a deterministic Conditional Reasoning Graph (CRG)
3. Produces a classified, auditable, reproducible legal analysis

**North Star test:** The Riviera Bay scenario in `tests/gold/riviera-bay.test.ts` must always pass.

---

## 2. THE SINGLE MOST IMPORTANT ARCHITECTURAL LAW

```
LLM calls are ONLY permitted in src/extraction/
```

| Module | LLM calls? | Notes |
|---|---|---|
| `src/extraction/` | ✅ YES | Only place. Structured JSON output only. |
| `src/knowledge/` | ❌ NO | Loads YAML. Pure I/O + validation. |
| `src/validation/` | ❌ NO | Pure functions. Deterministic. |
| `src/reasoning/` | ❌ NO | DAG traversal. Deterministic. |
| `src/firewall/` | ❌ NO | SHA-256 crypto only. |
| `src/orchestrator/` | ❌ NO | Sequences modules. Thin controller. |
| `src/api/` | ❌ NO | Express routes. No business logic. |

If you find yourself adding an LLM call outside `src/extraction/`, **stop and ask**.

---

## 3. MODULE BOUNDARIES

```
src/
  types/          ← Shared TypeScript interfaces. Import from here ONLY.
  knowledge/      ← Loads YAML rules → builds CRG graph. No LLM.
  extraction/     ← LLM call here. Input: raw text. Output: FactBundle.
  validation/     ← Validates FactBundle. Pure functions. No LLM.
  reasoning/      ← DAG traversal over CRG. Deterministic. No LLM.
  firewall/       ← SHA-256 hash/verify protected fields. No LLM.
  orchestrator/   ← Sequences: extract → validate → reason → firewall.
  api/            ← Express endpoint. Calls orchestrator only.

knowledge/
  misrepresentation/
    E1-representation-made.yaml     ← Elements layer (E1–E7)
    E2-statement-of-fact.yaml
    ... (23 rules total)

tests/
  gold/           ← Riviera Bay fixture + test. The truth.
  unit/           ← Per-module tests.
  property/       ← fast-check property-based tests.
```

---

## 4. CANONICAL TYPES — ALWAYS IMPORT FROM src/types/index.ts

Never redefine these types. Never use `any`. Key types you will use:

| Type | Where used |
|---|---|
| `TreeNode` | knowledge/ — a single CRG rule node |
| `FactBundle` | extraction/ output, validation/ input |
| `RepresentationFact` | inside FactBundle |
| `ValidationResult` | validation/ output |
| `NodeEvaluation` | reasoning/ — one node's trace |
| `ClassificationResult` | reasoning/ — per representation |
| `ReasoningResult` | reasoning/ full output |
| `FirewallRecord` | firewall/ — per protected field |
| `FirewallSummary` | firewall/ aggregate |
| `FinalReport` | orchestrator/ output, api/ response |

**Enums to know:**
- `MisrepresentationClass`: `FRAUDULENT | NEGLIGENT_COMMON_LAW | NEGLIGENT_STATUTORY | INNOCENT | NOT_ESTABLISHED`
- `RemedyType`: `RESCISSION | DAMAGES_IN_LIEU | DAMAGES_TORTIOUS | DAMAGES_STATUTORY | INDEMNITY | NONE`
- `TruthValue`: `TRUE | FALSE | PARTIALLY_FALSE | UNKNOWN`
- `CRGLayer`: `ELEMENTS | CLASSIFICATION | REMEDIES | BARS`

---

## 5. THE CONDITIONAL REASONING GRAPH (CRG)

23 YAML rule files in `knowledge/misrepresentation/`. Each file is one `TreeNode`.

**Layer structure:**
```
ELEMENTS (E1–E7)       → Was a representation made? Was it false? Was it relied on?
CLASSIFICATION (C1–C4) → Fraudulent? Negligent statutory? Negligent CL? Innocent?
REMEDIES (R1–R3)       → Rescission? Damages? Indemnity?
BARS (B1–B7)           → Affirmation? Lapse of time? Third-party rights? UCTA?
```

**YAML schema** (`knowledge/misrepresentation/E1-representation-made.yaml`):
```yaml
id: E1
name: Representation Was Made
layer: ELEMENTS
prerequisites: []
required_facts:
  - representations[*].statement
  - representations[*].maker
predicate: >
  At least one RepresentationFact exists with a non-empty statement and maker.
conclusion: >
  A representation was made. Proceeding to assess its nature.
burden: CLAIMANT
modality: MUST
protected: false
citations:
  - "Tan Chin Seng v Raffles Town Club Pte Ltd [2003] 3 SLR(R) 307"
abstention_policy: STRICT
```

---

## 6. THE VALIDATION FIREWALL

For each `TreeNode` where `protected: true`:

1. Before generating any LLM explanation — compute `SHA-256(protected_value)`
2. Store as `FirewallRecord.hash_before`
3. After any LLM text generation — re-extract protected value from explanation
4. Compute `SHA-256(re_extracted_value)`
5. If hashes differ → **revert to raw deterministic value**, set `FirewallRecord.reverted = true`

This ensures LLM cannot corrupt legal classifications or remedy outcomes.

Use Node.js built-in `crypto` module. No external libraries for hashing.

---

## 7. PROHIBITED PATTERNS

```typescript
// ❌ NEVER
const result: any = ...
} catch (e) { }  // silent catch
console.log(...)  // use logger utility in src/utils/logger.ts
const RULE_ID = "E1"  // hardcode rule IDs or classification strings
// making LLM call outside src/extraction/

// ✅ ALWAYS
const result: FactBundle = ...
} catch (e: unknown) { logger.error('context', e); throw e; }
import { logger } from '../utils/logger'
import { MisrepresentationClass } from '../types'
```

No `npm install` without flagging the package name first — confirm before adding dependencies.

No mock data in `src/` — test fixtures live in `tests/gold/` only.

---

## 8. IP PROTECTION — OUTPUT RULES

**NEVER output or log** (in any console, API response, or comment):
- The names of reasoning dimensions (any six-dimensional framework terminology)
- Phrases: "logic tree", "expert system", "knowledge graph structure"
- Internal graph traversal details beyond what's in `NodeEvaluation.reasoning_trace`

**SAFE to expose** in API responses and logs:
- "Deterministic reasoning engine"
- "Validation Firewall"
- "Complete provenance"
- `NodeEvaluation.reasoning_trace` (deterministic rule trace per node)

---

## 9. CURRENT STATE

**Week:** 1 — Foundations
**Last completed:** Repository scaffold, `src/types/index.ts`, `CLAUDE.md`
**In progress:** YAML loader (`src/knowledge/loader.ts`), CRG graph builder

**Closed design decisions:**
- D1: YAML files in git (not database)
- D2: Per-representation classification then aggregate
- D3: Extraction confidence only for MVP (not reasoning confidence)
- D4: Configurable per-node abstention policy
- D5: Auto-derive SEG schema from CRG fact slots + manual hints
- D6: Structured report only for MVP (no LLM narrative)
- D7: YAML + Git for knowledge management
- D8: Expert-authored gold cases + property-based tests
- D9: Gap-based multi-path trigger
- D10: TypeScript / Node.js monolith

**Open decisions:**
- OD1: Azure OpenAI model choice for extraction (GPT-4o vs GPT-4-turbo)
- OD2: Express vs Fastify for API layer
- OD3: Logging library (winston vs pino)

---

## 10. SESSION PROTOCOL

**Every session starts with:**
```
Read CLAUDE.md first.
Then read src/types/index.ts.
Then read [specific file relevant to today's task].
Then I'll describe what I need.
```

**Every session ends with:**
1. `tsc --noEmit` — zero type errors required before committing
2. Check: any LLM calls outside `src/extraction/`?
3. Check: any IP-sensitive strings in user-facing output?
4. Run unit tests for the module just written
5. Run `tests/gold/riviera-bay.test.ts` if reasoning layer was touched

**One session = one bounded objective.**
Example: "Implement DAG builder in `src/knowledge/graph-builder.ts`. Input: loaded TreeNode[]. Output: adjacency list with validated dependency edges and cycle detection."
NOT: "Build the reasoning engine."

---

## 11. THE GOLD TEST — RIVIERA BAY

`tests/gold/riviera-bay.fixture.ts` contains the canonical test case.

Three representations by seller Chen Wei to buyer Priya Nair, $1.85M property:
- **R1** (rental income): Stated $4,800/month; actual $3,200/month; seller knew → **FRAUDULENT**
- **R2** (MC arrears): Stated no disputes; $18,000 arrears dispute active; seller should have known → **NEGLIGENT_STATUTORY**
- **R3** (roof repairs): Stated fully replaced 2022 with warranty; only partial repairs, no warranty → **INNOCENT or NEGLIGENT** (ambiguous — triggers multi-path)

Any commit touching `src/reasoning/` must pass this test before merge.
