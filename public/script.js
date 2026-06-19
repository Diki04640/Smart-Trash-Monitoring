let map;
let tileLayer;
let markers = {};
let allData = {};
let notifiedFull = {};
let isFirstLoad = true;

document.addEventListener("DOMContentLoaded", () => {
    // 1. Inisialisasi Map Terlebih Dahulu
    map = L.map('map').setView([1.119611, 104.043722], 15);

    // 2. Deteksi & Terapkan Tema
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    
    function applyTheme(isDark) {
        if (isDark) {
            document.body.classList.remove("light");
        } else {
            document.body.classList.add("light");
        }
        loadMapTheme(isDark);
    }

    // Jalankan awal
    applyTheme(systemTheme.matches);

    // Listener jika user ganti tema OS saat app jalan
    systemTheme.addEventListener("change", (e) => applyTheme(e.matches));

    // 3. Izin Notifikasi
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // 4. Hubungkan WebSocket
    connectWS();

    // Fix bug layout map
    setTimeout(() => map.invalidateSize(), 800);
});

function loadMapTheme(isDark) {
    if (tileLayer && map.hasLayer(tileLayer)) {
        map.removeLayer(tileLayer);
    }

    const url = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    tileLayer = L.tileLayer(url, {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function connectWS() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === "init") {
                allData = {};
                msg.data.forEach(d => allData[d.id] = d);
            } else if (msg.type === "update") {
                allData[msg.data.id] = msg.data;
            }
            render();
        } catch (err) {
            console.error("Gagal parsing data:", err);
        }
    };

    ws.onclose = () => {
        console.warn("WebSocket putus. Mencoba menyambung kembali...");
        setTimeout(connectWS, 3000);
    };

    ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        ws.close();
    };
}

function render() {
    let data = Object.values(allData);

    // (SORT BY ID)
    data.sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    );

    renderStats(data);
    renderList(data);
    renderMap(data);

    // NOTIFIKASI //
    data.forEach(item => {
        // Hanya kirim notifikasi jika perangkat TIDAK dalam kondisi offline
        const timeServer = new Date(item.updated_at).getTime();
        const timeLocal = new Date().getTime();
        const isOffline = Math.floor((timeLocal - timeServer) / 1000) > 180;

        if (item.level >= 80 && !isOffline) {
            const lokasiText = item.lokasi ? item.lokasi : "Lokasi Tidak Diketahui";
            if (!notifiedFull[item.id]) {
                if (Notification.permission === "granted") {
                    const n = new Notification(`${item.id} Penuh!`, {
                        body: `Lokasi: ${lokasiText}\nKapasitas sudah mencapai ${item.level}%`,
                        icon: "https://cdn-icons-png.flaticon.com/512/565/565547.png"
                    });
                    setTimeout(n.close.bind(n), 5000); 
                }
                notifiedFull[item.id] = true;
            }
        } else if (item.level < 80 || isOffline) {
            notifiedFull[item.id] = false;
        }
    });
}

function renderStats(data) {
    const countEl = document.getElementById("count");
    const avgEl = document.getElementById("avg");
    const statusEl = document.getElementById("safe");

    // Hanya hitung statistik dari perangkat yang saat ini online saja
    const onlineBins = data.filter(item => {
        const timeServer = new Date(item.updated_at).getTime();
        const timeLocal = new Date().getTime();
        return Math.floor((timeLocal - timeServer) / 1000) <= 180;
    });

    countEl.innerText = onlineBins.length;
    
    const avg = onlineBins.length 
        ? Math.round(onlineBins.reduce((a, b) => a + b.level, 0) / onlineBins.length) 
        : 0;
    avgEl.innerText = avg + "%";

    const fullBins = onlineBins.filter(d => d.level >= 80);

    if (onlineBins.length === 0) {
        statusEl.innerText = "SEMUA OFFLINE";
        statusEl.style.color = "#95a5a6";
    } else if (fullBins.length > 0) {
        const infoPenuh = fullBins.map(b => {
            const loc = b.lokasi ? ` (${b.lokasi})` : '';
            return `${b.id}${loc}`;
        }).join(", ");
        
        statusEl.innerText = `${infoPenuh} PENUH`; 
        statusEl.style.color = "#ef4444";
    } else {
        statusEl.innerText = "AMAN";
        statusEl.style.color = "#22c55e";
    }
}

function renderList(data) {
    const list = document.getElementById("list");
    list.innerHTML = "";

    data.forEach(item => {
        // 🔥 LOGIKA DETEKSI OFFLINE (DI-UPDATE SECARA PRECISI)
        const timeServer = new Date(item.updated_at).getTime();
        const timeLocal = new Date().getTime();
        const diffSeconds = Math.floor((timeLocal - timeServer) / 1000);
        const isOffline = diffSeconds > 180; // Lewat 3 menit = Offline

        const div = document.createElement("div");
        // Beri kelas CSS penanda alert sesuai kondisi real-time data
        div.className = "item " + (isOffline ? "offline-alert" : (item.level >= 80 ? "full-alert" : "safe-status"));
        
        if (isOffline) {
            div.style.borderLeft = "5px solid #95a5a6"; 
            div.style.opacity = "0.65"; 
        }

        const idLabel = document.createElement("strong");
        idLabel.textContent = 'Id: ' + item.id;

        const info = document.createElement("div");

        const lokasiText = item.lokasi ? item.lokasi : "Lokasi Tidak Diketahui";
        const locationEl = document.createElement("div");
        locationEl.className = "item-location";
        locationEl.innerHTML = `<span style="font-weight: 600;">${lokasiText}</span>`;
        locationEl.style.fontSize = "0.85rem";
        locationEl.style.color = "var(--text-muted, #7f8c8d)";
        locationEl.style.margin = "3px 0";

        const levelText = document.createElement("div");
        levelText.style.fontWeight = "bold";
        
        // 🌟 KONDISIONAL TEKS: Jika offline ubah teks level menjadi status error
        if (isOffline) {
            levelText.textContent = `Status: PERANGKAT OFFLINE`;
            levelText.style.color = "#ef4444"; 
        } else {
            levelText.textContent = `Level: ${item.level}%`;
            levelText.style.color = "inherit";
        }

        const timeText = document.createElement("small");
        timeText.textContent = "Update: " + formatTimeAgo(item.updated_at);

        info.appendChild(locationEl); 
        info.appendChild(levelText);
        info.appendChild(timeText);

        div.appendChild(idLabel);
        div.appendChild(info);
        list.appendChild(div);
    });
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return "Data belum masuk";
    
    return new Date(timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true
    });
}

function renderMap(data) {
    data.forEach(item => {
        // 🔥 LOGIKA SINKRONISASI WARNA MARKER PETA SAAT OFFLINE
        const timeServer = new Date(item.updated_at).getTime();
        const timeLocal = new Date().getTime();
        const isOffline = Math.floor((timeLocal - timeServer) / 1000) > 180;

        const isFull = item.level >= 80; 
        
        // Pilih skema warna penanda peta
        const color = isOffline ? "#95a5a6" : (isFull ? "#ef4444" : "#22c55e");
        const coords = [item.latitude, item.longitude];
        
        const lokasiText = item.lokasi ? item.lokasi : "Lokasi Tidak Diketahui";
        const popupContent = `
            <div style="font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.4;">
                Id: <b>${item.id}</b><br>
                Lokasi: <b>${lokasiText}</b><br>
                Level: <span style="font-weight: bold; color: ${color}">${isOffline ? "OFFLINE" : item.level + "%"}</span><br>
                Status: <span style="font-weight: bold; color: ${color}">${isOffline ? "DISCONNECTED" : (isFull ? "PENUH" : "AMAN")}</span>
            </div>
        `;

        if (markers[item.id]) {
            markers[item.id]
                .setLatLng(coords)
                .setStyle({ color: color, fillColor: color })
                .getPopup().setContent(popupContent);
            
            if (item.id === "Tong1" && !isOffline) {
                map.panTo(coords, { animate: true });
            }
        } 
        else {
            markers[item.id] = L.circleMarker(coords, {
                radius: 10,
                color: color,
                fillColor: color,
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map).bindPopup(popupContent);
        }
        
        // Manajemen kontrol popup otomatis di peta Leaflet
        if (isFull && !isOffline) {
            if (!markers[item.id].isPopupOpen()) {
                markers[item.id].openPopup();
            }
        } else {
            if (markers[item.id].isPopupOpen()) {
                markers[item.id].closePopup();
            }
        }

        const el = markers[item.id].getElement();
        if (el) {
            if (isFull && !isOffline) {
                el.classList.add("pulsing-marker");
            } else {
                el.classList.remove("pulsing-marker");
            }
        }
    });

    if (data.length > 0 && isFirstLoad) {
        const bounds = data.map(d => [d.latitude, d.longitude]);
        map.fitBounds(bounds, { padding: [40, 40] });
        isFirstLoad = false;
    }
}

window.addEventListener("resize", () => {
    setTimeout(() => map.invalidateSize(), 300);
});

// =========================================================================
// 🔥 ENGINE TIMER INTERVAL UTAMA (MEMAKSA SINKRONISASI REAL-TIME CLOCK)
// =========================================================================
setInterval(() => {
    let data = Object.values(allData);
    if (data.length > 0) {
        // Jalankan evaluasi ulang durasi waktu lokal vs server secara berkala
        renderList(data);
        renderMap(data);
        renderStats(data);
    }
}, 5000); // Mengecek kondisi umur data setiap 5 detik sekali