import type { TreeNode } from '../../src/types';
import { buildGraph } from '../../src/knowledge/graph-builder';
import { loadCRG } from '../../src/knowledge/loader';

function makeNode(overrides: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    name: 'Test Node',
    layer: 'ELEMENTS',
    prerequisites: [],
    required_facts: ['some.fact'],
    predicate: 'test predicate',
    conclusion: 'test conclusion',
    burden: 'CLAIMANT',
    modality: 'MUST',
    protected: false,
    abstention_policy: 'STRICT',
    citations: [],
    ...overrides,
  };
}

describe('buildGraph', () => {
  // TEST 1 — builds graph from E1 without error
  it('builds graph from E1 loaded via loadCRG', async () => {
    const nodes = await loadCRG('./knowledge/misrepresentation');
    const graph = buildGraph(nodes);

    expect(graph.nodes.size).toBeGreaterThanOrEqual(1);
    expect(graph.nodes.get('E1')).toBeDefined();
    expect(graph.topologicalOrder[0]).toBe('E1');
    expect(graph.adjacency.get('E1')).toBeDefined();
  });

  // TEST 2 — correct topological order for a linear chain
  it('produces correct topological order for a linear chain', () => {
    const A = makeNode({ id: 'A' });
    const B = makeNode({ id: 'B', prerequisites: ['A'] });
    const C = makeNode({ id: 'C', prerequisites: ['B'] });

    const graph = buildGraph([A, B, C]);

    expect(graph.topologicalOrder).toEqual(['A', 'B', 'C']);
  });

  // TEST 3 — correct topological order for a diamond dependency
  it('produces correct topological order for a diamond dependency', () => {
    const A = makeNode({ id: 'A' });
    const B = makeNode({ id: 'B', prerequisites: ['A'] });
    const C = makeNode({ id: 'C', prerequisites: ['A'] });
    const D = makeNode({ id: 'D', prerequisites: ['B', 'C'] });

    const graph = buildGraph([A, B, C, D]);

    expect(graph.topologicalOrder[0]).toBe('A');
    expect(graph.topologicalOrder[3]).toBe('D');
    expect(graph.topologicalOrder).toHaveLength(4);
    expect(graph.topologicalOrder).toContain('B');
    expect(graph.topologicalOrder).toContain('C');
  });

  // TEST 4 — throws on cycle
  it('throws on cycle', () => {
    const X = makeNode({ id: 'X', prerequisites: ['Y'] });
    const Y = makeNode({ id: 'Y', prerequisites: ['X'] });

    expect(() => buildGraph([X, Y])).toThrow('cycle detected');
  });

  // TEST 5 — throws on duplicate node id
  it('throws on duplicate node id', () => {
    const A1 = makeNode({ id: 'E1', name: 'First' });
    const A2 = makeNode({ id: 'E1', name: 'Second' });

    expect(() => buildGraph([A1, A2])).toThrow('duplicate node id');
  });
});
