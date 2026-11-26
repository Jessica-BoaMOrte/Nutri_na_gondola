/* =========================================================================
   app.js — site público (index.html, produto.html, qrcodes.html)

   Catálogo: NGCatalogo.carregar() (js/catalogo.js) = produtos.json + itens do fornecedor
   + conteúdo aprovado pelo professor. Publicação: data/site.json.
   ========================================================================= */
const DATA_SITE = 'data/site.json';

let products = [];
let site = {};

const qs = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const semAcento = NGCatalogo.semAcento;

/* ---------- URLs ---------- */
const urlProduto = p => 'produto.html?id=' + encodeURIComponent(p.id);
// O QR Code é gerado aqui no navegador (js/vendor/qrcode.js) para qualquer alimento, inclusive os novos.
function qrImagem(url) {
    try { return NGQR.dataUrl(url, { nivel: 'M' }); } catch (e) { console.warn('QR Code:', e); return ''; }
}
function urlSite() {
    const base = (site.publicacao && site.publicacao.urlBase) || '';
    return base ? base.replace(/\/?$/, '/') + 'index.html' : new URL('index.html', location.href).href;
}
function urlPublica(p) {
    const base = (site.publicacao && site.publicacao.urlBase) || '';
    return base ? base.replace(/\/?$/, '/') + urlProduto(p) : new URL(urlProduto(p), location.href).href;
}

/* ---------- Imagens ---------- */
// Cada alimento tem "imagem" (foto externa, opcional) e "imagemLocal" (ilustração em assets/).
// Se a foto externa falhar, trocamos pela local; se tudo falhar, mostramos um aviso. Nunca fica imagem quebrada.
function photo(p) {
    const src = p.imagem ? NGApi.asset(p.imagem) : p.imagemLocal;
    if (!src) return '<div class="missing" role="img" aria-label="Fotografia ainda não cadastrada">Foto em atualização</div>';
    return `<img class="food-image" loading="lazy" decoding="async" src="${esc(src)}" data-local="${esc(p.imagemLocal || '')}" alt="Imagem ilustrativa de ${esc(p.nome)}">`;
}
function aviso(texto, rotulo) {
    const d = document.createElement('div');
    d.className = 'missing';
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', rotulo);
    d.textContent = texto;
    return d;
}
document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.classList.contains('qr')) {
        img.replaceWith(aviso('QR Code ainda não gerado', 'QR Code indisponível'));
    } else if (img.classList.contains('food-image')) {
        if (img.dataset.local && !img.src.endsWith(img.dataset.local)) img.src = img.dataset.local;
        else img.replaceWith(aviso('Foto em atualização', 'Imagem indisponível'));
    }
}, true);

/* ---------- Catálogo (index.html) ---------- */
function card(p) {
    const link = urlProduto(p);
    return `<article class="card"><a class="card-photo" href="${link}" aria-label="Conhecer ${esc(p.nome)}">${photo(p)}</a><div class="card-body"><span class="pill">${esc(p.categoria)}</span><h3>${esc(p.nome)}</h3><p>Conheça este alimento e acompanhe a publicação de informações revisadas.</p><a class="card-link" href="${link}">Explorar alimento <span aria-hidden="true">↗</span></a></div></article>`;
}

function catalog() {
    const busca = qs('#search'), filtro = qs('#category');
    function render() {
        const termo = semAcento(busca.value);
        const lista = products.filter(p => semAcento(p.nome).includes(termo) && (!filtro.value || p.categoria === filtro.value));
        qs('#count').textContent = `${lista.length} de ${products.length} alimentos`;
        qs('#catalog').innerHTML = lista.map(card).join('') || '<p class="empty">Nenhum alimento encontrado. Tente outro termo ou categoria.</p>';
    }
    busca.addEventListener('input', render);
    filtro.addEventListener('change', render);
    render();
}

/* ---------- Página do alimento (produto.html) ---------- */
function detail() {
    const p = products.find(x => x.id === params.get('id'));
    if (!p) {
        qs('#detail').innerHTML = '<p>Alimento não encontrado. <a href="index.html">Voltar ao catálogo</a>.</p>';
        return;
    }
    document.title = p.nome + ' | Nutrição na Gôndola';

    const nutri = p.nutrientes
        ? `<p class="notice">Valores aproximados por 100 g do alimento cru. Dados preliminares, ainda não validados por nutricionista. Não utilizar como rotulagem.</p>
           <dl class="nutrition-grid">${Object.entries(p.nutrientes).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
           ${p.vitaminas ? `<p class="small"><strong>Vitaminas:</strong> ${esc(p.vitaminas)}</p>` : ''}
           ${p.minerais ? `<p class="small"><strong>Minerais:</strong> ${esc(p.minerais)}</p>` : ''}
           <p class="small muted">${esc(p.fonteNutricional || 'Fonte pendente de verificação.')}</p>`
        : '<p class="muted">Informações nutricionais em validação. Os valores serão publicados após revisão da equipe responsável.</p>';

    const receitas = Array.isArray(p.receitas) && p.receitas.length
        ? p.receitas.map(r => `<div class="recipe"><h3>${esc(r.nome)}</h3>
            <p class="small muted">${[r.tempo, r.rendimento, r.origem === 'aluno' ? 'Receita enviada por aluno(a) e aprovada' : 'Receita demonstrativa'].filter(Boolean).map(esc).join(' · ')}</p>
            <h4>Ingredientes</h4><ul>${(r.ingredientes || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <h4>Modo de preparo</h4><ol>${(r.preparo || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`).join('')
        : '<p class="muted">Receitas saudáveis em preparação. Em breve, sugestões de ingredientes e modo de preparo.</p>';

    qs('#detail').innerHTML = `
        <div class="detail-media">${photo(p)}<p class="muted small">Imagem ilustrativa de referência; correspondência e licença pendentes de conferência.</p></div>
        <div class="detail-content">
            <span class="pill">${esc(p.categoria)}</span>
            <h1>${esc(p.nome)}</h1>
            <p class="lead">${esc(p.descricao)}</p>
            <div class="panel detail-panel">
                <h2>Informações nutricionais</h2>${nutri}
                <div class="section-divider"></div>
                <h2>Receitas e ideias de preparo</h2>${receitas}
                <div class="section-divider"></div>
                <h2>Conservação</h2><p class="muted">${esc(p.conservacao)}</p>
            </div>
            <div class="panel qr-panel">
                <h2>Leve estas informações com você</h2>
                <img class="qr" src="${qrImagem(urlPublica(p))}" alt="QR Code do alimento ${esc(p.nome)}">
                <p class="small">Escaneie para abrir esta página em outro dispositivo.</p>
                <a class="text-link" href="${esc(urlProduto(p))}">Abrir link direto</a>
            </div>
        </div>`;
}

/* ---------- QR Codes (qrcodes.html) ---------- */
function qrcodes() {
    const base = (site.publicacao && site.publicacao.urlBase) || '';
    const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
    qs('#qr-warning').textContent = local && !base
        ? 'Atenção: você está abrindo o site no seu computador, então estes QR Codes apontam para ele e não funcionam no celular. Abra o site pelo endereço publicado para imprimir.'
        : `Cada QR Code abre a página do alimento em ${base || location.origin}. Teste alguns no celular antes de imprimir.`;

    const itens = [{ nome: 'Catálogo completo', categoria: 'Site', slug: 'site', pagina: 'index.html', qr: qrImagem(urlSite()) }]
        .concat(products.map(p => ({ nome: p.nome, categoria: p.categoria, slug: p.slug, pagina: urlProduto(p), qr: qrImagem(urlPublica(p)) })));

    qs('#qr-list').innerHTML = itens.map(i => `
        <article class="panel qr-card">
            <strong>${esc(i.nome)}</strong>
            <span class="pill">${esc(i.categoria)}</span>
            <img class="qr" loading="lazy" src="${i.qr}" alt="QR Code para ${esc(i.nome)}">
            <div class="qr-actions">
                <a class="text-link" href="${esc(i.pagina)}">Ver página</a>
                <a class="text-link" href="${i.qr}" download="qrcode-${esc(i.slug)}.png">Baixar PNG</a>
            </div>
        </article>`).join('');
}

/* ---------- Início ---------- */
async function load() {
    const alvo = qs('#catalog') || qs('#detail') || qs('#qr-list');
    if (!alvo) return;                         // páginas sem catálogo (ex.: sobre.html)
    try {
        const rs = await fetch(DATA_SITE);
        site = rs.ok ? await rs.json() : {};
        products = await NGCatalogo.carregar();
        if (qs('#catalog')) catalog();
        if (qs('#detail')) detail();
        if (qs('#qr-list')) qrcodes();
    } catch (e) {
        alvo.innerHTML = '<p class="notice">Não foi possível carregar o catálogo. Abra o projeto por um servidor (por exemplo, <code>python -m http.server</code>) ou publique o site e tente novamente.</p>';
        console.error(e);
    }
}
load();
