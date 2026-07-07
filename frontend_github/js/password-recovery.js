// Recuperação de senha sem handlers inline, compatível com CSP

document.addEventListener('DOMContentLoaded', () => {
    // ============= RECUPERAÇÃO DE SENHA =============
    document.getElementById('btnEsqueceuSenha').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('etapa1Recuperar').style.display = 'block';
        document.getElementById('etapa2Recuperar').style.display = 'none';
        document.getElementById('emailRecuperacao').value = '';
        document.getElementById('tokenRecuperacao').value = '';
        document.getElementById('novaSenhaInput').value = '';
        document.getElementById('modalRecuperarSenha').style.display = 'flex';
    });

    function fecharRecuperarSenha() {
        document.getElementById('modalRecuperarSenha').style.display = 'none';
    }

    async function solicitarRecuperacao() {
        const email = document.getElementById('emailRecuperacao').value.trim();
        if (!email || !email.includes('@')) {
            showToast('Informe um e-mail válido', true);
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/recuperar-senha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const dados = await res.json();
            if (res.ok) {
                if (dados.token) {
                    // Modo desenvolvimento: exibir token no console
                    console.info('[DoeFacil Dev] Token de recuperação:', dados.token);
                    document.getElementById('tokenRecuperacao').value = dados.token;
                }
                document.getElementById('etapa1Recuperar').style.display = 'none';
                document.getElementById('etapa2Recuperar').style.display = 'block';
                showToast('Código gerado! Verifique o console (dev) ou seu e-mail (produção).');
            } else {
                showToast(dados.erro || 'Erro ao solicitar recuperação', true);
            }
        } catch (e) {
            showToast('Erro de conexão', true);
        }
    }

    async function confirmarNovaSenha() {
        const token = document.getElementById('tokenRecuperacao').value.trim();
        const novaSenha = document.getElementById('novaSenhaInput').value;
        if (!token) {
            showToast('Informe o código de recuperação', true);
            return;
        }
        if (!novaSenha || novaSenha.length < 8) {
            showToast('A nova senha deve ter pelo menos 8 caracteres', true);
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/resetar-senha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, novaSenha })
            });
            const dados = await res.json();
            if (res.ok) {
                fecharRecuperarSenha();
                showToast('Senha alterada com sucesso! Faça login com a nova senha.');
            } else {
                showToast(dados.erro || 'Código inválido ou expirado', true);
            }
        } catch (e) {
            showToast('Erro de conexão', true);
        }
    }

    document.getElementById('btnCancelarRecuperacao1')?.addEventListener('click', fecharRecuperarSenha);
    document.getElementById('btnCancelarRecuperacao2')?.addEventListener('click', fecharRecuperarSenha);
    document.getElementById('btnSolicitarRecuperacao')?.addEventListener('click', solicitarRecuperacao);
    document.getElementById('btnConfirmarNovaSenha')?.addEventListener('click', confirmarNovaSenha);
});
