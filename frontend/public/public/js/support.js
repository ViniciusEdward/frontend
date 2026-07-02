// Support and Help Features
let supportMessages = [];

function escaparTexto(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

function inicializarSupport() {
    const supportMsg = document.getElementById('supportMessages');
    if (supportMsg && supportMessages.length === 0) {
        supportMessages = [
            {tipo: 'bot', texto: 'Olá! Bem-vindo ao Doefacil. Como posso ajudar? 😊'}
        ];
        atualizarSupportUI();
    }
}

function atualizarSupportUI() {
    const container = document.getElementById('supportMessages');
    if (!container) return;
    container.innerHTML = supportMessages.map(msg => `
        <div style="padding: 10px; margin-bottom: 5px; border-radius: 12px; max-width: 80%; ${msg.tipo === 'user' ? 'background: var(--primary); color: white; align-self: flex-end; margin-left: auto;' : 'background: #f1f1f1; color: var(--text-dark); align-self: flex-start;'}">
            <div>${escaparTexto(msg.texto)}</div>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendSupportMessage() {
    const input = document.getElementById('supportInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    supportMessages.push({tipo: 'user', texto: msg});
    input.value = '';
    atualizarSupportUI();
    
    const respostas = [
        { regex: /\berro\b|\bproblema\b|\bbug\b|\bfalha\b/i, texto: 'Se você encontrou um erro no suporte, descreva o problema com detalhes e vamos ajudar com base no que você pediu.' },
        { regex: /\beditar perfil\b|\bcomo editar perfil\b|\bcomo faço para editar perfil\b|\beditar meu perfil\b/i, texto: 'Para editar seu perfil, vá à página de perfil, atualize seus dados e confirme as alterações. Assim você mantém seus dados e localização sempre corretos.' },
        { regex: /\bcomo usar\b|\bcomo funciona\b|\bcomo\b.*\bDoefacil\b|\bcomo\b.*\busar\b/i, texto: 'Para usar o Doefacil: 1) Cadastre-se, 2) Crie doações ou solicite itens, 3) Localize no mapa, 4) Chat com doadores, 5) Combine a retirada.' },
        { regex: /\bdoa(c|ç)\b|\bdoa(c|ç)(?:ão|oes)?\b|\bdoar\b/i, texto: 'Para criar uma doação: vá para a aba de doações, preencha os dados do item, selecione a localização no mapa e publique.' },
        { regex: /\bsolicitar\b|\bsolicitação\b|\bsolicitar um item\b|\bpegar\b/i, texto: 'Para solicitar um item: encontre um doador no feed, clique em "Ver Detalhes" e depois em "Solicitar Item".' },
        { regex: /\bmapa\b|\blocaliza(c|ç)\b|\bgeolocalização\b/i, texto: 'O mapa mostra onde estão os itens doados. Use-o para encontrar doações mais próximas e combinar a retirada com mais facilidade.' },
        { regex: /\bsuporte\b|\bcontato\b|\bajuda\b/i, texto: 'Você pode usar este chat para suporte ou enviar um email para suporte@doefacil.com. Descreva o problema claramente para receber a resposta certa.' },
        { regex: /\bproximidade\b|\bpr(o|ó)ximo\b|\bdist(â|a)ncia\b/i, texto: 'Os itens mais próximos aparecem primeiro para facilitar o encontro e reduzir o tempo de retirada.' },
        { regex: /\bchat\b|\bconversar\b|\bmensagem\b|\bconversas\b/i, texto: 'O chat permite combinar diretamente com o doador. Envie sua mensagem após selecionar o item que deseja solicitar.' },
        { regex: /\bperfil\b|\batualizar dados\b|\bminha conta\b/i, texto: 'Edite seu perfil para atualizar seu nome, email, localização e telefone. Isso ajuda doadores e solicitantes a se comunicarem melhor.' },
        { regex: /\bfila\b|\bestou na fila\b|\bprioridade\b/i, texto: 'A fila prioriza quem está mais próximo do item. Isso ajuda a organizar solicitações e a entrega.' }
    ];

    let resposta = 'Desculpe, não entendi. Por favor, descreva melhor o que você precisa: cadastro, doação, solicitação, mapa, suporte, chat ou perfil?';
    for (const item of respostas) {
        if (item.regex.test(msg)) {
            resposta = item.texto;
            break;
        }
    }

    setTimeout(() => {
        supportMessages.push({tipo: 'bot', texto: resposta});
        atualizarSupportUI();
    }, 500);
}



