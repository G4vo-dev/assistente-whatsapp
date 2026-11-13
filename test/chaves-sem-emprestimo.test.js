// EMPRESTAR_CHAVES=nao: quem não é o dono só usa a IA com a própria chave (#chave).
process.env.PERMITIDOS_TESTE = '5521977776666';
process.env.MISTRAL_TESTE = 'chave-do-dono-mistral';
const { criarBot, mensagem, limpar } = require('./ajudante');
process.env.EMPRESTAR_CHAVES = 'nao';
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');

const AMIGO = { fromMe: false, remoteJid: '5521977776666@s.whatsapp.net' };
const fetchOriginal = global.fetch;
test.after(() => {
    global.fetch = fetchOriginal;
    limpar();
});

async function enviar(texto, key) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key));
    return bot.ultima();
}

test('sem chave própria, a IA fica desligada para o amigo e ele aprende a colocar a dele', async () => {
    const pedidos = [];
    global.fetch = async (url) => {
        pedidos.push(url);
        return { ok: true, status: 200, statusText: '', headers: new Headers(), text: async () => JSON.stringify({ choices: [{ message: { content: 'oi' } }] }) };
    };
    const txt = await enviar('#ia oi', AMIGO);
    assert.match(txt, /não está liberada para você/);
    assert.match(txt, /#chave groq/);
    assert.strictEqual(pedidos.length, 0, 'não gastou a chave do dono');
    assert.match(await enviar('#chave', AMIGO), /Mistral: nenhuma/);

    // o dono continua usando a dele
    assert.strictEqual(await enviar('#ia oi'), 'oi');
});
