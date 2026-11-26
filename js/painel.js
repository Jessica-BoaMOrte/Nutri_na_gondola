/* =========================================================================
   painel.js — Portais do Aluno e do Professor

   Fluxo:
     Aluno envia (receita / nutricional / imagem)  →  fica "pendente"
     Professor aprova ou rejeita                   →  aprovado entra em data/produtos.json
   Tudo é gravado em JSON no servidor (servidor/app.py). O aluno só enxerga os próprios
   envios; o professor enxerga todos. As permissões são conferidas no servidor.
   ========================================================================= */
(() => {
    'use strict';

    const body = document.body;
    const pagina = body.dataset.page || '';
    const perfil = body.dataset.perfil || '';

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtData = d => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';
    const foto = caminho => NGApi.asset(caminho, '../');

    const ROTULO = { receita: 'Receita', nutricional: 'Informação Nutricional', imagem: 'Imagem' };
    const STATUS = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };

    let usuario = null;

    /* ---------- Avisos de erro ---------- */
    function erroGeral(e) {
        const main = $('main.content');
        if (!main) return;
        let faixa = $('#erro-geral');
        if (!faixa) {
            faixa = document.createElement('p');
            faixa.id = 'erro-geral';
            faixa.className = 'msg erro';
            faixa.setAttribute('role', 'alert');
            main.prepend(faixa);
        }
        faixa.textContent = e.message || 'Algo deu errado. Tente novamente.';
    }

    /* ---------- Elementos comuns ---------- */
    function preencherUsuario() {
        $$('[data-usuario-nome]').forEach(el => { el.textContent = usuario.nome; });
        $$('[data-sair]').forEach(a => a.addEventListener('click', () => NGApi.sair()));
    }

    // Logo externo (Santa Casa): se não carregar, mostra o nome em texto em vez de imagem quebrada
    function trocarPorTexto(img) {
        const s = document.createElement('span');
        s.className = 'logo-texto';
        s.textContent = img.dataset.fallbackTexto;
        img.replaceWith(s);
    }
    document.addEventListener('error', e => {
        if (e.target.tagName === 'IMG' && e.target.dataset.fallbackTexto) trocarPorTexto(e.target);
    }, true);
    window.addEventListener('DOMContentLoaded', () => {
        $$('img[data-fallback-texto]').forEach(i => { if (i.complete && i.naturalWidth === 0) trocarPorTexto(i); });
    });

    /* ---------- Contagens dos dashboards ---------- */
    async function contagens() {
        const lista = await NGApi.envios();                 // aluno: só os dele; professor: todos
        $$('[data-contagem]').forEach(el => {
            const k = el.dataset.contagem;
            el.textContent = lista.filter(e => (pagina === 'dash-aluno' ? e.tipo : e.status) === k).length;
        });
    }

    /* ---------- Histórico do aluno ---------- */
    async function historico() {
        const meus = await NGApi.envios();
        ['receita', 'nutricional', 'imagem'].forEach(tipo => {
            const alvo = $('#hist-' + tipo);
            const lista = meus.filter(e => e.tipo === tipo);
            alvo.innerHTML = lista.length ? lista.map(e => `
                <div class="card">
                    ${tipo === 'imagem' ? `<div class="imagem-placeholder">${e.dados && e.dados.imagem ? `<img src="${esc(foto(e.dados.imagem))}" alt="Imagem enviada: ${esc(e.titulo)}">` : '📷'}</div>` : ''}
                    <h3>${esc(e.titulo)}</h3>
                    <p>${esc(e.resumo || 'Cadastrado.')}</p>
                    <p><span class="status ${e.status}">${STATUS[e.status]}</span> · ${fmtData(e.data)}</p>
                    ${e.status === 'rejeitado' && e.motivo ? `<p><strong>Motivo:</strong> ${esc(e.motivo)}</p>` : ''}
                </div>`).join('') : '<div class="vazio">Você ainda não cadastrou nada nesta categoria.</div>';
        });
    }

    /* ---------- Formulários do aluno ---------- */
    const linhas = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
    const numero = v => (v === '' || v == null) ? null : Number(v);

    async function carregarAlimentos() {
        const lista = $('#lista-alimentos');
        if (!lista) return;
        try {
            const produtos = await NGApi.produtos();
            lista.innerHTML = produtos.map(p => `<option value="${esc(p.nome)}"></option>`).join('');
        } catch { /* o campo continua aceitando texto; o servidor confere o nome */ }
    }

    function formulario() {
        const form = $('form[data-form]');
        const tipo = form.dataset.form;
        const msg = $('#form-msg');
        const botao = $('button[type=submit]', form);
        const aviso = (t, erro = false) => { msg.textContent = t; msg.classList.toggle('erro', erro); };
        let imagemPronta = null, nomeArquivo = '';
        carregarAlimentos();

        if (tipo === 'imagem') {
            $('#arquivo').addEventListener('change', async ev => {
                const arq = ev.target.files[0];
                const caixa = $('#preview-box');
                imagemPronta = null;
                if (!arq) { caixa.innerHTML = '<span>Imagem aparecerá aqui</span>'; return; }
                if (!arq.type.startsWith('image/')) { aviso('Escolha um arquivo de imagem (JPG, PNG, WebP).', true); ev.target.value = ''; return; }
                try {
                    imagemPronta = await NGApi.reduzirImagem(arq);
                    nomeArquivo = arq.name;
                    caixa.innerHTML = `<img src="${imagemPronta}" alt="Pré-visualização da imagem escolhida">`;
                    aviso('');
                } catch { aviso('Não foi possível ler essa imagem. Tente outro arquivo.', true); }
            });
        }

        form.addEventListener('submit', async ev => {
            ev.preventDefault();
            const f = new FormData(form);
            const v = n => String(f.get(n) || '').trim();
            const envio = { tipo, alimento: v('alimento') };

            if (tipo === 'receita') {
                envio.titulo = v('nome');
                envio.dados = { ingredientes: linhas(v('ingredientes')), preparo: linhas(v('preparo')), tempo: v('tempo'), rendimento: v('rendimento') };
                envio.resumo = `Receita com ${envio.dados.ingredientes.length} ingrediente(s) e ${envio.dados.preparo.length} passo(s).`;
            } else if (tipo === 'nutricional') {
                envio.titulo = v('alimento');
                envio.dados = { energia: numero(v('calorias')), proteinas: numero(v('proteinas')), carboidratos: numero(v('carboidratos')), gorduras: numero(v('gorduras')), fibras: numero(v('fibras')), sodio: numero(v('sodio')), vitaminas: v('vitaminas'), minerais: v('minerais'), obs: v('obs') };
                envio.resumo = envio.dados.energia != null ? `${envio.dados.energia} kcal por 100 g.` : 'Informações nutricionais cadastradas.';
            } else {
                if (!imagemPronta) { aviso('Escolha uma imagem antes de salvar.', true); return; }
                envio.titulo = nomeArquivo || 'imagem';
                envio.dados = { imagem: imagemPronta, descricao: v('descricao') };
                envio.resumo = v('descricao') || 'Imagem enviada para validação.';
            }

            botao.disabled = true;
            aviso('Enviando...');
            try {
                await NGApi.criarEnvio(envio);
                form.reset();
                if (tipo === 'imagem') { imagemPronta = null; $('#preview-box').innerHTML = '<span>Imagem aparecerá aqui</span>'; }
                msg.classList.remove('erro');
                msg.innerHTML = 'Enviado! O conteúdo aguarda a aprovação do professor. <a href="historico.html">Ver no histórico</a>.';
            } catch (e) {
                aviso(e.message, true);
            } finally {
                botao.disabled = false;
            }
        });
    }

    /* ---------- Listas do professor ---------- */
    function cartao(e, modo) {
        const rotuloTipo = ROTULO[e.tipo];
        const miniatura = e.tipo === 'imagem' && e.dados && e.dados.imagem ? `<img class="thumb" src="${esc(foto(e.dados.imagem))}" alt="Imagem enviada: ${esc(e.titulo)}">` : '';
        const analise = e.status !== 'pendente' ? `<p><strong>Data da Análise:</strong> ${fmtData(e.analisadoEm)}</p>` : '';
        const motivo = e.status === 'rejeitado' && e.motivo ? `<p><strong>Motivo:</strong> ${esc(e.motivo)}</p>` : '';
        let topo = `<div class="status ${e.status}">${STATUS[e.status]}</div><h3>${rotuloTipo}: ${esc(e.titulo)}</h3>`;
        let datas = e.status === 'pendente' ? `<p><strong>Data:</strong> ${fmtData(e.data)}</p>` : analise;
        let acoes = '';

        if (modo === 'pendentes') {
            acoes = `<div class="acoes"><button class="aprovar" data-acao="aprovar">Aprovar</button><button class="rejeitar" data-acao="rejeitar">Rejeitar</button></div>`;
        } else if (modo === 'gerenciar') {
            topo = `<div class="tipo ${e.tipo}">${rotuloTipo}</div><h3>${esc(e.titulo)}</h3>`;
            datas = `<p class="origem">Situação: ${STATUS[e.status]} · enviado em ${fmtData(e.data)}</p>`;
            acoes = `<div class="acoes"><button class="editar" data-acao="editar"><i class="fa-solid fa-pen" aria-hidden="true"></i>Editar</button><button class="excluir" data-acao="excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i>Excluir</button></div>`;
        }
        return `<div class="info-card" data-id="${esc(e.id)}">${topo}<p><strong>Aluno:</strong> ${esc(e.autor)}</p><p><strong>Alimento:</strong> ${esc(e.alimento)}</p>${datas}${motivo}<p>${esc(e.resumo || '')}</p>${miniatura}${acoes}</div>`;
    }

    async function listaProfessor() {
        const alvo = $('#lista');
        const modo = alvo.dataset.lista;
        const vazio = { pendentes: 'Nenhum conteúdo aguardando aprovação. 🎉', analisadas: 'Nenhum conteúdo analisado ainda.', gerenciar: 'Nenhum conteúdo cadastrado.' }[modo];
        let todos = [];

        async function desenhar() {
            todos = await NGApi.envios();
            let lista = todos;
            if (modo === 'pendentes') lista = todos.filter(e => e.status === 'pendente');
            if (modo === 'analisadas') lista = todos.filter(e => e.status !== 'pendente');
            alvo.innerHTML = lista.length ? lista.map(e => cartao(e, modo)).join('') : `<div class="vazio">${vazio}</div>`;
        }

        alvo.addEventListener('click', async ev => {
            const b = ev.target.closest('button[data-acao]');
            if (!b) return;
            const id = b.closest('[data-id]').dataset.id;
            const e = todos.find(x => x.id === id);
            if (!e) return;
            try {
                if (b.dataset.acao === 'aprovar') {
                    b.disabled = true;
                    await NGApi.analisar(id, 'aprovado');
                } else if (b.dataset.acao === 'rejeitar') {
                    const motivo = prompt('Motivo da rejeição (opcional):');
                    if (motivo === null) return;
                    b.disabled = true;
                    await NGApi.analisar(id, 'rejeitado', motivo.trim());
                } else if (b.dataset.acao === 'excluir') {
                    if (!confirm(`Excluir "${e.titulo}"? Se já foi aprovado, ele também sai do catálogo. Essa ação não pode ser desfeita.`)) return;
                    await NGApi.excluirEnvio(id);
                } else if (b.dataset.acao === 'editar') {
                    abrirEdicao(e, desenhar);
                    return;
                }
                await desenhar();
            } catch (err) { alert(err.message); await desenhar().catch(() => {}); }
        });
        await desenhar();
    }

    function abrirEdicao(e, depois) {
        const dlg = document.createElement('dialog');
        dlg.setAttribute('aria-labelledby', 'ed-titulo-dlg');
        dlg.innerHTML = `
            <form>
                <h3 id="ed-titulo-dlg">Editar informação</h3>
                <div class="campo"><label for="ed-titulo">Título</label><input id="ed-titulo" value="${esc(e.titulo)}" required maxlength="120"></div>
                <div class="campo"><label for="ed-resumo">Descrição</label><textarea id="ed-resumo" rows="3" maxlength="500">${esc(e.resumo || '')}</textarea></div>
                <p class="msg erro" id="ed-erro" role="alert"></p>
                <div class="acoes"><button type="button" class="secundario" data-fechar>Cancelar</button><button type="submit">Salvar alterações</button></div>
            </form>`;
        document.body.appendChild(dlg);
        $('[data-fechar]', dlg).addEventListener('click', () => dlg.close());
        $('form', dlg).addEventListener('submit', async ev => {
            ev.preventDefault();
            try {
                await NGApi.editarEnvio(e.id, { titulo: $('#ed-titulo', dlg).value, resumo: $('#ed-resumo', dlg).value });
                dlg.close();
                await depois();
            } catch (err) { $('#ed-erro', dlg).textContent = err.message; }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
    }

    /* ---------- Arquivos JSON (página "Dados salvos" do professor) ---------- */
    async function arquivosJson() {
        const area = $('#arquivos-json'), pre = $('#json-conteudo');
        const lista = await NGApi.arquivos();
        if (!lista.length) {
            area.innerHTML = '<div class="vazio">Disponível ao rodar o projeto no desktop (INICIAR.bat). Aqui, no modo demonstração, nada é salvo.</div>';
            return;
        }
        const kb = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
        area.innerHTML = `<table class="tabela-json"><thead><tr><th>Arquivo</th><th>Caminho</th><th>Tamanho</th><th>Atualizado em</th><th></th></tr></thead><tbody>${lista.map(a => `
            <tr><td><strong>${esc(a.nome)}</strong></td><td><code>${esc(a.caminho)}</code></td>
            <td>${a.existe ? kb(a.tamanho) : '—'}</td><td>${esc(a.atualizadoEm || 'ainda não criado')}</td>
            <td>${a.existe ? `<button type="button" class="editar" data-json="${esc(a.nome)}">Ver conteúdo</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
        area.addEventListener('click', async ev => {
            const b = ev.target.closest('[data-json]');
            if (!b) return;
            try {
                pre.textContent = JSON.stringify(await NGApi.arquivo(b.dataset.json), null, 2);
                pre.hidden = false;
                pre.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (e) { alert(e.message); }
        });
    }

    /* ---------- Início ---------- */
    window.addEventListener('DOMContentLoaded', async () => {
        try {
            usuario = await NGApi.exigir(perfil, '../login.html');
            preencherUsuario();
            if (pagina === 'dash-aluno' || pagina === 'dash-prof') await contagens();
            if (pagina === 'dados') await arquivosJson();
            if (pagina === 'historico') await historico();
            if ($('form[data-form]')) formulario();
            if ($('#lista')) await listaProfessor();
        } catch (e) { erroGeral(e); }
    });
})();
