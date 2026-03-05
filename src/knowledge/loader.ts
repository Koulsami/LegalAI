/**
 * src/knowledge/loader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads CRG YAML rule files from a directory, validates against Zod schema,
 * performs cross-file prerequisite check, and returns validated TreeNode[].
 *
 * LLM calls: ❌ NONE — deterministic I/O + validation only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs/promises';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';
import { z } from 'zod';
import type { TreeNode } from '../types';
import { logger } from '../utils/logger';

// ─── ZOD SCHEMA ─────────────────────────────────────────────────────────────

const TreeNodeSchema = z.object({
  id:                z.string().min(1),
  name:              z.string().min(1),
  layer:             z.enum(['ELEMENTS', 'CLASSIFICATION', 'REMEDIES', 'BARS']),
  prerequisites:     z.array(z.string()),
  required_facts:    z.array(z.string()).min(1),
  predicate:         z.string().min(1),
  conclusion:        z.string().min(1),
  burden:            z.enum(['CLAIMANT', 'DEFENDANT', 'COURT']),
  modality:          z.enum(['MUST', 'SHOULD', 'MAY']),
  protected:         z.boolean(),
  abstention_policy: z.enum(['STRICT', 'PERMISSIVE']),
  citations:         z.array(z.string()),
  notes:             z.string().optional(),
});

// ─── LOADER ─────────────────────────────────────────────────────────────────

export async function loadCRG(dir: string): Promise<TreeNode[]> {
  let filenames: string[];

  try {
    filenames = await fs.readdir(dir);
  } catch (e: unknown) {
    const msg = `CRG load failed: cannot read directory ${dir}`;
    logger.error('knowledge/loader', e);
    throw new Error(msg);
  }

  const yamlFiles = filenames.filter((f) => f.endsWith('.yaml'));

  logger.info('knowledge/loader', { dir, file_count: yamlFiles.length });

  const nodes: TreeNode[] = [];

  for (const file of yamlFiles) {
    const filePath = path.join(dir, file);

    let raw: unknown;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      raw = yamlLoad(content);
    } catch (e: unknown) {
      const msg = `CRG load failed: invalid schema in ${file} — failed to read or parse YAML`;
      logger.error('knowledge/loader', e);
      throw new Error(msg);
    }

    const parseResult = TreeNodeSchema.safeParse(raw);

    if (!parseResult.success) {
      const zodSummary = parseResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      const msg = `CRG load failed: invalid schema in ${file} — ${zodSummary}`;
      logger.error('knowledge/loader', msg);
      throw new Error(msg);
    }

    // Map validated data to TreeNode, discarding `notes`
    const { notes: _notes, ...validated } = parseResult.data;
    const node: TreeNode = validated;
    nodes.push(node);
  }

  // Cross-file prerequisite check
  const knownIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!knownIds.has(prereq)) {
        const msg = `CRG load failed: node ${node.id} references unknown prerequisite ${prereq}`;
        logger.error('knowledge/loader', msg);
        throw new Error(msg);
      }
    }
  }

  logger.info('knowledge/loader', { loaded_count: nodes.length });

  return nodes;
}
