/**
 * tests/gold/riviera-bay.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NORTH STAR TEST — Riviera Bay Gold Test
 *
 * Singapore residential property sale, 2024.
 * Seller: Chen Wei. Buyer: Priya Nair. Price: SGD 1.85M.
 *
 * Three representations — each classified independently:
 *   R1 (rental income)  → FRAUDULENT
 *   R2 (MC arrears)     → NEGLIGENT_STATUTORY
 *   R3 (roof repairs)   → NOT_ESTABLISHED (primary), NEGLIGENT_STATUTORY (PATH_A)
 *
 * This test must pass on every future merge.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { loadCRG } from '../../src/knowledge/loader';
import { buildGraph } from '../../src/knowledge/graph-builder';
import type { FactBundle, RepresentationFact, ReasoningResult } from '../../src/types';
import { reason } from '../../src/reasoning/engine';
import { protect, verify } from '../../src/firewall/firewall';
import path from 'path';

const CRG_DIR = path.resolve(
  __dirname, '../../knowledge/misrepresentation'
);

// ─── RIVIERA BAY REPRESENTATIONS ────────────────────────────────────────────

const R1: RepresentationFact = {
  id: 'R1',
  statement:
    'The property generates $4,800/month in rental income consistently',
  maker: 'Chen Wei',
  recipient: 'Priya Nair',
  context: 'Pre-contract negotiation for SGD 1.85M residential property',
  truth_value: 'FALSE',
  maker_knowledge: 'KNEW_FALSE',
  induced_contract: true,
  source_document: 'riviera-bay-contract.pdf',
  source_location: 'Clause 4.1',
  extraction_confidence: 'HIGH',
  extraction_notes: '',
  evidence_of_falsity: 'Tenancy agreements show actual rental income of $3,200/month',
};

const R2: RepresentationFact = {
  id: 'R2',
  statement:
    'There are no outstanding Management Corporation disputes or arrears',
  maker: 'Chen Wei',
  recipient: 'Priya Nair',
  context: 'Pre-contract negotiation for SGD 1.85M residential property',
  truth_value: 'FALSE',
  maker_knowledge: 'NO_REASONABLE_BELIEF',
  induced_contract: true,
  source_document: 'riviera-bay-contract.pdf',
  source_location: 'Clause 5.2',
  extraction_confidence: 'HIGH',
  extraction_notes: '',
  evidence_of_falsity: 'MC dispute letters dated prior to statement show $18,000 arrears',
};

const R3: RepresentationFact = {
  id: 'R3',
  statement:
    'The roof was fully replaced in 2022 and is under a 10-year warranty',
  maker: 'Chen Wei',
  recipient: 'Priya Nair',
  context: 'Pre-contract negotiation for SGD 1.85M residential property',
  truth_value: 'FALSE',
  maker_knowledge: 'UNKNOWN',
  induced_contract: true,
  source_document: 'riviera-bay-contract.pdf',
  source_location: 'Clause 6.1',
  extraction_confidence: 'MEDIUM',
  extraction_notes: 'Ambiguous whether seller knew roof was only partially repaired',
  evidence_of_falsity: 'Inspection report shows partial repairs only; no warranty document found',
};

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('Riviera Bay — Gold Test', () => {
  let result: ReasoningResult;

  beforeAll(async () => {
    const nodes = await loadCRG(CRG_DIR);
    const graph = buildGraph(nodes);
    const bundle: FactBundle = {
      case_id: 'RIVIERA-BAY-2024',
      extracted_at: new Date().toISOString(),
      representations: [R1, R2, R3],
      contract_formed: true,
      governing_law: 'Singapore',
      loss_amount: 185000,
      extraction_model: 'test',
      raw_documents: ['riviera-bay-contract.pdf'],
    };
    result = reason(bundle, graph);
  });

  // ─── STRUCTURE TESTS ────────────────────────────────────────────────────

  // TEST 1: case_id is preserved
  it('case_id is preserved', () => {
    expect(result.case_id).toBe('RIVIERA-BAY-2024');
  });

  // TEST 2: three classifications returned (one per rep)
  it('three classifications returned (one per rep)', () => {
    expect(result.classifications.length).toBe(3);
  });

  // TEST 3: three remedy results returned
  it('three remedy results returned', () => {
    expect(result.remedies.length).toBe(3);
  });

  // ─── R1 CLASSIFICATION ──────────────────────────────────────────────────

  // TEST 4: R1 classified as FRAUDULENT
  it('R1 classified as FRAUDULENT', () => {
    const r1 = result.classifications.find(
      (c) => c.representation_id === 'R1'
    );
    expect(r1).toBeDefined();
    expect(r1!.classification).toBe('FRAUDULENT');
  });

  // TEST 5: R1 remedies include RESCISSION and DAMAGES_TORTIOUS
  it('R1 remedies include RESCISSION and DAMAGES_TORTIOUS', () => {
    const r1Rem = result.remedies.find((r) => r.representation_id === 'R1');
    expect(r1Rem).toBeDefined();
    expect(r1Rem!.available_remedies).toContain('RESCISSION');
    expect(r1Rem!.available_remedies).toContain('DAMAGES_TORTIOUS');
  });

  // ─── R2 CLASSIFICATION ──────────────────────────────────────────────────

  // TEST 6: R2 classified as NEGLIGENT_STATUTORY
  it('R2 classified as NEGLIGENT_STATUTORY', () => {
    const r2 = result.classifications.find(
      (c) => c.representation_id === 'R2'
    );
    expect(r2).toBeDefined();
    expect(r2!.classification).toBe('NEGLIGENT_STATUTORY');
  });

  // TEST 7: R2 remedies include RESCISSION and DAMAGES_STATUTORY
  it('R2 remedies include RESCISSION and DAMAGES_STATUTORY', () => {
    const r2Rem = result.remedies.find((r) => r.representation_id === 'R2');
    expect(r2Rem).toBeDefined();
    expect(r2Rem!.available_remedies).toContain('RESCISSION');
    expect(r2Rem!.available_remedies).toContain('DAMAGES_STATUTORY');
  });

  // ─── R3 MULTI-PATH ──────────────────────────────────────────────────────

  // TEST 8: R3 primary path is NOT_ESTABLISHED
  it('R3 primary path is NOT_ESTABLISHED', () => {
    const r3 = result.classifications.find(
      (c) => c.representation_id === 'R3'
    );
    expect(r3).toBeDefined();
    expect(r3!.classification).toBe('NOT_ESTABLISHED');
  });

  // TEST 9: multi_path_results is not null (triggered by R3 UNKNOWN)
  it('multi_path_results is not null', () => {
    expect(result.multi_path_results).not.toBeNull();
    expect(result.multi_path_results!.length).toBeGreaterThanOrEqual(1);
  });

  // TEST 10: PATH_A classifies R3 as NEGLIGENT_STATUTORY
  it('PATH_A classifies R3 as NEGLIGENT_STATUTORY', () => {
    const pathA = result.multi_path_results!.find(
      (p) => p.path_id === 'PATH_A'
    );
    expect(pathA).toBeDefined();
    const r3PathA = pathA!.classifications.find(
      (c) => c.representation_id === 'R3'
    );
    expect(r3PathA).toBeDefined();
    expect(r3PathA!.classification).toBe('NEGLIGENT_STATUTORY');
  });

  // ─── FIREWALL ───────────────────────────────────────────────────────────

  // TEST 11: protect() produces a FirewallSummary
  it('protect() produces a FirewallSummary with all_verified false', () => {
    const { summary } = protect(result);
    expect(summary.case_id).toBe('RIVIERA-BAY-2024');
    expect(summary.records.length).toBeGreaterThan(0);
    expect(summary.all_verified).toBe(false);
  });

  // TEST 12: verify() after protect() with same result → all_verified
  it('verify() after protect() with same result marks all_verified true', () => {
    const { summary } = protect(result);
    const verified = verify(result, summary);
    expect(verified.all_verified).toBe(true);
  });

  // TEST 13: verify() detects corruption on R1 classification
  it('verify() detects corruption on R1 classification', () => {
    const { summary } = protect(result);

    // Build corrupted result: change R1 classification to INNOCENT
    const corruptedClassifications = result.classifications.map((c) =>
      c.representation_id === 'R1'
        ? { ...c, classification: 'INNOCENT' as const }
        : c
    );
    const corrupted: ReasoningResult = {
      ...result,
      classifications: corruptedClassifications,
    };

    const verified = verify(corrupted, summary);
    expect(verified.all_verified).toBe(false);
    expect(verified.revert_count).toBeGreaterThanOrEqual(1);
  });

  // ─── DETERMINISM ────────────────────────────────────────────────────────

  // TEST 14: running reason() twice produces identical classifications
  it('reason() is deterministic across two runs', async () => {
    const nodes = await loadCRG(CRG_DIR);
    const graph = buildGraph(nodes);
    const bundle: FactBundle = {
      case_id: 'RIVIERA-BAY-2024',
      extracted_at: '2024-03-15T00:00:00.000Z',
      representations: [R1, R2, R3],
      contract_formed: true,
      governing_law: 'Singapore',
      loss_amount: 185000,
      extraction_model: 'test',
      raw_documents: ['riviera-bay-contract.pdf'],
    };

    const result1 = reason(bundle, graph);
    const result2 = reason(bundle, graph);

    for (const rep of ['R1', 'R2', 'R3']) {
      const c1 = result1.classifications.find(
        (c) => c.representation_id === rep
      );
      const c2 = result2.classifications.find(
        (c) => c.representation_id === rep
      );
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();
      expect(c1!.classification).toBe(c2!.classification);
    }
  });

  // TEST 15: protect() twice produces identical summary_hash
  it('protect() produces identical summary_hash on same input', () => {
    const { summary: s1 } = protect(result);
    const { summary: s2 } = protect(result);
    expect(s1.summary_hash).toBe(s2.summary_hash);
  });
});
