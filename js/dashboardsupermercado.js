/* Portal do Fornecedor / Supermercado
   Os dados deste portal e os hortifrútis cadastrados ficam em JSON no servidor (servidor/app.py). */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let usuario = { nome: 'Fornecedor(a)', email: '' };

let appData = {
    fornecedores: [
        { id: 1, nome: "Agrovale Alimentos", cnpj: "12.345.678/0001-90", segmento: "Hortifrúti" },
        { id: 2, nome: "Laticínios Sul-Minas", cnpj: "98.765.432/0001-10", segmento: "Laticínios" }
    ],
    locais: [
        { id: 1, cep: "05422-001", logradouro: "Av. Rebouças, 2400", hub: "CD São Paulo Centro" },
        { id: 2, cep: "13060-002", logradouro: "Rua Regente Feijó, 45", hub: "CD Campinas Interior" }
    ],
    auditorias: [
        { id: 1, gondola: "Corredor 4 - Matinais", preco: "R$ 14,90", setor: "Mercearia" }
    ],
    seguranca: { token: "sd_live_9a8f7b6c5e4d3c2b1a", permissao: "Admin Master" }
};

// Grava no servidor (JSON) só quando algo mudou
let ultimoSalvo = null, aguardando = null;
function salvarDados() {
    const atual = JSON.stringify(appData);
    if (atual === ultimoSalvo) return;
    ultimoSalvo = atual;
    clearTimeout(aguardando);
    aguardando = setTimeout(() => NGApi.salvarSupermercado(appData).catch(e => console.warn('Não foi possível salvar no servidor:', e.message)), 300);
}

let currentModalContext = "";
let currentEditingId = null;

// Dicionário Transacional de Telas (Views)
const views = {
    perfil: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Olá, ${esc(usuario.nome)} 👋</h1>
            <p class="welcome-subtitle">Adicione as informações abaixo</p>
            <div class="cards-grid">
                <div class="action-card">
                    <div class="card-icon-wrapper"><i class="fa-solid fa-tractor" aria-hidden="true"></i></div>
                    <h3 class="action-card-title">Adicionar informações sobre o fornecedor</h3>
                    <p class="action-card-desc">Cadastre dados gerais e informações principais do fornecedor.</p>
                    <button class="btn-prime" onclick="openModal('addFornecedor')">Adicionar</button>
                </div>
                <div class="action-card">
                    <div class="card-icon-wrapper"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i></div>
                    <h3 class="action-card-title">Adicionar local do fornecedor</h3>
                    <p class="action-card-desc">Informe endereço, localização e dados de funcionamento.</p>
                    <button class="btn-prime" onclick="openModal('addLocal')">Adicionar</button>
                </div>
                <div class="action-card">
                    <div class="card-icon-wrapper"><i class="fa-solid fa-store" aria-hidden="true"></i></div>
                    <h3 class="action-card-title">Adicionar informações sobre o mercado</h3>
                    <p class="action-card-desc">Preencha dados relacionados ao segmento e atuação.</p>
                    <button class="btn-prime" onclick="openModal('addMercado')">Adicionar</button>
                </div>
                <div class="action-card">
                    <div class="card-icon-wrapper"><i class="fa-solid fa-carrot" aria-hidden="true"></i></div>
                    <h3 class="action-card-title">Cadastrar hortifrúti</h3>
                    <p class="action-card-desc">Inclua novas frutas, verduras e legumes no catálogo do site.</p>
                    <button class="btn-prime" onclick="switchView('hortifruti')">Cadastrar</button>
                </div>
            </div>
        </div>
    `,
    fornecedor: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Área do painel de Fornecedor</h1>
            <p class="welcome-subtitle">Visualize, gerencie e edite os dados estruturais das suas empresas parceiras.</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Empresa Parceira</th>
                        <th>CNPJ</th>
                        <th>Segmento</th>
                        <th class="ta-right">Ações de Edição</th>
                    </tr>
                </thead>
                <tbody>
                    ${appData.fornecedores.map(f => `
                        <tr>
                            <td><strong>${esc(f.nome)}</strong></td>
                            <td>${esc(f.cnpj)}</td>
                            <td>${esc(f.segmento)}</td>
                            <td class="ta-right">
                                <button class="btn-table-action btn-edit" onclick="openModal('editFornecedor', ${f.id})"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                                <button class="btn-table-action btn-delete" onclick="deleteItem('fornecedores', ${f.id}, 'fornecedor')"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `,
    local: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Painel de controle geográfico de centros logísticos</h1>
            <p class="welcome-subtitle">Mapeamento estrutural de endereços e hubs de distribuição integrados à malha de abastecimento Sonda.</p>
            
            <div class="geo-grid">
                <div class="geo-summary">
                    <h4 class="geo-summary-title"><i class="fa-solid fa-map-pin text-green"></i> Resumo de Cobertura</h4>
                    <p class="geo-summary-text">Atualmente existem <strong>${appData.locais.length} zonas estratégicas</strong> operacionais ativas para recebimento e triagem.</p>
                </div>
                
                <div>
                    <table class="data-table mt-0">
                        <thead>
                            <tr>
                                <th>CEP</th>
                                <th>Logradouro / Número</th>
                                <th>Hub Logístico</th>
                                <th class="ta-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${appData.locais.map(l => `
                                <tr>
                                    <td><code class="code-chip-sm">${esc(l.cep)}</code></td>
                                    <td>${esc(l.logradouro)}</td>
                                    <td><strong>${esc(l.hub)}</strong></td>
                                    <td class="ta-right">
                                        <button class="btn-table-action btn-delete" onclick="deleteItem('locais', ${l.id}, 'local')"><i class="fa-solid fa-circle-minus"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `,
    mercado: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Área do painel de Mercado</h1>
            <p class="welcome-subtitle">Análise de auditoria de gôndolas, precificação e setores ativos no Sonda.</p>
            
            <div class="form-box-inline">
                <h3 class="form-box-title"><i class="fa-solid fa-circle-plus text-green"></i> Adicionar Nova Auditoria de Gôndola</h3>
                <div class="inline-form-row">
                    <input type="text" id="m_gondola" class="input-field w-250" placeholder="Gôndola / Identificação">
                    <input type="text" id="m_preco" class="input-field w-150" placeholder="Preço Verificado (R$)">
                    <input type="text" id="m_setor" class="input-field w-200" placeholder="Setor Ativo">
                    <button class="btn-prime" onclick="addAuditoriaInline()">Adicionar Registro</button>
                </div>
            </div>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Gôndola / Localização</th>
                        <th>Precificação</th>
                        <th>Setor Ativo no Sonda</th>
                    </tr>
                </thead>
                <tbody>
                    ${appData.auditorias.map(a => `
                        <tr>
                            <td>${esc(a.gondola)}</td>
                            <td class="price-cell">${esc(a.preco)}</td>
                            <td><span class="chip">${esc(a.setor)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `,
    relatorios: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Área do painel de Relatórios & Analytics</h1>
            <p class="welcome-subtitle">Exportação de relatórios consolidados em formato PDF e planilhas BI.</p>
            
            <div class="upload-zone">
                <i class="fa-solid fa-cloud-arrow-up upload-icon"></i>
                <h3 class="upload-title">Enviar base de dados para consolidação</h3>
                <p class="upload-desc">Arraste planilhas .xlsx ou clique no botão abaixo para selecionar arquivos corporativos.</p>
                <input type="file" id="file_upload" onchange="simulateUpload()" hidden>
                <button class="btn-prime" onclick="document.getElementById('file_upload').click()"><i class="fa-solid fa-file-import"></i> Enviar Arquivos</button>
            </div>
        </div>
    `,
    configuracoes: () => `
        <div class="workspace-card">
            <h1 class="welcome-title">Área do painel de Configurações do Sistema</h1>
            <p class="welcome-subtitle">Ajustes de segurança da conta, tokens de API e permissões de acesso.</p>
            
            <div class="settings-list">
                <div class="setting-row">
                    <div>
                        <h4 class="setting-title">Chave Token de Integração API</h4>
                        <code class="code-chip">${appData.seguranca.token}</code>
                    </div>
                    <button class="btn-secondary" onclick="generateNewToken()"><i class="fa-solid fa-arrows-rotate"></i> Gerar Atualização</button>
                </div>
                <div class="setting-row">
                    <div>
                        <h4 class="setting-title">Nível de Acesso Operacional</h4>
                        <p class="setting-desc">Nível Atual: <strong>${appData.seguranca.permissao}</strong></p>
                    </div>
                    <button class="btn-secondary" onclick="updatePermissions()"><i class="fa-solid fa-user-shield"></i> Atualizar Permissões</button>
                </div>
            </div>
        </div>
    `
};

// --- MANIPULAÇÃO DA NAVEGAÇÃO SPA ---
function switchView(viewKey) {
    salvarDados();
    document.querySelectorAll('.menu-item-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`menu-${viewKey}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    document.getElementById('mainViewport').innerHTML = views[viewKey]();
}

// --- SISTEMA INTERATIVO DE CAIXAS FLUTUANTES (MODAL) ---
function openModal(action, id = null) {
    const modal = document.getElementById('globalModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    currentModalContext = action;
    currentEditingId = id;

    if (action === 'addFornecedor') {
        title.innerText = "Inserir Dados do Fornecedor";
        body.innerHTML = `
            <div class="input-group"><label class="input-label">Nome da Empresa</label><input type="text" id="f_nome" class="input-field" required placeholder="Ex: Distribuidora Central"></div>
            <div class="input-group"><label class="input-label">CNPJ</label><input type="text" id="f_cnpj" class="input-field" required placeholder="00.000.000/0001-00"></div>
            <div class="input-group"><label class="input-label">Segmento</label><input type="text" id="f_seg" class="input-field" required placeholder="Ex: Hortifrúti"></div>`;
    } else if (action === 'addLocal') {
        title.innerText = "Adicionar Local do Fornecedor";
        body.innerHTML = `
            <div class="input-group"><label class="input-label">CEP</label><input type="text" id="l_cep" class="input-field" required placeholder="00000-000"></div>
            <div class="input-group"><label class="input-label">Logradouro / Número do Fornecedor</label><input type="text" id="l_logradouro" class="input-field" required placeholder="Ex: Av. dos Estados, 4500"></div>
            <div class="input-group"><label class="input-label">Identificação do Centro Logístico (Hub)</label><input type="text" id="l_hub" class="input-field" required placeholder="Ex: CD Sonda Leste"></div>`;
    } else if (action === 'addMercado') {
        title.innerText = "Adicionar Auditoria de Mercado";
        body.innerHTML = `
            <div class="input-group"><label class="input-label">Gôndola / Identificação</label><input type="text" id="fm_gondola" class="input-field" required placeholder="Ex: Corredor 2 - Bebidas"></div>
            <div class="input-group"><label class="input-label">Preço Verificado</label><input type="text" id="fm_preco" class="input-field" required placeholder="Ex: 8,90"></div>
            <div class="input-group"><label class="input-label">Setor Ativo</label><input type="text" id="fm_setor" class="input-field" required placeholder="Ex: Bebidas"></div>`;
    } else if (action === 'editFornecedor') {
        title.innerText = "Editar Empresa Parceira";
        const item = appData.fornecedores.find(f => f.id === id);
        body.innerHTML = `
            <div class="input-group"><label class="input-label">Nome da Empresa</label><input type="text" id="f_nome" class="input-field" value="${esc(item.nome)}" required></div>
            <div class="input-group"><label class="input-label">CNPJ</label><input type="text" id="f_cnpj" class="input-field" value="${esc(item.cnpj)}" required></div>
            <div class="input-group"><label class="input-label">Segmento</label><input type="text" id="f_seg" class="input-field" value="${esc(item.segmento)}" required></div>`;
    }

    modal.classList.add('active');
    setTimeout(() => { document.querySelector('.input-field').focus(); }, 50);
}

function closeModal() {
    document.getElementById('globalModal').classList.remove('active');
}

function handleModalSubmit(e) {
    e.preventDefault();

    if (currentModalContext === 'addFornecedor') {
        appData.fornecedores.push({ id: Date.now(), nome: document.getElementById('f_nome').value, cnpj: document.getElementById('f_cnpj').value, segmento: document.getElementById('f_seg').value });
        switchView('fornecedor');
    } else if (currentModalContext === 'editFornecedor') {
        let f = appData.fornecedores.find(item => item.id === currentEditingId);
        f.nome = document.getElementById('f_nome').value; f.cnpj = document.getElementById('f_cnpj').value; f.segmento = document.getElementById('f_seg').value;
        switchView('fornecedor');
    } else if (currentModalContext === 'addLocal') {
        appData.locais.push({ id: Date.now(), cep: document.getElementById('l_cep').value, logradouro: document.getElementById('l_logradouro').value, hub: document.getElementById('l_hub').value });
        switchView('local');
    } else if (currentModalContext === 'addMercado') {
        appData.auditorias.unshift({ id: Date.now(), gondola: document.getElementById('fm_gondola').value, preco: `R$ ${document.getElementById('fm_preco').value}`, setor: document.getElementById('fm_setor').value });
        switchView('mercado');
    }

    closeModal();
}

// --- AÇÕES LOGICAMENTE MAPEADAS ---
function deleteItem(dataKey, id, redirectView) {
    if(confirm("Deseja prosseguir com a exclusão definitiva deste registro?")) {
        appData[dataKey] = appData[dataKey].filter(item => item.id !== id);
        switchView(redirectView);
    }
}

function addAuditoriaInline() {
    const gondola = document.getElementById('m_gondola').value;
    const preco = document.getElementById('m_preco').value;
    const setor = document.getElementById('m_setor').value;
    if(!gondola || !preco) return alert("Por favor, preencha os dados da auditoria.");
    
    appData.auditorias.unshift({ id: Date.now(), gondola, preco: `R$ ${preco}`, setor });
    switchView('mercado');
}

function simulateUpload() {
    alert("Arquivos enviados com sucesso para as rotas BI da Sonda Supermercados.");
}

function generateNewToken() {
    appData.seguranca.token = "sd_live_" + Math.random().toString(36).substring(2, 15);
    switchView('configuracoes');
    alert("Nova chave de Token gerada com sucesso.");
}

function updatePermissions() {
    appData.seguranca.permissao = "Gestor Avançado Sonda";
    switchView('configuracoes');
    alert("Permissões de acesso da conta atualizadas.");
}

// --- HORTIFRÚTI: itens novos do catálogo público ---------------------------------
// Cada item é gravado em data/produtos.json (e a foto em assets/img/alimentos/) pelo servidor,
// então aparece para todos no catálogo e ganha QR Code. O fornecedor edita só o que ele cadastrou.
const CATEGORIAS_HF = ['Frutas', 'Verduras', 'Legumes e hortaliças'];
let itensHF = [];
let editandoHF = null;
let fotoHF = null;          // foto nova escolhida (dataURL já reduzida)
let mensagemHF = { texto: '', erro: false };

const campoHF = id => document.getElementById(id).value.trim();
const fotoItemHF = caminho => NGApi.asset(caminho, '../');
async function carregarHF() {
    const todos = await NGApi.produtos();
    itensHF = todos.filter(p => p.criadoPor === usuario.email);
}
function avisoHF(texto, erro = false) {
    mensagemHF = { texto, erro };
    const el = document.getElementById('hf_msg');
    if (el) { el.textContent = texto; el.classList.toggle('erro', erro); }
}

views.hortifruti = () => {
    const ed = itensHF.find(i => i.id === editandoHF);
    const previa = fotoHF || (ed && ed.imagem ? fotoItemHF(ed.imagem) : '');
    const linhas = itensHF.map(i => `
        <tr>
            <td>${i.imagem ? `<img class="hf-thumb" src="${esc(fotoItemHF(i.imagem))}" alt="Foto de ${esc(i.nome)}">` : '<span class="hf-thumb hf-thumb-vazia" aria-hidden="true"><i class="fa-solid fa-image"></i></span>'}</td>
            <td><strong>${esc(i.nome)}</strong></td>
            <td><span class="chip">${esc(i.categoria)}</span></td>
            <td class="ta-right">
                <a class="btn-table-action btn-edit" href="../produto.html?id=${encodeURIComponent(i.id)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver</a>
                <button class="btn-table-action btn-edit" onclick="editarHF('${esc(i.id)}')"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                <button class="btn-table-action btn-delete" onclick="excluirHF('${esc(i.id)}')" aria-label="Excluir ${esc(i.nome)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join('');

    return `
        <div class="workspace-card">
            <h1 class="welcome-title">Hortifrúti</h1>
            <p class="welcome-subtitle">Cadastre as frutas, verduras e legumes. Cada item novo aparece no catálogo do site e ganha o seu próprio QR Code.</p>

            <div class="form-box-inline">
                <h3 class="form-box-title"><i class="fa-solid fa-circle-plus text-green"></i> ${ed ? 'Editar item' : 'Adicionar novo item'}</h3>
                <div class="hf-form">
                    <div class="input-group"><label class="input-label" for="hf_nome">Nome</label><input type="text" id="hf_nome" class="input-field" maxlength="60" placeholder="Ex: Pitaya" value="${esc(ed ? ed.nome : '')}"></div>
                    <div class="input-group"><label class="input-label" for="hf_categoria">Categoria</label>
                        <select id="hf_categoria" class="input-field">${CATEGORIAS_HF.map(c => `<option ${ed && ed.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
                    <div class="input-group hf-wide"><label class="input-label" for="hf_descricao">Descrição</label><textarea id="hf_descricao" class="input-field" rows="3" maxlength="1000" placeholder="Fale um pouco sobre o alimento">${esc(ed ? ed.descricao : '')}</textarea></div>
                    <div class="input-group hf-wide"><label class="input-label" for="hf_conservacao">Conservação</label><input type="text" id="hf_conservacao" class="input-field" maxlength="400" placeholder="Ex: Manter na geladeira por até 5 dias" value="${esc(ed ? ed.conservacao : '')}"></div>
                    <div class="input-group hf-wide"><label class="input-label" for="hf_foto">Foto do alimento</label>
                        <input type="file" id="hf_foto" class="input-field" accept="image/*" onchange="escolherFotoHF(event)">
                        <div id="hf_preview" class="hf-preview">${previa ? `<img src="${esc(previa)}" alt="Pré-visualização">` : ''}</div></div>
                </div>
                <div class="inline-form-row">
                    <button class="btn-prime" id="hf_salvar" onclick="salvarHF()">${ed ? 'Salvar alterações' : 'Adicionar hortifrúti'}</button>
                    ${ed ? '<button class="btn-secondary" onclick="cancelarEdicaoHF()">Cancelar</button>' : ''}
                </div>
                <p id="hf_msg" class="hf-msg ${mensagemHF.erro ? 'erro' : ''}" role="status">${esc(mensagemHF.texto)}</p>
            </div>

            ${itensHF.length ? `<table class="data-table">
                <thead><tr><th>Foto</th><th>Nome</th><th>Categoria</th><th class="ta-right">Ações</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table>` : '<p class="text-muted">Você ainda não cadastrou itens novos. Os 40 alimentos originais já estão no catálogo.</p>'}

            <div class="geo-summary hf-export">
                <h3 class="geo-summary-title"><i class="fa-solid fa-database text-green"></i> Onde ficam os dados</h3>
                <p class="geo-summary-text">Os itens são gravados no arquivo <code>data/produtos.json</code> do servidor e as fotos em <code>assets/img/alimentos/</code>. Não é preciso baixar nem enviar nada: o que você cadastra aparece no catálogo na hora.</p>
            </div>
        </div>`;
};

async function escolherFotoHF(ev) {
    const arq = ev.target.files[0];
    const caixa = document.getElementById('hf_preview');
    if (!arq) return;
    if (!arq.type.startsWith('image/')) { avisoHF('Escolha um arquivo de imagem (JPG, PNG ou WebP).', true); ev.target.value = ''; return; }
    try {
        fotoHF = await NGApi.reduzirImagem(arq);
        caixa.innerHTML = `<img src="${fotoHF}" alt="Pré-visualização">`;
        avisoHF('');
    } catch { avisoHF('Não foi possível ler essa imagem. Tente outro arquivo.', true); }
}

async function salvarHF() {
    const nome = campoHF('hf_nome');
    if (!nome) return avisoHF('Informe o nome do alimento.', true);
    const dados = { nome, categoria: campoHF('hf_categoria'), descricao: campoHF('hf_descricao'), conservacao: campoHF('hf_conservacao'), imagem: fotoHF || undefined };
    const botao = document.getElementById('hf_salvar');
    botao.disabled = true;
    avisoHF('Salvando...');
    try {
        const editando = editandoHF;
        if (editando) await NGApi.editarProduto(editando, dados); else await NGApi.criarProduto(dados);
        await carregarHF();
        editandoHF = null; fotoHF = null;
        mensagemHF = { texto: `"${nome}" foi ${editando ? 'atualizado' : 'adicionado'} no catálogo.`, erro: false };
        switchView('hortifruti');
    } catch (e) {
        botao.disabled = false;
        avisoHF(e.message, true);
    }
}

function editarHF(id) {
    if (!itensHF.some(x => x.id === id)) return;
    editandoHF = id; fotoHF = null; mensagemHF = { texto: '', erro: false };
    switchView('hortifruti');
    document.getElementById('hf_nome').focus();
}
function cancelarEdicaoHF() { editandoHF = null; fotoHF = null; mensagemHF = { texto: '', erro: false }; switchView('hortifruti'); }
async function excluirHF(id) {
    const it = itensHF.find(x => x.id === id);
    if (!it || !confirm(`Excluir "${it.nome}" do catálogo? Essa ação não pode ser desfeita.`)) return;
    try {
        await NGApi.excluirProduto(id);
        await carregarHF();
        if (editandoHF === id) { editandoHF = null; fotoHF = null; }
        mensagemHF = { texto: `"${it.nome}" foi excluído.`, erro: false };
    } catch (e) { mensagemHF = { texto: e.message, erro: true }; }
    switchView('hortifruti');
}

// Inicialização automática
document.addEventListener("DOMContentLoaded", async () => {
    try {
        usuario = await NGApi.exigir('supermercado', '../login.html');
    } catch (e) {
        document.getElementById('mainViewport').innerHTML = `<div class="workspace-card"><p class="hf-msg erro">${esc(e.message)}</p></div>`;
        return;
    }
    document.querySelectorAll('[data-usuario-nome]').forEach(el => { el.textContent = usuario.nome; });
    const sair = document.querySelector('[data-sair]');
    if (sair) sair.addEventListener('click', () => NGApi.sair());
    try {
        const r = await NGApi.supermercado();
        if (r.dados) appData = r.dados;
        ultimoSalvo = JSON.stringify(appData);
        await carregarHF();
    } catch (e) { console.warn('Não foi possível carregar os dados do servidor:', e.message); }
    switchView('perfil');
});
