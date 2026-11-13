// Testes do print do extrato (#lerextrato), do #editar e do jeito que a IA "pensa" na Groq.
process.env.GROQ_TESTE = 'chave-de-teste';
const { criarBot, mensagem, limpar } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');
const ia = require('../src/servicos/ia');
const midia = require('../src/servicos/midia');
const groq = require('../src/servicos/ia/groq');
const { hojeISO } = require('../src/util/formato');

const originais = { ia: { ...ia }, midia: { ...midia } };
test.afterEach(() => {
    Object.assign(ia, originais.ia);
    Object.assign(midia, originais.midia);
});
test.after(limpar);

async function enviar(texto, message) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, {}, message ? { message } : undefined));
    return bot.ultima();
}

const print = (legenda = '') => ({ imageMessage: { caption: legenda, mimetype: 'image/jpeg' } });
const [ano] = hojeISO().split('-');

const EXTRATO = JSON.stringify([
    { acao: 'despesa', valor: 23.9, metodo: 'debito', categoria: 'comida', data: `10/11/${ano}`, descricao: 'Padaria Pão Quente' },
    { acao: 'receita', valor: '1.500,00', metodo: 'pix', categoria: 'salario', data: `05/11/${ano}`, descricao: 'Empresa X' },
    { acao: 'despesa', valor: -60, metodo: 'pix', categoria: 'transporte', data: `11/11/${ano}`, descricao: 'Uber' },
    { acao: 'saldo', valor: 999, descricao: 'saldo do dia' },
]);

test('#lerextrato anota cada linha, mostra o número e não repete o que já estava anotado', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    let pergunta = '';
    let tokens = 0;
    ia.perguntarSobreImagem = async (dados, tipo, texto, opcoes) => {
        pergunta = texto;
        tokens = opcoes.maxTokens;
        return '```json\n' + EXTRATO + '\n```';
    };
    const r = await enviar('', print('#lerextrato'));
    assert.ok(r.includes('extrato lido'), r);
    assert.ok(r.includes('Padaria Pão Quente') && r.includes('R$ 23,90') && r.includes('🏷️ comida'), r);
    assert.ok(r.includes('R$ 1.500,00') && r.includes('Uber') && r.includes('R$ 60,00'), r);
    assert.ok(!r.includes('saldo do dia'), 'linha de saldo não entra');
    assert.ok(r.includes('#editar'), r);
    assert.ok(pergunta.includes('NÃO inclua linhas de saldo'));
    assert.ok(tokens >= 4000, 'extrato precisa de resposta longa');

    // outro print que mostra as mesmas linhas + uma nova: só a nova entra
    ia.perguntarSobreImagem = async () => JSON.stringify([
        { acao: 'despesa', valor: 60, metodo: 'pix', categoria: 'transporte', data: `11/11/${ano}`, descricao: 'Uber Trip' },
        { acao: 'despesa', valor: 12, metodo: 'pix', categoria: 'comida', data: `12/11/${ano}`, descricao: 'Café' },
    ]);
    const r2 = await enviar('', print('#lerextrato'));
    assert.ok(r2.includes('Café') && !r2.includes('Uber Trip'), r2);
    assert.ok(r2.includes('1 já estava anotado'), r2);

    const extrato = await enviar('#extrato tudo');
    assert.strictEqual((extrato.match(/Uber/g) || []).length, 1, extrato);
    assert.ok(extrato.includes('#editar'), extrato);
});

test('duas compras iguais no mesmo print entram as duas', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    const cafe = { acao: 'despesa', valor: 7, metodo: 'pix', categoria: 'comida', data: `01/11/${ano}`, descricao: 'Cafezinho' };
    ia.perguntarSobreImagem = async () => JSON.stringify([cafe, cafe]);
    const r = await enviar('', print('#lerextrato'));
    assert.strictEqual((r.match(/Cafezinho/g) || []).length, 2, r);
});

test('#extrato na legenda do print lê o print; prints logo depois são lidos sem legenda', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    ia.perguntarSobreImagem = async () => JSON.stringify([{ acao: 'despesa', valor: 33, metodo: 'pix', categoria: 'mercado', data: `03/11/${ano}`, descricao: 'Mercadinho' }]);
    const r = await enviar('', print('#extrato'));
    assert.ok(r.includes('extrato lido') && r.includes('Mercadinho'), r);

    ia.perguntarSobreImagem = async () => JSON.stringify([{ acao: 'despesa', valor: 44, metodo: 'pix', categoria: 'farmacia', data: `03/11/${ano}`, descricao: 'Drogaria' }]);
    const r2 = await enviar('', print(''));
    assert.ok(r2 && r2.includes('Drogaria'), 'print sem legenda logo depois também é lido');
});

test('fatura de cartão: sem saber o cartão avisa; com o cartão na legenda lança no crédito', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    await enviar('#cartao adicionar nubank 2000');
    await enviar('#cartao adicionar inter 1000');
    ia.perguntarSobreImagem = async () => JSON.stringify([
        { acao: 'despesa', valor: 89.9, metodo: 'credito', categoria: 'assinaturas', data: `02/11/${ano}`, descricao: 'Streaming', parcelas: 12 },
    ]);
    const sem = await enviar('', print('#lerextrato'));
    assert.ok(sem.includes('não sei de qual cartão'), sem);

    const com = await enviar('', print('#lerextrato nubank'));
    assert.ok(com.includes('💳 nubank') && com.includes('Streaming'), com);
    assert.ok(!com.includes('12x'), 'extrato não cria parcelas futuras');
});

test('#lerextrato sem print explica; print sem movimentação avisa', async () => {
    assert.ok((await enviar('#lerextrato')).includes('mande o print'));
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    ia.perguntarSobreImagem = async () => '[]';
    assert.ok((await enviar('', print('#lerextrato'))).includes('não achei movimentações'));
});

test('#editar muda categoria, valor, descrição, data, tipo e método', async () => {
    await enviar('#despesa 50 pix outros lanche');
    const extrato = await enviar('#extrato tudo');
    const numero = extrato.match(/(\d+)\. 🔴 \S+ lanche/)[1];

    let r = await enviar(`#editar ${numero} mercado`);
    assert.ok(r.includes('categoria outros → mercado'), r);

    r = await enviar(`#editar ${numero} valor 45,90`);
    assert.ok(r.includes('valor R$ 50,00 → R$ 45,90'), r);

    r = await enviar(`#editar ${numero} descricao padaria do zé`);
    assert.ok(r.includes('descrição lanche → padaria do zé'), r);

    r = await enviar(`#editar ${numero} 15/10 debito`);
    assert.ok(r.includes('data') && r.includes('forma pix → debito'), r);

    r = await enviar(`#editar ${numero} nubank`);
    assert.ok(r.includes('crédito nubank'), r);

    r = await enviar(`#editar ${numero} receita pix`);
    assert.ok(r.includes('tipo despesa → receita') && r.includes('🟢'), r);
});

test('#editar vários de uma vez e erros', async () => {
    await enviar('#despesa 10 pix outros a');
    await enviar('#despesa 11 pix outros b');
    const extrato = await enviar('#extrato tudo');
    const a = Number(extrato.match(/(\d+)\. 🔴 \S+ a ·/)[1]);
    const r = await enviar(`#editar ${a}-${a + 1},9999 transporte`);
    assert.strictEqual((r.match(/categoria outros → transporte/g) || []).length, 2, r);
    assert.ok(r.includes('não achei: 9999'), r);

    assert.ok((await enviar('#editar')).includes('uso'));
    assert.ok((await enviar('#editar 9999 mercado')).includes('não achei'));
    assert.ok((await enviar(`#editar ${a} valor abc`)).includes('não é um valor'));
    assert.ok((await enviar(`#editar ${a} credito`)).includes('de qual cartão'));
});

test('Groq: finanças sem raciocínio, conversa com pouco, e modelos sem suporte ficam de fora', () => {
    assert.deepStrictEqual(groq.opcoesDeRaciocinio('qwen/qwen3.8-27b', 'none'), { reasoning_effort: 'none' });
    assert.deepStrictEqual(groq.opcoesDeRaciocinio('qwen/qwen3.8-27b', 'low'), { reasoning_effort: 'low', reasoning_format: 'hidden' });
    assert.deepStrictEqual(groq.opcoesDeRaciocinio('openai/gpt-oss-120b', 'none'), { reasoning_effort: 'low', reasoning_format: 'hidden' });
    assert.deepStrictEqual(groq.opcoesDeRaciocinio('llama-3.3-70b-versatile', 'low'), {});
    assert.deepStrictEqual(groq.opcoesDeRaciocinio('qwen/qwen3.8-27b', 'padrao'), {});
});
