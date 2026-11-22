import type { NestApplicationOptions } from '@nestjs/common';

// Shared by main.ts and the test app, so the contract tests run the API exactly as production does.
// bodyParser is off: Nest's parser runs as middleware, before guards, and would answer
// 400 invalid-json before the 401/404/403 checks the contracts require first.
// Handlers read their body with readJsonBody after those checks.
export const APP_OPTIONS = { bodyParser: false } satisfies NestApplicationOptions;
