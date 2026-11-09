// Testes de privacidade e avisos: modo privado, #privacidade, aviso para outros usuários, direitos autorais e avisos financeiros.
process.env.PERMITIDOS_TESTE = '5521977776666';
process.env.GROQ_TESTE = 'chave-groq';
process.env.GEMINI_TESTE = 'chave-gemini';
const { criarBot, mensagem, limpar } = require('./ajudante');
process.env.IA_MODO_PRIVADO = 'sim';
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');
const ia = require('../src/servicos/ia');
const midia = require('../src/servicos/midia');

const originais = { ia: { ...ia }, midia: { ...midia } };
test.afterEach(() => {
    Object.assign(ia, originais.ia);
    Object.assign(midia, originais.midia);
});
test.after(limpar);

const AMIGO = { fromMe: false, remoteJid: '5521977776666@s.whatsapp.net' };

async function enviar(texto, key, extra) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key, extra ? { message: extra } : undefined));
    return bot;
}

test('modo privado: finanças, fotos e áudios só vão para a Groq', () => {
    const { filas } = ia.situacao();
    assert.deepStrictEqual(filas.financas, ['groq']);
    assert.deepStrictEqual(filas.imagem, ['groq']);
    assert.deepStrictEqual(filas.audio, ['groq']);
    assert.deepStrictEqual(filas.pdf, []);
    assert.ok(filas.texto.includes('gemini'), 'a conversa comum continua com todas');
});

test('#privacidade explica o que fica guardado e como apagar', async () => {
    const r = (await enviar('#privacidade')).ultima();
    assert.ok(r.includes('modo privado: ✅ ligado') && r.includes('#resetfin tudo confirmar') && r.includes('não* ficam guardados'), r);
});

test('quem não é o dono recebe o aviso de privacidade só na primeira vez', async () => {
    let textos = (await enviar('#ping', AMIGO)).textos();
    assert.strictEqual(textos.length, 2);
    assert.ok(textos[0].includes('bot pessoal') && textos[1].startsWith('pong'));
    textos = (await enviar('#ping', AMIGO)).textos();
    assert.deepStrictEqual(textos.length, 1);
    assert.strictEqual((await enviar('#ping')).textos().length, 1, 'o dono não recebe o aviso');
});

test('#dicas e #iaeco avisam que não é recomendação de investimento', async () => {
    await enviar('#despesa 10 pix teste');
    ia.perguntarIA = async () => 'guarde 10% do salário';
    const dicas = (await enviar('#dicas')).ultima();
    assert.ok(dicas.includes('guarde 10%') && dicas.includes('não é recomendação de investimento'), dicas);
    const eco = (await enviar('#iaeco o que é CDB?')).ultima();
    assert.ok(eco.includes('não é recomendação de investimento'), eco);
    ia.perguntarIA = async () => '❌ nenhuma IA respondeu';
    assert.ok(!(await enviar('#iaeco o que é CDB?')).ultima().includes('recomendação'), 'erro não leva aviso');
});

test('#comprovante em PDF explica que o modo privado não lê PDF', async () => {
    const r = (await enviar('', {}, { documentMessage: { caption: '#comprovante', mimetype: 'application/pdf', fileName: 'a.pdf' } })).ultima();
    assert.ok(r.includes('modo privado'), r);
});


test('#backup, #restaurar e #avisos são só do dono', async () => {
    await enviar('#despesa 999 pix saude consulta do dono');
    for (const comando of ['#backup', '#avisos', '#avisos testar backup', '#avisos desligar backup', '#restaurar confirmar']) {
        const bot = await enviar(comando, AMIGO);
        assert.ok(!bot.enviadas.some((e) => e.conteudo.document), `${comando} não pode mandar arquivo para outra pessoa`);
        assert.ok(bot.ultima().includes('só o dono'), `${comando}: ${bot.ultima()}`);
    }
    const bot = await enviar('#avisos');
    assert.ok(bot.ultima().includes('✅ *backup*'), 'o pedido do amigo não desligou o backup do dono');
});

test('#resetfin de outra pessoa apaga só a carteira dela e não manda o backup de todo mundo', async () => {
    await enviar('#despesa 999 pix saude consulta do dono');
    await enviar('#despesa 15 pix lanche coxinha', AMIGO);
    const bot = await enviar('#resetfin confirmar', AMIGO);
    assert.ok(!bot.enviadas.some((e) => e.conteudo.document), 'não manda o arquivo de backup');
    assert.ok(bot.ultima().includes('1 lançamento(s) apagado(s)') && bot.ultima().includes('cópia de segurança'), bot.ultima());
    assert.ok((await enviar('#extrato')).ultima().includes('consulta do dono'), 'a carteira do dono continua');
});

test('comando desconhecido fora da conversa com você mesmo fica em silêncio (hashtag em grupo)', async () => {
    const grupo = { fromMe: true, remoteJid: '120363000000000000@g.us' };
    assert.strictEqual((await enviar('#tbt da viagem', grupo)).enviadas.length, 0);
    assert.strictEqual((await enviar('#sextou', AMIGO)).textos().filter((t) => t.includes('não conheço')).length, 0);
    assert.ok((await enviar('#tbt')).ultima().includes('não conheço'), 'na conversa com você mesmo continua avisando');
    assert.match((await enviar('#ping', grupo)).ultima(), /^pong/, 'comandos que existem continuam funcionando no grupo');
});
