const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// webhookのデータ保存先ファイル
const WEBHOOK_FILE = path.join(__dirname, 'webhook_data.jsonl');

// ファイルが存在しなければ作成
if (!fs.existsSync(WEBHOOK_FILE)) {
  fs.writeFileSync(WEBHOOK_FILE, '');
}

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════
//  Webhook エンドポイント
// ══════════════════════════════════════════════════

// POST /webhook  ← FileAIからのWebhookを受け取る
app.post('/webhook', (req, res) => {
  const body = req.body;

  // 受け取った日時を付加してJSONL形式で1行追記
  const record = {
    receivedAt: new Date().toISOString(),
    data: body
  };

  fs.appendFileSync(WEBHOOK_FILE, JSON.stringify(record) + '\n');
  console.log('Webhook received:', JSON.stringify(record));

  res.status(200).json({ success: true, message: 'Webhook received' });
});

// GET /webhook/logs  ← 保存済みデータを全件返す
app.get('/webhook/logs', (req, res) => {
  const content = fs.readFileSync(WEBHOOK_FILE, 'utf-8').trim();
  if (!content) return res.json({ success: true, count: 0, data: [] });

  const lines = content.split('\n').filter(Boolean);
  const data = lines.map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  res.json({ success: true, count: data.length, data: data.reverse() }); // 新しい順
});

// DELETE /webhook/logs  ← ファイルの中身を空にする
app.delete('/webhook/logs', (req, res) => {
  fs.writeFileSync(WEBHOOK_FILE, '');
  console.log('Webhook log cleared');
  res.json({ success: true, message: 'Webhook log cleared' });
});

// ══════════════════════════════════════════════════
//  既存 Items API
// ══════════════════════════════════════════════════
const store = { items: [], logs: [], nextId: 1 };

function addLog(method, p, body, result) {
  store.logs.unshift({ id: Date.now(), timestamp: new Date().toISOString(), method, path: p, body: body || null, result });
  if (store.logs.length > 100) store.logs.pop();
}

app.get('/api/items', (req, res) => {
  const result = { success: true, count: store.items.length, data: store.items };
  addLog('GET', '/api/items', null, result); res.json(result);
});
app.get('/api/items/:id', (req, res) => {
  const item = store.items.find(i => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
});
app.post('/api/items', (req, res) => {
  const { name, value, category } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '"name" is required' });
  const item = { id: store.nextId++, name, value: value ?? null, category: category ?? 'default', createdAt: new Date().toISOString() };
  store.items.push(item);
  const result = { success: true, data: item };
  addLog('POST', '/api/items', req.body, result); res.status(201).json(result);
});
app.put('/api/items/:id', (req, res) => {
  const idx = store.items.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  store.items[idx] = { ...store.items[idx], ...req.body, id: store.items[idx].id };
  res.json({ success: true, data: store.items[idx] });
});
app.delete('/api/items/:id', (req, res) => {
  const idx = store.items.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  const removed = store.items.splice(idx, 1)[0];
  res.json({ success: true, data: removed });
});
app.delete('/api/items', (req, res) => {
  store.items = []; store.nextId = 1;
  res.json({ success: true, message: 'All items deleted' });
});
app.get('/api/logs', (req, res) => res.json({ success: true, count: store.logs.length, data: store.logs }));
app.delete('/api/logs', (req, res) => { store.logs = []; res.json({ success: true, message: 'Logs cleared' }); });
app.get('/api/transform', (req, res) => {
  const summary = store.items.reduce((acc, item) => {
    const cat = item.category || 'default';
    if (!acc[cat]) acc[cat] = { count: 0, values: [] };
    acc[cat].count++;
    if (item.value != null) acc[cat].values.push(Number(item.value));
    return acc;
  }, {});
  const result = Object.entries(summary).map(([category, data]) => ({
    category, count: data.count,
    total: data.values.reduce((s, v) => s + v, 0),
    average: data.values.length ? +(data.values.reduce((s, v) => s + v, 0) / data.values.length).toFixed(2) : null
  }));
  res.json({ success: true, data: result });
});

// ポートバインド（Render対応）
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});