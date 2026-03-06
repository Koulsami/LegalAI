/**
 * src/reasoning/predicate-evaluator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates a single ELEMENTS-layer CRG node against a FactBundle.
 * Returns a deterministic NodeEvaluation.
 *
 * LLM calls: ❌ NONE — pure deterministic logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TreeNode, FactBundle, NodeEvaluation, NodeOutcome } from '../types';
import { logger } from '../utils/logger';

// ─── FACT PATH RESOLUTION ───────────────────────────────────────────────────

const WILDCARD_MARKER = '[*].';

function isArrayWildcardPath(path: string): boolean {
  return path.includes(WILDCARD_MARKER);
}

function resolveArrayWildcard(
  bundle: FactBundle,
  path: string
): { values: unknown[]; present: boolean } {
  const markerIndex = path.indexOf(WILDCARD_MARKER);
  const arrayKey = path.substring(0, markerIndex);
  const fieldKey = path.substring(markerIndex + WILDCARD_MARKER.length);

  // Only 'representations' array wildcard is supported on FactBundle
  if (arrayKey !== 'representations') {
    return { values: [], present: false };
  }

  const values = bundle.representations.map(
    (rep) => (rep as unknown as Record<string, unknown>)[fieldKey]
  );

  const present = values.some(
    (v) => v !== null && v !== undefined && v !== ''
  );

  return { values, present };
}

function resolveScalar(
  bundle: FactBundle,
  path: string
): { value: unknown; present: boolean } {
  const value = (bundle as unknown as Record<string, unknown>)[path];

  let present: boolean;
  if (value === null || value === undefined) {
    present = false;
  } else if (typeof value === 'string') {
    present = value.length > 0;
  } else {
    present = true;
  }

  return { value, present };
}

// ─── EVALUATOR ──────────────────────────────────────────────────────────────

export function evaluateElementsNode(
  node: TreeNode,
  bundle: FactBundle
): NodeEvaluation {
  const factsUsed: Record<string, unknown> = {};
  const missingPaths: string[] = [];

  // Step 1 & 2: resolve required_facts and identify missing paths
  for (const path of node.required_facts) {
    if (isArrayWildcardPath(path)) {
      const { values, present } = resolveArrayWildcard(bundle, path);
      factsUsed[path] = values;
      if (!present) {
        missingPaths.push(path);
      }
    } else {
      const { value, present } = resolveScalar(bundle, path);
      factsUsed[path] = value;
      if (!present) {
        missingPaths.push(path);
      }
    }
  }

  // Step 3: determine outcome based on abstention policy
  let outcome: NodeOutcome;
  if (missingPaths.length > 0) {
    outcome = node.abstention_policy === 'STRICT'
      ? 'ABSTAINED'
      : 'NOT_SATISFIED';
  } else {
    outcome = 'SATISFIED';
  }

  // Step 4: build reasoning_trace
  let reasoningTrace: string;
  switch (outcome) {
    case 'SATISFIED':
      reasoningTrace = `Node ${node.id} satisfied. All required facts present: ${node.required_facts.join(', ')}`;
      break;
    case 'ABSTAINED':
      reasoningTrace = `Node ${node.id} abstained. Required facts missing: ${missingPaths.join(', ')}`;
      break;
    case 'NOT_SATISFIED':
      reasoningTrace = `Node ${node.id} not satisfied. Facts absent but proceeding (PERMISSIVE): ${missingPaths.join(', ')}`;
      break;
    default:
      reasoningTrace = `Node ${node.id} evaluation pending.`;
  }

  // Step 5: assemble NodeEvaluation
  const evaluation: NodeEvaluation = {
    node_id: node.id,
    node_name: node.name,
    layer: node.layer,
    outcome,
    facts_used: factsUsed,
    reasoning_trace: reasoningTrace,
    citations_applied: [...node.citations],
    evaluated_at: new Date().toISOString(),
  };

  logger.debug('reasoning/predicate-evaluator', {
    node_id: node.id,
    outcome,
  });

  return evaluation;
}
