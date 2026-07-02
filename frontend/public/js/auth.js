window.BACKEND_URL = 'https://backend-1z9z.onrender.com';
// Configuração de API
// Suporta três modos:
//   1. window.BACKEND_URL definido manualmente (produção / deploy customizado)
//   2. Live Server / VS Code (porta 5500/5501) → aponta para backend na 3001
//   3. Servido pelo próprio Express (porta 3001) → same-origin
const API_BASE_URL = (() => {
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

// Função para exibir notificações
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
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

    const layer = L.tileLayer(urls[currentUrlIndex], Object.assign({
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }, options));

    layer.on('tileerror', () => {
        if (!errorNotified) {
            errorNotified = true;
            showToast('Erro ao carregar o mapa. Tentando outro provedor...', true);
        }

        if (currentUrlIndex < urls.length - 1) {
            currentUrlIndex += 1;
            layer.setUrl(urls[currentUrlIndex]);
        }
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

        // Validação básica no frontend
        if (!email || !email.includes('@') || senha.length < 8) {
            showToast('Email ou senha inválidos', true);
            return;
        }

        try {
            const resposta = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });

            const dados = await resposta.json();
            
            if (resposta.ok && dados.token) {
                // Armazenar token e dados do usuário
                localStorage.setItem('token', dados.token);
                localStorage.setItem('currentUser', JSON.stringify(dados.usuario));
                showToast('Login realizado com sucesso!');
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 500);
            } else {
                showToast(dados.erro || 'Email ou senha incorretos', true);
                // Limpar campos
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

if (registerMapElement) {
    initRegisterMap();
}

function setupPasswordToggle(buttonId, inputId) {
    const togglePasswordBtn = document.getElementById(buttonId);
    const passwordInput = document.getElementById(inputId);

    if (!togglePasswordBtn || !passwordInput) return;

    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        const icon = togglePasswordBtn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        }
        togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
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

        // Validações rigorosas
        if (!primeironome || primeironome.length < 3) {
            showToast('Primeiro nome deve ter pelo menos 3 caracteres', true);
            return;
        }

        if (!sobrenome || sobrenome.length < 3) {
            showToast('Sobrenome deve ter pelo menos 3 caracteres', true);
            return;
        }

        const cpfDigits = cpf.replace(/\D/g, '');
        if (!/^\d{11}$/.test(cpfDigits)) {
            showToast('CPF inválido. Use 11 dígitos.', true);
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Email inválido', true);
            return;
        }

        if (senha.length < 8) {
            showToast('Senha deve ter no mínimo 8 caracteres', true);
            return;
        }

        if (!/^\d{2}$/.test(ddd)) {
            showToast('DDD deve ter 2 dígitos', true);
            return;
        }

        if (!/^\d{8,9}$/.test(telefone.replace(/\D/g, ''))) {
            showToast('Telefone inválido', true);
            return;
        }

        if (!logradouro || !cidade || !estado) {
            showToast('Clique no mapa para preencher seu endereço automaticamente', true);
            return;
        }

        if (!numero) {
            showToast('Informe o número do endereço', true);
            return;
        }

        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            showToast('Selecione sua localização no mapa', true);
            return;
        }

        const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

        try {
            const novoUsuario = {
                primeironome,
                sobrenome,
                cpf: cpfFormatted,
                email,
                senha,
                ddd,
                telefone: telefone.replace(/\D/g, ''),
                estado,
                cidade,
                bairro,
                logradouro,
                numero,
                latitude,
                longitude
            };

            const resposta = await fetch(`${API_BASE_URL}/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novoUsuario)
            });

            const textoResposta = await resposta.text();
            let dados;
            try {
                dados = textoResposta ? JSON.parse(textoResposta) : {};
            } catch (parseErro) {
                console.error('Resposta JSON inválida:', textoResposta);
                dados = {};
            }
            
            if (resposta.ok && dados.token) {
                // Login automático após registro
                localStorage.setItem('token', dados.token);
                localStorage.setItem('currentUser', JSON.stringify(dados.usuario));
                showToast('Cadastro realizado! Redirecionando...');
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 1000);
            } else {
                const errorMessage = dados.erro || resposta.statusText || 'Erro ao cadastrar';
                showToast(errorMessage, true);
            }
        } catch (erro) {
            console.error('Erro ao cadastrar:', erro);
            showToast('Erro de conexão com o servidor', true);
        }
    });
}

// ============= MAPA DE LOCALIZAÇÃO NO REGISTRO =============
function initRegisterMap() {
    registerMap = L.map(registerMapElement).setView(
        [registerLocation.latitude, registerLocation.longitude],
        12
    );
    
    createFallbackTileLayer().addTo(registerMap);

    // Clique no mapa para selecionar localização
    registerMap.on('click', (event) => {
        registerLocation = {
            latitude: event.latlng.lat,
            longitude: event.latlng.lng
        };

        // Remover marcador anterior
        if (registerMarker) {
            registerMap.removeLayer(registerMarker);
        }

        // Adicionar novo marcador
        registerMarker = L.marker(
            [registerLocation.latitude, registerLocation.longitude],
            {
                title: 'Sua localização'
            }
        ).addTo(registerMap);

        // Atualizar campos de entrada
        document.getElementById('latitude').value = registerLocation.latitude.toFixed(6);
        document.getElementById('longitude').value = registerLocation.longitude.toFixed(6);
        
        if (registerLocationInfo) {
            registerLocationInfo.innerText = 
                `📍 ${registerLocation.latitude.toFixed(6)}, ${registerLocation.longitude.toFixed(6)} — carregando endereço...`;
        }

        reverseGeocode(registerLocation.latitude, registerLocation.longitude);
    });

    // Tentar geolocalização automática
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                registerLocation.latitude = pos.coords.latitude;
                registerLocation.longitude = pos.coords.longitude;
                registerMap.setView(
                    [registerLocation.latitude, registerLocation.longitude],
                    14
                );
                
                // Adicionar marcador na localização atual
                registerMarker = L.marker(
                    [registerLocation.latitude, registerLocation.longitude],
                    { title: 'Sua localização atual' }
                ).addTo(registerMap);

                document.getElementById('latitude').value = registerLocation.latitude.toFixed(6);
                document.getElementById('longitude').value = registerLocation.longitude.toFixed(6);
                
                if (registerLocationInfo) {
                    registerLocationInfo.innerText = 
                        `📍 Localização detectada: ${registerLocation.latitude.toFixed(6)}, ${registerLocation.longitude.toFixed(6)} — obtendo endereço...`;
                }

                reverseGeocode(registerLocation.latitude, registerLocation.longitude);
            },
            (err) => {
                console.log('Geolocalização não disponível:', err.message);
            }
        );
    }
}

const BRAZIL_STATE_MAP = {
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
    'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
    'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
    'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
    'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO'
};

function normalizeBrazilianState(value) {
    if (!value || typeof value !== 'string') return '';
    const sanitized = value.trim().toLowerCase();
    if (sanitized.length === 2) return sanitized.toUpperCase();
    return BRAZIL_STATE_MAP[sanitized] || '';
}

async function reverseGeocode(latitude, longitude) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&addressdetails=1`
        );
        const data = await response.json();
        const address = data.address || {};

        const road = address.road || address.pedestrian || address.cycleway || address.footway || address.path || address.neighbourhood || address.suburb || address.village || '';
        const bairro = address.suburb || address.neighbourhood || address.village || address.hamlet || address.quarter || '';
        const cidade = address.city || address.town || address.village || address.municipality || address.county || '';
        const estadoRaw = address.state_code || address.state || address.region || '';
        const estado = normalizeBrazilianState(estadoRaw);

        if (road) {
            document.getElementById('logradouro').value = road;
        }

        if (bairro) {
            document.getElementById('bairro').value = bairro;
        }

        if (cidade) {
            document.getElementById('cidade').value = cidade;
        }

        if (estado) {
            document.getElementById('estado').value = estado;
        }

        if (registerLocationInfo) {
            registerLocationInfo.innerText = `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)} — ${road || 'Endereço definido'}`;
        }
    } catch (erro) {
        console.error('Erro na geocodificação reversa:', erro);
        if (registerLocationInfo) {
            registerLocationInfo.innerText = `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)} — endereço não encontrado`; 
        }
    }
}

// ============= VERIFICAR AUTENTICAÇÃO =============
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname.includes('app.html')) {
        window.location.href = 'index.html';
    }
}

// Verificar autenticação ao carregar página
checkAuth();



