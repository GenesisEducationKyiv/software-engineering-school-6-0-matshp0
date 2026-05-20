import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { Pool } from 'pg';

function loadEnvFile(path: string) {
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

async function waitForDb(url: string, retries = 20, delayMs = 1500) {
  const pool = new Pool({ connectionString: url });
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  await pool.end();
  throw new Error('Test database did not become ready in time');
}

export async function setup() {
  loadEnvFile('.env.test');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  await waitForDb(dbUrl);
  execSync('node_modules/.bin/prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
}
