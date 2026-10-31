import express from 'express';
import path from 'node:path';
import { load, save } from './store.ts';

const PORT = Number(process.env.PORT ?? 5173);
const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/planner', async (_req, res) => {
  try {
    res.json(await load());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/planner', async (req, res) => {
  try {
    await save(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

// Bound to this computer only: the planner is for you, not your network.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Chunk History planner → http://localhost:${PORT}`);
});
