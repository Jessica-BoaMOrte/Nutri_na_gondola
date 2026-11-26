# Nutrição na Gôndola

Projeto acadêmico — Faculdade de Ciências Médicas da Santa Casa de São Paulo.

O projeto tem **duas formas de uso**:

| | Onde | O que funciona |
|---|---|---|
| **Desktop (completo)** | `INICIAR.bat` no computador | Contas, cadastros, aprovação e **salvamento em arquivos JSON** |
| **GitHub Pages (vitrine)** | link público | Navegar por todas as páginas em **modo demonstração** (nada é salvo) |

## Como rodar no desktop (salvamento em JSON)
1. Instale o **Python 3.8 ou mais novo** (https://www.python.org/downloads/ — no Windows, marque *Add python.exe to PATH*). Não precisa instalar mais nada.
2. Dê **dois cliques em `INICIAR.bat`** (Windows) ou `INICIAR.command` (Mac). No Linux: `./iniciar.sh`.
   Ou, no terminal, dentro da pasta do projeto: `python servidor/app.py --abrir`
3. O navegador abre em `http://localhost:8000`. Para parar, feche a janela preta (ou Ctrl+C).

## Onde fica salvo (tudo em JSON, dentro da pasta do projeto)
| Arquivo | Conteúdo |
|---|---|
| `data/produtos.json` | Catálogo de alimentos (itens do fornecedor + receitas/nutrientes/fotos **aprovados**) |
| `data/db/usuarios.json` | Contas criadas (a senha é guardada só como hash) |
| `data/db/envios.json` | Receitas, informações nutricionais e imagens enviadas, com status pendente / **aprovado** / **rejeitado** e motivo |
| `data/db/supermercado.json` | Dados do portal do fornecedor |
| `assets/img/alimentos/` e `assets/img/envios/` | Fotos enviadas |

No portal do professor, o item **Dados salvos** do menu lista esses arquivos com tamanho e hora da última gravação e mostra o conteúdo ao vivo.

## Roteiro de teste (desktop)
1. Abra o projeto → *Área acadêmica* → **Criar conta** como **Aluno(a)** → *Criar Informações* → envie uma receita, dados nutricionais e uma imagem.
2. Abra `data/db/envios.json`: os 3 envios estão lá com `"status": "pendente"`.
3. Saia, crie uma conta de **Professor(a)** → *Aguardando Aprovação*: aprove dois e rejeite um (com motivo).
4. `data/db/envios.json` mostra `aprovado` / `rejeitado`; `data/produtos.json` ganhou o conteúdo aprovado. O catálogo público já mostra.
5. Entre como aluno de novo → *Histórico*: cada aluno vê **só os seus** envios, com status e motivo.
6. Crie uma conta de **Fornecedor** → *Hortifrúti* → cadastre um item novo: aparece no catálogo, com foto e QR Code, e em `data/produtos.json`.

## Modo demonstração (GitHub)
No link publicado não existe servidor. A tela de entrada detecta isso e oferece **Explorar como Aluno / Professor / Fornecedor**:
dá para navegar por todas as páginas (uma faixa avisa que é demonstração), mas nada é salvo.

Para publicar no GitHub: envie os arquivos do projeto, **menos** `data/db/` e `assets/img/envios/` (são dados gerados; o `.gitignore` já os ignora)
e ative *Settings → Pages → Deploy from a branch → main / (root)*.

## Segurança
Nesta fase do projeto a segurança é básica de propósito (senha com hash, login por token, histórico individual).
Em `data/db/config.json` (criado na primeira execução) há a opção `"exigir_codigo": true`, que passa a exigir um código para cadastrar professor e fornecedor.

## Estrutura
- `index.html`, `produto.html`, `qrcodes.html`, `sobre.html`, `login.html`, `cadastro.html` — site público
- `aluno/` · `professor/` · `supermercado/` — portais
- `servidor/app.py` — servidor (só biblioteca padrão do Python) que grava os JSON
- `css/` — todo o CSS · `js/` — `api.js`, `app.js`, `catalogo.js`, `painel.js`, `login.js`, `cadastro.js`, `dashboardsupermercado.js`, `vendor/qrcode.js` (MIT)
- `data/` — `produtos.json`, `site.json` · `assets/` — imagens
- QR Codes são gerados no navegador com o endereço em que o site está aberto (abra o site publicado para imprimir).
