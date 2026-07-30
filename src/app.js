require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, service: 'moi-backend', apiBase: '/api' }));
app.get('/api', (req, res) => res.json({ ok: true, service: 'moi-backend', health: '/api/health' }));
app.get('/health', (req, res) => res.json({ ok: true, service: 'moi-backend' }));

app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/units', require('./routes/units'));
app.use('/api/badges', require('./routes/badges'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/resignations', require('./routes/resignations'));
app.use('/api/circulars', require('./routes/circulars'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/stats', require('./routes/stats'));


// Basic error handler — never leak stack traces to clients
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
