import request from 'supertest';
// @ts-expect-error — Step A: api/index.ts has no exports yet
import { app } from '../../src/api/index';

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('API', () => {
  // TEST 1 — GET /health returns 200 with status ok
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.crg_version).toBe('string');
    expect(typeof res.body.node_count).toBe('number');
  });

  // TEST 2 — POST /analyse returns 200 with FinalReport
  it('POST /analyse returns 200 with FinalReport', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({
        case_id: 'API-TEST-001',
        documents: [
          { filename: 'test.txt', content: 'test content', doc_type: 'OTHER' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.case_id).toBe('API-TEST-001');
    expect(res.body.request_id).toBeTruthy();
  });

  // TEST 3 — POST /analyse response contains firewall_summary
  it('POST /analyse response contains firewall_summary', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({
        case_id: 'API-TEST-001',
        documents: [
          { filename: 'test.txt', content: 'test content', doc_type: 'OTHER' },
        ],
      });

    expect(res.body.data.firewall_summary).toBeDefined();
    expect(res.body.data.firewall_summary.case_id).toBe('API-TEST-001');
  });

  // TEST 4 — POST /analyse returns 400 when case_id missing
  it('POST /analyse returns 400 when case_id missing', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({
        documents: [
          { filename: 'test.txt', content: 'test', doc_type: 'OTHER' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // TEST 5 — POST /analyse returns 400 when documents missing
  it('POST /analyse returns 400 when documents missing', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({ case_id: 'API-TEST-005' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // TEST 6 — POST /analyse returns 400 when body is empty
  it('POST /analyse returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // TEST 7 — POST /analyse returns 400 when documents is not an array
  it('POST /analyse returns 400 when documents is not an array', async () => {
    const res = await request(app)
      .post('/analyse')
      .send({ case_id: 'API-TEST-007', documents: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // TEST 8 — every response has a request_id field
  // Design choice: /health returns request_id via X-Request-Id header.
  // /analyse returns request_id in the JSON body (per ApiResponse type).
  it('every response has a request_id field', async () => {
    const healthRes = await request(app).get('/health');
    expect(healthRes.headers['x-request-id']).toBeTruthy();

    const analyseRes = await request(app)
      .post('/analyse')
      .send({
        case_id: 'API-TEST-008',
        documents: [
          { filename: 'test.txt', content: 'test', doc_type: 'OTHER' },
        ],
      });
    expect(analyseRes.body.request_id).toBeDefined();
  });
});
