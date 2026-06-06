# Smart Trash Monitoring

A modern light-mode web dashboard for monitoring trash bins using an ultrasonic sensor and NodeMCU ESP8266.

## Fitur

- Dashboard monitoring dengan map interaktif
- Status level isi tong sampah
- Integrasi data dari NodeMCU ESP8266 + sensor ultrasonik
- Tampilan bersih dan modern dengan tema light mode

## Cara Pakai

1. Install dependensi Node.js:

```bash
npm install
```

2. Jalankan server:

```bash
npm start
```

3. Buka browser ke `http://localhost:3000`

4. Pasang NodeMCU ESP8266 dan sensor HC-SR04.
5. Sesuaikan `ssid`, `password`, dan `serverHost` di `esp_trash_monitor.ino`.
6. Upload sketch ke papan ESP8266.

## Endpoint API

- `GET /api/status` - Mengambil array status tong sampah
- `POST /api/status` - Mengirim data baru dari ESP8266

### Contoh payload POST

```json
{
  "id": "trash-bin-1",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "level": 72,
  "capacity": 100,
  "battery": 95,
  "timestamp": 1710000000000
}
```

## Integrasi ESP8266

Buka `esp_trash_monitor.ino` dan ganti `YOUR_SSID`, `YOUR_PASSWORD`, dan `serverHost`.

## Struktur Proyek

- `server.js` - backend Express untuk melayani dashboard dan API
- `public/` - asset frontend
- `esp_trash_monitor.ino` - contoh sketch Arduino untuk ESP8266
