/* ============================================================
   WATER MONITORING SYSTEM — DASHBOARD SCRIPT
   File: dashboard.js  |  Digunakan oleh: index.html
   Dependensi: firebase-config.js (harus dimuat lebih dulu)
   ============================================================ */
// Cek login sudah ditangani oleh firebase-config.js
// Variabel: Menyimpan status terakhir agar notifikasi tidak muncul berulang kali jika status sama
let lastWqiStatus = null;

// Konfigurasi gaya visual untuk card aktivitas (digunakan oleh addActivity dan loadRecentActivities)
const ACTIVITY_STYLES = {
    normal: { icon: 'fa-check-circle', color: 'text-emerald-500', pillBg: 'bg-emerald-100/50', pillText: 'text-emerald-600', pillBorder: 'border-emerald-200', pillLabel: 'Normal' },
    warning: { icon: 'fa-exclamation-triangle', color: 'text-amber-500', pillBg: 'bg-amber-100/50', pillText: 'text-amber-600', pillBorder: 'border-amber-200', pillLabel: 'Waspada' },
    danger: { icon: 'fa-times-circle', color: 'text-red-500', pillBg: 'bg-red-100/50', pillText: 'text-red-600', pillBorder: 'border-red-200', pillLabel: 'Bahaya' }
};

// Template HTML card aktivitas (digunakan oleh addActivity dan loadRecentActivities)
function buildActivityCardHTML(type, timeStr, msg, level) {
    const s = ACTIVITY_STYLES[level] || ACTIVITY_STYLES.normal;
    return `
        <div class="flex flex-col gap-2 p-4 md:p-3 bg-blue-50/40 border border-blue-100 rounded-[14px] transition-all animate-slide-in">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <i class="fas ${s.icon} ${s.color} text-[20px]"></i>
                    <h4 class="text-[13px] font-bold text-slate-800">${type}</h4>
                </div>
                <span class="text-[12px] font-bold text-slate-500">${timeStr}</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-snug ml-8">${msg}</p>
            <div class="ml-8">
                <span class="inline-block text-[10px] font-semibold ${s.pillText} ${s.pillBg} border ${s.pillBorder} px-3 py-1 rounded-full">${s.pillLabel}</span>
            </div>
        </div>`;
}

// 1. LOGIKA AKTIVITAS (Aktivitas Terbaru): Mencatat kejadian penting ke dalam daftar di layar.
function addActivity(type, msg, level = 'normal') {
    const list = document.getElementById('activity-list');
    const badge = document.getElementById('activity-count-badge');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const htmlItem = buildActivityCardHTML(type, timeStr, msg, level);

    if (list) {
        // Hapus teks "Menunggu data..." jika ini data pertama
        if (list.dataset.empty === 'true') {
            list.innerHTML = '';
            list.dataset.empty = 'false';
        }

        // Masukkan data baru di posisi paling atas (afterbegin)
        list.insertAdjacentHTML('afterbegin', htmlItem);

        // Batasi maksimal 6 item agar tidak terlalu panjang kebawah
        if (list.children.length > 6) {
            list.removeChild(list.lastElementChild);
        }

        // Update angka jumlah log di badge
        if (badge) badge.innerText = list.children.length + " entri";
    }

    // Simpan ke Firebase agar persisten dan terbaca saat refresh
    db.ref("recent_activities").push({
        type, msg, level,
        waktu: now.toISOString(),
        timestamp: now.getTime()
    });
}

// 1b. LOAD AKTIVITAS TERBARU DARI FIREBASE (agar persisten saat refresh)
function loadRecentActivities() {
    const list = document.getElementById('activity-list');
    const badge = document.getElementById('activity-count-badge');
    if (!list) return;

    db.ref("recent_activities")
        .orderByChild("timestamp")
        .limitToLast(6)
        .once("value", (snap) => {
            const items = [];
            snap.forEach((child) => {
                items.push(child.val());
            });

            if (items.length === 0) return;

            list.innerHTML = '';
            list.dataset.empty = 'false';

            items.reverse();
            items.forEach(a => {
                const t = new Date(a.waktu);
                const timeStr = t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                list.insertAdjacentHTML('beforeend', buildActivityCardHTML(a.type, timeStr, a.msg, a.level));
            });

            if (badge) badge.innerText = list.children.length + " entri";
        });
}

// 2. LOGIKA WQI (Water Quality Index): Memperbarui SVG gauge lingkaran berdasarkan data Arduino.
function updateWQI(wqiScore, status, ph, ntu, tds) {
    const arcFill = document.getElementById('wqi-arc-fill');
    const scoreEl = document.getElementById('wqi-score');
    const statusEl = document.getElementById('wqi-status');
    const labelEl = document.getElementById('wqi-label');
    const descEl = document.getElementById('wqi-desc');

    let desc = '';
    let color = '';

    if (wqiScore >= 90) {
        desc = 'Air sangat bersih dan cocok untuk semua penggunaan.';
        color = '#10B981'; // Emerald 500 (Hijau)
    } else if (wqiScore >= 75) {
        desc = 'Air umumnya aman namun mungkin ada masalah kecil.';
        color = '#3B82F6'; // Blue 500 (Biru)
    } else if (wqiScore >= 50) {
        desc = 'Kualitas air moderat, tidak ideal untuk penggunaan sensitif.';
        color = '#F59E0B'; // Amber 500 (Kuning)
    } else if (wqiScore >= 25) {
        desc = 'Air tercemar dan kemungkinan tidak aman.';
        color = '#F97316'; // Orange 500 (Orange)
    } else {
        desc = 'Air sangat tercemar dan tidak layak digunakan untuk sebagian besar keperluan.';
        color = '#EF4444'; // Red 500 (Merah)
    }

    // --- Update SVG circular gauge ---
    // Arc 180° dari total circumference 2πr (r=108): 678.58 * 0.5 = 339.29
    const maxArc = 339.29;
    const offset = maxArc * (1 - wqiScore / 100);
    if (arcFill) {
        arcFill.style.strokeDashoffset = offset;
        arcFill.style.stroke = color;
    }

    // --- Update teks di tengah gauge ---
    if (scoreEl) { scoreEl.innerText = wqiScore; scoreEl.style.color = color; }
    if (statusEl) { statusEl.innerText = status || 'Menunggu'; statusEl.style.color = color; }
    if (labelEl) labelEl.style.color = color;
    if (descEl) descEl.innerText = desc;

    // --- Log aktivitas jika status berubah ---
    const isPhAsam = ph < 6.5;
    const isPhBasa = ph > 8.5;
    const isNtuBad = ntu > 200;
    const isTdsBad = tds > 500;

    if (status && status !== lastWqiStatus) {
        if (isPhAsam) addActivity('Sensor pH', 'pH Asam (pH < 6.5)', 'danger');
        else if (isPhBasa) addActivity('Sensor pH', 'pH Basa (pH > 8.5)', 'danger');
        else if (isNtuBad) addActivity('Sensor Kekeruhan', 'Air Keruh !', 'warning');
        else if (isTdsBad) addActivity('Sensor TDS', 'Air Tidak Normal', 'warning');
        else addActivity('Sistem', `Status WQI: ${status}`, 'normal');
        lastWqiStatus = status;
    }
}

// 3. PENYAMBUNG DATA (Real-time Listener): Mendengarkan perubahan data dari Firebase secara langsung.
db.ref("water_quality").on("value", (snap) => {
    const data = snap.val();
    if (!data) return;

    // Menampilkan waktu data terakhir diperbarui
    const bannerEl = document.getElementById('last-update-banner');
    const timeEl = document.getElementById('last-update-time');
    if (data.timestamp && bannerEl && timeEl) {
        const lastDate = new Date(data.timestamp);
        const opsiWaktu = { 
            day: '2-digit', month: 'short', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', 
            timeZone: 'Asia/Jakarta' 
        };
        // Hasilnya misal: "26 Jul 2026 21.45"
        timeEl.innerText = lastDate.toLocaleString('id-ID', opsiWaktu).replace(',', '') + ' WIB';
        bannerEl.classList.remove('hidden');
    }

    // Menampilkan angka sensor ke kotak-kotak di atas, diformat 2 angka di belakang koma
    document.getElementById("ph-val").innerText = parseFloat(data.ph || 0).toFixed(2);
    document.getElementById("turbidity-val").innerText = parseFloat(data.turbidity || 0).toFixed(2);
    document.getElementById("temp-val").innerText = parseFloat(data.temperature || 0).toFixed(2);
    document.getElementById("tds-val").innerText = parseFloat(data.tds || 0).toFixed(2);

    // Memperbarui grafik status air membaca WQI dari Arduino/ESP
    updateWQI(data.wqi || 0, data.status || 'Menunggu', data.ph, data.turbidity, data.tds);
});


// 5. DETEKSI KONEKSI FIREBASE (Offline Banner): Menampilkan banner jika koneksi ke server terputus.
firebase.database().ref('.info/connected').on('value', (snap) => {
    const banner = document.getElementById('offline-banner');
    snap.val() === true
        ? banner.classList.remove('show')
        : banner.classList.add('show');
});

// 6. TREN SENSOR 24 JAM (hourLabels, hourKeys sudah di firebase-config.js)

let trendChart = null;

function initTrendChart() {
    const ctx = document.getElementById('chart-trend-24h');
    if (!ctx) return;
    trendChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: hourLabels,
            datasets: [
                { label: 'pH', data: Array(24).fill(null), borderColor: '#4F46E5', backgroundColor: '#4F46E51A', fill: false, tension: 0.4, pointRadius: 3, borderWidth: 2.5, spanGaps: true, yAxisID: 'y' },
                { label: 'Kekeruhan', hidden: true, data: Array(24).fill(null), borderColor: '#8B5CF6', backgroundColor: '#8B5CF61A', fill: false, tension: 0.4, pointRadius: 3, borderWidth: 2.5, spanGaps: true, yAxisID: 'y1' },
                { label: 'Suhu', data: Array(24).fill(null), borderColor: '#F59E0B', backgroundColor: '#F59E0B1A', fill: false, tension: 0.4, pointRadius: 3, borderWidth: 2.5, spanGaps: true, yAxisID: 'y' },
                { label: 'TDS', hidden: true, data: Array(24).fill(null), borderColor: '#0EA5E9', backgroundColor: '#0EA5E91A', fill: false, tension: 0.4, pointRadius: 3, borderWidth: 2.5, spanGaps: true, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            let unit = '';
                            if (ctx.dataset.label === 'pH') unit = ' pH';
                            if (ctx.dataset.label === 'Kekeruhan') unit = ' NTU';
                            if (ctx.dataset.label === 'Suhu') unit = ' °C';
                            if (ctx.dataset.label === 'TDS') unit = ' mg/L';
                            return `${ctx.dataset.label}: ${ctx.parsed.y}${unit}`;
                        }
                    }
                }
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    suggestedMax: 40,
                    grid: { color: '#F1F5F9' },
                    ticks: { font: { size: 9, family: 'Plus Jakarta Sans' } },
                    title: { display: true, text: 'pH & Suhu', font: { size: 10 } }
                },
                y1: {
                    type: 'linear',
                    display: false,
                    position: 'left',
                    beginAtZero: true,
                    suggestedMax: 400,
                    grid: { color: '#F1F5F9' },
                    ticks: { font: { size: 9, family: 'Plus Jakarta Sans' } },
                    title: { display: true, text: 'Kekeruhan & TDS', font: { size: 10 } }
                },
                x: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 9, weight: 'bold', family: 'Plus Jakarta Sans' }, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}
initTrendChart();
loadRecentActivities();

let currentView = 'left';
const btnToggleChart = document.getElementById('btn-toggle-chart');
if (btnToggleChart) {
    btnToggleChart.addEventListener('click', () => {
        if (!trendChart) return;
        
        if (currentView === 'left') {
            currentView = 'right';
            btnToggleChart.innerText = 'Tampilkan pH & Suhu';
            btnToggleChart.classList.replace('bg-blue-500', 'bg-purple-500');
            btnToggleChart.classList.replace('hover:bg-blue-600', 'hover:bg-purple-600');
            
            trendChart.hide(0); // Sembunyikan pH
            trendChart.hide(2); // Sembunyikan Suhu
            trendChart.show(1); // Tampilkan Kekeruhan
            trendChart.show(3); // Tampilkan TDS
            
            trendChart.options.scales.y.display = false;
            trendChart.options.scales.y1.display = true;
        } else {
            currentView = 'left';
            btnToggleChart.innerText = 'Tampilkan Kekeruhan & TDS';
            btnToggleChart.classList.replace('bg-purple-500', 'bg-blue-500');
            btnToggleChart.classList.replace('hover:bg-purple-600', 'hover:bg-blue-600');
            
            trendChart.show(0); // Tampilkan pH
            trendChart.show(2); // Tampilkan Suhu
            trendChart.hide(1); // Sembunyikan Kekeruhan
            trendChart.hide(3); // Sembunyikan TDS
            
            trendChart.options.scales.y.display = true;
            trendChart.options.scales.y1.display = false;
        }
        trendChart.update();
    });
}

// Listener data log dari Firebase — ambil nilai raw sensor berdasarkan tanggal
let currentLogRef = null;

function loadChartDataForDate(dateStr) {
    if (currentLogRef) {
        currentLogRef.off("value");
    }

    // Gunakan history_logs untuk mengambil data 24 jam di hari apa pun
    currentLogRef = db.ref("history_logs/" + dateStr);
    currentLogRef.on("value", (snap) => {
        const logs = snap.val() || {};
        if (!trendChart) return;

        // Update Grafik dengan raw data langsung
        trendChart.data.datasets[0].data = hourKeys.map(k => logs[k] ? parseFloat(logs[k].ph || 0) : null);
        trendChart.data.datasets[1].data = hourKeys.map(k => logs[k] ? parseFloat(logs[k].turbidity || 0) : null);
        trendChart.data.datasets[2].data = hourKeys.map(k => logs[k] ? parseFloat(logs[k].temperature || 0) : null);
        trendChart.data.datasets[3].data = hourKeys.map(k => logs[k] ? parseFloat(logs[k].tds || 0) : null);
        trendChart.update();
    });
}

// Inisialisasi Date Picker dan Load Data Awal
const datePicker = document.getElementById('history-date-picker');
if (datePicker) {
    const d = new Date();
    const todayLocalStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    
    datePicker.value = todayLocalStr;
    datePicker.max = todayLocalStr; // Tidak bisa pilih tanggal di masa depan

    datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
            loadChartDataForDate(e.target.value);
        }
    });

    // Muat data hari ini saat pertama kali dibuka
    loadChartDataForDate(todayLocalStr);
}
