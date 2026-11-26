/* cadastro.js — criação de conta (aluno, professor ou fornecedor). O servidor valida tudo, inclusive o código de acesso. */
const PERFIS_COM_CODIGO = ['professor', 'supermercado'];
let exigeCodigo = false;            // o servidor informa (config.json: exigir_codigo)
const PRECISA_CODIGO = { includes: p => exigeCodigo && PERFIS_COM_CODIGO.includes(p) };
let perfil = 'aluno';

const mensagem = document.getElementById('cadastro-status');
const blocoCodigo = document.getElementById('bloco-codigo');
const botao = document.querySelector('.auth-submit');

document.querySelectorAll('[data-role]').forEach(b => {
    b.addEventListener('click', () => {
        perfil = b.dataset.role;
        document.querySelectorAll('[data-role]').forEach(x => {
            x.classList.toggle('selected', x === b);
            x.setAttribute('aria-pressed', String(x === b));
        });
        const precisa = PRECISA_CODIGO.includes(perfil);
        blocoCodigo.hidden = !precisa;
        document.getElementById('codigo').required = precisa;
    });
});

for (const id of ['password', 'password2']) {
    const campo = document.getElementById(id);
    const mostrar = document.querySelector(`[data-mostrar="${id}"]`);
    mostrar.addEventListener('click', () => {
        const oculta = campo.type === 'password';
        campo.type = oculta ? 'text' : 'password';
        mostrar.textContent = oculta ? 'Ocultar' : 'Mostrar';
    });
}

function aviso(texto, erro = true) {
    mensagem.classList.toggle('erro', erro);
    mensagem.textContent = texto;
}

document.getElementById('cadastro-form').addEventListener('submit', async e => {
    e.preventDefault();
    const senha = document.getElementById('password').value;
    if (senha !== document.getElementById('password2').value) return aviso('As senhas não são iguais.');
    botao.disabled = true;
    aviso('Criando sua conta...', false);
    try {
        const usuario = await NGApi.cadastro({
            nome: document.getElementById('nome').value, email: document.getElementById('email').value,
            senha, perfil, codigo: PRECISA_CODIGO.includes(perfil) ? document.getElementById('codigo').value : undefined
        });
        aviso('Conta criada! Abrindo seu painel...', false);
        location.href = NGApi.DESTINOS[usuario.perfil];
    } catch (erro) {
        aviso(erro.message || 'Não foi possível criar a conta.');
        botao.disabled = false;
    }
});

// Pergunta ao servidor se o código de acesso é exigido; sem servidor, mostra o aviso
NGApi.servidorOnline().then(async online => {
    if (!online) {
        ['cadastro-form', 'area-cadastro-topo', 'link-entrar', 'intro-cadastro'].forEach(id => { document.getElementById(id).hidden = true; });
        document.getElementById('aviso-offline').hidden = false;
        return;
    }
    try { exigeCodigo = (await NGApi.config()).exigirCodigo === true; } catch { exigeCodigo = false; }
});
