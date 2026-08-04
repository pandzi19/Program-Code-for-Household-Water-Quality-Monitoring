document.addEventListener('DOMContentLoaded', () => {
    const toggleBtns = document.querySelectorAll('.sidebar-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    
    if (toggleBtns.length === 0 || !sidebar) return;

    // Check if mobile (< 768px)
    const isMobile = () => window.innerWidth < 768;
    
    // Fungsi toggle
    const handleToggle = () => {
        if (isMobile()) {
            // Mobile: Toggle mobile-open class untuk slide-in/out
            sidebar.classList.toggle('mobile-open');
        } else {
            // Desktop: Toggle sidebar-collapsed class untuk collapse/expand
            document.documentElement.classList.toggle('sidebar-collapsed');
            
            // Simpan status ke localStorage
            const currentlyCollapsed = document.documentElement.classList.contains('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', currentlyCollapsed);
        }
    };

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', handleToggle);
    });
    
    // Close sidebar ketika klik di main content area pada mobile
    if (isMobile()) {
        document.addEventListener('click', (e) => {
            // Jika klik bukan di sidebar dan bukan di toggle button
            let clickedToggle = false;
            toggleBtns.forEach(btn => {
                if (btn.contains(e.target)) clickedToggle = true;
            });
            
            if (!sidebar.contains(e.target) && !clickedToggle) {
                sidebar.classList.remove('mobile-open');
            }
        });
    }
    
    // Handle window resize - reset mobile sidebar state ketika resize ke desktop
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            sidebar.classList.remove('mobile-open');
        }
    });
});
