/* catalogo.js — carrega o catálogo de alimentos.
   Fonte principal: o servidor (GET /api/produtos, que lê data/produtos.json).
   Se o servidor não responder (ex.: site aberto só como arquivos estáticos), lê data/produtos.json direto. */
(() => {
    'use strict';
    const origem = document.currentScript ? document.currentScript.src : location.href;
    const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    async function carregar() {
        try {
            return await NGApi.produtos();
        } catch {
            const r = await fetch(new URL('../data/produtos.json', origem));
            if (!r.ok) throw new Error('produtos.json: ' + r.status);
            return r.json();
        }
    }
    window.NGCatalogo = { semAcento, carregar };
})();
