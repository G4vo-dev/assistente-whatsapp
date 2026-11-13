// Testes do #chave: cada pessoa usa a própria chave de IA, sem gastar a do dono.
process.env.PERMITIDOS_TESTE = '5521977776666';
process.env.MISTRAL_TESTE = 'chave-do-dono-mistral';
const { criarBot, mensagem, limpar } = require('./ajudante');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');
const fila = require('../src/servicos/ia/fila');
const chaves = require('../src/servicos/ia/chaves');
const backup = require('../src/servicos/backup');
const { PASTA_DADOS } = require('../src/config');

const AMIGO = { fromMe: false, remoteJid: '5521977776666@s.whatsapp.net' };
const GRUPO = { fromMe: false, remoteJid: '120363000000000000@g.us', participant: '5521977776666@s.whatsapp.net' };
const CHAVE_AMIGO = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'; // 32 letras e números: jeito de chave da Mistral
const CHAVE_GROQ = `gsk_${'x'.repeat(40)}wxyz`;

const fetchOriginal = global.fetch;
let pedidos = [];
// testes de chave (GET) respondem pelo mapa; conversas (POST) na Mistral respondem "oi"
let validas = new Set();
let limite = new Set(); // chaves que batem no limite
test.beforeEach(() => {
    pedidos = [];
    validas = new Set([CHAVE_AMIGO, CHAVE_GROQ]);
    limite = new Set();
    fila.zerar();
    global.fetch = async (url, opcoes = {}) => {
        const cabecalhos = opcoes.headers || {};
        const chave = String(cabecalhos.Authorization || cabecalhos['x-goog-api-key'] || '').replace('Bearer ', '');
        pedidos.push({ url, chave, metodo: opcoes.method || 'GET' });
        let status = 200;
        let json = { data: [] };
        if (opcoes.method === 'POST') {
            status = limite.has(chave) ? 429 : 200;
            json = status === 200 ? { choices: [{ message: { content: `oi de ${chave}` } }] } : { error: { message: 'rate limit' } };
        } else if (!validas.has(chave)) {
            status = 401;
        }
        return { ok: status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(json) };
    };
});
test.afterEach(() => { global.fetch = fetchOriginal; });
test.after(limpar);

async function enviar(texto, key) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key));
    return bot;
}

test('descobre a IA pelo jeito da chave e nunca mostra a chave inteira', () => {
    assert.strictEqual(chaves.adivinharIA(CHAVE_GROQ), 'groq');
    assert.strictEqual(chaves.adivinharIA(`AIza${'y'.repeat(35)}`), 'gemini');
    assert.strictEqual(chaves.adivinharIA(`sk-or-v1-${'z'.repeat(40)}`), 'openrouter');
    assert.strictEqual(chaves.adivinharIA(CHAVE_AMIGO), 'mistral');
    assert.strictEqual(chaves.adivinharIA('curta'), null);
    assert.strictEqual(chaves.mascarar(CHAVE_GROQ), 'gsk_…wxyz');
});

test('a pessoa guarda a própria chave; o log e a resposta não mostram a chave', async () => {
    const logs = [];
    const logOriginal = console.log;
    console.log = (...partes) => logs.push(partes.join(' '));
    let bot;
    try {
        bot = await enviar(`#chave mistral ${CHAVE_AMIGO}`, AMIGO);
    } finally {
        console.log = logOriginal;
    }
    const respostas = bot.textos().join('\n');
    assert.match(respostas, /chave da Mistral guardada \(…2345\)/);
    assert.match(respostas, /aparelho do dono/, 'avisa onde a chave fica guardada');
    assert.ok(!respostas.includes(CHAVE_AMIGO), 'a resposta não repete a chave');
    assert.ok(logs.some((l) => l.includes('#chave [escondido]')), logs.join('\n'));
    assert.ok(!logs.some((l) => l.includes(CHAVE_AMIGO)), 'o log não tem a chave');
    assert.ok(pedidos.some((p) => p.url.includes('api.mistral.ai/v1/models') && p.chave === CHAVE_AMIGO), 'testou a chave antes de guardar');

    // o arquivo só o dono do aparelho lê, e a chave não vai para o backup
    const arquivo = path.join(PASTA_DADOS, 'chaves.json');
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(arquivo).mode & 0o777, 0o600);
    assert.ok(!backup.montarBackup().texto.includes(CHAVE_AMIGO));
});

test('cada um gasta a própria chave: o amigo usa a dele, o dono usa a do .env', async () => {
    const doAmigo = (await enviar('#ia oi', AMIGO)).ultima();
    assert.ok(doAmigo.includes(`oi de ${CHAVE_AMIGO}`), doAmigo);
    const doDono = (await enviar('#ia oi')).ultima();
    assert.ok(doDono.includes('oi de chave-do-dono-mistral'), doDono);
});

test('o limite da chave do amigo não para a do dono', async () => {
    limite.add(CHAVE_AMIGO);
    const doAmigo = (await enviar('#ia oi', AMIGO)).ultima();
    assert.ok(doAmigo.startsWith('❌'), doAmigo);
    const doDono = (await enviar('#ia oi')).ultima();
    assert.ok(doDono.includes('oi de chave-do-dono-mistral'), `o dono continua: ${doDono}`);
});

test('#chave mostra de quem é cada chave', async () => {
    const txt = (await enviar('#chave', AMIGO)).ultima();
    assert.match(txt, /Mistral: sua \(…2345\)/);
    assert.match(txt, /Groq: nenhuma/);
    const doDono = (await enviar('#chave')).ultima();
    assert.match(doDono, /Mistral: a do \.env/);
});

test('chave recusada pela IA não é guardada', async () => {
    validas.delete(CHAVE_GROQ);
    const txt = (await enviar(`#chave ${CHAVE_GROQ}`, AMIGO)).ultima();
    assert.match(txt, /Groq recusou/);
    assert.strictEqual(chaves.chavesDa(['5521977776666']).groq, undefined);
});

test('chave mandada em grupo não é guardada e o bot pede para trocar', async () => {
    const txt = (await enviar(`#chave ${CHAVE_GROQ}`, GRUPO)).ultima();
    assert.match(txt, /não mande chave em grupo/);
    assert.ok(!pedidos.length, 'nem testou a chave');
    assert.strictEqual(chaves.chavesDa(['5521977776666']).groq, undefined);
});

test('a chave do dono vai por comando e a mensagem com ela é apagada', async () => {
    const bot = await enviar(`#chave groq ${CHAVE_GROQ}`);
    assert.ok(bot.enviadas.some((e) => e.conteudo.delete), 'apagou a mensagem com a chave');
    assert.strictEqual(chaves.chavesDa(chaves.DONO).groq, CHAVE_GROQ);
    assert.match((await enviar('#chave remover groq')).ultima(), /1 chave\(s\) apagada/);
    assert.strictEqual(chaves.chavesDa(chaves.DONO).groq, undefined);
});

test('#chave remover tudo volta a usar a do dono', async () => {
    assert.match((await enviar('#chave remover tudo', AMIGO)).ultima(), /apagada.*as do dono do bot/s);
    const doAmigo = (await enviar('#ia oi', AMIGO)).ultima();
    assert.ok(doAmigo.includes('oi de chave-do-dono-mistral'), doAmigo);
});
