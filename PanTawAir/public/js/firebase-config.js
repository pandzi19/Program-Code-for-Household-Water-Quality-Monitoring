/* ============================================================
   WATER MONITORING SYSTEM — SHARED CONFIG
   File: firebase-config.js
   Digunakan oleh: index.html, log-alert.html & maintenance.html
   Berisi: Konfigurasi Firebase + fungsi showToast() bersama.
   ============================================================ */

// 1. KONFIGURASI FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBHhRbZUXGQ5UMVIasbuoHybWp14QPcACA",
    authDomain: "monitoring-kualitas-air-a4800.firebaseapp.com",
    databaseURL: "https://monitoring-kualitas-air-a4800-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "monitoring-kualitas-air-a4800",
    storageBucket: "monitoring-kualitas-air-a4800.firebasestorage.app",
    messagingSenderId: "508413883808",
    appId: "1:508413883808:web:3e407e9432ed02660060c5"
};

// Mengaktifkan layanan Firebase di browser (cek duplikat agar aman)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

// 2. KONSTANTA BERSAMA
const hourLabels = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
const hourKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];

// 4. TOAST NOTIFICATION
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 5. LOGOUT — Sign out dari Firebase Auth + hapus localStorage
function logout() {
    firebase.auth().signOut().then(() => {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('namaUser');
        localStorage.removeItem('role');
        localStorage.removeItem('uid');
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Logout error:', error);
    });
}

// 6. TAMPILKAN NAMA USER & JAM
document.addEventListener('DOMContentLoaded', function () {
    const namaUser = localStorage.getItem('namaUser');
    if (namaUser && document.getElementById('display-nama-user')) {
        document.getElementById('display-nama-user').innerText = namaUser;
    }

    function updateClock() {
        const now = new Date();
        const el = document.getElementById('header-date-display');
        if (el) {
            el.innerText = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
    }
    if (document.getElementById('header-date-display')) {
        setInterval(updateClock, 60000);
        updateClock();
    }
});

// 7. CEK LOGIN
if (!window.location.pathname.includes('login')) {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // Sesi Firebase valid → perbarui localStorage
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('uid', user.uid);
        } else {
            // Sesi Firebase tidak valid → paksa logout
            localStorage.clear();
            window.location.href = 'login.html';
        }
    });
}