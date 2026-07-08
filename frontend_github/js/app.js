// URL do backend — usa config.js quando disponível.
const API_BASE_URL = window.API_BASE_URL || (() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
        return window.location.protocol + '//' + h + ':3001/api';
    }
    return 'https://backend-1z9z.onrender.com/api';
})();

// ============= ESTADO GLOBAL =============
let currentUser = null;
let token = null;
let currentItems = [];
let chatInterval = null;
let destinatarioIdAtual = null;
let itemBeingEdited = null;
let selectedItemImageDataUrl = '';
let itemImageMarkedForRemoval = false;
let selectedAvaliacaoImageDataUrl = '';
const requestingItems = new Set();
let queueModalInterval = null;
let queueModalItemId = null;
let map = null;
let userLocation = { latitude: -12.97, longitude: -38.50 };
const TIPO_AVALIACAO = {
    DOADOR_AVALIA_BENEFICIARIO: 'doador_avalia_beneficiario',
    BENEFICIARIO_AVALIA_DOADOR_ITEM: 'beneficiario_avalia_doador_item'
};

// ============= AUTENTICAÇÃO =============
function checkAuth() {
    token = localStorage.getItem('token');
    const userStr = localStorage.getItem('currentUser');
    
    if (!token || !userStr) {
        window.location.href = 'index.html';
        return false;
    }
    
    currentUser = JSON.parse(userStr);
    return true;
}

// Verificar autenticação ao carregar
if (!checkAuth()) {
    throw new Error('Não autenticado');
}

// ============= FUNÇÃO AUXILIAR PARA FETCH COM JWT =============
async function fetchAPI(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        // Se receber 401, token inválido ou expirado
        if (res.status === 401) {
            localStorage.clear();
            showToast('Sessão expirada ou não autorizada. Faça login novamente.', true);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 800);
        }

        return res;
    } catch (erro) {
        console.error('Erro na requisição:', erro);
        throw erro;
    }
}

async function buscarPosicaoNaFila(iditem) {
    try {
        const res = await fetchAPI(`/itens/${iditem}/fila`);
        if (!res || !res.ok) {
            return null;
        }
        return await res.json();
    } catch (erro) {
        console.error('Erro ao buscar posição na fila:', erro);
        return null;
    }
}


function getBackendBaseUrl() {
    return String(API_BASE_URL || '')
        .replace(/\/api\/?$/i, '')
        .replace(/\/$/, '');
}

function buildUploadUrl(pathname) {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) return '';
    return `${backendBaseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function isSafeExternalImageUrl(value) {
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) && !/[<>"'`]/.test(value);
    } catch (erro) {
        return false;
    }
}

function safeImageSrc(src, uploadFolder = 'items') {
    const value = typeof src === 'string' ? src.trim() : '';
    if (!value) return '';

    if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
        return value;
    }

    if (/^\/uploads\/(items|feedback)\/[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(value)) {
        return buildUploadUrl(value);
    }

    if (/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(value)) {
        const folder = uploadFolder === 'feedback' ? 'feedback' : 'items';
        return buildUploadUrl(`/uploads/${folder}/${value}`);
    }

    if (/^https?:\/\//i.test(value) && isSafeExternalImageUrl(value)) {
        return value;
    }

    return '';
}

function renderItemImage(item, extraClass = '') {
    const title = escapeHtml(item?.titulo || 'Item para doação');
    const src = safeImageSrc(item?.imagem_url || item?.imagemUrl || '');
    if (!src) {
        return `<div class="item-card-img-placeholder ${extraClass}"><i class="fa-solid fa-box-open"></i></div>`;
    }
    return `<img class="item-card-img ${extraClass}" src="${escapeHtml(src)}" alt="${title}" loading="lazy">`;
}

function safeInlineString(value) {
    return JSON.stringify(String(value || '')).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
    return escapeHtml(String(value || '')).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateTime(value) {
    if (!value) return 'Data indisponível';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data indisponível';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function limparImagemSelecionada() {
    selectedItemImageDataUrl = '';
    const input = document.getElementById('itemImageFile');
    const preview = document.getElementById('itemImagePreview');
    const img = document.getElementById('itemImagePreviewImg');
    const name = document.getElementById('itemImageFileName');
    if (input) input.value = '';
    if (img) img.src = '';
    if (name) name.textContent = '';
    if (preview) preview.style.display = 'none';
}

function resetImagemDoacao() {
    itemImageMarkedForRemoval = false;
    limparImagemSelecionada();
}

function removerImagemDoFormulario() {
    itemImageMarkedForRemoval = true;
    limparImagemSelecionada();
}

function exibirImagemExistenteNoFormulario(imagemUrl) {
    selectedItemImageDataUrl = '';
    itemImageMarkedForRemoval = false;
    const preview = document.getElementById('itemImagePreview');
    const img = document.getElementById('itemImagePreviewImg');
    const name = document.getElementById('itemImageFileName');
    const src = safeImageSrc(imagemUrl || '');
    if (!src || !preview || !img) {
        limparImagemSelecionada();
        return;
    }
    img.src = src;
    if (name) name.textContent = 'Imagem atual da doação';
    preview.style.display = 'flex';
}

function carregarImagemSelecionada(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file) {
        limparImagemSelecionada();
        return;
    }

    if (!allowedTypes.includes(file.type)) {
        showToast('Use uma imagem JPG, PNG ou WebP.', true);
        limparImagemSelecionada();
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('A imagem deve ter no máximo 5 MB.', true);
        limparImagemSelecionada();
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!isValidImageSrc(dataUrl)) {
            showToast('Imagem inválida ou corrompida.', true);
            limparImagemSelecionada();
            return;
        }

        selectedItemImageDataUrl = dataUrl;
        itemImageMarkedForRemoval = false;
        const preview = document.getElementById('itemImagePreview');
        const img = document.getElementById('itemImagePreviewImg');
        const name = document.getElementById('itemImageFileName');
        if (img) img.src = dataUrl;
        if (name) name.textContent = file.name;
        if (preview) preview.style.display = 'flex';
    };
    reader.onerror = () => {
        showToast('Não foi possível ler a imagem selecionada.', true);
        limparImagemSelecionada();
    };
    reader.readAsDataURL(file);
}

function inicializarUploadImagemDoacao() {
    const fileInput = document.getElementById('itemImageFile');
    const chooseBtn = document.getElementById('itemImageChooseBtn');
    const changeBtn = document.getElementById('itemImageChangeBtn');
    const removeBtn = document.getElementById('itemImageRemoveBtn');
    const dropZone = document.getElementById('itemImageDropZone');
    if (!fileInput) return;

    const openPicker = () => fileInput.click();
    if (chooseBtn) chooseBtn.addEventListener('click', openPicker);
    if (changeBtn) changeBtn.addEventListener('click', openPicker);
    if (removeBtn) removeBtn.addEventListener('click', removerImagemDoFormulario);

    fileInput.addEventListener('change', () => carregarImagemSelecionada(fileInput.files?.[0]));

    if (dropZone) {
        ['dragenter', 'dragover'].forEach((eventName) => {
            dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                dropZone.classList.add('drag-over');
            });
        });
        ['dragleave', 'drop'].forEach((eventName) => {
            dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                dropZone.classList.remove('drag-over');
            });
        });
        dropZone.addEventListener('drop', (event) => carregarImagemSelecionada(event.dataTransfer?.files?.[0]));
    }
}

// ============= INICIALIZAÇÃO =============

function limparImagemAvaliacao() {
    selectedAvaliacaoImageDataUrl = '';
    const input = document.getElementById('avaliacaoImagemFile');
    const preview = document.getElementById('avaliacaoImagemPreview');
    const img = document.getElementById('avaliacaoImagemPreviewImg');
    const name = document.getElementById('avaliacaoImagemFileName');
    if (input) input.value = '';
    if (img) img.src = '';
    if (name) name.textContent = '';
    if (preview) preview.style.display = 'none';
}

function carregarImagemAvaliacao(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file) {
        limparImagemAvaliacao();
        return;
    }

    if (!allowedTypes.includes(file.type)) {
        showToast('Use uma imagem JPG, PNG ou WebP.', true);
        limparImagemAvaliacao();
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('A imagem de feedback deve ter no máximo 5 MB.', true);
        limparImagemAvaliacao();
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(dataUrl)) {
            showToast('Imagem inválida ou corrompida.', true);
            limparImagemAvaliacao();
            return;
        }
        selectedAvaliacaoImageDataUrl = dataUrl;
        const preview = document.getElementById('avaliacaoImagemPreview');
        const img = document.getElementById('avaliacaoImagemPreviewImg');
        const name = document.getElementById('avaliacaoImagemFileName');
        if (img) img.src = dataUrl;
        if (name) name.textContent = file.name;
        if (preview) preview.style.display = 'flex';
    };
    reader.onerror = () => {
        showToast('Não foi possível ler a imagem selecionada.', true);
        limparImagemAvaliacao();
    };
    reader.readAsDataURL(file);
}

function inicializarUploadImagemAvaliacao() {
    const fileInput = document.getElementById('avaliacaoImagemFile');
    const chooseBtn = document.getElementById('avaliacaoImagemChooseBtn');
    const changeBtn = document.getElementById('avaliacaoImagemChangeBtn');
    const removeBtn = document.getElementById('avaliacaoImagemRemoveBtn');
    if (!fileInput) return;

    const openPicker = () => fileInput.click();
    if (chooseBtn) chooseBtn.addEventListener('click', openPicker);
    if (changeBtn) changeBtn.addEventListener('click', openPicker);
    if (removeBtn) removeBtn.addEventListener('click', limparImagemAvaliacao);
    fileInput.addEventListener('change', () => carregarImagemAvaliacao(fileInput.files?.[0]));
}

function renderBeneficiarioInfo(item) {
    const idusuarioBeneficiario = Number(item.idusuario_beneficiario || item.beneficiario_id || item.idusuario_vencedor || 0);
    const nome = item.beneficiario_nome || item.nome_beneficiario || '';
    const temFluxoDeEntrega = ['reservada', 'finalizada'].includes(item.status) || ['aceito', 'reservado', 'aguardando_entrega', 'em_processo', 'entregue'].includes(item.entrega_status);

    if (!idusuarioBeneficiario && !nome && !temFluxoDeEntrega) return '';

    const nomeSeguro = nome ? escapeHtml(nome) : 'Beneficiário selecionado';
    const chat = idusuarioBeneficiario ? `
        <button class="btn btn-secondary btn-sm" data-action="abrir-chat" data-idusuario="${idusuarioBeneficiario}">
            <i class="fa-solid fa-comments"></i> Chat com beneficiário
        </button>` : '';

    return `
        <div class="beneficiario-info">
            <div>
                <strong><i class="fa-solid fa-user-check"></i> Beneficiário:</strong>
                <span>${nomeSeguro}</span>
            </div>
            ${chat}
        </div>`;
}

async function obterLocalizacaoAtual() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation.latitude = pos.coords.latitude;
                userLocation.longitude = pos.coords.longitude;
                resolve(true);
            },
            () => {
                console.warn('Geolocalização indisponível ou recusada');
                resolve(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}


function substituirImagemComErro(img) {
    if (!img || img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    const placeholder = document.createElement('div');
    const extraClass = img.className.replace(/\bitem-card-img\b/g, '').trim();
    placeholder.className = `item-card-img-placeholder ${extraClass}`.trim();
    placeholder.innerHTML = '<i class="fa-solid fa-box-open"></i>';
    img.replaceWith(placeholder);
}

function inicializarEventosSemInline() {
    document.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action], [data-tab], [data-activity], [data-close-modal], [data-modal-target]');
        if (!target) return;

        if (target.dataset.tab) {
            navigateTab(target.dataset.tab, target.classList.contains('nav-btn') ? target : null);
            return;
        }

        if (target.dataset.activity) {
            toggleActivity(target.dataset.activity);
            return;
        }

        if (target.dataset.closeModal) {
            closeModal(target.dataset.closeModal);
            return;
        }

        if (target.dataset.modalTarget) {
            openProfileModal(target.dataset.modalTarget);
            return;
        }

        const action = target.dataset.action;
        const iditem = Number(target.dataset.iditem || 0);
        const idsolicitacao = Number(target.dataset.idsolicitacao || 0);
        const idusuario = Number(target.dataset.idusuario || 0);

        switch (action) {
            case 'logout':
                logout();
                break;
            case 'clear-session':
                localStorage.clear();
                window.location.href = 'index.html';
                break;
            case 'support-send':
                sendSupportMessage();
                break;
            case 'send-chat':
                sendChatMessage();
                break;
            case 'submit-avaliacao':
                await enviarAvaliacaoExperiencia();
                break;
            case 'solicitar-doacao':
                if (iditem) await solicitarDoacao(iditem);
                break;
            case 'abrir-fila-completa':
                if (iditem) await abrirModalFilaCompleta(iditem);
                break;
            case 'confirmar-entrega':
                if (idsolicitacao) await confirmarEntrega(idsolicitacao);
                break;
            case 'abrir-chat':
                if (idusuario) abrirChat(idusuario);
                break;
            case 'abrir-avaliacao':
                if (idsolicitacao) abrirAvaliacaoExperiencia({
                    idsolicitacao,
                    iditem,
                    idusuarioAvaliado: Number(target.dataset.idusuarioAvaliado || target.dataset.idusuarioDoador || 0),
                    nomeAvaliado: target.dataset.nomeAvaliado || target.dataset.nomeDoador || '',
                    tipo: target.dataset.tipoAvaliacao || '',
                    tituloItem: target.dataset.tituloItem || ''
                });
                break;
            case 'cancelar-solicitacao':
                if (idsolicitacao) await cancelarSolicitacao(idsolicitacao);
                break;
            case 'editar-doacao':
                if (iditem) await abrirEdicaoDoacao(iditem);
                break;
            case 'cancelar-doacao':
                if (iditem) await cancelarDoacao(iditem);
                break;
            case 'cancelar-edicao-doacao':
                resetarFormularioDoacao();
                navigateTab('myDonationsTab');
                break;
            case 'abrir-detalhes-doacao':
                if (iditem) await abrirDetalhesDoacao(iditem);
                break;
            case 'ver-fila':
                if (iditem) await verFila(iditem);
                break;
            case 'finalizar-doacao':
                if (iditem) await finalizarDoacaoAntecipada(iditem);
                break;
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.target?.id === 'supportInput') {
            event.preventDefault();
            sendSupportMessage();
        }
        if (event.target?.id === 'chatInput') {
            event.preventDefault();
            sendChatMessage();
        }
        if (event.target?.classList?.contains('chat-item') || event.target?.classList?.contains('user-badge')) {
            event.preventDefault();
            event.target.click();
        }
    });

    window.addEventListener('error', (event) => {
        const img = event.target;
        if (img instanceof HTMLImageElement && img.classList.contains('item-card-img')) {
            substituirImagemComErro(img);
        }
    }, true);
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventosSemInline();
    updateUserHeader();
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await atualizarPerfil();
        });
    }

    const donateForm = document.getElementById('donateForm');
    if (donateForm) {
        donateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await criarDoacao();
        });
    }

    inicializarUploadImagemDoacao();
    inicializarUploadImagemAvaliacao();

    inicializarSupport();
    await obterLocalizacaoAtual();
    await carregarPerfil();
    carregarItensDoBanco();

    // Polling de mensagens não lidas (a cada 30s)
    atualizarBadgeMensagens();
    setInterval(atualizarBadgeMensagens, 30000);
});

// ============= UI UTILITIES =============
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.innerText = msg;
        toast.style.background = isError ? '#e74c3c' : '#2ecc71';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else {
        alert(msg);
    }
}

function updateUserHeader() {
    const header = document.getElementById('headerUserName');
    const profile = document.getElementById('profileName');
    
    if (header && currentUser) {
        header.innerText = currentUser.primeironome;
    }
    
    if (profile && currentUser) {
        profile.innerText = `${currentUser.primeironome} ${currentUser.sobrenome || ''}`;
    }
}

function updateChatBadge(count) {
    const badge = document.getElementById('chatBadge');
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function atualizarBadgeMensagens() {
    try {
        const res = await fetchAPI('/mensagens/nao-lidas');
        if (res && res.ok) {
            const dados = await res.json();
            updateChatBadge(dados.total || 0);
        }
    } catch (e) {
        // Falha silenciosa — badge não crítico
    }
}

function navigateTab(tabId, btnElement = null) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    if (btnElement) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }

    // Carregar dados da aba ativa
    if (tabId === 'activityTab') carregarAtividades();
    if (tabId === 'feedTab') carregarItensDoBanco();
    if (tabId === 'mapTab') initMap();
    if (tabId === 'chatsTab') carregarChats();
    if (tabId === 'donateTab') inicializarMapaDoacao();
    if (tabId === 'myDonationsTab') carregarMinhasDoacoes();
}

// ============= ITENS E DOAÇÕES =============
async function carregarItensDoBanco() {
    try {
        showToast('Carregando itens...');
        const query = `?lat=${encodeURIComponent(userLocation.latitude)}&lon=${encodeURIComponent(userLocation.longitude)}`;
        const res = await fetchAPI(`/itens${query}`);
        
        if (!res || !res.ok) {
            showToast('Erro ao carregar itens', true);
            return;
        }

        currentItems = await res.json();
        const list = document.getElementById('feedList');
        if (!list) return;

        list.innerHTML = currentItems.map(item => {
            const limite = item.limite_fila || 10;
            const filaBadge = item.total_na_fila > 0
                ? `<span class="fila-badge ${item.total_na_fila >= limite ? 'cheio' : 'quase-cheio'}">${item.total_na_fila >= limite ? 'Fila cheia' : `Fila: ${item.total_na_fila}/${limite}`}</span>`
                : '';

            const diasText = item.dias_restantes <= 3
                ? `<p class="dias-restantes ${item.dias_restantes <= 3 ? 'urgente' : ''}">⏰ ${item.dias_restantes} dias restantes para seleção</p>`
                : '';
            const isFilaCheia = item.total_na_fila >= limite;
            const minhaSolicitacao = String(item.minha_solicitacao_status || '').toLowerCase();
            const jaSolicitado = minhaSolicitacao && minhaSolicitacao !== 'cancelado';
            const isMeuItem = currentUser && Number(item.usuario_idusuario) === Number(currentUser.idusuario);
            const botaoSolicitarDesabilitado = isFilaCheia || jaSolicitado || isMeuItem;
            const textoBotaoSolicitar = isMeuItem
                ? 'Sua doação'
                : jaSolicitado
                    ? 'Já solicitado'
                    : isFilaCheia
                        ? 'Fila cheia'
                        : 'Solicitar';
            const botaoClass = jaSolicitado || isMeuItem ? 'btn btn-secondary' : 'btn btn-primary';

            const imgHtml = renderItemImage(item);

            return `
                <div class="item-card">
                    ${imgHtml}
                    <div class="item-card-body">
                        <div class="item-card-header">
                            <h3>${escapeHtml(item.titulo)}</h3>
                            ${filaBadge}
                        </div>
                        <p>${escapeHtml(item.descricao || '')}</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">
                            📍 ${item.distancia} km • 👤 ${escapeHtml(item.primeironome)}
                        </p>
                        ${diasText}
                        <div class="item-card-actions">
                            <button class="${botaoClass}" data-action="solicitar-doacao" data-iditem="${item.iditem}" ${botaoSolicitarDesabilitado ? 'disabled' : ''}>
                                <i class="fa-solid fa-hand-holding-heart"></i>
                                ${textoBotaoSolicitar}
                            </button>
                            <button class="btn btn-secondary btn-sm" data-action="abrir-fila-completa" data-iditem="${item.iditem}">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        showToast(`${currentItems.length} itens carregados`);
    } catch (erro) {
        console.error('Erro ao carregar itens:', erro);
        showToast('Erro de conexão', true);
    }
}

async function solicitarDoacao(iditem) {
    const itemId = Number(iditem);
    if (!Number.isInteger(itemId) || itemId <= 0) {
        showToast('ID do item inválido', true);
        return;
    }

    if (requestingItems.has(itemId)) return;
    requestingItems.add(itemId);

    const btn = document.querySelector(`[data-action="solicitar-doacao"][data-iditem="${itemId}"]`);
    const originalHtml = btn ? btn.innerHTML : '';
    const originalDisabled = btn ? btn.disabled : false;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Solicitando...';
    }

    try {
        const res = await fetchAPI('/solicita', {
            method: 'POST',
            body: JSON.stringify({ iditem: itemId, item_iditem: itemId })
        });

        let dados = {};
        try {
            dados = await res.json();
        } catch (parseError) {
            dados = {};
        }

        if (res.ok) {
            const filaInfo = await buscarPosicaoNaFila(itemId);
            if (dados.jaSolicitado) {
                showToast('Você já está na fila deste item.');
            } else if (filaInfo && filaInfo.posicao) {
                showToast(`✅ Você está na posição #${filaInfo.posicao} da fila! Seleção automática em ${filaInfo.dias_restantes} dias.`);
            } else {
                showToast('Doação solicitada com sucesso!');
            }
            await carregarItensDoBanco();
        } else {
            const mensagem = dados.erro || dados.mensagem || `Erro ao solicitar (${res.status})`;
            showToast(mensagem, true);
            if (btn) {
                btn.disabled = originalDisabled;
                btn.innerHTML = originalHtml;
            }
        }
    } catch (erro) {
        console.error('Erro:', erro);
        showToast('Erro de conexão', true);
        if (btn) {
            btn.disabled = originalDisabled;
            btn.innerHTML = originalHtml;
        }
    } finally {
        requestingItems.delete(itemId);
    }
}

async function cancelarSolicitacao(idsolicitacao) {
    if (!confirm('Tem certeza que deseja cancelar sua solicitação?')) return;
    try {
        const res = await fetchAPI(`/cancelar-solicitacao/${idsolicitacao}`, {
            method: 'POST'
        });

        const dados = await res.json();
        if (res.ok) {
            showToast('Solicitação cancelada.');
            carregarAtividades();
            carregarItensDoBanco();
        } else {
            showToast(dados.erro || 'Erro ao cancelar solicitação', true);
        }
    } catch (erro) {
        console.error('Erro ao cancelar solicitação:', erro);
        showToast('Erro de conexão', true);
    }
}

function getDonationFormPayload() {
    const titulo = document.getElementById('itemName')?.value.trim();
    const descricao = document.getElementById('itemDesc')?.value.trim() || '';
    const limiteFila = parseInt(document.getElementById('queueLimit')?.value, 10) || 10;
    const prazo_dias = parseInt(document.getElementById('prazo_dias')?.value, 10) || 7;
    const latitude = parseFloat(document.getElementById('itemLatitude')?.value);
    const longitude = parseFloat(document.getElementById('itemLongitude')?.value);

    if (!titulo || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        showToast('Preencha o item e selecione a localização no mapa.', true);
        return null;
    }

    const imagem_url = itemImageMarkedForRemoval
        ? ''
        : (selectedItemImageDataUrl || itemBeingEdited?.imagem_url || '');

    return {
        titulo,
        descricao,
        limiteFila,
        prazo_dias,
        latitude,
        longitude,
        imagem_url: imagem_url || undefined
    };
}

function atualizarEstadoFormularioDoacao() {
    const submitBtn = document.getElementById('donationSubmitBtn');
    const cancelBtn = document.getElementById('cancelDonationEditBtn');
    const title = document.querySelector('#donateTab .section-header h3');

    if (itemBeingEdited) {
        if (title) title.textContent = 'Editar Doação';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações';
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        return;
    }

    if (title) title.textContent = 'Criar Doação';
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Publicar Item';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function resetarFormularioDoacao() {
    const form = document.getElementById('donateForm');
    if (form) form.reset();
    itemBeingEdited = null;
    resetImagemDoacao();
    const coords = document.getElementById('coordsDisplay');
    if (coords) coords.innerText = 'Coordenadas: será preenchido ao clicar';
    const lat = document.getElementById('itemLatitude');
    const lon = document.getElementById('itemLongitude');
    if (lat) lat.value = '';
    if (lon) lon.value = '';

    const mapElement = document.getElementById('donateMapContainer');
    const mapaDoacao = mapElement?._leaflet_map;
    if (mapaDoacao?._marker) {
        mapaDoacao.removeLayer(mapaDoacao._marker);
        mapaDoacao._marker = null;
    }
    atualizarEstadoFormularioDoacao();
}

function definirCoordenadasDoacao(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

    const latInput = document.getElementById('itemLatitude');
    const lonInput = document.getElementById('itemLongitude');
    const coords = document.getElementById('coordsDisplay');
    if (latInput) latInput.value = latitude.toFixed(6);
    if (lonInput) lonInput.value = longitude.toFixed(6);
    if (coords) coords.innerText = `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

    const mapElement = document.getElementById('donateMapContainer');
    const mapaDoacao = mapElement?._leaflet_map;
    if (mapaDoacao && window.L) {
        const ponto = [latitude, longitude];
        mapaDoacao.setView(ponto, 14);
        if (mapaDoacao._marker) mapaDoacao.removeLayer(mapaDoacao._marker);
        mapaDoacao._marker = L.marker(ponto).addTo(mapaDoacao).bindPopup('<strong>Local do Item</strong>').openPopup();
        setTimeout(() => mapaDoacao.invalidateSize(), 150);
    }
}

function preencherFormularioEdicaoDoacao(item) {
    itemBeingEdited = item;
    document.getElementById('itemName').value = item.titulo || '';
    document.getElementById('itemDesc').value = item.descricao || '';
    document.getElementById('queueLimit').value = Number(item.limite_fila || 10);
    document.getElementById('prazo_dias').value = Number(item.prazo_dias || item.prazoDias || 7);
    definirCoordenadasDoacao(item.latitude, item.longitude);
    exibirImagemExistenteNoFormulario(item.imagem_url || item.imagemUrl || '');
    atualizarEstadoFormularioDoacao();
}

async function criarDoacao() {
    if (itemBeingEdited) {
        await atualizarDoacao(itemBeingEdited.iditem);
        return;
    }

    try {
        const payload = getDonationFormPayload();
        if (!payload) return;

        const res = await fetchAPI('/itens', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const dados = await res.json();
        
        if (res.ok) {
            showToast('Item criado com sucesso!');
            resetarFormularioDoacao();
            navigateTab('myDonationsTab');
        } else {
            showToast(dados.erro || 'Erro ao criar', true);
        }
    } catch (erro) {
        console.error('Erro ao criar doação:', erro);
        showToast('Erro de conexão', true);
    }
}

async function atualizarDoacao(iditem) {
    try {
        const itemId = Number(iditem);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            showToast('ID da doação inválido.', true);
            return;
        }

        const payload = getDonationFormPayload();
        if (!payload) return;

        const res = await fetchAPI(`/itens/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const dados = await res.json();

        if (res.ok) {
            showToast('Doação atualizada com sucesso!');
            resetarFormularioDoacao();
            navigateTab('myDonationsTab');
            carregarItensDoBanco();
            return;
        }

        showToast(dados.erro || 'Não foi possível atualizar a doação.', true);
    } catch (erro) {
        console.error('Erro ao atualizar doação:', erro);
        showToast('Erro de conexão ao atualizar doação.', true);
    }
}

async function abrirEdicaoDoacao(iditem) {
    try {
        const itemId = Number(iditem);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            showToast('Doação inválida.', true);
            return;
        }

        const res = await fetchAPI(`/itens/${itemId}`);
        const item = await res.json();
        if (!res.ok) {
            showToast(item.erro || 'Não foi possível carregar a doação para edição.', true);
            return;
        }

        if (['reservada', 'finalizada'].includes(String(item.status || '').toLowerCase())) {
            showToast('Esta doação já está reservada/finalizada e não pode ser editada.', true);
            return;
        }

        closeModal('itemModal');
        navigateTab('donateTab');
        setTimeout(() => preencherFormularioEdicaoDoacao(item), 200);
    } catch (erro) {
        console.error('Erro ao abrir edição da doação:', erro);
        showToast('Erro de conexão ao abrir edição.', true);
    }
}

async function cancelarDoacao(iditem) {
    try {
        const itemId = Number(iditem);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            showToast('Doação inválida.', true);
            return;
        }

        const confirmar = confirm('Tem certeza que deseja cancelar esta doação? Ela será removida da lista e as solicitações vinculadas serão canceladas.');
        if (!confirmar) return;

        const res = await fetchAPI(`/itens/${itemId}`, { method: 'DELETE' });
        const dados = await res.json();

        if (res.ok) {
            showToast('Doação cancelada/removida com sucesso.');
            if (itemBeingEdited && Number(itemBeingEdited.iditem) === itemId) resetarFormularioDoacao();
            closeModal('itemModal');
            carregarAtividades();
            carregarMinhasDoacoes();
            carregarItensDoBanco();
            return;
        }

        showToast(dados.erro || 'Não foi possível cancelar a doação.', true);
    } catch (erro) {
        console.error('Erro ao cancelar doação:', erro);
        showToast('Erro de conexão ao cancelar doação.', true);
    }
}


// ============= ATIVIDADES =============
function formatStatus(status) {
    const map = {
        'pendente': 'Na Fila',
        'aceito': 'Aguardando Entrega',
        'reservado': 'Aguardando Entrega',
        'aguardando_entrega': 'Aguardando Entrega',
        'em_processo': 'Em Processo de Entrega',
        'entregue': 'Entregue',
        'cancelado': 'Cancelado',
        'disponivel': 'Disponível',
        'reservada': 'Reservada',
        'finalizada': 'Finalizada'
    };
    return map[status] || status;
}

function booleanFromApi(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function renderAvaliacaoEnviada() {
    return '<span class="avaliacao-status"><i class="fa-solid fa-circle-check"></i> Avaliação enviada</span>';
}

function renderAvaliacaoBeneficiarioButton(item) {
    if (booleanFromApi(item.avaliacao_enviada)) return renderAvaliacaoEnviada();
    if (!item.id || !item.idusuario_doador) return '';
    return `
        <button class="btn btn-secondary" data-action="abrir-avaliacao"
            data-tipo-avaliacao="${TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM}"
            data-idsolicitacao="${Number(item.id)}"
            data-iditem="${Number(item.iditem || 0)}"
            data-idusuario-avaliado="${Number(item.idusuario_doador)}"
            data-nome-avaliado="${escapeAttr(item.primeironome || 'doador')}"
            data-titulo-item="${escapeAttr(item.titulo || '')}">
            <i class="fa-solid fa-star"></i> Avaliar item e doador
        </button>`;
}

function renderAvaliacaoDoadorButton(item) {
    const idsolicitacao = Number(item.idsolicitacao || item.idsolicitacao_aceita || 0);
    const idusuarioBeneficiario = Number(item.idusuario_beneficiario || item.beneficiario_id || item.idusuario_vencedor || 0);
    const entregaFinalizada = item.entrega_status === 'entregue' || item.status === 'finalizada' || item.status === 'entregue';
    if (!entregaFinalizada) return '';
    if (booleanFromApi(item.avaliacao_enviada)) return renderAvaliacaoEnviada();
    if (!idsolicitacao || !idusuarioBeneficiario) {
        return '<span class="avaliacao-status pendente"><i class="fa-solid fa-circle-exclamation"></i> Beneficiário não identificado para avaliação</span>';
    }
    return `
        <button class="btn btn-secondary btn-sm" data-action="abrir-avaliacao"
            data-tipo-avaliacao="${TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO}"
            data-idsolicitacao="${idsolicitacao}"
            data-iditem="${Number(item.iditem || 0)}"
            data-idusuario-avaliado="${idusuarioBeneficiario}"
            data-nome-avaliado="${escapeAttr(item.beneficiario_nome || 'beneficiário')}"
            data-titulo-item="${escapeAttr(item.titulo || '')}">
            <i class="fa-solid fa-star"></i> Avaliar beneficiário
        </button>`;
}


function podeEditarDoacao(item) {
    const status = String(item.status || 'disponivel').toLowerCase();
    const entregaStatus = String(item.entrega_status || '').toLowerCase();
    return status === 'disponivel' && !['aceito', 'reservado', 'aguardando_entrega', 'em_processo', 'entregue'].includes(entregaStatus);
}

function podeCancelarDoacao(item) {
    const status = String(item.status || '').toLowerCase();
    const entregaStatus = String(item.entrega_status || '').toLowerCase();
    return !['finalizada', 'entregue'].includes(status) && entregaStatus !== 'entregue';
}

function renderGerenciarDoacaoButtons(item) {
    const iditem = Number(item.iditem || item.id || 0);
    if (!iditem) return '';

    const editar = podeEditarDoacao(item)
        ? `<button class="btn btn-secondary btn-sm" data-action="editar-doacao" data-iditem="${iditem}">
                <i class="fa-solid fa-pen-to-square"></i> Editar
           </button>`
        : '';

    const cancelar = podeCancelarDoacao(item)
        ? `<button class="btn btn-danger btn-sm" data-action="cancelar-doacao" data-iditem="${iditem}">
                <i class="fa-solid fa-ban"></i> Cancelar doação
           </button>`
        : '';

    return `${editar}${cancelar}`;
}

async function carregarAtividades() {
    try {
        const res = await fetchAPI('/atividades');
        
        if (!res || !res.ok) {
            showToast('Erro ao carregar atividades', true);
            return;
        }

        const atividades = await res.json();
        const fila = document.getElementById('listaFila');
        const doacoes = document.getElementById('listaDoacoes');

        if (!fila || !doacoes) return;

        const solicitacoes = atividades.filter(item => item.tipo === 'solicitacao');
        const criacoes = atividades.filter(item => item.tipo === 'doacao');

        const solicitacoesComFila = await Promise.all(solicitacoes.map(async item => {
            if (item.status === 'pendente') {
                const filaData = await buscarPosicaoNaFila(item.iditem);
                return { ...item, filaData };
            }
            return item;
        }));

        fila.innerHTML = solicitacoesComFila.length > 0 ? solicitacoesComFila.map(item => {
            let statusClass = 'status-badge';
            if (item.status === 'aguardando_entrega' || item.status === 'aceito') statusClass += ' warning';
            if (item.status === 'entregue') statusClass += ' success';
            if (item.status === 'cancelado') statusClass += ' danger';

            const imgHtml = renderItemImage(item);
            return `
                <div class="item-card">
                    ${imgHtml}
                    <div class="item-card-body">
                        <h4>${escapeHtml(item.titulo)}</h4>
                        <p>${escapeHtml(item.descricao || '')}</p>
                        <p style="font-size: 0.9rem; color: var(--text-muted);">Doador: ${escapeHtml(item.primeironome || 'Usuário')}</p>
                        <p style="margin-top: 5px;"><span class="${statusClass}">${formatStatus(item.status)}</span></p>
                        ${item.filaData ? `<p class="posicao-fila">📍 Sua posição: #${item.filaData.posicao} de ${item.filaData.total}</p>` : ''}
                        ${item.filaData && item.filaData.dias_restantes !== undefined ? `<p class="dias-restantes${item.filaData.dias_restantes <= 3 ? ' urgente' : ''}">⏰ Seleção automática em ${item.filaData.dias_restantes} dias</p>` : ''}
                        <div class="item-card-actions">
                            ${item.status === 'aguardando_entrega' || item.status === 'aceito' ? `
                                <button class="btn btn-primary" data-action="confirmar-entrega" data-idsolicitacao="${item.id}">
                                    <i class="fa-solid fa-check-circle"></i> Confirmar Recebimento
                                </button>
                                <button class="btn btn-secondary" data-action="abrir-chat" data-idusuario="${item.idusuario_doador}">
                                    <i class="fa-solid fa-comments"></i> Combinar Entrega
                                </button>` : ''}
                            ${item.status === 'entregue' ? renderAvaliacaoBeneficiarioButton(item) : ''}
                            ${item.status === 'pendente' ? `
                                <button class="btn btn-danger btn-sm" data-action="cancelar-solicitacao" data-idsolicitacao="${item.id}">
                                    <i class="fa-solid fa-xmark"></i> Cancelar Solicitação
                                </button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('') : '<p style="padding: 1rem; color: var(--text-muted);">Nenhuma solicitação ativa no momento.</p>';

        doacoes.innerHTML = criacoes.length > 0 ? criacoes.map(item => {
            const imgHtml = renderItemImage(item);
            const beneficiarioHtml = renderBeneficiarioInfo(item);
            return `
                <div class="item-card">
                    ${imgHtml}
                    <div class="item-card-body">
                        <h4 style="font-size:1rem; color:var(--secondary);">${escapeHtml(item.titulo)}</h4>
                        <p>${escapeHtml(item.descricao || '')}</p>
                        <p style="font-size: 0.82rem; color: var(--text-muted);">📅 ${new Date(item.data).toLocaleDateString('pt-BR')}</p>
                        <p style="font-size: 0.82rem; color: var(--text-muted);">Status: ${escapeHtml(formatStatus(item.status || 'disponivel'))}</p>
                        ${beneficiarioHtml}
                        <div class="item-card-actions">
                            <button class="btn btn-secondary btn-sm" data-action="abrir-detalhes-doacao" data-iditem="${item.iditem}">Ver Detalhes</button>
                            ${renderGerenciarDoacaoButtons(item)}
                            ${renderAvaliacaoDoadorButton(item)}
                        </div>
                    </div>
                </div>`;
        }).join('') : '<p style="padding: 1rem; color: var(--text-muted);">Você ainda não publicou doações.</p>';
    } catch (erro) {
        console.error('Erro:', erro);
        showToast('Erro ao carregar atividades', true);
    }
}

function openProfileModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
}

function handleChatEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    await enviarMensagem();
}

async function abrirAvaliacaoExperiencia({ idsolicitacao, iditem, idusuarioAvaliado, nomeAvaliado, tipo, tituloItem }) {
    const form = document.getElementById('avaliacaoForm');
    const tituloEl = document.getElementById('avaliacaoTitulo');
    const descEl = document.getElementById('avaliacaoDescricao');
    const itemWrap = document.getElementById('avaliacaoItemConformeWrap');
    const imagemWrap = document.getElementById('avaliacaoImagemWrap');
    if (!form || !idsolicitacao || !idusuarioAvaliado) {
        showToast('Não foi possível abrir a avaliação desta doação.', true);
        return;
    }

    const tipoResolvido = tipo === TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
        ? TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
        : TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM;

    form.dataset.idsolicitacao = String(idsolicitacao);
    form.dataset.iditem = String(iditem || '');
    form.dataset.idusuarioAvaliado = String(idusuarioAvaliado);
    form.dataset.tipoAvaliacao = tipoResolvido;

    const nome = nomeAvaliado || (tipoResolvido === TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO ? 'o beneficiário' : 'o doador');
    if (tituloEl) {
        tituloEl.textContent = tipoResolvido === TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
            ? 'Avaliar beneficiário'
            : 'Avaliar item e doador';
    }
    if (descEl) {
        descEl.textContent = tipoResolvido === TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
            ? `Conte como foi a experiência com ${nome}: se encontrou a pessoa, se ocorreu tudo bem e se não teve problemas.`
            : `Conte como foi a experiência com ${nome}${tituloItem ? ` no item "${tituloItem}"` : ''}: avalie o item, o doador e se a entrega ocorreu sem problemas.`;
    }
    const beneficiarioAvalia = tipoResolvido === TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM;
    if (itemWrap) {
        itemWrap.style.display = beneficiarioAvalia ? 'flex' : 'none';
    }
    if (imagemWrap) {
        imagemWrap.style.display = beneficiarioAvalia ? 'block' : 'none';
    }
    limparImagemAvaliacao();

    ['avaliacaoNota', 'avaliacaoComentario'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['avaliacaoOcorreuBem', 'avaliacaoEncontrouPessoa', 'avaliacaoItemConforme', 'avaliacaoSemProblemas'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });

    openProfileModal('avaliacaoModal');
}

async function enviarAvaliacaoExperiencia() {
    const form = document.getElementById('avaliacaoForm');
    const notaEl = document.getElementById('avaliacaoNota');
    const comentEl = document.getElementById('avaliacaoComentario');

    const nota = parseInt(notaEl?.value, 10);
    if (!nota || nota < 1 || nota > 5) {
        showToast('Selecione uma nota de 1 a 5', true);
        return;
    }

    const payload = {
        idsolicitacao: Number(form?.dataset.idsolicitacao || 0),
        iditem: Number(form?.dataset.iditem || 0) || undefined,
        idusuario_avaliado: Number(form?.dataset.idusuarioAvaliado || 0),
        tipo_avaliacao: form?.dataset.tipoAvaliacao || TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM,
        avaliacao: nota,
        comentario: comentEl?.value?.trim() || '',
        ocorreu_tudo_bem: Boolean(document.getElementById('avaliacaoOcorreuBem')?.checked),
        encontrou_pessoa: Boolean(document.getElementById('avaliacaoEncontrouPessoa')?.checked),
        item_conforme: Boolean(document.getElementById('avaliacaoItemConforme')?.checked),
        sem_problemas: Boolean(document.getElementById('avaliacaoSemProblemas')?.checked)
    };

    if (payload.tipo_avaliacao === TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM && selectedAvaliacaoImageDataUrl) {
        payload.imagem_feedback_url = selectedAvaliacaoImageDataUrl;
    }

    if (!payload.idsolicitacao || !payload.idusuario_avaliado) {
        showToast('Dados da avaliação incompletos.', true);
        return;
    }

    try {
        const res = await fetchAPI('/avaliacao', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const dados = await res.json();
        if (res.ok) {
            showToast('Avaliação enviada com sucesso!');
            closeModal('avaliacaoModal');
            carregarAtividades();
            carregarMinhasDoacoes();
        } else {
            showToast(dados.erro || 'Erro ao enviar avaliação', true);
        }
    } catch (erro) {
        showToast('Erro de conexão', true);
    }
}

async function confirmarEntrega(idsolicitacao) {
    if (!confirm('Confirmar a entrega deste item?')) return;

    try {
        const res = await fetchAPI(`/confirmar-entrega/${idsolicitacao}`, {
            method: 'POST'
        });

        const dados = await res.json();
        if (res.ok) {
            showToast('Entrega confirmada com sucesso!');
            carregarAtividades();
            carregarMinhasDoacoes();
            const tipoAvaliacao = dados.papel_usuario === 'doador'
                ? TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
                : TIPO_AVALIACAO.BENEFICIARIO_AVALIA_DOADOR_ITEM;
            const idusuarioAvaliado = dados.papel_usuario === 'doador'
                ? dados.idusuario_beneficiario
                : dados.idusuario_doador;
            if (idusuarioAvaliado) {
                abrirAvaliacaoExperiencia({
                    idsolicitacao: dados.idsolicitacao || idsolicitacao,
                    iditem: dados.iditem,
                    idusuarioAvaliado,
                    tipo: tipoAvaliacao
                });
            }
        } else {
            showToast(dados.erro || 'Erro ao confirmar entrega', true);
        }
    } catch (erro) {
        showToast('Erro de conexão', true);
    }
}

async function carregarMinhasDoacoes() {
    const list = document.getElementById('meusDoacoesList');
    if (!list) return;

    try {
        const res = await fetchAPI('/itens/minhas');
        if (!res || !res.ok) {
            list.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">Erro ao carregar suas doações.</p>';
            return;
        }

        const itens = await res.json();
        if (itens.length === 0) {
            list.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">Você ainda não publicou nenhuma doação.</p>';
            return;
        }

        list.innerHTML = itens.map(item => {
            const limite = item.limite_fila || 10;
            const imgHtml = renderItemImage(item);
            const beneficiarioHtml = renderBeneficiarioInfo(item);
            return `
                <div class="item-card">
                    ${imgHtml}
                    <div class="item-card-body">
                        <h4 style="font-size:1rem;color:var(--secondary);">${escapeHtml(item.titulo)}</h4>
                        <p>${escapeHtml(item.descricao || '')}</p>
                        <p style="font-size:0.82rem;color:var(--text-muted);">
                            Fila: ${item.total_na_fila || 0}/${limite}
                        </p>
                        <p style="font-size:0.82rem;color:var(--text-muted);">Status: ${escapeHtml(formatStatus(item.status || 'disponivel'))}</p>
                        ${beneficiarioHtml}
                        <div class="item-card-actions">
                            <button class="btn btn-secondary btn-sm" data-action="abrir-detalhes-doacao" data-iditem="${item.iditem}">
                                <i class="fa-solid fa-circle-info"></i> Detalhes
                            </button>
                            <button class="btn btn-secondary btn-sm" data-action="ver-fila" data-iditem="${item.iditem}">
                                <i class="fa-solid fa-users"></i> Fila
                            </button>
                            ${renderGerenciarDoacaoButtons(item)}
                            ${item.status !== 'finalizada' ? `<button class="btn btn-primary btn-sm" data-action="finalizar-doacao" data-iditem="${item.iditem}">
                                <i class="fa-solid fa-flag-checkered"></i> Finalizar
                            </button>` : ''}
                            ${renderAvaliacaoDoadorButton(item)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (erro) {
        console.error('Erro ao carregar minhas doações:', erro);
        list.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">Erro ao carregar suas doações.</p>';
    }
}


async function abrirDetalhesDoacao(iditem) {
    try {
        const res = await fetchAPI(`/itens/${iditem}`);
        if (!res || !res.ok) {
            showToast('Erro ao carregar detalhes da doação', true);
            return;
        }

        const item = await res.json();
        const modal = document.getElementById('itemModal');
        const title = document.getElementById('modalTitle');
        const donor = document.getElementById('modalDonor');
        const desc = document.getElementById('modalDesc');
        const actions = document.getElementById('modalActions');
        if (!modal || !title || !desc || !actions) return;

        title.textContent = item.titulo || 'Detalhes da doação';
        if (donor) donor.textContent = item.primeironome || 'Usuário';
        desc.innerHTML = `
            <div class="details-modal-body">
                ${renderItemImage(item, 'details-image')}
                <p>${escapeHtml(item.descricao || 'Sem descrição.')}</p>
                <div class="details-meta">
                    <span><i class="fa-solid fa-users"></i> Fila: ${Number(item.total_na_fila || 0)}/${Number(item.limite_fila || 10)}</span>
                    <span><i class="fa-solid fa-circle-info"></i> Status: ${escapeHtml(formatStatus(item.status || 'disponivel'))}</span>
                </div>
            </div>
        `;
        const souDoador = currentUser && Number(item.usuario_idusuario) === Number(currentUser.idusuario);
        const gerenciar = souDoador ? renderGerenciarDoacaoButtons(item) : '';
        actions.innerHTML = `${gerenciar}<button class="btn btn-secondary" data-close-modal="itemModal">Fechar</button>`;
        openProfileModal('itemModal');
    } catch (erro) {
        console.error('Erro ao abrir detalhes:', erro);
        showToast('Erro de conexão ao carregar detalhes', true);
    }
}

async function abrirModalFilaCompleta(iditem) {
    queueModalItemId = iditem;
    const modal = document.getElementById('queueModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await carregarFilaCompletaModal(iditem);

    if (queueModalInterval) clearInterval(queueModalInterval);
    queueModalInterval = setInterval(() => {
        if (queueModalItemId) carregarFilaCompletaModal(queueModalItemId, true);
    }, 5000);
}

async function carregarDadosFilaCompleta(iditem) {
    const res = await fetchAPI(`/itens/${iditem}/fila-completa`);
    if (res && res.ok) {
        return await res.json();
    }

    // Compatibilidade com backends antigos ainda não atualizados no Render.
    // O modal completo funciona totalmente após publicar o backend novo.
    if (res && res.status === 404) {
        const fallback = await fetchAPI(`/itens/${iditem}/fila-detalhada`);
        if (fallback && fallback.ok) {
            const filaAntiga = await fallback.json();
            const itemAtual = currentItems.find((item) => Number(item.iditem) === Number(iditem)) || {};
            return {
                item: itemAtual,
                total: Array.isArray(filaAntiga) ? filaAntiga.length : 0,
                fallback: true,
                fila: Array.isArray(filaAntiga) ? filaAntiga.map((pessoa, index) => ({
                    posicao: pessoa.posicao || index + 1,
                    nome: `${pessoa.primeironome || ''} ${pessoa.sobrenome || ''}`.trim() || pessoa.nome || 'Usuário',
                    datarequisicao: pessoa.datarequisicao,
                    status: pessoa.status,
                    is_me: Number(pessoa.idusuario) === Number(currentUser?.idusuario)
                })) : []
            };
        }
    }

    return null;
}

async function carregarFilaCompletaModal(iditem, silent = false) {
    try {
        const dados = await carregarDadosFilaCompleta(iditem);
        if (!dados) {
            if (!silent) showToast('Erro ao carregar a fila completa. Atualize o backend no Render ou rode o backend local.', true);
            return;
        }

        const item = dados.item || {};
        const fila = Array.isArray(dados.fila) ? dados.fila : [];
        const limite = item.limite_fila || dados.limite_fila || 0;

        const title = document.getElementById('queueModalTitle');
        const subtitle = document.getElementById('queueModalSubtitle');
        const count = document.getElementById('queueModalCount');
        const image = document.getElementById('queueModalItemImage');
        const list = document.getElementById('queueModalList');

        if (title) title.textContent = `Fila — ${item.titulo || 'Doação'}`;
        if (subtitle) subtitle.textContent = dados.fallback ? `Compatibilidade: backend antigo em uso • ${formatDateTime(new Date())}` : `Última atualização: ${formatDateTime(new Date())}`;
        if (count) {
            count.textContent = `${fila.length}/${limite || '-'}`;
            count.className = `fila-badge ${limite && fila.length >= limite ? 'cheio' : 'quase-cheio'}`;
        }
        if (image) image.innerHTML = renderItemImage(item, 'queue-image');

        if (!list) return;
        if (fila.length === 0) {
            list.innerHTML = '<div class="queue-empty">Ninguém entrou na fila ainda.</div>';
            return;
        }

        list.innerHTML = fila.map((pessoa) => `
            <div class="queue-row ${pessoa.is_me ? 'is-me' : ''}">
                <span class="queue-position">#${pessoa.posicao}</span>
                <div class="queue-user">
                    <strong>${escapeHtml(pessoa.nome || 'Usuário')}</strong>
                    <small>${pessoa.is_me ? 'Você está nesta posição' : 'Solicitante'}</small>
                </div>
                <time class="queue-date" datetime="${escapeHtml(pessoa.datarequisicao || '')}">${formatDateTime(pessoa.datarequisicao)}</time>
            </div>
        `).join('');
    } catch (erro) {
        console.error('Erro ao carregar fila completa:', erro);
        if (!silent) showToast('Erro de conexão ao carregar fila', true);
    }
}

async function verFila(iditem) {
    try {
        const res = await fetchAPI(`/itens/${iditem}/fila-detalhada`);
        if (!res.ok) {
            showToast('Erro ao carregar fila', true);
            return;
        }
        const fila = await res.json();
        
        const modal = document.getElementById('itemModal');
        const title = document.getElementById('modalTitle');
        const desc = document.getElementById('modalDesc');
        const actions = document.getElementById('modalActions');

        title.innerText = 'Fila de Interessados';
        const modalDonor = document.getElementById('modalDonor');
        if (modalDonor) modalDonor.textContent = '';
        desc.innerHTML = fila.length > 0 ? `<div class="queue-list">${fila.map((f, i) => `
            <div class="queue-row">
                <span class="queue-position">#${f.posicao || i + 1}</span>
                <div class="queue-user">
                    <strong>${escapeHtml(`${f.primeironome || ''} ${f.sobrenome || ''}`.trim() || 'Usuário')}</strong>
                    <small>Solicitou em ${formatDateTime(f.datarequisicao)}</small>
                </div>
                <button class="btn btn-secondary btn-sm" data-action="abrir-chat" data-idusuario="${f.idusuario}">
                    <i class="fa-solid fa-comments"></i> Chat
                </button>
            </div>
        `).join('')}</div>` : '<div class="queue-empty">Ninguém na fila ainda.</div>';
        
        actions.innerHTML = '<button class="btn btn-secondary" data-close-modal="itemModal">Fechar</button>';
        openProfileModal('itemModal');
    } catch (erro) {
        console.error(erro);
    }
}

async function finalizarDoacaoAntecipada(iditem) {
    if (!confirm('Deseja finalizar a doação agora com quem estiver na fila? O sistema escolherá o primeiro da fila automaticamente.')) return;
    
    try {
        const res = await fetchAPI(`/itens/${iditem}/finalizar`, { method: 'POST' });
        const dados = await res.json();
        if (res.ok) {
            showToast(dados.status === 'finalizada' ? 'Doação finalizada com sucesso!' : 'Beneficiário selecionado. Combine a entrega pelo chat.');
            carregarMinhasDoacoes();
            carregarAtividades();
            if (dados.status === 'finalizada' && dados.idusuario_beneficiario) {
                abrirAvaliacaoExperiencia({
                    idsolicitacao: dados.idsolicitacao,
                    iditem: dados.iditem || iditem,
                    idusuarioAvaliado: dados.idusuario_beneficiario,
                    tipo: TIPO_AVALIACAO.DOADOR_AVALIA_BENEFICIARIO
                });
            }
        } else {
            showToast(dados.erro || 'Erro ao finalizar', true);
        }
    } catch (erro) {
        console.error(erro);
    }
}

// ============= CHATS =============
async function carregarChats() {
    try {
        const res = await fetchAPI('/chats');
        
        if (!res || !res.ok) {
            return;
        }

        const chats = await res.json();
        const list = document.getElementById('chatsList');
        if (!list) return;

        list.innerHTML = chats.map(chat => `
            <div class="chat-item" data-action="abrir-chat" data-idusuario="${chat.idusuario_outro}" role="button" tabindex="0">
                <h4>${escapeHtml(chat.primeironome)}</h4>
                <small>${new Date(chat.ultima_mensagem).toLocaleDateString('pt-BR')}</small>
            </div>
        `).join('');
    } catch (erro) {
        console.error('Erro:', erro);
    }
}

function toggleActivity(tab) {
    const fila = document.getElementById('listaFila');
    const doacoes = document.getElementById('listaDoacoes');

    if (fila && doacoes) {
        fila.style.display = tab === 'fila' ? 'grid' : 'none';
        doacoes.style.display = tab === 'doacoes' ? 'grid' : 'none';
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        btn.classList.toggle('active', tab === 'fila' ? text.includes('fila') : text.includes('doações'));
    });
}

async function abrirChat(idusuario) {
    destinatarioIdAtual = idusuario;
    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.style.display = 'flex';
        carregarMensagensChat();

        // Marcar mensagens como lidas e atualizar badge
        fetchAPI(`/mensagens/marcar-lidas/${idusuario}`, { method: 'POST' })
            .then(() => atualizarBadgeMensagens())
            .catch(() => {});

        // Iniciar polling
        if (chatInterval) clearInterval(chatInterval);
        chatInterval = setInterval(carregarMensagensChat, 3000);
    }
}

async function carregarMensagensChat() {
    if (!destinatarioIdAtual) return;
    
    try {
        const res = await fetchAPI(`/chat/${destinatarioIdAtual}`);
        const container = document.getElementById('chatMessages');

        if (!res || !res.ok) {
            if (res && res.status === 403) {
                if (chatInterval) {
                    clearInterval(chatInterval);
                    chatInterval = null;
                }
                destinatarioIdAtual = null;
                if (container) {
                    container.innerHTML = `
                        <div class="chat-empty-state">
                            <i class="fa-solid fa-lock"></i>
                            <p>Chat indisponível para estes usuários.</p>
                            <small>O chat é liberado quando existe uma solicitação relacionada à doação.</small>
                        </div>`;
                }
                showToast('Chat indisponível para estes usuários.', true);
            }
            return;
        }

        const mensagens = await res.json();
        if (!container) return;

        container.innerHTML = mensagens.map(msg => `
            <div class="mensagem ${msg.idusuario_remetente === currentUser.idusuario ? 'enviada' : 'recebida'}">
                <strong>${escapeHtml(msg.primeironome)}:</strong>
                <p>${escapeHtml(msg.mensagem)}</p>
                <small>${msg.data ? new Date(msg.data).toLocaleTimeString('pt-BR') : ''}</small>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    } catch (erro) {
        console.error('Erro:', erro);
    }
}

async function enviarMensagem() {
    if (!destinatarioIdAtual) return;
    
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim()) return;
    
    const mensagem = input.value.trim();
    input.value = '';
    
    try {
        const res = await fetchAPI('/mensagem', {
            method: 'POST',
            body: JSON.stringify({
                idusuario_destinatario: destinatarioIdAtual,
                mensagem
            })
        });

        if (res.ok) {
            carregarMensagensChat();
        } else {
            let dados = {};
            try { dados = await res.json(); } catch (e) { dados = {}; }
            const mensagemErro = dados.erro || dados.mensagem || 'Erro ao enviar mensagem';
            if (res.status === 403 && chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }
            showToast(mensagemErro, true);
        }
    } catch (erro) {
        showToast('Erro de conexão', true);
    }
}

// ============= MAPA =============
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

function initMap() {
    if (map) return;
    
    const mapElement = document.getElementById('mapContainer');
    if (!mapElement) return;

    map = L.map(mapElement).setView([userLocation.latitude, userLocation.longitude], 12);
    createFallbackTileLayer().addTo(map);

    // Adicionar marcador dos itens
    currentItems.forEach(item => {
        L.marker([item.latitude, item.longitude])
            .bindPopup(`<b>${escapeHtml(item.titulo)}</b><br>${escapeHtml(item.primeironome)}`)
            .addTo(map);
    });
}

function inicializarMapaDoacao() {
    const mapElement = document.getElementById('donateMapContainer');
    if (!mapElement || mapElement.dataset.initialized) {
        if (mapElement && mapElement._leaflet_map) {
            setTimeout(() => mapElement._leaflet_map.invalidateSize(), 100);
        }
        return;
    }
    
    const mapaDoacao = L.map(mapElement).setView([userLocation.latitude, userLocation.longitude], 12);
    createFallbackTileLayer().addTo(mapaDoacao);
    mapElement._leaflet_map = mapaDoacao;

    mapaDoacao.on('click', (event) => {
        definirCoordenadasDoacao(event.latlng.lat, event.latlng.lng);
    });

    mapElement.dataset.initialized = 'true';
    setTimeout(() => mapaDoacao.invalidateSize(), 200);
}


// ============= PERFIL =============
async function carregarPerfil() {
    try {
        const res = await fetchAPI('/perfil');
        
        if (!res || !res.ok) {
            showToast('Erro ao carregar perfil', true);
            return;
        }

        const perfil = await res.json();
        
        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) {
            profileNameEl.innerText = `${perfil.primeironome || ''} ${perfil.sobrenome || ''}`.trim();
        }

        const headerUserNameEl = document.getElementById('headerUserName');
        if (headerUserNameEl) {
            headerUserNameEl.innerText = perfil.primeironome || currentUser?.primeironome || '';
        }

        document.getElementById('editPrimeironome').value = perfil.primeironome || '';
        document.getElementById('editSobrenome').value = perfil.sobrenome || '';
        document.getElementById('editLogradouro').value = perfil.logradouro || '';
        document.getElementById('editBairro').value = perfil.bairro || '';
        document.getElementById('editCidade').value = perfil.cidade || '';
        document.getElementById('editEstado').value = perfil.estado || '';
        document.getElementById('editNumero').value = perfil.numero || '';
        const phone = `${perfil.ddd || ''}${perfil.telefone || ''}`;
        document.getElementById('editTelefone').value = phone;
        
        await carregarRating();
    } catch (erro) {
        console.error('Erro:', erro);
    }
}

async function carregarRating() {
    try {
        const res = await fetchAPI('/atividades');
        if (!res.ok) return;
        const atividades = await res.json();
        const avaliacoes = atividades.filter(a => a.tipo === 'avaliacao' && a.avaliacao);
        const display = document.getElementById('userRatingDisplay');
        if (!display) return;

        if (avaliacoes.length === 0) {
            display.innerText = 'N/A';
            return;
        }

        const soma = avaliacoes.reduce((acc, curr) => acc + curr.avaliacao, 0);
        const media = (soma / avaliacoes.length).toFixed(1);
        display.innerText = media;
    } catch (erro) {
        console.error('Erro ao carregar rating:', erro);
    }
}

async function atualizarPerfil() {
    try {
        const telefoneFull = document.getElementById('editTelefone').value.replace(/\D/g, '');
        const ddd = telefoneFull.substring(0, 2);
        const telefone = telefoneFull.substring(2);

        const res = await fetchAPI('/perfil', {
            method: 'PUT',
            body: JSON.stringify({
                primeironome: document.getElementById('editPrimeironome').value,
                sobrenome: document.getElementById('editSobrenome').value,
                logradouro: document.getElementById('editLogradouro').value,
                bairro: document.getElementById('editBairro').value,
                cidade: document.getElementById('editCidade').value,
                estado: document.getElementById('editEstado').value,
                numero: document.getElementById('editNumero').value,
                ddd: ddd,
                telefone: telefone,
                latitude: userLocation.latitude,
                longitude: userLocation.longitude
            })
        });

        if (res.ok) {
            showToast('Perfil atualizado!');
            carregarPerfil();
        } else {
            showToast('Erro ao atualizar', true);
        }
    } catch (erro) {
        showToast('Erro de conexão', true);
    }
}

// ============= LOGOUT =============
function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    
    if (modalId === 'chatModal') {
        if (chatInterval) {
            clearInterval(chatInterval);
            chatInterval = null;
        }
        destinatarioIdAtual = null;
    }

    if (modalId === 'queueModal') {
        if (queueModalInterval) {
            clearInterval(queueModalInterval);
            queueModalInterval = null;
        }
        queueModalItemId = null;
    }
}

// ============= UTILIDADES =============
function escapeHtml(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}




