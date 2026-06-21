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

const statusStore = {
  "Tong1": { id: "Tong1", lokasi: "Kost Mitra", latitude: 1.119611, longitude: 104.043722, level: 0, status: "online", updated_at: new Date().toISOString() },
  "Tong2": { id: "Tong2", lokasi: "Gedung A Lantai 1", latitude: 1.120500, longitude: 104.044500, level: 30, status: "online", updated_at: new Date().toISOString() },
  "Tong3": { id: "Tong3", lokasi: "Gedung B Parkiran", latitude: 1.118500, longitude: 104.042500, level: 50, status: "online", updated_at: new Date().toISOString() }
};

const MAX_ITEMS = 100;
let wsConnectedClients = new Set();

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

app.post('/api/status', (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    payload.forEach(item => {
      const { id, lokasi, latitude, longitude, level } = item;

      if (!id) return;

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      const record = {
        id: String(id).trim(),
        lokasi: lokasi ? String(lokasi).trim() : "Lokasi Tidak Diketahui",
        latitude: (lat && lat !== 0) ? lat : 1.119611,
        longitude: (lng && lng !== 0) ? lng : 104.043722,
        level: Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : 0,
        status: "online",
        updated_at: new Date().toISOString()
      };


      statusStore[record.id] = record;
      results.push(record);

      console.log(`[${record.updated_at}] ${record.id} (${record.lokasi}): Lvl ${record.level}% | Pos: ${record.latitude}, ${record.longitude} | Status: ${record.status}`);
      
      broadcastUpdate(record);
    });

    res.json({ success: true, saved: results.length });
  } catch (error) {
    console.error('Error POST:', error.message);
    res.status(400).json({ error: 'Invalid format' });
  }
});


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

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    bins_count: Object.keys(statusStore).length 
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Server error' });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client WebSocket connected. Total clients:', wsConnectedClients.size + 1);
  wsConnectedClients.add(ws);

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

server.listen(port, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║      Smart Trash Monitor - Server Ready        ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});

setInterval(() => {
  const waktuSekarang = new Date().getTime();

  Object.values(statusStore).forEach(item => {
    // ⚠️ KUNCI UTAMA: Hanya lakukan pengecekan offline jika ID-nya adalah "Tong1"
    // Tong2 dan Tong3 (data dummy) akan dilewati dan statusnya tetap "online"
    if (item.id === "Tong1") {
      const waktuDataServer = new Date(item.updated_at).getTime();
      const selisihDetik = Math.floor((waktuSekarang - waktuDataServer) / 1000);

      // Jika Tong1 tidak mengirim data lebih dari 30 detik DAN statusnya belum offline
      if (selisihDetik > 30 && item.status !== "offline") {
        item.status = "offline"; 

        console.log(`[ALERT] Perangkat ${item.id} (Murni IoT) mati/dicabut selama ${selisihDetik} detik. Menyiarkan status OFFLINE.`);
        
        // Siarkan status offline Tong1 ke dashboard browser
        broadcastUpdate(item);
      }
    }
  });
}, 4000);

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