// ============================================================
// Configuração central da API — ÚNICA fonte de verdade.
// auth.js e app.js leem window.API_BASE_URL, já calculado aqui.
// Se precisar trocar o backend de produção, troque SÓ a linha abaixo.
// ============================================================
window.BACKEND_URL = 'https://backend-1z9z.onrender.com';

// Suporta três modos:
//   1. window.BACKEND_URL definido acima (produção / deploy customizado)
//   2. Live Server / VS Code (porta 5500/5501) → aponta para backend na 3001
//   3. Servido pelo próprio Express (porta 3001) → same-origin
window.API_BASE_URL = (() => {
    if (typeof window.BACKEND_URL === 'string' && window.BACKEND_URL) {
        return window.BACKEND_URL.replace(/\/$/, '') + '/api';
    }
    const { protocol, hostname, port } = window.location;
    const devPorts = ['5500', '5501', '8080', '8081', '3000'];
    if (devPorts.includes(port)) {
        return `${protocol}//${hostname}:3001/api`;
    }
    return `${protocol}//${window.location.host}/api`;
})();

console.log('[config.js] API_BASE_URL =', window.API_BASE_URL);
