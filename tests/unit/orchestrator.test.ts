import type { AnalyseRequest } from '../../src/types';
import { analyse } from '../../src/orchestrator/orchestrator';

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('analyse', () => {
  const CRG_DIR = './knowledge/misrepresentation';

  // TEST 1 — returns FinalReport with correct case_id
  it('returns FinalReport with correct case_id', async () => {
    const request: AnalyseRequest = {
      case_id: 'TEST-ORCH-001',
      documents: [
        { filename: 'test.txt', content: 'test', doc_type: 'OTHER' },
      ],
    };
    const result = await analyse(request, CRG_DIR);

    expect(result.case_id).toBe('TEST-ORCH-001');
    expect(result.report_id).toBeTruthy();
    expect(new Date(result.generated_at).toISOString()).toBe(
      result.generated_at
    );
    expect(result.fact_bundle.case_id).toBe('TEST-ORCH-001');
  });

  // TEST 2 — returns invalid report when no documents
  it('returns invalid report when no documents', async () => {
    const request: AnalyseRequest = {
      case_id: 'TEST-ORCH-002',
      documents: [],
    };
    const result = await analyse(request, CRG_DIR);

    expect(result.validation_result.valid).toBe(false);
  });

  // TEST 3 — firewall_summary is present
  it('firewall_summary is present', async () => {
    const request: AnalyseRequest = {
      case_id: 'TEST-ORCH-001',
      documents: [
        { filename: 'test.txt', content: 'test', doc_type: 'OTHER' },
      ],
    };
    const result = await analyse(request, CRG_DIR);

    expect(result.firewall_summary).toBeDefined();
    expect(result.firewall_summary.case_id).toBe('TEST-ORCH-001');
  });

  // TEST 4 — case_summary is present and well-formed
  it('case_summary is present and well-formed', async () => {
    const request: AnalyseRequest = {
      case_id: 'TEST-ORCH-001',
      documents: [
        { filename: 'test.txt', content: 'test', doc_type: 'OTHER' },
      ],
    };
    const result = await analyse(request, CRG_DIR);

    expect(result.case_summary).toBeDefined();
    expect(typeof result.case_summary.total_representations).toBe('number');
    expect(result.case_summary.rescission_available).toBe(false);
  });
});
