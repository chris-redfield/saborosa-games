const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Static site. Hashed-free assets, so keep the cache short in this mockup phase.
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    extensions: ['html'],
  })
);

// Mailing-list stub — swapped for a real provider later.
app.use(express.json());
app.post('/api/subscribe', (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email' });
  }
  console.log(`[subscribe] ${email}`);
  res.json({ ok: true });
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Saborosa Games running at http://localhost:${PORT}`);
});
