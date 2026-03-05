/**
 * src/knowledge/graph-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a directed acyclic graph (DAG) from loaded TreeNodes using Kahn's
 * algorithm for topological sorting and cycle detection.
 *
 * LLM calls: ❌ NONE — pure deterministic graph logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TreeNode } from '../types';
import { logger } from '../utils/logger';

// ─── TYPES (internal to knowledge layer) ────────────────────────────────────

export interface CRGGraph {
  readonly nodes: ReadonlyMap<string, TreeNode>;
  // node id → ids of nodes that depend on it (its dependents)
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  // valid evaluation order — prerequisites before dependents
  readonly topologicalOrder: readonly string[];
}

interface CycleError {
  readonly message: string;
  readonly cycleNodes: readonly string[];
}

// ─── GRAPH BUILDER ──────────────────────────────────────────────────────────

export function buildGraph(nodes: TreeNode[]): CRGGraph {
  const nodeMap = new Map<string, TreeNode>();
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Step 0: populate nodeMap and check for duplicates
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      const msg = `CRG build failed: duplicate node id '${node.id}'`;
      logger.error('knowledge/graph-builder', msg);
      throw new Error(msg);
    }
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  // Step 1: build adjacency list and in-degree map
  let edgeCount = 0;
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!nodeMap.has(prereq)) {
        const msg = `CRG build failed: node '${node.id}' prerequisites unknown node '${prereq}'`;
        logger.error('knowledge/graph-builder', msg);
        throw new Error(msg);
      }

      // prereq → node (node depends on prereq)
      // Safe assertion: prereq was verified to exist in nodeMap above,
      // and adjacency is populated for every key in nodeMap
      const dependents = adjacency.get(prereq)!;
      dependents.push(node.id);
      edgeCount++;

      // Increment in-degree of the dependent node
      // Safe assertion: node.id is guaranteed to be in inDegree (set in step 0)
      const currentDegree = inDegree.get(node.id)!;
      inDegree.set(node.id, currentDegree + 1);
    }
  }

  // Step 2: Kahn's algorithm — initialise queue with in-degree 0 nodes
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // Step 3: process queue
  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    // Safe assertion: length check guarantees element exists
    const current = queue.shift()!;
    topologicalOrder.push(current);

    // Safe assertion: current is a valid node id from the queue,
    // which was populated from inDegree keys matching adjacency keys
    const dependents = adjacency.get(current)!;
    for (const dep of dependents) {
      // Safe assertion: dep was added to adjacency/inDegree in step 0
      const newDegree = inDegree.get(dep)! - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // Step 4: check for cycles
  if (topologicalOrder.length !== nodes.length) {
    const cycleNodes = nodes
      .map((n) => n.id)
      .filter((id) => !topologicalOrder.includes(id));

    const cycleError: CycleError = {
      message: `CRG build failed: cycle detected involving nodes: ${cycleNodes.join(', ')}`,
      cycleNodes,
    };

    logger.error('knowledge/graph-builder', cycleError.message);
    throw new Error(cycleError.message);
  }

  // Freeze adjacency lists for immutability
  const frozenAdjacency = new Map<string, readonly string[]>();
  for (const [id, deps] of adjacency) {
    frozenAdjacency.set(id, Object.freeze([...deps]));
  }

  logger.info('knowledge/graph-builder', { node_count: nodes.length, edge_count: edgeCount });

  return {
    nodes: nodeMap,
    adjacency: frozenAdjacency,
    topologicalOrder,
  };
}
