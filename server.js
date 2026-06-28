import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

//  POST /api/analyze 
// Proxies a prompt to Claude and returns the text result.
app.post('/api/analyze', async (req, res) => {
  const { prompt, mode } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  // Fun mode gets a bit more creative latitude
  const isFun       = mode === 'fun';
  const max_tokens  = isFun ? 500 : 350;
  const temperature = isFun ? 1.1 : 0.4;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Claude] error:', err);
      return res.status(502).json({ error: 'Claude API error' });
    }

    const data   = await response.json();
    const result = data.content?.[0]?.text || '';
    res.json({ result });

  } catch (err) {
    console.error('[/api/analyze]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//  GET /api/coindetail?coinType= 
// Fetches price, market cap, holders, and supply from BlockVision.
app.get('/api/coindetail', async (req, res) => {
  const { coinType } = req.query;
  if (!coinType) return res.status(400).json({ error: 'coinType required' });

  try {
    const url      = `https://api.blockvision.org/v2/sui/coin/detail?coinType=${encodeURIComponent(coinType)}`;
    const response = await fetch(url, {
      headers: {
        'Accept':    'application/json',
        'x-api-key': process.env.BLOCKVISION_API_KEY,
      },
    });

    if (!response.ok) {
      console.warn('[BlockVision] coindetail →', response.status);
      return res.status(response.status).json({ error: 'BlockVision error' });
    }

    const data = await response.json();
    res.json({ result: data?.result ?? data });

  } catch (err) {
    console.error('[/api/coindetail]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//  GET /api/holders?coinType= ─
// Fetches the top 10 holders for a given coin type from BlockVision.
app.get('/api/holders', async (req, res) => {
  const { coinType } = req.query;
  if (!coinType) return res.status(400).json({ error: 'coinType required' });

  try {
    const url      = `https://api.blockvision.org/v2/sui/coin/holders?coinType=${encodeURIComponent(coinType)}&pageIndex=1&pageSize=10`;
    const response = await fetch(url, {
      headers: {
        'Accept':    'application/json',
        'x-api-key': process.env.BLOCKVISION_API_KEY,
      },
    });

    if (!response.ok) {
      console.warn('[BlockVision] holders →', response.status);
      return res.status(response.status).json({ error: 'BlockVision error' });
    }

    const data    = await response.json();
    const holders = data?.result?.data ?? data?.data ?? [];
    const total   = data?.result?.total ?? data?.total ?? holders.length;
    res.json({ data: holders, totalElements: total });

  } catch (err) {
    console.error('[/api/holders]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//  Catch-all → serve index.html ─
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`YetiScan running → http://localhost:${PORT}`);
});
