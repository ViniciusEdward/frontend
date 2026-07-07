// URL do backend — usa config.js quando disponível.
const API_BASE_URL = window.API_BASE_URL || (() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
        return window.location.protocol + '//' + h + ':3001/api';
    }
    return 'https://backend-1z9z.onrender.com/api';
})();

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.background = isError ? '#e74c3c' : '#2ecc71';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function createFallbackTileLayer(options = {}) {
    const urls = [
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png'
    ];
    let currentUrlIndex = 0;
    let errorNotified = false;
    const layer = L.tileLayer(urls[currentUrlIndex], Object.assign({ attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }, options));
    layer.on('tileerror', () => {
        if (!errorNotified) { errorNotified = true; showToast('Erro ao carregar o mapa. Tentando outro provedor...', true); }
        if (currentUrlIndex < urls.length - 1) { currentUrlIndex++; layer.setUrl(urls[currentUrlIndex]); }
    });
    return layer;
}

// ============= LOGIN =============
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        if (!email || !email.includes('@') || senha.length < 8) { showToast('Email ou senha inválidos', true); return; }
        try {
            const resposta = await fetch(API_BASE_URL + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });
            const dados = await resposta.json();
            if (resposta.ok && dados.token) {
                localStorage.setItem('token', dados.token);
                localStorage.setItem('currentUser', JSON.stringify(dados.usuario));
                showToast('Login realizado com sucesso!');
                setTimeout(() => { window.location.href = 'app.html'; }, 500);
            } else {
                showToast(dados.erro || 'Email ou senha incorretos', true);
                document.getElementById('senha').value = '';
            }
        } catch (erro) {
            console.error('Erro ao fazer login:', erro);
            showToast('Erro de conexão com o servidor', true);
        }
    });
}

// ============= REGISTRO =============
const cadastroForm = document.getElementById('cadastroForm');
const registerMapElement = document.getElementById('registerMap');
const registerLocationInfo = document.getElementById('registerLocationInfo');
let registerMap = null;
let registerMarker = null;
let registerLocation = { latitude: -12.97, longitude: -38.50 };

if (registerMapElement) { initRegisterMap(); }

function setupPasswordToggle(buttonId, inputId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const icon = btn.querySelector('i');
        if (icon) { icon.classList.toggle('fa-eye'); icon.classList.toggle('fa-eye-slash'); }
        btn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    });
}
setupPasswordToggle('togglePassword', 'senhaCad');
setupPasswordToggle('toggleLoginPassword', 'senha');

if (cadastroForm) {
    cadastroForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const primeironome = document.getElementById('primeironome').value.trim();
        const sobrenome = document.getElementById('sobrenome').value.trim();
        const cpf = document.getElementById('cpf').value.trim();
        const email = document.getElementById('emailCad').value.trim();
        const senha = document.getElementById('senhaCad').value;
        const ddd = document.getElementById('ddd').value.trim();
        const telefone = document.getElementById('telefone').value.trim();
        const estado = document.getElementById('estado').value.trim();
        const cidade = document.getElementById('cidade').value.trim();
        const bairro = document.getElementById('bairro').value.trim();
        const logradouro = document.getElementById('logradouro').value.trim();
        const numero = document.getElementById('numero').value.trim();
        const latitude = parseFloat(document.getElementById('latitude').value);
        const longitude = parseFloat(document.getElementById('longitude').value);

        if (!primeironome || primeironome.length < 3) { showToast('Primeiro nome deve ter pelo menos 3 caracteres', true); return; }
        if (!sobrenome || sobrenome.length < 3) { showToast('Sobrenome deve ter pelo menos 3 caracteres', true); return; }
        const cpfDigits = cpf.replace(/\D/g, '');
        if (!/^\d{11}$/.test(cpfDigits)) { showToast('CPF inválido. Use 11 dígitos.', true); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email inválido', true); return; }
        if (senha.length < 8) { showToast('Senha deve ter no mínimo 8 caracteres', true); return; }
        if (!/^\d{2}$/.test(ddd)) { showToast('DDD deve ter 2 dígitos', true); return; }
        if (!/^\d{8,9}$/.test(telefone.replace(/\D/g, ''))) { showToast('Telefone inválido', true); return; }
        if (!logradouro || !cidade || !estado) { showToast('Clique no mapa para preencher seu endereço automaticamente', true); return; }
        if (!numero) { showToast('Informe o número do endereço', true); return; }
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) { showToast('Selecione sua localização no mapa', true); return; }

        const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        try {
            const resposta = await fetch(API_BASE_URL + '/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ primeironome, sobrenome, cpf: cpfFormatted, email, senha, ddd, telefone: telefone.replace(/\D/g, ''), estado, cidade, bairro, logradouro, numero, latitude, longitude })
            });
            const textoResposta = await resposta.text();
            let dados;
            try { dados = textoResposta ? JSON.parse(textoResposta) : {}; }
            catch (parseErro) { console.error('Resposta JSON inválida:', textoResposta); dados = {}; }
            if (resposta.ok && dados.token) {
                localStorage.setItem('token', dados.token);
                localStorage.setItem('currentUser', JSON.stringify(dados.usuario));
                showToast('Cadastro realizado! Redirecionando...');
                setTimeout(() => { window.location.href = 'app.html'; }, 1000);
            } else {
                showToast(dados.erro || resposta.statusText || 'Erro ao cadastrar', true);
            }
        } catch (erro) {
            console.error('Erro ao cadastrar:', erro);
            showToast('Erro de conexão com o servidor', true);
        }
    });
}

// ============= MAPA =============
function initRegisterMap() {
    registerMap = L.map(registerMapElement).setView([registerLocation.latitude, registerLocation.longitude], 12);
    createFallbackTileLayer().addTo(registerMap);
    registerMap.on('click', (event) => {
        registerLocation = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        if (registerMarker) registerMap.removeLayer(registerMarker);
        registerMarker = L.marker([registerLocation.latitude, registerLocation.longitude], { title: 'Sua localização' }).addTo(registerMap);
        document.getElementById('latitude').value = registerLocation.latitude.toFixed(6);
        document.getElementById('longitude').value = registerLocation.longitude.toFixed(6);
        if (registerLocationInfo) registerLocationInfo.innerText = '📍 ' + registerLocation.latitude.toFixed(6) + ', ' + registerLocation.longitude.toFixed(6) + ' — carregando endereço...';
        reverseGeocode(registerLocation.latitude, registerLocation.longitude);
    });
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            registerLocation.latitude = pos.coords.latitude;
            registerLocation.longitude = pos.coords.longitude;
            registerMap.setView([registerLocation.latitude, registerLocation.longitude], 14);
            registerMarker = L.marker([registerLocation.latitude, registerLocation.longitude], { title: 'Sua localização atual' }).addTo(registerMap);
            document.getElementById('latitude').value = registerLocation.latitude.toFixed(6);
            document.getElementById('longitude').value = registerLocation.longitude.toFixed(6);
            if (registerLocationInfo) registerLocationInfo.innerText = '📍 Localização detectada: ' + registerLocation.latitude.toFixed(6) + ', ' + registerLocation.longitude.toFixed(6) + ' — obtendo endereço...';
            reverseGeocode(registerLocation.latitude, registerLocation.longitude);
        }, (err) => { console.log('Geolocalização não disponível:', err.message); });
    }
}

const BRAZIL_STATE_MAP = {
    'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE',
    'distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA',
    'mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','para':'PA',
    'paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ',
    'rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR',
    'santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'
};

function normalizeBrazilianState(value) {
    if (!value || typeof value !== 'string') return '';
    const s = value.trim().toLowerCase();
    if (s.length === 2) return s.toUpperCase();
    return BRAZIL_STATE_MAP[s] || '';
}

async function reverseGeocode(latitude, longitude) {
    try {
        const response = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude) + '&addressdetails=1');
        const data = await response.json();
        const address = data.address || {};
        const road = address.road || address.pedestrian || address.neighbourhood || address.suburb || address.village || '';
        const bairro = address.suburb || address.neighbourhood || address.village || address.hamlet || '';
        const cidade = address.city || address.town || address.village || address.municipality || '';
        const estado = normalizeBrazilianState(address.state_code || address.state || '');
        if (road) document.getElementById('logradouro').value = road;
        if (bairro) document.getElementById('bairro').value = bairro;
        if (cidade) document.getElementById('cidade').value = cidade;
        if (estado) document.getElementById('estado').value = estado;
        if (registerLocationInfo) registerLocationInfo.innerText = '📍 ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' — ' + (road || 'Endereço definido');
    } catch (erro) {
        console.error('Erro na geocodificação reversa:', erro);
        if (registerLocationInfo) registerLocationInfo.innerText = '📍 ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' — endereço não encontrado';
    }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname.includes('app.html')) { window.location.href = 'index.html'; }
}
checkAuth();
