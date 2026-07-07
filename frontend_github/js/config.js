// ============================================================
// Configuração central da API — ÚNICA fonte de verdade.
// Em desenvolvimento local (Live Server/VS Code), usa localhost:3001.
// Em produção, usa o backend publicado no Render.
// ============================================================
window.PRODUCTION_BACKEND_URL = 'https://backend-1z9z.onrender.com';

window.API_BASE_URL = (() => {
    const { protocol, hostname, port, host } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const devFrontendPorts = ['5500', '5501', '8080', '8081', '3000'];

    // Frontend aberto pelo Live Server/VS Code: backend local na porta 3001.
    if (isLocalHost && devFrontendPorts.includes(port)) {
        return `${protocol}//${hostname}:3001/api`;
    }

    // Frontend servido pelo próprio Express local.
    if (isLocalHost && port === '3001') {
        return `${protocol}//${host}/api`;
    }

    // Produção ou deploy customizado. Para trocar, defina window.BACKEND_URL antes deste arquivo.
    const productionBackend = window.BACKEND_URL || window.PRODUCTION_BACKEND_URL;
    return productionBackend.replace(/\/$/, '') + '/api';
})();

console.log('[config.js] API_BASE_URL =', window.API_BASE_URL);
