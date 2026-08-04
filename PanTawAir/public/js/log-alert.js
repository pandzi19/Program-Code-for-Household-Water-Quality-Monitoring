/* ============================================================
   WATER MONITORING SYSTEM — LOG ALERT SCRIPT
   File: log-alert.js  |  Digunakan oleh: log-alert.html
   Dependensi: firebase-config.js (harus dimuat lebih dulu)
   Berfungsi untuk memproses, memfilter, dan menampilkan riwayat alert.
   ============================================================ */
// Cek login sudah ditangani oleh firebase-config.js
/* ── 1. VARIABEL GLOBAL ──────────────────────────────────── */
let allLogs = [];
let currentPage = 1;
const rowsPerPage = 10;

/* ── 2. CUSTOM CONFIRM DIALOG — menggantikan confirm() blocking ── */
function showConfirm(onConfirm) {
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.add('show');

    document.getElementById('confirm-ok').onclick = () => {
        overlay.classList.remove('show');
        onConfirm();
    };
    document.getElementById('confirm-cancel').onclick = () => {
        overlay.classList.remove('show');
    };
}

// 3. FUNGSI FILTER GABUNGAN (Pencarian + Dropdown): Menyaring data berdasarkan sensor atau kata kunci.
function applyAllFilters() {
    const keyword = document.getElementById('search-input').value.toLowerCase(); // Ambil teks dari kotak cari
    const sensorFilter = document.getElementById('sensor-filter').value.toLowerCase(); // Ambil pilihan dari dropdown

    // Melakukan penyaringan pada array 'allLogs'
    const filteredData = allLogs.filter(log => {
        const sensorFilterVal = sensorFilter === "" || (log.sensor || "").toLowerCase().includes(sensorFilter);
        const matchesKeyword =
            (log.displayWaktu || log.waktu || "").toLowerCase().includes(keyword) ||
            (log.waktu || "").toLowerCase().includes(keyword) ||
            (log.sensor || "").toLowerCase().includes(keyword) ||
            (log.parameter || "").toLowerCase().includes(keyword) ||
            (log.nilai != null ? log.nilai.toString() : "").includes(keyword) ||
            (log.detail || "").toLowerCase().includes(keyword);

        return sensorFilterVal && matchesKeyword; // Data harus cocok dengan sensor DAN kata kunci
    });

    renderTable(currentPage, filteredData); // Gambar ulang tabel dengan data hasil filter
}

/* ── 4. FUNGSI RENDER TABEL ──────────────────────────────── */
function renderTable(page, dataToRender = allLogs) {
    const tableBody = document.querySelector("tbody");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    currentPage = page;

    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedItems = dataToRender.slice(start, end);

    if (paginatedItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-8 py-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Tidak ada data ditemukan</td></tr>`;
        document.getElementById('log-info').innerText = "Tidak ada data";
        updatePaginationUI(dataToRender);
        return;
    }

    paginatedItems.forEach((data) => {
        const isDanger = data.status === 'danger' || data.status === 'kritis';
        const statusClass = isDanger
            ? 'bg-red-50 text-red-600 border-red-100'
            : 'bg-amber-50 text-amber-600 border-amber-100';
        const detailTeks = data.detail || "Tidak ada penjelasan";

        // Format nilai menjadi 2 angka di belakang koma
        const formattedNilai = !isNaN(parseFloat(data.nilai)) ? parseFloat(data.nilai).toFixed(2) : data.nilai;

        const row = `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
                <td class="px-8 py-5 text-[11px] font-bold text-slate-500">${data.displayWaktu || data.waktu}</td>
                <td class="px-8 py-5"><span class="bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase">${data.sensor}</span></td>
                <td class="px-8 py-5 text-xs font-bold text-slate-700">${data.parameter}</td>
                <td class="px-8 py-5 text-xs font-black text-slate-800">${formattedNilai}</td>
                <td class="px-8 py-5">
                    <span class="inline-flex items-center gap-1.5 ${statusClass} px-3 py-1.5 rounded-full text-[9px] font-black uppercase border">
                        ${isDanger ? 'Kritis' : 'Waspada'}
                    </span>
                </td>
                <td class="px-8 py-5 text-[12px] font-black text-slate-800 italic max-w-[25%]">${detailTeks}</td>
            </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });

    document.getElementById('log-info').innerText =
        `Menampilkan ${paginatedItems.length} dari ${dataToRender.length} log`;
    updatePaginationUI(dataToRender);
}

/* ── 5. UPDATE UI PAGINATION ─────────────────────────────── */
function updatePaginationUI(dataToRender) {
    const controlsContainer = document.getElementById('pagination-controls');
    const pageInfo = document.getElementById('page-info');
    if (!controlsContainer || !pageInfo) return;

    controlsContainer.innerHTML = "";
    const totalPages = Math.ceil(dataToRender.length / rowsPerPage) || 1;
    pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;

    const btnClass = "px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all";

    const btnPrev = document.createElement('button');
    btnPrev.innerHTML = '<i class="fas fa-chevron-left text-[10px]"></i>';
    btnPrev.className = btnClass;
    btnPrev.disabled = currentPage === 1;
    btnPrev.onclick = () => renderTable(currentPage - 1, dataToRender);

    const btnNext = document.createElement('button');
    btnNext.innerHTML = '<i class="fas fa-chevron-right text-[10px]"></i>';
    btnNext.className = btnClass;
    btnNext.disabled = currentPage === totalPages;
    btnNext.onclick = () => renderTable(currentPage + 1, dataToRender);

    controlsContainer.appendChild(btnPrev);
    controlsContainer.appendChild(btnNext);
}

/* ── 6. EVENT LISTENERS ──────────────────────────────────── */
document.getElementById('search-input').addEventListener('input', () => {
    currentPage = 1;
    applyAllFilters();
});
document.getElementById('sensor-filter').addEventListener('change', () => {
    currentPage = 1;
    applyAllFilters();
});

// Tombol Reset → Custom Confirm Dialog (bukan confirm() blocking)
document.getElementById('btn-reset').addEventListener('click', function () {
    showConfirm(() => {
        db.ref("history_alerts").remove()
            .then(() => {
                showToast('Semua data berhasil dihapus.', 'success');
                // Tidak perlu location.reload() — Firebase listener otomatis memperbarui tabel
            })
            .catch(err => {
                showToast('Gagal menghapus: ' + err.message, 'error');
            });
    });
});

/* ── 7. FIREBASE REAL-TIME LISTENERS ────────────────────── */
db.ref("history_alerts").on("value", (snapshot) => {
    allLogs = [];
    snapshot.forEach((child) => {
        let log = child.val();

        // Ubah format string tanggal dari "DD/MM/YYYY HH:MM:SS" menjadi "Hari, DD Bulan YYYY HH:MM:SS"
        let displayWaktu = log.waktu;
        if (log.waktu && log.waktu.includes('/')) {
            const parts = log.waktu.split(' ');
            if (parts.length >= 2) {
                const dateParts = parts[0].split('/');
                if (dateParts.length === 3) {
                    const [dd, mm, yyyy] = dateParts;
                    const d = new Date(`${yyyy}-${mm}-${dd}T${parts[1]}`);
                    if (!isNaN(d.getTime())) {
                        displayWaktu = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                }
            }
        }
        log.displayWaktu = displayWaktu;
        allLogs.push(log);
    });
    allLogs.reverse();
    applyAllFilters();
});
