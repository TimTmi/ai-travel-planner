import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Next reads .env only from apps/web, but the repo keeps one .env at its root.
// Only NEXT_PUBLIC_ variables are inlined into the browser bundle.
const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {};

export default nextConfig;
