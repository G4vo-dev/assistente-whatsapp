// Testes do roteador e dos comandos gerais. Rode com: npm test
process.env.PERMITIDOS_TESTE = '5521977776666';
const { criarBot, mensagem, limpar, EU_PN, pasta } = require('./ajudante');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');
const lembretes = require('../src/servicos/lembretes');
const midia = require('../src/servicos/midia');

async function enviar(texto, key, extra) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key, extra));
    return bot;
}

test.after(limpar);

test('você sempre pode; estranhos não; permitidos sim', async () => {
    assert.match((await enviar('#ping')).ultima(), /^pong/);
    assert.strictEqual((await enviar('#ping', { fromMe: false, remoteJid: '5531966665555@s.whatsapp.net' })).enviadas.length, 0);
    assert.match((await enviar('#ping', { fromMe: false, remoteJid: '5521977776666@s.whatsapp.net' })).ultima(), /^pong/);
    // em grupo vale quem mandou (participant), não o grupo
    const grupo = { fromMe: false, remoteJid: '120363000000000000@g.us' };
    assert.strictEqual((await enviar('#ping', { ...grupo, participant: '5531966665555@s.whatsapp.net' })).enviadas.length, 0);
    assert.match((await enviar('#ping', { ...grupo, participant: '999@lid', participantAlt: '5521977776666@s.whatsapp.net' })).ultima(), /^pong/);
});

test('ignora mensagens sem prefixo e mensagens do próprio bot', async () => {
    assert.strictEqual((await enviar('ping')).enviadas.length, 0);
    const bot = criarBot();
    await tratarMensagem(bot, mensagem('#ping'));
    await tratarMensagem(bot, mensagem('#ping', { id: bot.enviadas[0].id }));
    assert.strictEqual(bot.enviadas.length, 1);
});

test('menu lista todos os comandos e ajuda mostra exemplos', async () => {
    const menu = (await enviar('#menu')).ultima();
    for (const c of ['#s', '#img', '#ia', '#iaeco', '#iagerente', '#saldo', '#receita', '#despesa', '#extrato', '#apagar',
        '#cartao', '#pagarfatura', '#fixo', '#meta', '#grafico', '#dicas', '#resetfin', '#dado', '#moeda',
        '#lembrar', '#mc', '#quimica', '#ajuda', '#limite', '#transcrever', '#comprovante', '#avisos', '#backup',
        '#restaurar', '#exportar', '#img', '#clima', '#cep', '#traduzir', '#pokemon']) {
        assert.ok(menu.includes(c), `faltou ${c} no menu`);
    }
    const ajuda = (await enviar('#ajuda despesa')).ultima();
    assert.ok(ajuda.includes('exemplos') && ajuda.includes('#despesa 35,90'));
});

test('comando parecido ganha sugestão; acento e maiúscula funcionam', async () => {
    assert.ok((await enviar('#sald')).ultima().includes('#saldo'));
    assert.ok((await enviar('#Saída')).ultima().includes('faltou o valor'), 'acento e maiúscula no comando');
    assert.match((await enviar('# ping')).ultima(), /^pong/);
});

test('apelidos antigos continuam valendo', async () => {
    assert.ok((await enviar('#removertrans 99')).ultima().includes('não achei'));
    assert.ok((await enviar('#sticker')).ultima().includes('foto'));
});

test('lembretes: marcar, listar, cancelar e entregar atrasado', async () => {
    assert.ok((await enviar('#lembrar 1h30 tirar o bolo')).ultima().startsWith('✅'));
    assert.ok((await enviar('#lembretes')).ultima().includes('tirar o bolo'));
    assert.ok((await enviar('#cancelar 1')).ultima().includes('tirar o bolo'));
    assert.ok((await enviar('#lembrar depois algo')).ultima().startsWith('❌ uso'));

    fs.writeFileSync(path.join(pasta, 'dados', 'lembretes.json'), JSON.stringify([{ id: 'x', jid: EU_PN, quando: Date.now() - 1000, texto: 'beber água' }]));
    const recebidos = [];
    lembretes.definirEnvio(async (jid, texto) => { recebidos.push(texto); });
    lembretes.retomarPendentes();
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(recebidos, ['⏰ *LEMBRETE:* beber água']);
    lembretes.definirEnvio(null);
});

test('IA sem chave avisa como configurar', async () => {
    assert.ok((await enviar('#ia')).ultima().startsWith('❌'));
    assert.ok((await enviar('#ia oi')).ultima().includes('GROQ_API_KEY'));
});

test('figurinha: legenda #s e modo figurinha para as próximas fotos', async () => {
    const original = { ...midia };
    midia.baixarDaMensagem = async () => Buffer.from('foto');
    midia.paraFigurinha = async () => Buffer.from('webp');
    try {
        const bot = criarBot();
        const foto = (legenda) => ({ message: { imageMessage: { caption: legenda, mimetype: 'image/jpeg' } } });
        await tratarMensagem(bot, mensagem('', {}, foto('#s')));
        await tratarMensagem(bot, mensagem('', {}, foto('')));
        const figurinhas = bot.enviadas.filter((e) => e.conteudo.sticker);
        assert.strictEqual(figurinhas.length, 2);
        // foto de outra conversa não vira figurinha
        await tratarMensagem(bot, mensagem('', { remoteJid: '5521900000000@s.whatsapp.net' }, foto('')));
        assert.strictEqual(bot.enviadas.filter((e) => e.conteudo.sticker).length, 2);
    } finally {
        Object.assign(midia, original);
    }
});

test('SEGUNDOS_MODO_FIGURINHA=0 desliga o modo figurinha', () => {
    const ler = (valor) => spawnSync(process.execPath, ['-e', "console.log(require('./src/config').SEGUNDOS_MODO_FIGURINHA)"], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, SEGUNDOS_MODO_FIGURINHA: valor }, encoding: 'utf8',
    }).stdout.trim();
    assert.strictEqual(ler('0'), '0');
    assert.strictEqual(ler('30'), '30');
    assert.strictEqual(ler(''), '10');
    assert.strictEqual(ler('abc'), '10');
});
