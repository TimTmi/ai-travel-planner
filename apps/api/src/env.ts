import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Local runs read the repo-root .env; in CI and production the variables are set directly.
const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}
