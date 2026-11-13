// Testes de anotações e listas (#anotar, #notas, #lista, #listas).
const { criarBot, mensagem, limpar } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');
const { tratarMensagem } = require('../src/roteador');

test.after(limpar);

async function enviar(texto, key) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key));
    return bot.ultima();
}

test('anotar, listar e apagar notas', async () => {
    assert.match(await enviar('#anotar comprar caderno'), /anotado/);
    assert.match(await enviar('#anotar ligar para o banco'), /anotado/);
    const lista = await enviar('#notas');
    assert.match(lista, /1\. comprar caderno/);
    assert.match(lista, /2\. ligar para o banco/);
    assert.match(await enviar('#notas apagar 1'), /apagada/);
    const depois = await enviar('#notas');
    assert.doesNotMatch(depois, /comprar caderno/);
    assert.match(depois, /1\. ligar para o banco/);
});

test('anotar sem texto explica o uso', async () => {
    assert.match(await enviar('#anotar'), /anotar/);
});

test('listas: adicionar vários itens, marcar feito, listar e limpar', async () => {
    assert.match(await enviar('#lista mercado add leite, pão, ovos'), /3 itens/);
    const mostra = await enviar('#lista mercado');
    assert.match(mostra, /1\. ⬜ leite/);
    assert.match(mostra, /3\. ⬜ ovos/);
    assert.match(await enviar('#lista mercado feito 2'), /pão/);
    assert.match(await enviar('#lista mercado'), /2\. ✅ pão/);
    assert.match(await enviar('#listas'), /mercado/);
    assert.match(await enviar('#lista mercado apagar 1'), /leite/);
    assert.match(await enviar('#lista mercado limpar'), /apagada/);
    assert.match(await enviar('#listas'), /nenhuma lista/);
});

test('cada conversa tem as suas notas', async () => {
    const outra = { remoteJid: '5521977776666@s.whatsapp.net', fromMe: true };
    await enviar('#anotar nota só da outra conversa', outra);
    assert.doesNotMatch(await enviar('#notas'), /só da outra conversa/);
    assert.match(await enviar('#notas', outra), /só da outra conversa/);
});

test('#lembrar repetido cria lembrete que aparece com 🔁 e dá para cancelar', async () => {
    const resposta = await enviar('#lembrar todo dia 8h tomar remédio');
    assert.match(resposta, /todo dia às 8h/);
    assert.match(await enviar('#lembretes'), /🔁.*tomar remédio/);
    assert.match(await enviar('#cancelar 1'), /cancelado/);
});

test('#ajuda troca # pelo prefixo em uso', async () => {
    const config = require('../src/config');
    const { montarAjuda } = require('../src/comandos');
    assert.doesNotMatch(montarAjuda('resetfin', '!'), /#/);
    assert.strictEqual(config.PREFIXO, '#'); // os testes usam # de propósito (ajudante.js)
});
