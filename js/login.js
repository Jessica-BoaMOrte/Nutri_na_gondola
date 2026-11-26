/* login.js — entrada com e-mail e senha de uma conta criada em cadastro.html */
const campoSenha = document.getElementById('password');
const botaoSenha = document.getElementById('toggle-pass');
const mensagem = document.getElementById('login-status');
const botao = document.querySelector('.auth-submit');

botaoSenha.addEventListener('click', () => {
    const oculta = campoSenha.type === 'password';
    campoSenha.type = oculta ? 'text' : 'password';
    botaoSenha.textContent = oculta ? 'Ocultar' : 'Mostrar';
    botaoSenha.setAttribute('aria-label', oculta ? 'Ocultar senha' : 'Mostrar senha');
});

document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    mensagem.classList.remove('erro');
    mensagem.textContent = 'Verificando...';
    botao.disabled = true;
    try {
        const usuario = await NGApi.login(document.getElementById('email').value, campoSenha.value);
        mensagem.textContent = 'Acesso liberado. Abrindo seu painel...';
        location.href = NGApi.DESTINOS[usuario.perfil];
    } catch (erro) {
        mensagem.classList.add('erro');
        mensagem.textContent = erro.message || 'Não foi possível entrar. Tente novamente.';
        botao.disabled = false;
    }
});

// Sem servidor (ex.: site publicado no GitHub): oferece o modo demonstração
NGApi.servidorOnline().then(online => {
    if (online) return;
    document.getElementById('login-form').hidden = true;
    document.getElementById('link-cadastro').hidden = true;
    document.getElementById('bloco-demo').hidden = false;
});
document.querySelectorAll('[data-demo]').forEach(b => {
    b.addEventListener('click', () => { location.href = NGApi.entrarDemo(b.dataset.demo); });
});
