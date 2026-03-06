/**
 * tests/property/invariants.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Property-based invariant tests for the reasoning engine.
 *
 * Three invariants:
 *   1. Determinism — identical input → identical output, always.
 *   2. Mutual Exclusivity — FRAUDULENT and INNOCENT never coexist.
 *   3. CRG Structural Integrity — YAML files and graph are well-formed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { loadCRG } from '../../src/knowledge/loader';
import { buildGraph } from '../../src/knowledge/graph-builder';
import { reason } from '../../src/reasoning/engine';
import type { FactBundle, RepresentationFact } from '../../src/types';
import type { CRGGraph } from '../../src/knowledge/graph-builder';
import path from 'path';

const CRG_DIR = path.resolve(
  __dirname, '../../knowledge/misrepresentation'
);

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeBundle(reps: RepresentationFact[]): FactBundle {
  return {
    case_id: 'PROPERTY-TEST',
    extracted_at: '2024-03-15T00:00:00.000Z',
    representations: reps,
    contract_formed: true,
    governing_law: 'Singapore',
    loss_amount: 100000,
    extraction_model: 'property-test',
    raw_documents: ['test.pdf'],
  };
}

function makeRep(
  overrides: Partial<RepresentationFact> & { id: string }
): RepresentationFact {
  return {
    statement: 'The property has no defects',
    maker: 'Seller',
    recipient: 'Buyer',
    context: 'Pre-contract negotiation',
    truth_value: 'FALSE',
    maker_knowledge: 'KNEW_FALSE',
    induced_contract: true,
    source_document: 'test.pdf',
    source_location: 'Clause 1',
    extraction_confidence: 'HIGH',
    extraction_notes: '',
    evidence_of_falsity: 'Survey report confirms defects present',
    ...overrides,
  };
}

// ─── CRG LOADING ────────────────────────────────────────────────────────────

let graph: CRGGraph;

beforeAll(async () => {
  const nodes = await loadCRG(CRG_DIR);
  graph = buildGraph(nodes);
});

// ─── INVARIANT 1 — DETERMINISM ──────────────────────────────────────────────

describe('Invariant 1 — Determinism', () => {
  // TEST 1
  it('FRAUDULENT input produces identical output on two runs', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'KNEW_FALSE', truth_value: 'FALSE' }),
    ]);
    const result1 = reason(bundle, graph);
    const result2 = reason(bundle, graph);
    const c1 = result1.classifications.find((c) => c.representation_id === 'R1');
    const c2 = result2.classifications.find((c) => c.representation_id === 'R1');
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1!.classification).toBe(c2!.classification);
  });

  // TEST 2
  it('NEGLIGENT_STATUTORY input produces identical output on two runs', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'NO_REASONABLE_BELIEF', truth_value: 'FALSE' }),
    ]);
    const result1 = reason(bundle, graph);
    const result2 = reason(bundle, graph);
    const c1 = result1.classifications.find((c) => c.representation_id === 'R1');
    const c2 = result2.classifications.find((c) => c.representation_id === 'R1');
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1!.classification).toBe(c2!.classification);
  });

  // TEST 3
  it('UNKNOWN maker_knowledge produces identical output on two runs', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'UNKNOWN', truth_value: 'FALSE' }),
    ]);
    const result1 = reason(bundle, graph);
    const result2 = reason(bundle, graph);
    const c1 = result1.classifications.find((c) => c.representation_id === 'R1');
    const c2 = result2.classifications.find((c) => c.representation_id === 'R1');
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1!.classification).toBe(c2!.classification);
    expect(c1!.classification).toBe('NOT_ESTABLISHED');
    expect(result1.multi_path_results).not.toBeNull();
    expect(result2.multi_path_results).not.toBeNull();
  });

  // TEST 4
  it('Full Riviera Bay bundle produces identical output on two runs', () => {
    const bundle = makeBundle([
      makeRep({
        id: 'R1',
        statement: 'The property generates $4,800/month in rental income consistently',
        maker_knowledge: 'KNEW_FALSE',
        truth_value: 'FALSE',
        evidence_of_falsity: 'Tenancy agreements show actual rental income of $3,200/month',
      }),
      makeRep({
        id: 'R2',
        statement: 'There are no outstanding Management Corporation disputes or arrears',
        maker_knowledge: 'NO_REASONABLE_BELIEF',
        truth_value: 'FALSE',
        evidence_of_falsity: 'MC dispute letters dated prior to statement show $18,000 arrears',
      }),
      makeRep({
        id: 'R3',
        statement: 'The roof was fully replaced in 2022 and is under a 10-year warranty',
        maker_knowledge: 'UNKNOWN',
        truth_value: 'FALSE',
        evidence_of_falsity: 'Inspection report shows partial repairs only; no warranty document found',
      }),
    ]);
    const result1 = reason(bundle, graph);
    const result2 = reason(bundle, graph);
    for (const rep of ['R1', 'R2', 'R3']) {
      const c1 = result1.classifications.find((c) => c.representation_id === rep);
      const c2 = result2.classifications.find((c) => c.representation_id === rep);
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();
      expect(c1!.classification).toBe(c2!.classification);
    }
  });
});

// ─── INVARIANT 2 — MUTUAL EXCLUSIVITY ───────────────────────────────────────

describe('Invariant 2 — Mutual Exclusivity', () => {
  // TEST 5
  it('FRAUDULENT classification excludes INNOCENT on same representation', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'KNEW_FALSE' }),
    ]);
    const result = reason(bundle, graph);
    const r1 = result.classifications.find((c) => c.representation_id === 'R1');
    expect(r1).toBeDefined();
    expect(r1!.classification).toBe('FRAUDULENT');
    if (result.multi_path_results !== null) {
      for (const path of result.multi_path_results) {
        const r1Path = path.classifications.find((c) => c.representation_id === 'R1');
        if (r1Path !== undefined) {
          expect(r1Path.classification).not.toBe('INNOCENT');
        }
      }
    }
  });

  // TEST 6
  it('INNOCENT classification excludes FRAUDULENT on same representation', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'REASONABLE_BELIEF' }),
    ]);
    const result = reason(bundle, graph);
    const r1 = result.classifications.find((c) => c.representation_id === 'R1');
    expect(r1).toBeDefined();
    expect(r1!.classification).not.toBe('FRAUDULENT');
    if (result.multi_path_results !== null) {
      for (const path of result.multi_path_results) {
        const r1Path = path.classifications.find((c) => c.representation_id === 'R1');
        if (r1Path !== undefined) {
          expect(r1Path.classification).not.toBe('FRAUDULENT');
        }
      }
    }
  });

  // TEST 7
  it('NO_REASONABLE_BELIEF never produces INNOCENT classification', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'NO_REASONABLE_BELIEF' }),
    ]);
    const result = reason(bundle, graph);
    const r1 = result.classifications.find((c) => c.representation_id === 'R1');
    expect(r1).toBeDefined();
    expect(r1!.classification).toBe('NEGLIGENT_STATUTORY');
    if (result.multi_path_results !== null) {
      for (const path of result.multi_path_results) {
        const r1Path = path.classifications.find((c) => c.representation_id === 'R1');
        if (r1Path !== undefined) {
          expect(r1Path.classification).not.toBe('INNOCENT');
        }
      }
    }
  });

  // TEST 8
  it('KNEW_FALSE never produces INNOCENT classification', () => {
    const bundle = makeBundle([
      makeRep({ id: 'R1', maker_knowledge: 'KNEW_FALSE' }),
    ]);
    const result = reason(bundle, graph);
    const r1 = result.classifications.find((c) => c.representation_id === 'R1');
    expect(r1).toBeDefined();
    expect(r1!.classification).toBe('FRAUDULENT');
    if (result.multi_path_results !== null) {
      for (const path of result.multi_path_results) {
        const r1Path = path.classifications.find((c) => c.representation_id === 'R1');
        if (r1Path !== undefined) {
          expect(r1Path.classification).not.toBe('INNOCENT');
        }
      }
    }
  });
});

// ─── INVARIANT 3 — CRG STRUCTURAL INTEGRITY ────────────────────────────────

describe('Invariant 3 — CRG Structural Integrity', () => {
  // TEST 9
  it('CRG contains exactly 21 nodes', () => {
    expect(graph.nodes.size).toBe(21);
  });

  // TEST 10
  it('All expected node IDs are present', () => {
    const expectedIds = [
      'E1', 'E2', 'E2B', 'E3', 'E4', 'E5', 'E6', 'META1',
      'CL1', 'CL2', 'CL3', 'CL4',
      'REM1', 'REM2', 'REM3',
      'BAR1', 'BAR2', 'BAR3', 'BAR4', 'BAR5', 'XS1',
    ];
    for (const id of expectedIds) {
      expect(graph.nodes.has(id)).toBe(true);
    }
  });

  // TEST 11
  it('Topological order starts with element layer nodes', () => {
    const order = graph.topologicalOrder;
    const indexOf = (id: string) => order.indexOf(id);

    expect(indexOf('E1')).toBeLessThan(indexOf('META1'));
    expect(indexOf('META1')).toBeLessThan(indexOf('CL1'));
    expect(indexOf('META1')).toBeLessThan(indexOf('CL2'));
    expect(indexOf('META1')).toBeLessThan(indexOf('CL3'));
    expect(indexOf('META1')).toBeLessThan(indexOf('CL4'));
    expect(indexOf('CL1')).toBeLessThan(indexOf('CL2'));
    expect(indexOf('CL1')).toBeLessThan(indexOf('CL4'));
  });

  // TEST 12
  it('META1 is protected', () => {
    const meta1 = graph.nodes.get('META1');
    expect(meta1).toBeDefined();
    expect(meta1!.protected).toBe(true);
  });

  // TEST 13
  it('CL1, CL2, CL4 are protected', () => {
    expect(graph.nodes.get('CL1')!.protected).toBe(true);
    expect(graph.nodes.get('CL2')!.protected).toBe(true);
    expect(graph.nodes.get('CL4')!.protected).toBe(true);
  });

  // TEST 14
  it('CL3 and XS1 are not protected (flagged-not-decided)', () => {
    expect(graph.nodes.get('CL3')!.protected).toBe(false);
    expect(graph.nodes.get('XS1')!.protected).toBe(false);
  });

  // TEST 15
  it('CL2 burden is DEFENDANT (reversed burden)', () => {
    const cl2 = graph.nodes.get('CL2');
    expect(cl2).toBeDefined();
    expect(cl2!.burden).toBe('DEFENDANT');
  });

  // TEST 16
  it('E6 modality is MAY (loss does not gate rescission)', () => {
    const e6 = graph.nodes.get('E6');
    expect(e6).toBeDefined();
    expect(e6!.modality).toBe('MAY');
  });
});
