// Mensagem que chega "trancada" (chave de criptografia velha): o bot avisa se o celular não reenviar.
const { criarBot, limpar, EU_LID } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');
const { proto } = require('@whiskeysockets/baileys');
const { mensagemTrancada, destrancou } = require('../src/conexao');
const { filtrar } = require('../src/silenciar');

test.after(limpar);

const trancada = (id, extra = {}) => ({
    key: { remoteJid: EU_LID, fromMe: true, id, ...extra },
    messageStubType: proto.WebMessageInfo.StubType.CIPHERTEXT,
});

test('mensagem trancada: avisa depois de 20 s se o celular não reenviar; não avisa se reenviar', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    const bot = criarBot();

    assert.strictEqual(mensagemTrancada(bot, trancada('A')), true);
    t.mock.timers.tick(21_000);
    assert.ok(bot.ultima()?.includes('mande de novo'), 'avisou');

    const antes = bot.enviadas.length;
    t.mock.timers.tick(200_000);
    assert.strictEqual(mensagemTrancada(bot, trancada('B')), true);
    destrancou({ key: { id: 'B' }, message: { conversation: '!menu' } });
    t.mock.timers.tick(21_000);
    assert.strictEqual(bot.enviadas.length, antes, 'reenviou a tempo: não avisa');

    // mensagem normal não é trancada; em grupo de outra pessoa não avisa
    assert.strictEqual(mensagemTrancada(bot, { key: { id: 'C' }, message: { conversation: 'oi' } }), false);
    assert.strictEqual(mensagemTrancada(bot, trancada('D', { remoteJid: '1203@g.us', fromMe: false })), true);
    t.mock.timers.tick(21_000);
    assert.strictEqual(bot.enviadas.length, antes);
});

test('o log não mostra as chaves de criptografia', () => {
    const escritos = [];
    const log = filtrar((...p) => escritos.push(p.join(' ')));
    log('Closing session:', { privKey: 'segredo' });
    log('Decrypted message with closed session.');
    log('outra coisa');
    assert.deepStrictEqual(escritos, ['outra coisa']);
});
