import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from '../../src/plugins/infrastructure/database/types.js';

export function buildKysely(): Kysely<DB> {
  const dialect = new PostgresDialect({
    pool: new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
    }),
  });
  return new Kysely<DB>({ dialect, plugins: [new CamelCasePlugin()] });
}

export async function truncateTables(db: Kysely<DB>) {
  await db.deleteFrom('subscriptions').execute();
  await db.deleteFrom('repositories').execute();
}
