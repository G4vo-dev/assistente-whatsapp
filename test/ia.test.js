// Testes da fila de IAs: cada tarefa tenta as IAs na ordem e pula as que falham ou estão no limite.
process.env.GROQ_TESTE = 'chave-groq';
process.env.GEMINI_TESTE = 'chave-gemini';
process.env.MISTRAL_TESTE = 'chave-mistral';
process.env.OPENROUTER_TESTE = 'chave-openrouter';
const { criarBot, mensagem, limpar } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');

const ia = require('../src/servicos/ia');
const fila = require('../src/servicos/ia/fila');
const groq = require('../src/servicos/ia/groq');
const midia = require('../src/servicos/midia');
const { tratarMensagem } = require('../src/roteador');
const { lerData } = require('../src/util/formato');
const lancamentoIA = require('../src/servicos/lancamento-ia');

const originais = { groq: { ...groq }, midia: { ...midia }, fetch: global.fetch };
let pedidos = [];

function erro(status, mensagem = `erro ${status}`) {
    return Object.assign(new Error(mensagem), { status });
}

// Respostas falsas das APIs: { gemini, mistral, openrouter } -> função(url, corpo) que devolve [status, json]
function simularApis(respostas) {
    global.fetch = async (url, opcoes) => {
        const corpo = JSON.parse(opcoes.body);
        const quem = url.includes('generativelanguage') ? 'gemini' : url.includes('mistral') ? 'mistral' : url.includes('openrouter') ? 'openrouter' : '?';
        pedidos.push({ quem, url, corpo, cabecalhos: opcoes.headers });
        const [status, json] = respostas[quem] ? respostas[quem](url, corpo) : [500, { error: { message: 'fora do ar' } }];
        return { ok: status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(json) };
    };
}

const respostaGemini = (texto) => [200, { candidates: [{ content: { parts: [{ text: texto }] } }] }];
const respostaChat = (texto) => [200, { choices: [{ message: { content: texto } }] }];

test.beforeEach(() => {
    fila.zerar();
    pedidos = [];
});
test.afterEach(() => {
    Object.assign(groq, originais.groq);
    Object.assign(midia, originais.midia);
    global.fetch = originais.fetch;
});
test.after(limpar);

test('Groq no limite: o Gemini responde e a Groq fica descansando', async () => {
    let chamadasGroq = 0;
    groq.texto = async () => { chamadasGroq++; throw erro(429, 'rate limit'); };
    simularApis({ gemini: () => respostaGemini('oi do **gemini**') });
    assert.strictEqual(await ia.perguntarIA('oi'), 'oi do *gemini*');
    assert.strictEqual(await ia.perguntarIA('oi de novo'), 'oi do *gemini*');
    assert.strictEqual(chamadasGroq, 1, 'na segunda vez a Groq é pulada');
    assert.strictEqual(pedidos[0].cabecalhos['x-goog-api-key'], 'chave-gemini');
    const groqStatus = ia.situacao().provedores.find((p) => p.nome === 'groq');
    assert.strictEqual(groqStatus.parados[0].d.motivo, 'limite atingido');
});

test('Gemini pula para o próximo modelo se o primeiro não existir', async () => {
    groq.texto = async () => { throw erro(500); };
    simularApis({ gemini: (url) => (url.includes('/gemini-flash-latest:') ? [404, { error: { message: 'not found' } }] : respostaGemini('do lite')) });
    assert.strictEqual(await ia.perguntarIA('oi'), 'do lite');
    assert.deepStrictEqual(pedidos.map((p) => p.url.split('/models/')[1]), ['gemini-flash-latest:generateContent', 'gemini-flash-lite-latest:generateContent']);
});

test('conversa vai até o OpenRouter; finanças nunca usa o OpenRouter', async () => {
    groq.texto = async () => { throw erro(503); };
    simularApis({ openrouter: () => respostaChat('do openrouter') });
    assert.strictEqual(await ia.perguntarIA('oi'), 'do openrouter');
    assert.deepStrictEqual(pedidos.map((p) => p.quem), ['gemini', 'mistral', 'openrouter']);

    fila.zerar();
    pedidos = [];
    const r = await ia.perguntarIA('gastei 30', { tarefa: 'financas' });
    assert.ok(r.startsWith('❌ nenhuma IA respondeu') && r.includes('groq:') && r.includes('mistral:'), r);
    assert.ok(!pedidos.some((p) => p.quem === 'openrouter'));
});

test('Mistral responde quando Groq e Gemini falham (formato em partes)', async () => {
    groq.texto = async () => { throw erro(500); };
    simularApis({ mistral: () => [200, { choices: [{ message: { content: [{ type: 'text', text: 'oi ' }, { type: 'text', text: 'da mistral' }] } }] }] });
    assert.strictEqual(await ia.perguntarIA('oi', { tarefa: 'financas' }), 'oi da mistral');
    assert.strictEqual(pedidos.at(-1).corpo.model, 'mistral-small-latest');
});

test('foto vai primeiro para o Gemini; PDF só o Gemini lê', async () => {
    simularApis({ gemini: () => respostaGemini('[]') });
    await ia.perguntarSobreImagem(Buffer.from('foto'), 'image/jpeg', 'o que é?');
    await ia.perguntarSobreImagem(Buffer.from('pdf'), 'application/pdf', 'o que é?');
    const tipos = pedidos.map((p) => p.corpo.contents[0].parts[0].inlineData.mimeType);
    assert.deepStrictEqual(tipos, ['image/jpeg', 'application/pdf']);

    // sem Gemini, foto cai na Groq (Llama 4 Scout)
    fila.zerar();
    simularApis({ gemini: () => [429, { error: { message: 'quota' } }] });
    groq.arquivo = async ({ tipo }) => `groq viu ${tipo}`;
    assert.strictEqual(await ia.perguntarSobreImagem(Buffer.from('foto'), 'image/png', '?'), 'groq viu image/png');
});

test('áudio: se o Whisper da Groq falhar, o Gemini transcreve', async () => {
    groq.audio = async () => { throw erro(503); };
    simularApis({ gemini: () => respostaGemini('  bom dia  ') });
    assert.strictEqual(await ia.transcreverAudio(Buffer.from('ogg')), 'bom dia');
    assert.strictEqual(pedidos[0].corpo.contents[0].parts[0].inlineData.mimeType, 'audio/ogg');
});

test('#comprovante aceita PDF (lido pelo Gemini)', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('%PDF-1.4');
    simularApis({ gemini: () => respostaGemini('[{"acao":"despesa","valor":149.9,"metodo":"boleto","categoria":"internet","descricao":"Fibra Net"}]') });
    const bot = criarBot();
    await tratarMensagem(bot, mensagem('', {}, { message: { documentMessage: { caption: '#comprovante', mimetype: 'application/pdf', fileName: 'boleto.pdf' } } }));
    assert.ok(bot.ultima().includes('comprovante lançado') && bot.ultima().includes('Fibra Net') && bot.ultima().includes('R$ 149,90'), bot.ultima());
    assert.strictEqual(pedidos[0].corpo.contents[0].parts[0].inlineData.mimeType, 'application/pdf');
});

test('#ias mostra as IAs ligadas e a fila de cada tarefa', async () => {
    groq.texto = async () => { throw erro(429); };
    simularApis({ gemini: () => respostaGemini('ok') });
    await ia.perguntarIA('oi');
    const bot = criarBot();
    await tratarMensagem(bot, mensagem('#ias'));
    const r = bot.ultima();
    assert.ok(r.includes('💤 Groq') && r.includes('✅ Google Gemini · 1 resposta(s)'), r);
    assert.ok(r.includes('conversa: groq → gemini → mistral → openrouter') && r.includes('finanças: groq → gemini → mistral') && r.includes('pdf: gemini'), r);
});

test('a IA pode mandar um objeto sozinho ou a data em AAAA-MM-DD', () => {
    assert.deepStrictEqual(ia.extrairListaJson('```json\n{"acao":"despesa","valor":30}\n```'), [{ acao: 'despesa', valor: 30 }]);
    assert.deepStrictEqual(ia.extrairListaJson('[{"acao":"receita","valor":5}]'), [{ acao: 'receita', valor: 5 }]);
    assert.strictEqual(ia.extrairListaJson('não entendi'), null);
    assert.strictEqual(lerData('2026-11-05'), '2026-11-05');
    assert.strictEqual(lerData('2026-02-30'), null);
});

test('lançamento pela IA aceita a ação escrita com maiúscula', () => {
    const conta = { transacoes: [], cartoes: [], fixos: [], metas: [], limites: [] };
    const despesa = lancamentoIA.aplicarAcao(conta, { acao: 'Despesa', valor: 10, metodo: 'pix', categoria: 'padaria', descricao: 'pão' });
    assert.ok(despesa.startsWith('🔴 nº 1 pão · R$ 10,00'), despesa);
    const receita = lancamentoIA.aplicarAcao(conta, { acao: 'Receita', valor: 50, metodo: 'pix', categoria: 'venda', descricao: 'bolo' });
    assert.ok(receita.startsWith('🟢 nº 2 bolo'), receita);
    assert.deepStrictEqual(conta.transacoes.map((t) => t.tipo), ['despesa', 'receita']);
    assert.ok(lancamentoIA.aplicarAcao(conta, { acao: 'META', valor: 500, descricao: 'bike' }).startsWith('🎯 meta: bike'));
});

test('áudio com transferência, venda, saque ou gíria de dinheiro vira lançamento', () => {
    for (const frase of ['transferi 50 pro joão', 'vendi a bike por 300', 'deu 20 pila o lanche', 'depositei 100 na poupança', 'saquei 200 no caixa', 'gastei 30 no uber']) {
        assert.ok(lancamentoIA.falaDeDinheiro(frase), frase);
    }
    assert.ok(!lancamentoIA.falaDeDinheiro('lembrar de ligar pra mãe amanhã'));
});

test('links em markdown viram texto que o WhatsApp mostra direito', () => {
    assert.strictEqual(ia.limparResposta('baixe no [MCPEDL](https://mcpedl.com/addon)'), 'baixe no MCPEDL (https://mcpedl.com/addon)');
    assert.strictEqual(ia.limparResposta('site: [https://x.com](https://x.com)'), 'site: https://x.com');
});
