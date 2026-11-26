#!/usr/bin/env python3
"""
Servidor do projeto Nutrição na Gôndola  (somente biblioteca padrão do Python 3.8+; nada para instalar)

Guarda TUDO em arquivos JSON:
    data/produtos.json        catálogo de alimentos (o mesmo arquivo que o site público lê)
    data/db/usuarios.json     contas (senha só como hash PBKDF2 + sal)
    data/db/envios.json       receitas / informações nutricionais / imagens, com status aprovado/rejeitado
    data/db/supermercado.json dados do portal do fornecedor
    data/db/config.json       segredo de assinatura e códigos de acesso (professor e fornecedor)
Imagens enviadas ficam em assets/img/alimentos/ (fornecedor) e assets/img/envios/ (alunos).

Rodar no seu computador:   python servidor/app.py        ->  http://localhost:8000   (ou dê dois cliques em INICIAR.bat / INICIAR.command)
Hospedagem WSGI (ex.: PythonAnywhere): aponte para o objeto `application` deste arquivo.
"""
import base64, hashlib, hmac, json, mimetypes, os, re, secrets, sys, threading, time, traceback, unicodedata
from pathlib import Path
from urllib.parse import unquote

try:
    import fcntl                       # trava entre processos (Linux/macOS); no Windows basta a trava de threads
except ImportError:
    fcntl = None

RAIZ = Path(__file__).resolve().parent.parent
DB = RAIZ / 'data' / 'db'
ARQ_PRODUTOS = RAIZ / 'data' / 'produtos.json'
ARQ_USUARIOS = DB / 'usuarios.json'
ARQ_ENVIOS = DB / 'envios.json'
ARQ_MERCADO = DB / 'supermercado.json'
ARQ_CONFIG = DB / 'config.json'
PASTA_ALIMENTOS = RAIZ / 'assets' / 'img' / 'alimentos'
PASTA_ENVIOS = RAIZ / 'assets' / 'img' / 'envios'

PERFIS = ('aluno', 'professor', 'supermercado')
CATEGORIAS = ('Frutas', 'Verduras', 'Legumes e hortaliças')
ITERACOES = 600_000
VALIDADE_TOKEN = 7 * 24 * 3600
MAX_CORPO = 8 * 1024 * 1024
MAX_IMAGEM = 3 * 1024 * 1024


class Erro(Exception):
    def __init__(self, status, mensagem):
        super().__init__(mensagem)
        self.status, self.mensagem = status, mensagem


# ------------------------------------------------------------------ armazenamento JSON
_trava_threads = threading.RLock()


class transacao:
    """Bloqueia leitura-modificação-gravação para dois pedidos não se atropelarem."""
    def __enter__(self):
        _trava_threads.acquire()
        self.arq = None
        if fcntl:
            DB.mkdir(parents=True, exist_ok=True)
            self.arq = open(DB / '.lock', 'a')
            fcntl.flock(self.arq, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        if self.arq:
            fcntl.flock(self.arq, fcntl.LOCK_UN)
            self.arq.close()
        _trava_threads.release()


def ler(caminho, padrao):
    try:
        return json.loads(caminho.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return padrao
    except json.JSONDecodeError:
        # nunca devolver "vazio" para um arquivo corrompido: a próxima gravação apagaria tudo
        raise Erro(500, f'O arquivo {caminho.name} está corrompido. Restaure um backup antes de continuar.')


def gravar(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_name(caminho.name + '.tmp')
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, caminho)           # troca atômica: nunca fica meio escrito


_config = None


def config():
    global _config
    if _config is None:
        c = ler(ARQ_CONFIG, None)
        if c is None:
            c = {'segredo': secrets.token_hex(32),
                 'exigir_codigo': False,           # true = professor e fornecedor precisam do código abaixo para se cadastrar
                 'codigos': {'professor': 'PROF-' + secrets.token_hex(3).upper(),
                             'supermercado': 'FORN-' + secrets.token_hex(3).upper()}}
            gravar(ARQ_CONFIG, c)
        c['segredo'] = os.environ.get('NG_SEGREDO', c['segredo'])
        c['exigir_codigo'] = os.environ.get('NG_EXIGIR_CODIGO', '1' if c.get('exigir_codigo') else '0') == '1'
        c['codigos']['professor'] = os.environ.get('NG_CODIGO_PROFESSOR', c['codigos']['professor'])
        c['codigos']['supermercado'] = os.environ.get('NG_CODIGO_FORNECEDOR', c['codigos']['supermercado'])
        _config = c
    return _config


# ------------------------------------------------------------------ utilitários
def agora():
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def hoje():
    return time.strftime('%Y-%m-%d')


def sem_acento(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower().strip()


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', sem_acento(s)).strip('-')


def texto(valor, maximo, nome, obrigatorio=False):
    v = re.sub(r'[ \t]+', ' ', str(valor if valor is not None else '')).strip()
    if obrigatorio and not v:
        raise Erro(400, f'Preencha o campo "{nome}".')
    if len(v) > maximo:
        raise Erro(400, f'O campo "{nome}" aceita no máximo {maximo} caracteres.')
    return v


def lista_textos(valor, nome, max_itens=60, max_len=300):
    if not isinstance(valor, list):
        raise Erro(400, f'"{nome}" precisa ser uma lista.')
    itens = [texto(x, max_len, nome) for x in valor]
    itens = [x for x in itens if x]
    if len(itens) > max_itens:
        raise Erro(400, f'"{nome}" aceita no máximo {max_itens} itens.')
    return itens


def numero(valor, nome):
    if valor is None or valor == '':
        return None
    try:
        n = float(valor)
    except (TypeError, ValueError):
        raise Erro(400, f'O valor de "{nome}" não é um número.')
    if not (0 <= n <= 100000):
        raise Erro(400, f'O valor de "{nome}" está fora do intervalo permitido.')
    return int(n) if n == int(n) else round(n, 3)


def salvar_imagem(data_url, pasta, nome_base):
    m = re.match(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$', str(data_url or ''))
    if not m:
        raise Erro(400, 'Imagem inválida. Envie um JPG, PNG ou WebP.')
    try:
        bruto = base64.b64decode(m.group(2), validate=False)
    except Exception:
        raise Erro(400, 'Imagem inválida.')
    if len(bruto) > MAX_IMAGEM:
        raise Erro(413, 'Imagem grande demais (máximo 3 MB).')
    if bruto.startswith(b'\xff\xd8\xff'):
        ext = 'jpg'
    elif bruto.startswith(b'\x89PNG\r\n\x1a\n'):
        ext = 'png'
    elif bruto[:4] == b'RIFF' and bruto[8:12] == b'WEBP':
        ext = 'webp'
    else:
        raise Erro(400, 'O arquivo não parece ser uma imagem válida.')
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f'{nome_base}.{ext}'
    destino.write_bytes(bruto)
    return destino.relative_to(RAIZ).as_posix()


def apagar_arquivo_enviado(caminho_rel, pasta_permitida):
    """Só apaga arquivos que o próprio servidor criou (nunca as fotos originais do projeto)."""
    if not caminho_rel:
        return
    alvo = (RAIZ / caminho_rel).resolve()
    if pasta_permitida.resolve() in alvo.parents and alvo.is_file():
        alvo.unlink()


# ------------------------------------------------------------------ autenticação
def b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


def unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def derivar(senha, sal_hex):
    return hashlib.pbkdf2_hmac('sha256', senha.encode('utf-8'), bytes.fromhex(sal_hex), ITERACOES).hex()


def emitir_token(uid):
    corpo = b64(json.dumps({'u': uid, 'e': int(time.time()) + VALIDADE_TOKEN}).encode())
    return corpo + '.' + b64(hmac.new(config()['segredo'].encode(), corpo.encode(), hashlib.sha256).digest())


def usuario_do_token(token):
    try:
        corpo, assinatura = token.split('.')
        esperado = b64(hmac.new(config()['segredo'].encode(), corpo.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(assinatura, esperado):
            return None
        dados = json.loads(unb64(corpo))
        if dados['e'] < time.time():
            return None
        return next((u for u in ler(ARQ_USUARIOS, []) if u['id'] == dados['u']), None)
    except Exception:
        return None


_tentativas = {}


def checar_limite(chave, maximo=10, janela=300):
    recentes = [t for t in _tentativas.get(chave, []) if t > time.time() - janela]
    _tentativas[chave] = recentes
    if len(recentes) >= maximo:
        raise Erro(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.')


def registrar_falha(chave):
    _tentativas.setdefault(chave, []).append(time.time())


def publico(u):
    return {'nome': u['nome'], 'email': u['email'], 'perfil': u['perfil']}


# ------------------------------------------------------------------ requisição
class Req:
    def __init__(self, environ):
        self.environ = environ
        self.metodo = environ['REQUEST_METHOD']
        self.ip = (environ.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()) or environ.get('REMOTE_ADDR', '?')
        auth = environ.get('HTTP_AUTHORIZATION', '')
        self.usuario = usuario_do_token(auth[7:]) if auth.startswith('Bearer ') else None
        self._corpo = None

    def json(self):
        if self._corpo is None:
            n = int(self.environ.get('CONTENT_LENGTH') or 0)
            if n > MAX_CORPO:
                raise Erro(413, 'Envio grande demais.')
            bruto = self.environ['wsgi.input'].read(n) if n else b''
            try:
                self._corpo = json.loads(bruto.decode('utf-8')) if bruto else {}
            except (ValueError, UnicodeDecodeError):
                raise Erro(400, 'Pedido inválido (JSON mal formado).')
            if not isinstance(self._corpo, dict):
                raise Erro(400, 'Pedido inválido.')
        return self._corpo

    def exigir(self, *perfis):
        if not self.usuario:
            raise Erro(401, 'Entre na sua conta para continuar.')
        if perfis and self.usuario['perfil'] not in perfis:
            raise Erro(403, 'Seu perfil não tem permissão para esta ação.')
        return self.usuario


# ------------------------------------------------------------------ rotas: contas
def r_cadastro(req, _):
    d = req.json()
    nome = texto(d.get('nome'), 80, 'Nome', True)
    if len(nome) < 3:
        raise Erro(400, 'Informe seu nome completo.')
    email = texto(d.get('email'), 120, 'E-mail', True).lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise Erro(400, 'Informe um e-mail válido.')
    senha = str(d.get('senha') or '')
    if len(senha) < 8:
        raise Erro(400, 'A senha precisa ter pelo menos 8 caracteres.')
    if len(senha) > 200:
        raise Erro(400, 'Senha longa demais.')
    perfil = d.get('perfil')
    if perfil not in PERFIS:
        raise Erro(400, 'Escolha um tipo de acesso.')
    if perfil != 'aluno' and config()['exigir_codigo']:
        chave = ('cadastro', req.ip)
        checar_limite(chave)
        esperado = config()['codigos'][perfil]
        if not hmac.compare_digest(str(d.get('codigo') or '').strip().lower().encode(), esperado.lower().encode()):
            registrar_falha(chave)
            raise Erro(403, 'Código de acesso incorreto. Peça o código ao responsável pelo projeto.')
    sal = secrets.token_hex(16)
    hash_ = derivar(senha, sal)
    with transacao():
        usuarios = ler(ARQ_USUARIOS, [])
        if any(u['email'] == email for u in usuarios):
            raise Erro(409, 'Já existe uma conta com esse e-mail. Use "Entrar".')
        novo = {'id': 'u' + secrets.token_hex(6), 'nome': nome, 'email': email, 'perfil': perfil,
                'sal': sal, 'hash': hash_, 'criadoEm': agora()}
        usuarios.append(novo)
        gravar(ARQ_USUARIOS, usuarios)
    return 201, {'token': emitir_token(novo['id']), 'usuario': publico(novo)}


def r_login(req, _):
    d = req.json()
    email = texto(d.get('email'), 120, 'E-mail').lower()
    senha = str(d.get('senha') or '')[:200]
    chave = ('login', req.ip, email)
    checar_limite(chave)
    u = next((x for x in ler(ARQ_USUARIOS, []) if x['email'] == email), None)
    ok = False
    if u:
        ok = hmac.compare_digest(derivar(senha, u['sal']), u['hash'])
    else:
        derivar(senha, '00' * 16)       # gasta o mesmo tempo para não revelar quais e-mails existem
    if not ok:
        registrar_falha(chave)
        raise Erro(401, 'E-mail ou senha incorretos.')
    _tentativas.pop(chave, None)
    return 200, {'token': emitir_token(u['id']), 'usuario': publico(u)}


def r_config(req, _):
    return 200, {'exigirCodigo': config()['exigir_codigo']}


def r_eu(req, _):
    return 200, {'usuario': publico(req.exigir())}


# ------------------------------------------------------------------ rotas: catálogo
def r_produtos_listar(req, _):
    return 200, ler(ARQ_PRODUTOS, [])


def dados_produto(d):
    categoria = d.get('categoria')
    if categoria not in CATEGORIAS:
        raise Erro(400, 'Escolha uma categoria válida.')
    return {'nome': texto(d.get('nome'), 60, 'Nome', True), 'categoria': categoria,
            'descricao': texto(d.get('descricao'), 1000, 'Descrição') or 'Descrição em preparação.',
            'conservacao': texto(d.get('conservacao'), 400, 'Conservação') or 'Informações de conservação em validação.'}


def r_produto_criar(req, _):
    u = req.exigir('supermercado')
    d = req.json()
    novo = dados_produto(d)
    with transacao():
        produtos = ler(ARQ_PRODUTOS, [])
        if any(sem_acento(p['nome']) == sem_acento(novo['nome']) for p in produtos):
            raise Erro(409, 'Esse alimento já existe no catálogo.')
        nums = [int(m.group(1)) for p in produtos if (m := re.fullmatch(r'alimento-(\d+)', p['id']))]
        slugs = {p['slug'] for p in produtos}
        slug = base = slugify(novo['nome']) or 'item'
        n = 2
        while slug in slugs:
            slug, n = f'{base}-{n}', n + 1
        item = {'id': f'alimento-{(max(nums) + 1 if nums else 1):03d}', 'slug': slug, **novo,
                'nutrientes': None, 'receitas': [], 'imagem': None,
                'criadoPor': u['email'], 'criadoEm': agora()}
        if d.get('imagem'):
            item['imagem'] = salvar_imagem(d['imagem'], PASTA_ALIMENTOS, slug)
        produtos.append(item)
        gravar(ARQ_PRODUTOS, produtos)
    return 201, item


def achar_produto_do_fornecedor(produtos, pid, usuario):
    p = next((x for x in produtos if x['id'] == pid), None)
    if not p:
        raise Erro(404, 'Alimento não encontrado.')
    if p.get('criadoPor') != usuario['email']:
        raise Erro(403, 'Você só pode alterar os itens que você mesmo cadastrou.')
    return p


def r_produto_editar(req, params):
    u = req.exigir('supermercado')
    d = req.json()
    novo = dados_produto(d)
    with transacao():
        produtos = ler(ARQ_PRODUTOS, [])
        p = achar_produto_do_fornecedor(produtos, params[0], u)
        if any(x['id'] != p['id'] and sem_acento(x['nome']) == sem_acento(novo['nome']) for x in produtos):
            raise Erro(409, 'Esse alimento já existe no catálogo.')
        p.update(novo)
        if d.get('imagem'):
            antiga = p.get('imagem')
            p['imagem'] = salvar_imagem(d['imagem'], PASTA_ALIMENTOS, p['slug'])
            if antiga and antiga != p['imagem'] and not p.get('imagemEnvioId'):
                apagar_arquivo_enviado(antiga, PASTA_ALIMENTOS)
        gravar(ARQ_PRODUTOS, produtos)
    return 200, p


def r_produto_excluir(req, params):
    u = req.exigir('supermercado')
    with transacao():
        produtos = ler(ARQ_PRODUTOS, [])
        p = achar_produto_do_fornecedor(produtos, params[0], u)
        gravar(ARQ_PRODUTOS, [x for x in produtos if x['id'] != p['id']])
        if not p.get('imagemEnvioId'):
            apagar_arquivo_enviado(p.get('imagem'), PASTA_ALIMENTOS)
    return 200, {'ok': True}


# ------------------------------------------------------------------ rotas: envios (aluno -> professor)
def nutrientes_do_envio(d):
    n = {}
    for chave, rotulo, un in (('energia', 'Energia', 'kcal'), ('proteinas', 'Proteínas', 'g'), ('carboidratos', 'Carboidratos', 'g'),
                              ('gorduras', 'Gorduras totais', 'g'), ('fibras', 'Fibras', 'g'), ('sodio', 'Sódio', 'mg')):
        if d.get(chave) is not None:
            n[rotulo] = f'{d[chave]} {un}'
    return n


def aplicar_envio(produtos, e):
    """Conteúdo aprovado entra no catálogo (data/produtos.json)."""
    p = next((x for x in produtos if x['id'] == e.get('alimentoId')), None)
    if not p:
        return
    d = e['dados']
    if e['tipo'] == 'nutricional':
        n = nutrientes_do_envio(d)
        if n:
            if 'nutricionalEnvioId' not in p:      # guarda o que existia para poder desfazer sem perder nada
                p['nutricionalOriginal'] = {k: p.get(k) for k in ('nutrientes', 'fonteNutricional', 'vitaminas', 'minerais')}
            p['nutrientes'] = n
            p['fonteNutricional'] = 'Valores cadastrados por aluno(a) e aprovados por professor(a). Fonte informada: ' + (d.get('obs') or 'não informada') + '.'
            p['nutricionalEnvioId'] = e['id']
        if d.get('vitaminas'):
            p['vitaminas'] = d['vitaminas']
        if d.get('minerais'):
            p['minerais'] = d['minerais']
    elif e['tipo'] == 'receita':
        p.setdefault('receitas', [])
        if not any(r.get('envioId') == e['id'] for r in p['receitas']):
            p['receitas'].append({'envioId': e['id'], 'nome': e['titulo'], 'ingredientes': d['ingredientes'], 'preparo': d['preparo'],
                                  'tempo': d.get('tempo', ''), 'rendimento': d.get('rendimento', ''), 'origem': 'aluno'})
    elif e['tipo'] == 'imagem' and d.get('imagem'):
        if 'imagemEnvioId' not in p:
            p['imagemOriginal'] = p.get('imagem')
        p['imagem'] = d['imagem']
        p['imagemEnvioId'] = e['id']


def desfazer_envio(produtos, e):
    p = next((x for x in produtos if x['id'] == e.get('alimentoId')), None)
    if not p:
        return
    if e['tipo'] == 'receita':
        p['receitas'] = [r for r in p.get('receitas', []) if r.get('envioId') != e['id']]
    elif e['tipo'] == 'nutricional' and p.get('nutricionalEnvioId') == e['id']:
        original = p.pop('nutricionalOriginal', {})
        p.pop('nutricionalEnvioId', None)
        for k in ('nutrientes', 'fonteNutricional', 'vitaminas', 'minerais'):
            if original.get(k) is not None:
                p[k] = original[k]
            else:
                p.pop(k, None)
        p.setdefault('nutrientes', None)
    elif e['tipo'] == 'imagem' and p.get('imagemEnvioId') == e['id']:
        p['imagem'] = p.pop('imagemOriginal', None)
        p.pop('imagemEnvioId', None)


def r_envios_listar(req, _):
    u = req.exigir('aluno', 'professor')
    todos = ler(ARQ_ENVIOS, [])
    if u['perfil'] == 'aluno':
        todos = [e for e in todos if e['autorEmail'] == u['email']]       # histórico individual
    return 200, sorted(todos, key=lambda e: e['criadoEm'], reverse=True)


def r_envio_criar(req, _):
    u = req.exigir('aluno')
    d = req.json()
    tipo = d.get('tipo')
    if tipo not in ('receita', 'nutricional', 'imagem'):
        raise Erro(400, 'Tipo de envio inválido.')
    dados_in = d.get('dados') if isinstance(d.get('dados'), dict) else {}
    produtos = ler(ARQ_PRODUTOS, [])
    alim = next((p for p in produtos if sem_acento(p['nome']) == sem_acento(d.get('alimento'))), None)
    if not alim:
        raise Erro(400, 'Alimento não encontrado no catálogo. Escolha um nome da lista de sugestões.')
    eid = 'e' + secrets.token_hex(5)
    if tipo == 'receita':
        titulo = texto(d.get('titulo'), 120, 'Nome da receita', True)
        dados = {'ingredientes': lista_textos(dados_in.get('ingredientes', []), 'Ingredientes'), 'preparo': lista_textos(dados_in.get('preparo', []), 'Modo de preparo'),
                 'tempo': texto(dados_in.get('tempo'), 60, 'Tempo'), 'rendimento': texto(dados_in.get('rendimento'), 60, 'Rendimento')}
        if not dados['ingredientes'] or not dados['preparo']:
            raise Erro(400, 'Informe ao menos um ingrediente e um passo do preparo.')
    elif tipo == 'nutricional':
        titulo = alim['nome']
        dados = {k: numero(dados_in.get(k), k) for k in ('energia', 'proteinas', 'carboidratos', 'gorduras', 'fibras', 'sodio')}
        dados.update({k: texto(dados_in.get(k), 500, k) for k in ('vitaminas', 'minerais', 'obs')})
        if all(dados[k] is None for k in ('energia', 'proteinas', 'carboidratos', 'gorduras', 'fibras', 'sodio')):
            raise Erro(400, 'Informe ao menos um valor nutricional.')
    else:
        dados = {'descricao': texto(dados_in.get('descricao'), 500, 'Descrição'), 'imagem': salvar_imagem(dados_in.get('imagem'), PASTA_ENVIOS, eid)}
        titulo = texto(d.get('titulo'), 120, 'Arquivo') or 'imagem'
    envio = {'id': eid, 'tipo': tipo, 'alimento': alim['nome'], 'alimentoId': alim['id'], 'titulo': titulo,
             'resumo': texto(d.get('resumo'), 500, 'Resumo'), 'autor': u['nome'], 'autorEmail': u['email'],
             'data': hoje(), 'criadoEm': agora(), 'status': 'pendente', 'dados': dados}
    with transacao():
        envios = ler(ARQ_ENVIOS, [])
        envios.append(envio)
        gravar(ARQ_ENVIOS, envios)
    return 201, envio


def achar_envio(envios, eid):
    e = next((x for x in envios if x['id'] == eid), None)
    if not e:
        raise Erro(404, 'Envio não encontrado.')
    return e


def r_envio_analisar(req, params):
    u = req.exigir('professor')
    d = req.json()
    status = d.get('status')
    if status not in ('aprovado', 'rejeitado'):
        raise Erro(400, 'Status inválido.')
    with transacao():
        envios = ler(ARQ_ENVIOS, [])
        e = achar_envio(envios, params[0])
        if e['status'] != 'pendente':
            raise Erro(409, 'Este envio já foi analisado.')
        e.update({'status': status, 'analisadoEm': hoje(), 'analisadoPor': u['nome'],
                  'motivo': texto(d.get('motivo'), 300, 'Motivo') or ('Sem motivo informado' if status == 'rejeitado' else '')})
        if status == 'aprovado':
            produtos = ler(ARQ_PRODUTOS, [])
            aplicar_envio(produtos, e)
            gravar(ARQ_PRODUTOS, produtos)
        gravar(ARQ_ENVIOS, envios)
    return 200, e


def r_envio_editar(req, params):
    req.exigir('professor')
    d = req.json()
    with transacao():
        envios = ler(ARQ_ENVIOS, [])
        e = achar_envio(envios, params[0])
        e['titulo'] = texto(d.get('titulo'), 120, 'Título', True)
        e['resumo'] = texto(d.get('resumo'), 500, 'Descrição')
        if e['status'] == 'aprovado' and e['tipo'] == 'receita':      # mantém o catálogo em sincronia
            produtos = ler(ARQ_PRODUTOS, [])
            p = next((x for x in produtos if x['id'] == e.get('alimentoId')), None)
            for r in (p or {}).get('receitas', []):
                if r.get('envioId') == e['id']:
                    r['nome'] = e['titulo']
            gravar(ARQ_PRODUTOS, produtos)
        gravar(ARQ_ENVIOS, envios)
    return 200, e


def r_envio_excluir(req, params):
    req.exigir('professor')
    with transacao():
        envios = ler(ARQ_ENVIOS, [])
        e = achar_envio(envios, params[0])
        if e['status'] == 'aprovado':
            produtos = ler(ARQ_PRODUTOS, [])
            desfazer_envio(produtos, e)
            gravar(ARQ_PRODUTOS, produtos)
        gravar(ARQ_ENVIOS, [x for x in envios if x['id'] != e['id']])
        if e['tipo'] == 'imagem':
            apagar_arquivo_enviado(e['dados'].get('imagem'), PASTA_ENVIOS)
    return 200, {'ok': True}


# ------------------------------------------------------------------ rotas: arquivos JSON (para mostrar ao professor onde tudo é salvo)
ARQUIVOS_JSON = {'produtos.json': ARQ_PRODUTOS, 'usuarios.json': ARQ_USUARIOS, 'envios.json': ARQ_ENVIOS, 'supermercado.json': ARQ_MERCADO}


def r_arquivos_listar(req, _):
    req.exigir('professor')
    lista = []
    for nome, caminho in ARQUIVOS_JSON.items():
        existe = caminho.exists()
        lista.append({'nome': nome, 'caminho': caminho.relative_to(RAIZ).as_posix(), 'existe': existe,
                      'tamanho': caminho.stat().st_size if existe else 0,
                      'atualizadoEm': time.strftime('%d/%m/%Y %H:%M:%S', time.localtime(caminho.stat().st_mtime)) if existe else None})
    return 200, lista


def r_arquivo_ver(req, params):
    req.exigir('professor')
    caminho = ARQUIVOS_JSON.get(params[0])
    if not caminho:
        raise Erro(404, 'Arquivo não encontrado.')
    dados = ler(caminho, [] if params[0] != 'supermercado.json' else {})
    if params[0] == 'usuarios.json':               # nunca mostra o hash nem o sal das senhas
        dados = [{k: v for k, v in u.items() if k not in ('hash', 'sal')} for u in dados]
    return 200, dados


# ------------------------------------------------------------------ rotas: portal do fornecedor
def r_mercado_ler(req, _):
    u = req.exigir('supermercado')
    return 200, {'dados': ler(ARQ_MERCADO, {}).get(u['email'])}


def r_mercado_salvar(req, _):
    u = req.exigir('supermercado')
    dados = req.json().get('dados')
    if not isinstance(dados, dict) or len(json.dumps(dados)) > 200_000:
        raise Erro(400, 'Dados inválidos ou grandes demais.')
    with transacao():
        todos = ler(ARQ_MERCADO, {})
        todos[u['email']] = dados
        gravar(ARQ_MERCADO, todos)
    return 200, {'ok': True}


ROTAS = [
    ('POST', r'/api/cadastro', r_cadastro), ('POST', r'/api/login', r_login), ('GET', r'/api/eu', r_eu), ('GET', r'/api/config', r_config),
    ('GET', r'/api/arquivos', r_arquivos_listar), ('GET', r'/api/arquivos/([\w.]+)', r_arquivo_ver),
    ('GET', r'/api/produtos', r_produtos_listar), ('POST', r'/api/produtos', r_produto_criar),
    ('PUT', r'/api/produtos/([\w-]+)', r_produto_editar), ('DELETE', r'/api/produtos/([\w-]+)', r_produto_excluir),
    ('GET', r'/api/envios', r_envios_listar), ('POST', r'/api/envios', r_envio_criar),
    ('POST', r'/api/envios/(\w+)/analise', r_envio_analisar), ('PUT', r'/api/envios/(\w+)', r_envio_editar),
    ('DELETE', r'/api/envios/(\w+)', r_envio_excluir),
    ('GET', r'/api/supermercado', r_mercado_ler), ('PUT', r'/api/supermercado', r_mercado_salvar),
    ('GET', r'/api/saude', lambda req, _: (200, {'ok': True})),
]


# ------------------------------------------------------------------ site estático (mesmo endereço da API)
BLOQUEADOS = {'servidor', 'tools', '__pycache__'}
EXT_BLOQUEADAS = {'.py', '.pyc', '.key', '.lock', '.tmp', '.md'}


def estatico(caminho):
    rel = unquote(caminho).lstrip('/') or 'index.html'
    alvo = (RAIZ / rel).resolve()
    if alvo.is_dir():
        alvo = alvo / 'index.html'
    try:
        partes = alvo.relative_to(RAIZ).parts
    except ValueError:
        raise Erro(404, 'Não encontrado.')
    if (any(p.startswith('.') or p in BLOQUEADOS for p in partes) or partes[:2] == ('data', 'db')
            or alvo.suffix.lower() in EXT_BLOQUEADAS or not alvo.is_file()):
        raise Erro(404, 'Página não encontrada.')
    tipo = mimetypes.guess_type(alvo.name)[0] or 'application/octet-stream'
    if alvo.suffix.lower() in ('.html', '.json', '.js', '.css'):
        tipo += '; charset=utf-8'
    cache = 'public, max-age=3600' if alvo.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.svg') else 'no-cache'
    return tipo, cache, alvo.read_bytes()


# ------------------------------------------------------------------ WSGI
CORS = [('Access-Control-Allow-Origin', '*'), ('Access-Control-Allow-Headers', 'Authorization, Content-Type'),
        ('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'), ('X-Content-Type-Options', 'nosniff')]
FRASES = {200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
          409: 'Conflict', 413: 'Payload Too Large', 429: 'Too Many Requests', 500: 'Internal Server Error'}


def application(environ, start_response):
    def responder(status, corpo=b'', tipo='application/json; charset=utf-8', extra=()):
        start_response(f'{status} {FRASES.get(status, "")}', [('Content-Type', tipo), ('Content-Length', str(len(corpo))), *CORS, *extra])
        return [corpo]

    def como_json(status, dados):
        return responder(status, json.dumps(dados, ensure_ascii=False).encode('utf-8'), extra=[('Cache-Control', 'no-store')])

    try:
        metodo, caminho = environ['REQUEST_METHOD'], environ.get('PATH_INFO', '/')
        if metodo == 'OPTIONS':
            return responder(204)
        if caminho.startswith('/api/'):
            req = Req(environ)
            for m, padrao, fn in ROTAS:
                achou = re.fullmatch(padrao, caminho)
                if m == metodo and achou:
                    status, dados = fn(req, achou.groups())
                    return como_json(status, dados)
            raise Erro(404, 'Rota da API não encontrada.')
        if metodo not in ('GET', 'HEAD'):
            raise Erro(404, 'Não encontrado.')
        tipo, cache, corpo = estatico(caminho)
        return responder(200, corpo if metodo == 'GET' else b'', tipo, [('Cache-Control', cache)])
    except Erro as e:
        if environ.get('PATH_INFO', '').startswith('/api/'):
            return como_json(e.status, {'erro': e.mensagem})
        return responder(e.status, f'<h1>{e.status}</h1><p>{e.mensagem}</p>'.encode(), 'text/html; charset=utf-8')
    except Exception:
        traceback.print_exc()
        return como_json(500, {'erro': 'Erro interno do servidor.'})


if __name__ == '__main__':
    for _fluxo in (sys.stdout, sys.stderr):
        try:
            _fluxo.reconfigure(errors='replace')
        except Exception:
            pass
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

    class Servidor(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    class Silencioso(WSGIRequestHandler):
        def log_message(self, fmt, *args):
            if '/api/' in self.requestline:
                sys.stderr.write('%s\n' % (fmt % args))

    host, porta = os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))
    c = config()
    url = f"http://localhost:{porta}"
    print(f"\nNutrição na Gôndola rodando em {url}")
    print("Tudo o que for cadastrado é salvo em arquivos JSON dentro da pasta do projeto:")
    print("   data/produtos.json  |  data/db/usuarios.json  |  data/db/envios.json  |  data/db/supermercado.json")
    if c['exigir_codigo']:
        print(f"Código para cadastrar PROFESSOR(A): {c['codigos']['professor']}")
        print(f"Código para cadastrar FORNECEDOR:   {c['codigos']['supermercado']}")
    print("Para parar o servidor: feche esta janela ou aperte Ctrl+C.\n")
    if '--abrir' in sys.argv:
        import webbrowser
        threading.Timer(1.0, webbrowser.open, [url]).start()
    make_server(host, porta, application, server_class=Servidor, handler_class=Silencioso).serve_forever()
