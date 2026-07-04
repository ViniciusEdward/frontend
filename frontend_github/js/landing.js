document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.replace('fa-bars', 'fa-xmark');
            } else {
                icon.classList.replace('fa-xmark', 'fa-bars');
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                menuToggle.querySelector('i').classList.replace('fa-xmark', 'fa-bars');
            });
        });
    }

    const counters = document.querySelectorAll('.metric-number');
    counters.forEach((counter) => {
        const target = Number(counter.dataset.target) || 0;
        let value = 0;
        const increment = Math.max(1, Math.floor(target / 120));

        const updateCounter = () => {
            value += increment;
            if (value >= target) {
                counter.innerText = target.toLocaleString('pt-BR');
            } else {
                counter.innerText = value.toLocaleString('pt-BR');
                requestAnimationFrame(updateCounter);
            }
        };

        updateCounter();
    });
});



