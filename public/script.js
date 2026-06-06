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
    // alamat WS dengan backend 
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
    if (item.level >= 80) {
        // Cek apakah sudah pernah dinotifikasi sebelumnya
        if (!notifiedFull[item.id]) {
            if (Notification.permission === "granted") {
                const n = new Notification("Kapasitas Penuh!", {
                    body: `${item.id} sudah mencapai ${item.level}%`,
                    icon: "https://cdn-icons-png.flaticon.com/512/565/565547.png"
                });
                setTimeout(n.close.bind(n), 5000); 
            }
            // Tandai sudah dinotifikasi agar tidak muncul terus-menerus
            notifiedFull[item.id] = true;
        }
    } else {
        // Agar jika penuh lagi di masa depan, notifikasi bisa muncul kembali.
        notifiedFull[item.id] = false;
    }
});
}

function renderStats(data) {
    const countEl = document.getElementById("count");
    const avgEl = document.getElementById("avg");
    const statusEl = document.getElementById("safe");

    countEl.innerText = data.length;
    
    const avg = data.length 
        ? Math.round(data.reduce((a, b) => a + b.level, 0) / data.length) 
        : 0;
    avgEl.innerText = avg + "%";

    // Cari tong yang levelnya sudah mencapai ambang batas (>= 80%)
    const fullBins = data.filter(d => d.level >= 80);

    if (data.length === 0) {
        statusEl.innerText = "-";
        statusEl.style.color = "gray";
    } else if (fullBins.length > 0) {
        // Jika ada yang penuh, ambil semua ID-nya dan gabungkan
        const ids = fullBins.map(b => b.id).join(", ");
        
        // Ubah teks menjadi informasi spesifik, misal: "Tong1 Penuh"
        statusEl.innerText = `${ids} PENUH`; 
        statusEl.style.color = "#ef4444";
    } else {
        // Jika tidak ada yang mencapai 80%, kembali ke status AMAN
        statusEl.innerText = "AMAN";
        statusEl.style.color = "#22c55e";
    }
}

function renderList(data) {
    const list = document.getElementById("list");
    list.innerHTML = "";

    // Di dalam renderList(data)
    data.forEach(item => {
    const div = document.createElement("div");
    // class tambahan untuk notifikasi
    div.className = "item " + (item.level >= 80 ? "full-alert" : "safe-status");
    

        const idLabel = document.createElement("strong");
        idLabel.textContent = 'Id: ' + item.id;


        const info = document.createElement("div");

        const levelText = document.createElement("div");
        levelText.textContent = `Level: ${item.level}%`;

        const timeText = document.createElement("small");
            timeText.textContent =
            "Update: " + formatTimeAgo(item.updated_at);

        info.appendChild(levelText);
        info.appendChild(timeText);

        div.appendChild(idLabel);
        div.appendChild(info);
        list.appendChild(div);
    });
}

function formatTimeAgo(timestamp) {
    const diff = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
);

    if (diff < 5) return "Baru saja";
    if (diff < 60) return diff + " detik lalu";
    if (diff < 3600) return Math.floor(diff / 60) + " menit lalu";

    return new Date(timestamp).toLocaleTimeString();
}

function renderMap(data) {
    data.forEach(item => {
        const isFull = item.level >= 80; // Simpan status penuh dalam boolean
        const color = isFull ? "#ef4444" : "#22c55e";
        const coords = [item.latitude, item.longitude];
        
        const popupContent = `
            Id: <b>${item.id}</b><br>
            Level: ${item.level}%<br>
            Status: ${isFull ? "PENUH" : "AMAN"}
        `;

        if (markers[item.id]) {
            // Update marker yang sudah ada
            markers[item.id]
                .setLatLng(coords)
                .setStyle({ color: color, fillColor: color })
                .getPopup().setContent(popupContent);
            
            // Fokus otomatis hanya untuk Tong1 jika diperlukan
            if (item.id === "Tong1") {
                map.panTo(coords, { animate: true });
            }
        } 
        else {
            // Buat marker baru jika belum ada
            markers[item.id] = L.circleMarker(coords, {
                radius: 10,
                color: color,
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map).bindPopup(popupContent);
        }
        
        // --- LOGIKA POPUP OTOMATIS ---
        if (isFull) {
            // Jika penuh, buka popup
            if (!markers[item.id].isPopupOpen()) {
                markers[item.id].openPopup();
            }
        } else {
            // Jika sudah AMAN, tutup popup secara otomatis
            if (markers[item.id].isPopupOpen()) {
                markers[item.id].closePopup();
            }
        }
        // -----------------------------

        // Efek Visual Pulsing
        const el = markers[item.id].getElement();
        if (el) {
            if (isFull) {
                el.classList.add("pulsing-marker");
            } else {
                el.classList.remove("pulsing-marker");
            }
        }
    });

    // Zoom otomatis pada load pertama
    if (data.length > 0 && isFirstLoad) {
        const bounds = data.map(d => [d.latitude, d.longitude]);
        map.fitBounds(bounds, { padding: [40, 40] });
        isFirstLoad = false;
    }
}

// Handler resize layar
window.addEventListener("resize", () => {
    setTimeout(() => map.invalidateSize(), 300);
});