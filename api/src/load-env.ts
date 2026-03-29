import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const cwd = process.cwd();
const appEnv = (process.env.APP_ENV || '').trim().toLowerCase();

const candidatePaths = [
  join(cwd, '.env'),
  appEnv ? join(cwd, `.env.${appEnv}`) : null,
  appEnv === 'local' ? join(cwd, '.env.local') : null,
].filter((value): value is string => Boolean(value));

for (const envPath of candidatePaths) {
  if (!existsSync(envPath)) {
    continue;
  }

  loadDotenv({
    path: envPath,
    override: true,
  });
}
