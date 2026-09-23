import fs from 'node:fs';

// Side-effect module: load .env (if present) before config reads process.env.
// Must be the first import in the entrypoint.
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}
