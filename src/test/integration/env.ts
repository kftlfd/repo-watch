import dotenv from 'dotenv';

export function ensureIntegrationTestEnv() {
  dotenv.config({ path: '.env.test' });
}
