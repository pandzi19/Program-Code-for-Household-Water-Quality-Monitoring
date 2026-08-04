// Cek jika sudah login, langsung ke dashboard
if (localStorage.getItem('isLoggedIn') === 'true') {
    window.location.href = 'index.html';
}

document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailInput = document.getElementById('email').value.trim();
    const passForm = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');
    const btnBtn = document.getElementById('btn-login');

    btnBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memeriksa...';
    btnBtn.disabled = true;

    try {
        // Login menggunakan Firebase Auth dengan email dan password
        const userCredential = await firebase.auth().signInWithEmailAndPassword(emailInput, passForm);
        const user = userCredential.user;

        localStorage.setItem('isLoggedIn', 'true');
        // Ambil bagian sebelum @ pada email sebagai nama user sementara
        const defaultName = user.email ? user.email.split('@')[0] : 'admin';
        localStorage.setItem('namaUser', user.displayName || defaultName);
        localStorage.setItem('uid', user.uid);

        // Coba ambil role dari database, jika gagal atau tidak ada gunakan admin
        try {
            const snapshot = await db.ref('users/' + user.uid).once('value');
            if (snapshot.exists() && snapshot.val().role) {
                localStorage.setItem('role', snapshot.val().role);
            } else {
                localStorage.setItem('role', 'admin');
            }
        } catch (err) {
            localStorage.setItem('role', 'admin');
            console.log("Tidak dapat mengambil role, default ke admin.");
        }

        // Coba update last_login
        try {
            await db.ref('users/' + user.uid).update({
                last_login: new Date().toISOString()
            });
        } catch (err) {
            console.log("Tidak ada akses write untuk update last_login, diabaikan.");
        }

        window.location.href = 'index.html';

    } catch (error) {
        console.error("Error:", error);

        let errorMsgText = "Email atau Password salah!";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMsgText = "Email atau Password salah!";
        } else if (error.code === 'auth/too-many-requests') {
            errorMsgText = "Terlalu banyak percobaan. Coba lagi nanti.";
        } else if (error.message) {
            errorMsgText = error.message;
        }

        tampilkanError(errorMsgText);
    }

    function tampilkanError(customMsg) {
        errorMsg.classList.remove('hidden');
        if (customMsg) {
            errorMsg.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + customMsg;
        } else {
            errorMsg.innerHTML = '<i class="fas fa-exclamation-circle"></i> Email atau Password salah!';
        }
        resetTombol();
    }

    function resetTombol() {
        btnBtn.innerHTML = 'Masuk Sistem <i class="fas fa-arrow-right text-xs"></i>';
        btnBtn.disabled = false;
    }
});