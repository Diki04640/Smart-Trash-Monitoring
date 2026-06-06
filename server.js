const express = require('express');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const app = express();
let port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === UPDATE: Menambahkan properti "lokasi" pada inisialisasi default data ===
const statusStore = {
  "Tong1": { id: "Tong1", lokasi: "LT2 Indobaru", latitude: 1.119611, longitude: 104.043722, level: 15, updated_at: new Date().toISOString() },
  "Tong2": { id: "Tong2", lokasi: "Gedung A Lantai 1", latitude: 1.120500, longitude: 104.044500, level: 30, updated_at: new Date().toISOString() },
  "Tong3": { id: "Tong3", lokasi: "Gedung B Parkiran", latitude: 1.118500, longitude: 104.042500, level: 50, updated_at: new Date().toISOString() }
};

const MAX_ITEMS = 100;
let wsConnectedClients = new Set();

// GET semua status
app.get('/api/status', (req, res) => {
  try {
    const data = Object.values(statusStore).sort((a, b) => 
      a.id.localeCompare(b.id, undefined, {numeric: true, sensitivity: 'base'})
    );
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('Error GET /api/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST single data atau array
app.post('/api/status', (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    payload.forEach(item => {
      // === UPDATE: Destructuring mengambil 'lokasi' dari ESP8266 ===
      const { id, lokasi, latitude, longitude, level } = item;

      if (!id) return;

      // koordinat 
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      const record = {
        id: String(id).trim(),
        // === UPDATE: Validasi jika nama lokasi kosong, berikan teks default ===
        lokasi: lokasi ? String(lokasi).trim() : "Lokasi Tidak Diketahui",
        latitude: (lat && lat !== 0) ? lat : 1.119611,
        longitude: (lng && lng !== 0) ? lng : 104.043722,
        level: Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : 0,
        updated_at: new Date().toISOString()
      };

      // Simpan ke memory
      statusStore[record.id] = record;
      results.push(record);

      // === UPDATE: Menampilkan nama lokasi di log console server ===
      console.log(`[${record.updated_at}] ${record.id} (${record.lokasi}): Lvl ${record.level}% | Pos: ${record.latitude}, ${record.longitude}`);
      
      // Kirim ke Dashboard secara Real-time via WebSocket
      broadcastUpdate(record);
    });

    res.json({ success: true, saved: results.length });
  } catch (error) {
    console.error('Error POST:', error.message);
    res.status(400).json({ error: 'Invalid format' });
  }
});

// Broadcast update ke semua connected clients
function broadcastUpdate(record) {
  const message = JSON.stringify({
    type: 'update',
    data: record,
    timestamp: new Date().toISOString()
  });
  
  wsConnectedClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else {
      wsConnectedClients.delete(ws);
    }
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    bins_count: Object.keys(statusStore).length 
  });
});

// Serve dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Server error' });
});

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client WebSocket connected. Total clients:', wsConnectedClients.size + 1);
  wsConnectedClients.add(ws);

  // Send initial data
  const initialData = Object.values(statusStore).sort((a, b) => 
    new Date(b.updated_at) - new Date(a.updated_at)
  );
  
  ws.send(JSON.stringify({
    type: 'init',
    data: initialData,
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    wsConnectedClients.delete(ws);
    console.log('Client WebSocket disconnected. Total clients:', wsConnectedClients.size);
  });

  ws.on('error', (error) => {
    console.error('⚠ WebSocket error:', error.message);
    wsConnectedClients.delete(ws);
  });
});

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║     Smart Trash Monitor - Server Ready        ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});

process.on('SIGINT', () => {
  console.log('\n\n Server shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Port ${port} sudah terpakai!`);
    port = port + 1;
    console.log(`🔄 Mencoba port ${port}...`);
    setTimeout(() => {
      const retry = app.listen(port, '0.0.0.0', () => {
        console.log(`Server berhasil di port ${port}`);
      });
      retry.on('error', (err) => {
        console.error('Port masih bermasalah:', err.message);
        process.exit(1);
      });
    }, 1000);
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});