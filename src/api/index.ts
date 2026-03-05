/**
 * src/api/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express app setup. Exports the app for testing via supertest.
 * No port binding here — that belongs in a separate server entry point.
 *
 * LLM calls: ❌ NONE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import { router } from './routes';

export const app = express();
app.use(express.json());
app.use(router);
