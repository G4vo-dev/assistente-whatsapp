// Testes de #confiar, #desconfiar e #confiaveis: só o dono mexe na lista.
const { criarBot, mensagem, limpar } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');
const { tratarMensagem } = require('../src/roteador');

test.after(limpar);

const AMIGA = { fromMe: false, remoteJid: '5521977776666@s.whatsapp.net' };
const OUTRO = { fromMe: false, remoteJid: '5531966665555@s.whatsapp.net' };

async function enviar(texto, key) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key));
    return bot.ultima();
}

test('quem não é confiável não usa o bot', async () => {
    assert.strictEqual(await enviar('#ping', AMIGA), undefined);
});

test('o dono confia num número (com DDD, sem 55) e a pessoa passa a poder usar', async () => {
    assert.match(await enviar('#confiar 21 97777-6666'), /5521977776666/);
    assert.match(await enviar('#ping', AMIGA), /^pong/);
    assert.strictEqual(await enviar('#ping', OUTRO), undefined);
});

test('confiar de novo o mesmo número avisa que já estava na lista', async () => {
    assert.match(await enviar('#confiar 5521977776666'), /já/);
});

test('número inválido é recusado', async () => {
    assert.match(await enviar('#confiar 123'), /❌/);
    assert.match(await enviar('#confiar abc'), /❌/);
});

test('um confiável NÃO consegue confiar em ninguém, nem tirar a lista', async () => {
    const resposta = await enviar('#confiar 5531966665555', AMIGA);
    assert.match(resposta, /só o dono/);
    assert.strictEqual(await enviar('#ping', OUTRO), undefined);
    assert.match(await enviar('#desconfiar 5521977776666', AMIGA), /só o dono/);
    assert.match(await enviar('#ping', AMIGA), /^pong/);
    assert.match(await enviar('#confiaveis', AMIGA), /só o dono/);
});

test('#confiaveis lista e #desconfiar remove', async () => {
    assert.match(await enviar('#confiaveis'), /5521977776666/);
    assert.match(await enviar('#desconfiar 5521977776666'), /removido/);
    assert.strictEqual(await enviar('#ping', AMIGA), undefined);
    assert.match(await enviar('#confiaveis'), /ninguém/);
    assert.match(await enviar('#desconfiar 5521977776666'), /não está/);
});

test('#confiar sem número, na conversa privada com a pessoa, confia nela', async () => {
    assert.match(await enviar('#confiar', { fromMe: true, remoteJid: '5531966665555@s.whatsapp.net' }), /5531966665555/);
    assert.match(await enviar('#ping', OUTRO), /^pong/);
});

test('#confiar sem número na conversa com você mesmo explica o uso', async () => {
    assert.match(await enviar('#confiar'), /ex:/);
});
