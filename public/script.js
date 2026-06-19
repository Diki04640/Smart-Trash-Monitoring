let map;
let tileLayer;
let markers = {};
let allData = {};
let notifiedFull = {};
let isFirstLoad = true;

// Status offline murni mendeteksi apakah websocket terputus/USB dicabut
let isDeviceOffline = false; 

document.addEventListener("DOMContentLoaded", () => {
    map = L.map('map').setView([1.119611, 104.043722], 15);

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    function applyTheme(isDark) {
        if (isDark) document.body.classList.remove("light");
        else document.body.classList.add("light");
        loadMapTheme(isDark);
    }
    applyTheme(systemTheme.matches);
    systemTheme.addEventListener("change", (e) => applyTheme(e.matches));

    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    connectWS();
    setTimeout(() => map.invalidateSize(), 800);
});

function loadMapTheme(isDark) {
    if (tileLayer && map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
    const url = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileLayer = L.tileLayer(url, { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
}

function connectWS() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        // Begitu tersambung, set status perangkat langsung ONLINE
        isDeviceOffline = false;
        render();
    };

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
        console.warn("WebSocket putus (USB Dicabut / Koneksi Hilang).");
        //Ketika USB dicabut, WebSocket close dipicu, set ke OFFLINE
        isDeviceOffline = true;
        render();
        setTimeout(connectWS, 3000); // Coba hubungkan kembali
    };

    ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        ws.close();
    };
}

function render() {
    let data = Object.values(allData);
    data.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

    renderStats(data);
    renderList(data);
    renderMap(data);

    // LOGIKA NOTIFIKASI
    data.forEach(item => {
        const isOffline = item.id === "Tong1" && isDeviceOffline;
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
        } else {
            notifiedFull[item.id] = false;
        }
    });
}

function renderStats(data) {
    const countEl = document.getElementById("count");
    const avgEl = document.getElementById("avg");
    const statusEl = document.getElementById("safe");

    countEl.innerText = data.length;
    const avg = data.length ? Math.round(data.reduce((a, b) => a + b.level, 0) / data.length) : 0;
    avgEl.innerText = avg + "%";

    const fullBins = data.filter(d => d.level >= 80);
    if (data.length === 0) {
        statusEl.innerText = "-";
        statusEl.style.color = "gray";
    } else if (fullBins.length > 0 && !(allData["Tong1"] && isDeviceOffline)) {
        const infoPenuh = fullBins.map(b => `${b.id} (${b.lokasi || '?'})`).join(", ");
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
        //Logika Offline
        const isOffline = item.id === "Tong1" && isDeviceOffline; 

        const div = document.createElement("div");
        div.className = "item " + (isOffline ? "offline-alert" : (item.level >= 80 ? "full-alert" : "safe-status"));
        
        // Desain border penuh keliling kotak status
        if (isOffline) {
            div.style.border = "1.5px solid #95a5a6"; 
            div.style.backgroundColor = "rgba(149, 165, 166, 0.08)";
            div.style.opacity = "0.65"; 
            div.style.boxShadow = "none";
        } else if (item.level >= 80) {
            div.style.border = "1.5px solid #ef4444"; 
        } else {
            div.style.border = "1.5px solid #22c55e"; 
            div.style.backgroundColor = "rgba(34, 197, 94, 0.05)";
            div.style.boxShadow = "none";
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
        
        if (isOffline) {
            levelText.textContent = `Status: PERANGKAT OFFLINE`;
            levelText.style.color = "#95a5a6"; 
        } else {
            levelText.textContent = `Level: ${item.level}%`;
            levelText.style.color = "inherit";
        }

        //JAM UPDATE
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
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

function renderMap(data) {
    data.forEach(item => {
        const isOffline = item.id === "Tong1" && isDeviceOffline;
        const isFull = item.level >= 80; 
        
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
        } else {
            markers[item.id] = L.circleMarker(coords, {
                radius: 10, color: color, fillColor: color, fillOpacity: 0.8, weight: 2
            }).addTo(map).bindPopup(popupContent);
        }
        
        // Kontrol Buka/Tutup Pop-up Peta
        if (isOffline) {
            if (markers[item.id].isPopupOpen()) markers[item.id].closePopup();
        } else if (isFull) {
            if (!markers[item.id].isPopupOpen()) markers[item.id].openPopup();
        } else {
            if (markers[item.id].isPopupOpen()) markers[item.id].closePopup();
        }

        const el = markers[item.id].getElement();
        if (el) {
            if (isFull && !isOffline) {
                if (!el.classList.contains("pulsing-marker")) el.classList.add("pulsing-marker");
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