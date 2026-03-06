/**
 * tests/integration/crg-full.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration test — loads the real 21-node CRG from YAML and runs the
 * Riviera Bay scenario through the full reasoning engine.
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

// ─── RIVIERA BAY REPRESENTATIONS ────────────────────────────────────────────

const R1: RepresentationFact = {
  id: 'R1',
  statement: 'The property generates $4,800/month in rental income consistently',
  maker: 'Chen Wei',
  recipient: 'Priya Nair',
  context: 'Pre-contract negotiation for SGD 1.85M residential property',
  truth_value: 'FALSE',
  maker_knowledge: 'KNEW_FALSE',
  induced_contract: true,
  source_document: 'riviera-bay-contract.pdf',
  source_location: 'Clause 3.1',
  extraction_confidence: 'HIGH',
  extraction_notes: '',
  evidence_of_falsity: 'Tenancy agreements show actual rental income of $3,200/month',
};

const R2: RepresentationFact = {
  id: 'R2',
  statement: 'There are no outstanding Management Corporation disputes or arrears',
  maker: 'Chen Wei',
  recipient: 'Priya Nair',
  context: 'Pre-contract negotiation for SGD 1.85M residential property',
  truth_value: 'FALSE',
  maker_knowledge: 'NO_REASONABLE_BELIEF',
  induced_contract: true,
  source_document: 'riviera-bay-contract.pdf',
  source_location: 'Clause 4.3',
  extraction_confidence: 'HIGH',
  extraction_notes: '',
  evidence_of_falsity: 'MC dispute letters dated prior to statement show $18,000 arrears',
};

const R3: RepresentationFact = {
  id: 'R3',
  statement: 'The roof was fully replaced in 2022 and is under a 10-year warranty',
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

const bundle: FactBundle = {
  case_id: 'RIVIERA-BAY-2024-INTEGRATION',
  extracted_at: '2024-03-15T00:00:00.000Z',
  representations: [R1, R2, R3],
  contract_formed: true,
  governing_law: 'Singapore',
  loss_amount: 185000,
  extraction_model: 'integration-test',
  raw_documents: ['riviera-bay-contract.pdf'],
};

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('CRG Integration — Full 21-node graph', () => {
  let graph: CRGGraph;

  beforeAll(async () => {
    const nodes = await loadCRG(CRG_DIR);
    graph = buildGraph(nodes);
  });

  // TEST 1
  it('loads 21 nodes from YAML without error', () => {
    expect(graph.nodes.size).toBe(21);
  });

  // TEST 2
  it('topological order contains all 21 node IDs', () => {
    expect(graph.topologicalOrder.length).toBe(21);
  });

  // TEST 3
  it('R1 classified as FRAUDULENT with real CRG', () => {
    const result = reason(bundle, graph);
    const r1 = result.classifications.find(
      (c) => c.representation_id === 'R1'
    );
    expect(r1).toBeDefined();
    expect(r1!.classification).toBe('FRAUDULENT');
  });

  // TEST 4
  it('R2 classified as NEGLIGENT_STATUTORY with real CRG', () => {
    const result = reason(bundle, graph);
    const r2 = result.classifications.find(
      (c) => c.representation_id === 'R2'
    );
    expect(r2).toBeDefined();
    expect(r2!.classification).toBe('NEGLIGENT_STATUTORY');
  });

  // TEST 5
  it('R3 primary path is NOT_ESTABLISHED with real CRG', () => {
    const result = reason(bundle, graph);
    const r3 = result.classifications.find(
      (c) => c.representation_id === 'R3'
    );
    expect(r3).toBeDefined();
    expect(r3!.classification).toBe('NOT_ESTABLISHED');
  });

  // TEST 6
  it('multi_path_results triggered by R3 UNKNOWN', () => {
    const result = reason(bundle, graph);
    expect(result.multi_path_results).not.toBeNull();
    expect(result.multi_path_results!.length).toBeGreaterThanOrEqual(1);
  });

  // TEST 7
  it('PATH_A classifies R3 as NEGLIGENT_STATUTORY', () => {
    const result = reason(bundle, graph);
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

  // TEST 8
  it('reason() is deterministic across two runs with real CRG', () => {
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
});
