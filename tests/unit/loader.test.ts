import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadCRG } from '../../src/knowledge/loader';

describe('loadCRG', () => {
  // ── TEST 1 — loads E1 without error ────────────────────────────────────
  it('loads E1 from knowledge/misrepresentation', async () => {
    const nodes = await loadCRG('./knowledge/misrepresentation');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    const e1 = nodes.find((n) => n.id === 'E1');
    expect(e1).toBeDefined();
    expect(e1!.layer).toBe('ELEMENTS');
  });

  // ── TEST 2 — throws on missing directory ───────────────────────────────
  it('throws on missing directory', async () => {
    await expect(loadCRG('./knowledge/does-not-exist')).rejects.toThrow(
      'CRG load failed'
    );
  });

  // ── TEST 3 — throws on invalid YAML schema ────────────────────────────
  describe('invalid YAML schema', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crg-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('throws on malformed YAML missing required id field', async () => {
      const badYaml = [
        'name: Bad Node',
        'layer: ELEMENTS',
        'prerequisites: []',
        'required_facts:',
        '  - some.fact',
        'predicate: "test predicate"',
        'conclusion: "test conclusion"',
        'burden: CLAIMANT',
        'modality: MUST',
        'protected: false',
        'abstention_policy: STRICT',
        'citations: []',
      ].join('\n');

      await fs.writeFile(path.join(tempDir, 'bad-node.yaml'), badYaml);
      await expect(loadCRG(tempDir)).rejects.toThrow('CRG load failed');
    });
  });

  // ── TEST 4 — throws on unknown prerequisite ───────────────────────────
  describe('unknown prerequisite', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crg-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('throws when prerequisites reference a nonexistent node', async () => {
      const yamlContent = [
        'id: X1',
        'name: Test Node',
        'layer: ELEMENTS',
        'prerequisites:',
        '  - NONEXISTENT_NODE',
        'required_facts:',
        '  - some.fact',
        'predicate: "test predicate"',
        'conclusion: "test conclusion"',
        'burden: CLAIMANT',
        'modality: MUST',
        'protected: false',
        'abstention_policy: STRICT',
        'citations: []',
      ].join('\n');

      await fs.writeFile(path.join(tempDir, 'test-node.yaml'), yamlContent);
      await expect(loadCRG(tempDir)).rejects.toThrow('CRG load failed');
    });
  });
});
