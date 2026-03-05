/**
 * src/api/routes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express route handlers for the Reasonex API.
 * No business logic — delegates to orchestrator.
 *
 * LLM calls: ❌ NONE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { analyse } from '../orchestrator/orchestrator';
import { loadCRG } from '../knowledge/loader';
import { buildGraph } from '../knowledge/graph-builder';
import { logger } from '../utils/logger';
import type { AnalyseRequest } from '../types';

export const router = Router();

const CRG_DIR = './knowledge/misrepresentation';

// ─── GET /health ────────────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  try {
    const nodes = await loadCRG(CRG_DIR);
    const graph = buildGraph(nodes);
    res.status(200).json({
      status: 'ok',
      crg_version: 'misrep-v1.0',
      node_count: graph.nodes.size,
    });
  } catch (e: unknown) {
    logger.error('api/routes health', e);
    res.status(500).json({ status: 'error' });
  }
});

// ─── POST /analyse ──────────────────────────────────────────────────────────

router.post('/analyse', async (req, res) => {
  const requestId = randomUUID();

  const body = req.body as Record<string, unknown>;

  if (
    typeof body['case_id'] !== 'string' ||
    body['case_id'].trim() === ''
  ) {
    res.status(400).json({
      success: false,
      error: 'case_id is required and must be a non-empty string',
      request_id: requestId,
    });
    return;
  }

  if (!Array.isArray(body['documents'])) {
    res.status(400).json({
      success: false,
      error: 'documents is required and must be an array',
      request_id: requestId,
    });
    return;
  }

  const analyseRequest: AnalyseRequest = {
    case_id: body['case_id'],
    documents: body['documents'] as AnalyseRequest['documents'],
  };

  try {
    const report = await analyse(analyseRequest, CRG_DIR);
    res.status(200).json({
      success: true,
      data: report,
      request_id: requestId,
    });
  } catch (e: unknown) {
    logger.error('api/routes analyse', e);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      request_id: requestId,
    });
  }
});
