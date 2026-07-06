// URL do backend — produção aponta para o Render, dev para localhost:3001
const API_BASE_URL = (() => {
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
let queueModalInterval = null;
let queueModalItemId = null;
let map = null;
let userLocation = { latitude: -12.97, longitude: -38.50 };

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


function isValidImageSrc(src) {
    if (typeof src !== 'string') return false;
    const value = src.trim();
    if (!value) return false;
    if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return true;
    if (/^\/uploads\/items\/[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(value)) return true;
    try {
        const parsed = new URL(value, window.location.origin);
        return ['http:', 'https:'].includes(parsed.protocol) && !/[<>"'`]/.test(value);
    } catch (erro) {
        return false;
    }
}

function safeImageSrc(src) {
    const value = typeof src === 'string' ? src.trim() : '';
    return isValidImageSrc(value) ? value : '';
}

function renderItemImage(item, extraClass = '') {
    const title = escapeHtml(item?.titulo || 'Item para doação');
    const src = safeImageSrc(item?.imagem_url || item?.imagemUrl || '');
    if (!src) {
        return `<div class="item-card-img-placeholder ${extraClass}"><i class="fa-solid fa-box-open"></i></div>`;
    }
    return `<img class="item-card-img ${extraClass}" src="${escapeHtml(src)}" alt="${title}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'item-card-img-placeholder ${extraClass}',innerHTML:'<i class=&quot;fa-solid fa-box-open&quot;></i>'}))">`;
}

function safeInlineString(value) {
    return JSON.stringify(String(value || '')).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    if (removeBtn) removeBtn.addEventListener('click', limparImagemSelecionada);

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

document.addEventListener('DOMContentLoaded', async () => {
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
                            <button class="btn btn-primary" onclick="solicitarDoacao(${item.iditem})" ${isFilaCheia ? 'disabled' : ''}>
                                <i class="fa-solid fa-hand-holding-heart"></i>
                                ${isFilaCheia ? 'Fila cheia' : 'Solicitar'}
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="abrirModalFilaCompleta(${item.iditem})">
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
    try {
        const res = await fetchAPI('/solicita', {
            method: 'POST',
            body: JSON.stringify({ iditem })
        });

        const dados = await res.json();
        
        if (res.ok) {
            const filaInfo = await buscarPosicaoNaFila(iditem);
            if (filaInfo && filaInfo.posicao) {
                showToast(`✅ Você está na posição #${filaInfo.posicao} da fila! Seleção automática em ${filaInfo.dias_restantes} dias.`);
            } else {
                showToast('Doação solicitada com sucesso!');
            }
            carregarItensDoBanco();
        } else {
            showToast(dados.erro || 'Erro ao solicitar', true);
        }
    } catch (erro) {
        console.error('Erro:', erro);
        showToast('Erro de conexão', true);
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

async function criarDoacao() {
    try {
        const titulo = document.getElementById('itemName')?.value.trim();
        const descricao = document.getElementById('itemDesc')?.value.trim() || '';
        const limiteFila = parseInt(document.getElementById('queueLimit')?.value) || 10;
        const prazo_dias = parseInt(document.getElementById('prazo_dias')?.value) || 7;
        const latitude = parseFloat(document.getElementById('itemLatitude')?.value);
        const longitude = parseFloat(document.getElementById('itemLongitude')?.value);

        if (!titulo || Number.isNaN(latitude) || Number.isNaN(longitude)) {
            showToast('Preencha o item e selecione a localização no mapa.', true);
            return;
        }

        const imagem_url = selectedItemImageDataUrl || '';

        const res = await fetchAPI('/itens', {
            method: 'POST',
            body: JSON.stringify({
                titulo,
                descricao,
                limiteFila,
                prazo_dias,
                latitude,
                longitude,
                imagem_url: imagem_url || undefined
            })
        });

        const dados = await res.json();
        
        if (res.ok) {
            showToast('Item criado com sucesso!');
            document.getElementById('donateForm').reset();
            limparImagemSelecionada();
            document.getElementById('coordsDisplay').innerText = 'Coordenadas: será preenchido ao clicar';
            navigateTab('myDonationsTab');
        } else {
            showToast(dados.erro || 'Erro ao criar', true);
        }
    } catch (erro) {
        console.error('Erro:', erro);
        showToast('Erro de conexão', true);
    }
}

// ============= ATIVIDADES =============
function formatStatus(status) {
    const map = {
        'pendente': 'Na Fila',
        'aceito': 'Aguardando Entrega',
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

        if (!fila || !doacoes) {
            return;
        }

        const solicitacoes = atividades.filter(item => item.tipo === 'solicitacao' || item.tipo === 'entrega');
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
                    <p style="margin-top: 5px;">
                        <span class="${statusClass}">${formatStatus(item.status)}</span>
                    </p>
                    ${item.filaData ? `<p class="posicao-fila">📍 Sua posição: #${item.filaData.posicao} de ${item.filaData.total}</p>` : ''}
                    ${item.filaData && item.filaData.dias_restantes !== undefined ? `<p class="dias-restantes${item.filaData.dias_restantes <= 3 ? ' urgente' : ''}">⏰ Seleção automática em ${item.filaData.dias_restantes} dias</p>` : ''}
                    
                    <div class="item-card-actions">
                        ${item.status === 'aguardando_entrega' || item.status === 'aceito' ? `
                            <button class="btn btn-primary" onclick="confirmarEntrega(${item.id})">
                                <i class="fa-solid fa-check-circle"></i> Confirmar Recebimento
                            </button>
                            <button class="btn btn-secondary" onclick="abrirChat(${item.idusuario_doador})">
                                <i class="fa-solid fa-comments"></i> Combinar Entrega
                            </button>` : ''}
                        ${item.status === 'entregue' ? `
                            <button class="btn btn-secondary" onclick="abrirAvaliacao(${item.id}, ${item.idusuario_doador}, ${safeInlineString(item.primeironome || '')})">
                                <i class="fa-solid fa-star"></i> Avaliar Doador
                            </button>` : ''}
                        ${item.status === 'pendente' ? `
                            <button class="btn btn-danger btn-sm" onclick="cancelarSolicitacao(${item.id})">
                                <i class="fa-solid fa-xmark"></i> Cancelar Solicitação
                            </button>` : ''}
                    </div>
                    </div>
                </div>
            `;
        }).join('') : '<p style="padding: 1rem; color: var(--text-muted);">Nenhuma solicitação ativa no momento.</p>';

        doacoes.innerHTML = criacoes.length > 0 ? criacoes.map(item => {
            const imgHtml = renderItemImage(item);
            return `
            <div class="item-card">
                ${imgHtml}
                <div class="item-card-body">
                    <h4 style="font-size:1rem; color:var(--secondary);">${escapeHtml(item.titulo)}</h4>
                    <p>${escapeHtml(item.descricao || '')}</p>
                    <p style="font-size: 0.82rem; color: var(--text-muted);">📅 ${new Date(item.data).toLocaleDateString('pt-BR')}</p>
                    <div class="item-card-actions">
                        <button class="btn btn-secondary btn-sm" onclick="abrirDetalhesDoacao(${item.iditem})">Ver Detalhes</button>
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

async function abrirAvaliacao(idsolicitacao, idusuarioDoador, nomeDoador) {
    const form = document.getElementById('avaliacaoForm');
    const nomeEl = document.getElementById('avaliacaoDoadorNome');
    if (form) form.dataset.idsolicitacao = idsolicitacao;
    if (form) form.dataset.idusuarioDoador = idusuarioDoador;
    if (nomeEl) nomeEl.textContent = nomeDoador || 'o doador';
    // Limpar campos anteriores
    const notaEl = document.getElementById('avaliacaoNota');
    const comentEl = document.getElementById('avaliacaoComentario');
    if (notaEl) notaEl.value = '';
    if (comentEl) comentEl.value = '';
    openProfileModal('avaliacaoModal');
}

async function avaliarDoador(idsolicitacao) {
    const form = document.getElementById('avaliacaoForm');
    const notaEl = document.getElementById('avaliacaoNota');
    const comentEl = document.getElementById('avaliacaoComentario');
    const idusuarioDoador = form?.dataset.idusuarioDoador;

    const nota = parseInt(notaEl?.value);
    if (!nota || nota < 1 || nota > 5) {
        showToast('Selecione uma nota de 1 a 5', true);
        return;
    }

    const comentario = comentEl?.value?.trim() || '';

    try {
        const res = await fetchAPI('/avaliacao', {
            method: 'POST',
            body: JSON.stringify({
                idusuario_avaliado: parseInt(idusuarioDoador),
                avaliacao: nota,
                comentario
            })
        });

        if (res.ok) {
            showToast('Avaliação enviada com sucesso!');
            closeModal('avaliacaoModal');
            carregarAtividades();
        } else {
            const dados = await res.json();
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
            return `
                <div class="item-card">
                    ${imgHtml}
                    <div class="item-card-body">
                        <h4 style="font-size:1rem;color:var(--secondary);">${escapeHtml(item.titulo)}</h4>
                        <p>${escapeHtml(item.descricao || '')}</p>
                        <p style="font-size:0.82rem;color:var(--text-muted);">
                            Fila: ${item.total_na_fila || 0}/${limite}
                        </p>
                        <div class="item-card-actions">
                            <button class="btn btn-secondary btn-sm" onclick="abrirDetalhesDoacao(${item.iditem})">
                                <i class="fa-solid fa-circle-info"></i> Detalhes
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="verFila(${item.iditem})">
                                <i class="fa-solid fa-users"></i> Fila
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="finalizarDoacaoAntecipada(${item.iditem})">
                                <i class="fa-solid fa-flag-checkered"></i> Finalizar
                            </button>
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
        actions.innerHTML = '<button class="btn btn-secondary" onclick="closeModal(\'itemModal\')">Fechar</button>';
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

async function carregarFilaCompletaModal(iditem, silent = false) {
    try {
        const res = await fetchAPI(`/itens/${iditem}/fila-completa`);
        if (!res || !res.ok) {
            if (!silent) showToast('Erro ao carregar a fila completa', true);
            return;
        }

        const dados = await res.json();
        const item = dados.item || {};
        const fila = Array.isArray(dados.fila) ? dados.fila : [];
        const limite = item.limite_fila || dados.limite_fila || 0;

        const title = document.getElementById('queueModalTitle');
        const subtitle = document.getElementById('queueModalSubtitle');
        const count = document.getElementById('queueModalCount');
        const image = document.getElementById('queueModalItemImage');
        const list = document.getElementById('queueModalList');

        if (title) title.textContent = `Fila — ${item.titulo || 'Doação'}`;
        if (subtitle) subtitle.textContent = `Última atualização: ${formatDateTime(new Date())}`;
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
                <button class="btn btn-secondary btn-sm" onclick="abrirChat(${f.idusuario})">
                    <i class="fa-solid fa-comments"></i> Chat
                </button>
            </div>
        `).join('')}</div>` : '<div class="queue-empty">Ninguém na fila ainda.</div>';
        
        actions.innerHTML = '<button class="btn btn-secondary" onclick="closeModal(\'itemModal\')">Fechar</button>';
        openProfileModal('itemModal');
    } catch (erro) {
        console.error(erro);
    }
}

async function finalizarDoacaoAntecipada(iditem) {
    if (!confirm('Deseja finalizar a doação agora com quem estiver na fila? O sistema escolherá o primeiro da fila automaticamente.')) return;
    
    try {
        const res = await fetchAPI(`/itens/${iditem}/finalizar`, { method: 'POST' });
        if (res.ok) {
            showToast('Doação finalizada com sucesso!');
            carregarMinhasDoacoes();
        } else {
            const dados = await res.json();
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
            <div class="chat-item" onclick="abrirChat(${chat.idusuario_outro})">
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
        
        if (!res || !res.ok) {
            return;
        }

        const mensagens = await res.json();
        const container = document.getElementById('chatMessages');
        if (!container) return;

        container.innerHTML = mensagens.map(msg => `
            <div class="mensagem ${msg.idusuario_remetente === currentUser.idusuario ? 'enviada' : 'recebida'}">
                <strong>${escapeHtml(msg.primeironome)}:</strong>
                <p>${escapeHtml(msg.mensagem)}</p>
                <small>${new Date(msg.data).toLocaleTimeString('pt-BR')}</small>
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
            showToast('Erro ao enviar mensagem', true);
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
        const lat = event.latlng.lat;
        const lon = event.latlng.lng;
        document.getElementById('itemLatitude').value = lat.toFixed(6);
        document.getElementById('itemLongitude').value = lon.toFixed(6);
        document.getElementById('coordsDisplay').innerText = 
            `📍 ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
            
        if (mapaDoacao._marker) mapaDoacao.removeLayer(mapaDoacao._marker);
        mapaDoacao._marker = L.marker([lat, lon]).addTo(mapaDoacao)
            .bindPopup('<strong>Local do Item</strong>').openPopup();
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




