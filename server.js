const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// メモリ上のデータストア
const store = { items: [], logs: [], nextId: 1 };

function addLog(method, path, body, result) {
  store.logs.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    method, path,
    body: body || null,
    result
  });
  if (store.logs.length > 100) store.logs.pop();
}

// GET 一覧
app.get('/api/items', (req, res) => {
  const result = { success: true, count: store.items.length, data: store.items };
  addLog('GET', '/api/items', null, result);
  res.json(result);
});

// GET 単件
app.get('/api/items/:id', (req, res) => {
  const item = store.items.find(i => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  const result = { success: true, data: item };
  addLog('GET', `/api/items/${req.params.id}`, null, result);
  res.json(result);
});

// POST 作成
app.post('/api/items', (req, res) => {
  const { name, value, category } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '"name" is required' });
  const item = {
    id: store.nextId++,
    name,
    value: value ?? null,
    category: category ?? 'default',
    createdAt: new Date().toISOString()
  };
  store.items.push(item);
  const result = { success: true, data: item };
  addLog('POST', '/api/items', req.body, result);
  res.status(201).json(result);
});

// PUT 更新
app.put('/api/items/:id', (req, res) => {
  const idx = store.items.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  store.items[idx] = { ...store.items[idx], ...req.body, id: store.items[idx].id };
  const result = { success: true, data: store.items[idx] };
  addLog('PUT', `/api/items/${req.params.id}`, req.body, result);
  res.json(result);
});

// DELETE 単件
app.delete('/api/items/:id', (req, res) => {
  const idx = store.items.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  const removed = store.items.splice(idx, 1)[0];
  const result = { success: true, data: removed };
  addLog('DELETE', `/api/items/${req.params.id}`, null, result);
  res.json(result);
});

// DELETE 全件
app.delete('/api/items', (req, res) => {
  store.items = []; store.nextId = 1;
  res.json({ success: true, message: 'All items deleted' });
});

// GET ログ
app.get('/api/logs', (req, res) => {
  res.json({ success: true, count: store.logs.length, data: store.logs });
});

// DELETE ログクリア
app.delete('/api/logs', (req, res) => {
  store.logs = [];
  res.json({ success: true, message: 'Logs cleared' });
});

// GET 集計
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
    average: data.values.length
      ? +(data.values.reduce((s, v) => s + v, 0) / data.values.length).toFixed(2)
      : null
  }));
  res.json({ success: true, data: result });
});

// ★ポイント: '0.0.0.0' を指定してRenderで動くようにする
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
