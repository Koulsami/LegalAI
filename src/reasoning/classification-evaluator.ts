/**
 * src/reasoning/classification-evaluator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates CLASSIFICATION-layer CRG nodes (CL1, CL2, CL4) against a
 * FactBundle for a specific representation.
 *
 * Each function classifies one representation based on maker_knowledge.
 *
 * LLM calls: ❌ NONE — pure deterministic logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  TreeNode,
  FactBundle,
  NodeEvaluation,
  NodeOutcome,
  RepresentationFact,
  MakerKnowledge,
} from '../types';
import { logger } from '../utils/logger';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function findRepresentation(
  bundle: FactBundle,
  representationId: string
): RepresentationFact | undefined {
  return bundle.representations.find((r) => r.id === representationId);
}

function buildEvaluation(
  node: TreeNode,
  outcome: NodeOutcome,
  makerKnowledge: MakerKnowledge | undefined,
  reasoningTrace: string
): NodeEvaluation {
  return {
    node_id: node.id,
    node_name: node.name,
    layer: node.layer,
    outcome,
    facts_used: { maker_knowledge: makerKnowledge },
    reasoning_trace: reasoningTrace,
    citations_applied: [...node.citations],
    evaluated_at: new Date().toISOString(),
  };
}

// ─── CL1 — FRAUDULENT MISREPRESENTATION ────────────────────────────────────

/**
 * CL1: Fraudulent misrepresentation (Derry v Peek).
 * SATISFIED when maker KNEW_FALSE or was RECKLESS.
 * NOT_SATISFIED for NO_REASONABLE_BELIEF or REASONABLE_BELIEF.
 * ABSTAINED when maker_knowledge is UNKNOWN and abstention_policy is STRICT.
 */
export function evaluateCL1Fraudulent(
  node: TreeNode,
  bundle: FactBundle,
  representationId: string
): NodeEvaluation {
  const rep = findRepresentation(bundle, representationId);

  if (rep === undefined) {
    return buildEvaluation(
      node,
      'ABSTAINED',
      undefined,
      `Node ${node.id}: representation ${representationId} not found in bundle.`
    );
  }

  const knowledge = rep.maker_knowledge;

  let outcome: NodeOutcome;
  let reasoningTrace: string;

  if (knowledge === 'UNKNOWN') {
    outcome = node.abstention_policy === 'STRICT' ? 'ABSTAINED' : 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: maker_knowledge is unknown; cannot determine fraudulent intent. Abstaining under ${node.abstention_policy} policy.`;
  } else if (knowledge === 'KNEW_FALSE' || knowledge === 'RECKLESS') {
    outcome = 'SATISFIED';
    reasoningTrace = `Node ${node.id}: fraudulent misrepresentation established. Maker knowledge: ${knowledge}.`;
  } else {
    outcome = 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: maker knowledge (${knowledge}) does not meet the threshold for fraudulent misrepresentation.`;
  }

  logger.debug('reasoning/classification-evaluator', {
    node_id: node.id,
    representation_id: representationId,
    outcome,
  });

  return buildEvaluation(node, outcome, knowledge, reasoningTrace);
}

// ─── CL2 — NEGLIGENT STATUTORY s.2(1) ──────────────────────────────────────

/**
 * CL2: Negligent misrepresentation under s.2(1) Misrepresentation Act.
 * Reversed burden: defendant must prove reasonable belief.
 * SATISFIED when defendant has NOT proved reasonable belief (anything except REASONABLE_BELIEF).
 * NOT_SATISFIED only when maker proved REASONABLE_BELIEF.
 * ABSTAINED when maker_knowledge is UNKNOWN and abstention_policy is STRICT.
 */
export function evaluateCL2NegligentStatutory(
  node: TreeNode,
  bundle: FactBundle,
  representationId: string
): NodeEvaluation {
  const rep = findRepresentation(bundle, representationId);

  if (rep === undefined) {
    return buildEvaluation(
      node,
      'ABSTAINED',
      undefined,
      `Node ${node.id}: representation ${representationId} not found in bundle.`
    );
  }

  const knowledge = rep.maker_knowledge;

  let outcome: NodeOutcome;
  let reasoningTrace: string;

  if (knowledge === 'UNKNOWN') {
    outcome = node.abstention_policy === 'STRICT' ? 'ABSTAINED' : 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: maker_knowledge is unknown; cannot assess burden of proof under s.2(1). Abstaining under ${node.abstention_policy} policy.`;
  } else if (knowledge === 'REASONABLE_BELIEF') {
    outcome = 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: defendant discharged burden by proving reasonable belief. Negligent statutory misrepresentation not established.`;
  } else {
    outcome = 'SATISFIED';
    reasoningTrace = `Node ${node.id}: reversed burden under s.2(1) — defendant has not proved reasonable belief (maker knowledge: ${knowledge}). Negligent statutory misrepresentation satisfied.`;
  }

  logger.debug('reasoning/classification-evaluator', {
    node_id: node.id,
    representation_id: representationId,
    outcome,
  });

  return buildEvaluation(node, outcome, knowledge, reasoningTrace);
}

// ─── CL4 — INNOCENT MISREPRESENTATION ──────────────────────────────────────

/**
 * CL4: Innocent misrepresentation under s.2(2).
 * SATISFIED only when maker had REASONABLE_BELIEF.
 * NOT_SATISFIED for KNEW_FALSE, RECKLESS, NO_REASONABLE_BELIEF.
 * ABSTAINED when maker_knowledge is UNKNOWN and abstention_policy is STRICT.
 */
export function evaluateCL4Innocent(
  node: TreeNode,
  bundle: FactBundle,
  representationId: string
): NodeEvaluation {
  const rep = findRepresentation(bundle, representationId);

  if (rep === undefined) {
    return buildEvaluation(
      node,
      'ABSTAINED',
      undefined,
      `Node ${node.id}: representation ${representationId} not found in bundle.`
    );
  }

  const knowledge = rep.maker_knowledge;

  let outcome: NodeOutcome;
  let reasoningTrace: string;

  if (knowledge === 'UNKNOWN') {
    outcome = node.abstention_policy === 'STRICT' ? 'ABSTAINED' : 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: maker_knowledge is unknown; cannot determine innocent misrepresentation. Abstaining under ${node.abstention_policy} policy.`;
  } else if (knowledge === 'REASONABLE_BELIEF') {
    outcome = 'SATISFIED';
    reasoningTrace = `Node ${node.id}: innocent misrepresentation established. Maker held reasonable belief in truth of statement.`;
  } else {
    outcome = 'NOT_SATISFIED';
    reasoningTrace = `Node ${node.id}: maker knowledge (${knowledge}) precludes innocent misrepresentation classification.`;
  }

  logger.debug('reasoning/classification-evaluator', {
    node_id: node.id,
    representation_id: representationId,
    outcome,
  });

  return buildEvaluation(node, outcome, knowledge, reasoningTrace);
}
