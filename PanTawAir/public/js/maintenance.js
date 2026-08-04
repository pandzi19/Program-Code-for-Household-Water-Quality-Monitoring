/* ============================================================
   WATER MONITORING SYSTEM — MAINTENANCE SCRIPT
   File: maintenance.js  |  Digunakan oleh: maintenance.html
   Dependensi: firebase-config.js (harus dimuat lebih dulu)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const btnClean = document.getElementById('btn-clean-filter');
    const lastCleanedDisplay = document.getElementById('last-cleaned-display');
    const maintenanceList = document.getElementById('maintenance-list');

    // 1. Tampilkan Riwayat dari Firebase
    db.ref("maintenance_logs").orderByChild("timestamp_ms").on("value", (snap) => {
        const logs = [];
        snap.forEach((childSnap) => {
            logs.push({
                id: childSnap.key,
                ...childSnap.val()
            });
        });

        // Urutkan dari yang terbaru (descending)
        logs.reverse();

        if (logs.length > 0) {
            // Update teks "Filter Terakhir Dibersihkan"
            lastCleanedDisplay.innerText = logs[0].timestamp_str;

            // Render list riwayat
            maintenanceList.innerHTML = '';
            logs.forEach(log => {
                const itemHTML = `
                    <div class="flex items-center gap-4 bg-slate-50/80 border border-slate-100 rounded-xl p-4">
                        <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                            <i class="fas fa-broom"></i>
                        </div>
                        <span class="text-sm font-semibold text-slate-700">${log.timestamp_str}</span>
                    </div>
                `;
                maintenanceList.insertAdjacentHTML('beforeend', itemHTML);
            });
        } else {
            lastCleanedDisplay.innerText = "Belum ada data";
            maintenanceList.innerHTML = '<div class="text-sm text-slate-400 italic text-center py-4">Belum ada riwayat pembersihan.</div>';
        }
    });

    // 2. Tambah Catatan Baru saat Tombol Diklik
    btnClean.addEventListener('click', () => {
        // Disable tombol sementara agar tidak double-click
        const originalHtml = btnClean.innerHTML;
        btnClean.disabled = true;
        btnClean.innerHTML = '<i class="fas fa-spinner fa-spin"></i> MENYIMPAN...';

        const now = new Date();
        // Format: YYYY-MM-DD HH:mm (seperti di desain)
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        const timestampStr = `${year}-${month}-${day} ${hours}:${minutes}`;

        // Simpan ke Firebase
        db.ref("maintenance_logs").push({
            timestamp_ms: now.getTime(),
            timestamp_str: timestampStr
        }).then(() => {
            showToast('Riwayat pembersihan berhasil dicatat!', 'success');
        }).catch((err) => {
            console.error(err);
            showToast('Gagal menyimpan riwayat', 'error');
        }).finally(() => {
            // Kembalikan tombol
            btnClean.disabled = false;
            btnClean.innerHTML = originalHtml;
        });
    });

    // 4. Cek Kualitas Air 24 Jam Terakhir
    function checkEmergencyWaterQuality() {
        const emergencyBanner = document.getElementById('emergency-banner');
        const offlineBanner = document.getElementById('offline-banner');

        // Cek data kualitas air saat ini
        db.ref("water_quality").on("value", (snap) => {
            const wq = snap.val();

            // Jika tidak ada data sama sekali, sembunyikan semua
            if (!wq) {
                if (emergencyBanner) emergencyBanner.classList.remove('show');
                if (offlineBanner) offlineBanner.classList.remove('show');
                return;
            }

            // --- LANGKAH 1: Cek apakah data masih segar (< 1 jam) ---
            const sekarang = Date.now();
            const BATAS_SEGAR = 60 * 60 * 1000; // 1 jam dalam milidetik
            // Mendukung property timestamp, timestamp_ms atau last_updated
            let timestampData = wq.timestamp || wq.timestamp_ms || wq.last_updated || 0;

            // Jika tidak ada data timestamp, anggap saja selalu segar
            if (timestampData > 0 && (sekarang - timestampData) > BATAS_SEGAR) {
                // Data sudah basi → tampilkan banner offline, sembunyikan darurat
                if (offlineBanner) offlineBanner.classList.add('show');
                if (emergencyBanner) emergencyBanner.classList.remove('show');
                return;
            }

            // Data masih segar → sembunyikan banner offline
            if (offlineBanner) offlineBanner.classList.remove('show');

            // --- LANGKAH 2: Cek kondisi darurat (termasuk TDS) ---
            let isEmergency = false;

            if (wq.wqi !== undefined && wq.wqi < 50) {
                isEmergency = true;
            } else if (wq.ph < 5.0 || wq.ph > 10.0 || wq.turbidity > 200 || wq.tds > 1000.0 || wq.temperature < 20 || wq.temperature > 36) {
                isEmergency = true;
            }

            if (isEmergency) {
                if (emergencyBanner) emergencyBanner.classList.add('show');
            } else {
                if (emergencyBanner) emergencyBanner.classList.remove('show');
            }
        });
    }

    // Panggil fungsi darurat
    checkEmergencyWaterQuality();
});
