/* =========================================================================
   api.js — comunicação com o servidor do projeto (servidor/app.py)

   Tudo (contas, alimentos, receitas, aprovados e rejeitados) fica em arquivos JSON no
   servidor. Aqui no navegador guardamos só o "crachá" de login (token) e o nome.
   Por padrão o site e a API ficam no mesmo endereço. Se a API estiver em outro lugar,
   preencha "api.base" em data/site.json (ex.: "https://meu-servidor.exemplo.com").
   ========================================================================= */
(() => {
    'use strict';
    const CHAVE_TOKEN = 'ng_token';
    const CHAVE_SESSAO = 'ng_sessao';
    const CHAVE_DEMO = 'ng_demo';
    const origemScript = document.currentScript ? document.currentScript.src : location.href;
    const DESTINOS = {
        aluno: 'aluno/dashboardaluno.html',
        professor: 'professor/dashboardprof.html',
        supermercado: 'supermercado/dashboardsupermercado.html'
    };

    let base = '';
    const pronto = (async () => {
        try {
            const r = await fetch(new URL('../data/site.json', origemScript));
            if (r.ok) base = String(((await r.json()).api || {}).base || '').replace(/\/+$/, '');
        } catch { /* usa o mesmo endereço do site */ }
    })();

    const lerChave = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const token = () => lerChave(CHAVE_TOKEN);

    /* ---- Modo demonstração: usado quando o site está só publicado (GitHub Pages), sem servidor ---- */
    const demoAtivo = () => lerChave(CHAVE_DEMO) === '1';
    const MSG_DEMO = 'Modo demonstração: nada é salvo aqui. O salvamento em JSON funciona ao rodar o projeto no desktop (INICIAR.bat ou python servidor/app.py).';

    async function respostaDemo(metodo, caminho) {
        if (metodo === 'GET') {
            if (caminho === '/api/produtos') {
                const r = await fetch(new URL('../data/produtos.json', origemScript));
                if (!r.ok) throw new Error('Não foi possível carregar o catálogo.');
                return r.json();
            }
            if (caminho === '/api/eu') return { usuario: JSON.parse(lerChave(CHAVE_SESSAO) || 'null') };
            if (caminho === '/api/envios' || caminho === '/api/arquivos') return [];
            if (caminho === '/api/supermercado') return { dados: null };
        }
        throw Object.assign(new Error(MSG_DEMO), { status: 0, demo: true });
    }

    async function servidorOnline() {
        await pronto;
        try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 3000);
            const r = await fetch(base + '/api/saude', { signal: ctl.signal });
            clearTimeout(t);
            return r.ok && (await r.json()).ok === true;
        } catch { return false; }
    }

    function entrarDemo(perfil) {
        try {
            localStorage.setItem(CHAVE_DEMO, '1');
            localStorage.setItem(CHAVE_TOKEN, 'demo');
            localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ nome: 'Visitante (demonstração)', email: 'demo@demonstracao', perfil }));
        } catch { /* armazenamento bloqueado */ }
        return DESTINOS[perfil];
    }

    function faixaDemo() {
        if (!demoAtivo()) return;
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = new URL('../css/demo.css', origemScript).href;
        document.head.appendChild(css);
        const f = document.createElement('div');
        f.className = 'faixa-demo';
        f.setAttribute('role', 'status');
        f.innerHTML = '<span><strong>Modo demonstração.</strong> Você pode navegar por todas as páginas, mas nada é salvo. O salvamento em JSON funciona ao rodar o projeto no desktop.</span>';
        const sairDemo = document.createElement('a');
        sairDemo.href = new URL('../login.html', origemScript).href;
        sairDemo.textContent = 'Sair da demonstração';
        sairDemo.addEventListener('click', () => sair());
        f.appendChild(sairDemo);
        document.body.appendChild(f);
        document.body.classList.add('tem-faixa-demo');
    }
    document.addEventListener('DOMContentLoaded', faixaDemo);

    async function req(metodo, caminho, corpo) {
        await pronto;
        if (demoAtivo()) return respostaDemo(metodo, caminho);
        const cab = {};
        if (corpo !== undefined) cab['Content-Type'] = 'application/json';
        if (token()) cab['Authorization'] = 'Bearer ' + token();
        let r;
        try {
            r = await fetch(base + caminho, { method: metodo, headers: cab, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
        } catch {
            throw Object.assign(new Error('Não foi possível falar com o servidor. Verifique sua conexão ou se o servidor do projeto está no ar.'), { status: 0 });
        }
        let dados = null;
        try { dados = await r.json(); } catch { /* resposta sem JSON */ }
        if (!r.ok) {
            const msg = dados && dados.erro ? dados.erro : 'O servidor do projeto não está disponível neste endereço (erro ' + r.status + ').';
            throw Object.assign(new Error(msg), { status: r.status });
        }
        return dados;
    }

    function guardar(resp) {
        try {
            localStorage.setItem(CHAVE_TOKEN, resp.token);
            localStorage.setItem(CHAVE_SESSAO, JSON.stringify(resp.usuario));
        } catch { /* armazenamento bloqueado */ }
        return resp.usuario;
    }
    function sair() {
        try { localStorage.removeItem(CHAVE_TOKEN); localStorage.removeItem(CHAVE_SESSAO); localStorage.removeItem(CHAVE_DEMO); } catch { /* ignora */ }
    }

    // Garante que há alguém logado com o perfil certo; senão manda para o login.
    async function exigir(perfil, paginaLogin) {
        const voltar = () => { location.replace(paginaLogin); return new Promise(() => {}); };
        if (!token()) return voltar();
        try {
            const { usuario } = await req('GET', '/api/eu');
            if (perfil && usuario.perfil !== perfil) return voltar();
            return usuario;
        } catch (e) {
            if (e.status === 401 || e.status === 403) { sair(); return voltar(); }
            throw e;
        }
    }

    // Endereço de um arquivo do site (foto). "prefixo" = '' nas páginas da raiz, '../' nas pastas dos portais.
    function asset(caminho, prefixo = '') {
        if (!caminho) return '';
        if (/^(data:|https?:)/.test(caminho)) return caminho;
        return base ? base + '/' + caminho : prefixo + caminho;
    }

    // Reduz a foto no navegador antes de enviar (menos dados, mais rápido)
    function reduzirImagem(arquivo, max = 800) {
        return new Promise((ok, falha) => {
            const leitor = new FileReader();
            leitor.onerror = falha;
            leitor.onload = () => {
                const img = new Image();
                img.onerror = falha;
                img.onload = () => {
                    const k = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * k);
                    c.height = Math.round(img.height * k);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    ok(c.toDataURL('image/jpeg', 0.82));
                };
                img.src = leitor.result;
            };
            leitor.readAsDataURL(arquivo);
        });
    }

    window.NGApi = {
        DESTINOS, asset, exigir, sair, reduzirImagem, servidorOnline, entrarDemo,
        demo: demoAtivo, config: () => req('GET', '/api/config'),
        arquivos: () => req('GET', '/api/arquivos'), arquivo: nome => req('GET', '/api/arquivos/' + encodeURIComponent(nome)),
        usuarioLocal: () => { try { return JSON.parse(lerChave(CHAVE_SESSAO)); } catch { return null; } },
        login: async (email, senha) => guardar(await req('POST', '/api/login', { email, senha })),
        cadastro: async dados => guardar(await req('POST', '/api/cadastro', dados)),
        produtos: () => req('GET', '/api/produtos'),
        criarProduto: d => req('POST', '/api/produtos', d),
        editarProduto: (id, d) => req('PUT', '/api/produtos/' + encodeURIComponent(id), d),
        excluirProduto: id => req('DELETE', '/api/produtos/' + encodeURIComponent(id)),
        envios: () => req('GET', '/api/envios'),
        criarEnvio: d => req('POST', '/api/envios', d),
        analisar: (id, status, motivo) => req('POST', `/api/envios/${id}/analise`, { status, motivo }),
        editarEnvio: (id, d) => req('PUT', '/api/envios/' + id, d),
        excluirEnvio: id => req('DELETE', '/api/envios/' + id),
        supermercado: () => req('GET', '/api/supermercado'),
        salvarSupermercado: dados => req('PUT', '/api/supermercado', { dados })
    };
})();
