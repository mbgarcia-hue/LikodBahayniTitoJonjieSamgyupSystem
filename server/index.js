import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import database from './database.js';
import { installDining } from './dining.js';

const app = express();
const port = Number(process.env.PORT) || 3001;
const root = fileURLToPath(new URL('..', import.meta.url));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => {
  database.prepare('SELECT 1').get();
  res.json({ status: 'ok', database: 'sqlite', apiVersion: 'role-accounts-v1' });
});
installDining(app);
// The old generic CRUD endpoints must not bypass visit and payment validation.
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found. Use the dining workflow.' }));
if (existsSync(resolve(root, 'dist/index.html'))) {
  app.use(express.static(resolve(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/index.html')));
}
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
});
const server = app.listen(port, '0.0.0.0');
server.on('listening', () => console.log(`Restaurant API listening on http://localhost:${port}`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Cannot start Restaurant API: port ${port} is already in use. Stop the existing restaurant server before starting another instance.`
    : `Cannot start Restaurant API: ${error.message}`);
  database.close();
  process.exitCode = 1;
});
