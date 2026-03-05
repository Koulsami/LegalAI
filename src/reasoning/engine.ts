/**
 * src/reasoning/engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic reasoning engine. Traverses the CRG in topological order,
 * evaluates ELEMENTS and CLASSIFICATION nodes, produces classifications
 * and remedies per representation.
 *
 * LLM calls: ❌ NONE — pure deterministic logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  FactBundle,
  ReasoningResult,
  NodeEvaluation,
  ClassificationResult,
  RemedyResult,
  MultiPathResult,
  MisrepresentationClass,
  RemedyType,
  RepresentationFact,
} from '../types';
import type { CRGGraph } from '../knowledge/graph-builder';
import { evaluateElementsNode } from './predicate-evaluator';
import {
  evaluateCL1Fraudulent,
  evaluateCL2NegligentStatutory,
  evaluateCL4Innocent,
} from './classification-evaluator';
import { logger } from '../utils/logger';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function remediesForClassification(
  classification: MisrepresentationClass
): readonly RemedyType[] {
  switch (classification) {
    case 'FRAUDULENT':
      return ['RESCISSION', 'DAMAGES_TORTIOUS'];
    case 'NEGLIGENT_STATUTORY':
      return ['RESCISSION', 'DAMAGES_STATUTORY'];
    case 'INNOCENT':
      return ['RESCISSION', 'DAMAGES_IN_LIEU'];
    default:
      return [];
  }
}

function classifyRepresentation(
  repId: string,
  bundle: FactBundle,
  graph: CRGGraph,
  allNodeEvaluations: NodeEvaluation[]
): { classification: MisrepresentationClass; clEvals: NodeEvaluation[] } {
  const clEvals: NodeEvaluation[] = [];
  let classification: MisrepresentationClass = 'NOT_ESTABLISHED';

  // CL1
  const cl1Node = graph.nodes.get('CL1');
  if (cl1Node !== undefined) {
    const cl1Eval = evaluateCL1Fraudulent(cl1Node, bundle, repId);
    clEvals.push(cl1Eval);
    allNodeEvaluations.push(cl1Eval);
    if (cl1Eval.outcome === 'SATISFIED') {
      classification = 'FRAUDULENT';
      return { classification, clEvals };
    }
  }

  // CL2
  const cl2Node = graph.nodes.get('CL2');
  if (cl2Node !== undefined) {
    const cl2Eval = evaluateCL2NegligentStatutory(cl2Node, bundle, repId);
    clEvals.push(cl2Eval);
    allNodeEvaluations.push(cl2Eval);
    if (cl2Eval.outcome === 'SATISFIED') {
      classification = 'NEGLIGENT_STATUTORY';
      return { classification, clEvals };
    }
  }

  // CL4
  const cl4Node = graph.nodes.get('CL4');
  if (cl4Node !== undefined) {
    const cl4Eval = evaluateCL4Innocent(cl4Node, bundle, repId);
    clEvals.push(cl4Eval);
    allNodeEvaluations.push(cl4Eval);
    if (cl4Eval.outcome === 'SATISFIED') {
      classification = 'INNOCENT';
      return { classification, clEvals };
    }
  }

  return { classification, clEvals };
}

function determineConfidence(
  clEvals: NodeEvaluation[]
): 'CERTAIN' | 'PROBABLE' | 'POSSIBLE' {
  if (clEvals.some((e) => e.outcome === 'ABSTAINED')) {
    return 'POSSIBLE';
  }
  return 'CERTAIN';
}

// ─── ENGINE ─────────────────────────────────────────────────────────────────

export function reason(
  bundle: FactBundle,
  graph: CRGGraph
): ReasoningResult {
  const allNodeEvaluations: NodeEvaluation[] = [];

  // Step 1: Evaluate ELEMENTS nodes
  let elementsGatePassed = true;
  for (const nodeId of graph.topologicalOrder) {
    const node = graph.nodes.get(nodeId);
    if (node === undefined || node.layer !== 'ELEMENTS') {
      continue;
    }
    const eval_ = evaluateElementsNode(node, bundle);
    allNodeEvaluations.push(eval_);
    if (eval_.outcome !== 'SATISFIED') {
      elementsGatePassed = false;
    }
  }

  // Step 2: Classify each representation
  const classifications: ClassificationResult[] = [];
  const remedies: RemedyResult[] = [];

  for (const rep of bundle.representations) {
    if (!elementsGatePassed) {
      classifications.push({
        representation_id: rep.id,
        classification: 'NOT_ESTABLISHED',
        confidence: 'POSSIBLE',
        node_evaluations: [],
        path_type: 'PRIMARY',
      });
      remedies.push({
        representation_id: rep.id,
        available_remedies: [],
        barred_remedies: [],
        node_evaluations: [],
      });
      continue;
    }

    const { classification, clEvals } = classifyRepresentation(
      rep.id, bundle, graph, allNodeEvaluations
    );

    classifications.push({
      representation_id: rep.id,
      classification,
      confidence: determineConfidence(clEvals),
      node_evaluations: clEvals,
      path_type: 'PRIMARY',
    });

    // Step 3: Build remedies
    remedies.push({
      representation_id: rep.id,
      available_remedies: remediesForClassification(classification),
      barred_remedies: [],
      node_evaluations: [],
    });
  }

  // Step 4: Handle multi-path
  const multiPathRequired = bundle.representations.some(
    (r) =>
      r.maker_knowledge === 'UNKNOWN' ||
      r.truth_value === 'PARTIALLY_FALSE'
  );

  let multiPathResults: readonly MultiPathResult[] | null = null;

  if (multiPathRequired) {
    const overriddenBundle: FactBundle = {
      ...bundle,
      representations: bundle.representations.map((r) =>
        r.maker_knowledge === 'UNKNOWN'
          ? { ...r, maker_knowledge: 'NO_REASONABLE_BELIEF' as const }
          : r
      ),
    };

    const pathClassifications: ClassificationResult[] = [];
    const pathRemedies: RemedyResult[] = [];
    const pathEvals: NodeEvaluation[] = [];

    for (const rep of overriddenBundle.representations) {
      if (!elementsGatePassed) {
        pathClassifications.push({
          representation_id: rep.id,
          classification: 'NOT_ESTABLISHED',
          confidence: 'POSSIBLE',
          node_evaluations: [],
          path_type: 'ALTERNATIVE',
        });
        pathRemedies.push({
          representation_id: rep.id,
          available_remedies: [],
          barred_remedies: [],
          node_evaluations: [],
        });
        continue;
      }

      const { classification, clEvals } = classifyRepresentation(
        rep.id, overriddenBundle, graph, pathEvals
      );

      pathClassifications.push({
        representation_id: rep.id,
        classification,
        confidence: determineConfidence(clEvals),
        node_evaluations: clEvals,
        path_type: 'ALTERNATIVE',
      });

      pathRemedies.push({
        representation_id: rep.id,
        available_remedies: remediesForClassification(classification),
        barred_remedies: [],
        node_evaluations: [],
      });
    }

    multiPathResults = [{
      path_id: 'PATH_A',
      path_type: 'ALTERNATIVE',
      assumption: 'maker_knowledge assumed NO_REASONABLE_BELIEF',
      classifications: pathClassifications,
      remedies: pathRemedies,
    }];
  }

  // Step 5: Assemble
  logger.info('reasoning/engine', {
    case_id: bundle.case_id,
    classification_count: classifications.length,
    multi_path: multiPathRequired,
  });

  return {
    case_id: bundle.case_id,
    reasoned_at: new Date().toISOString(),
    classifications,
    remedies,
    all_node_evaluations: allNodeEvaluations,
    multi_path_results: multiPathResults,
  };
}
