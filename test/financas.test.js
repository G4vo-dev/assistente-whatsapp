// Testes de finanças: lançamentos, cartões, faturas, fixos, metas, relatórios e importação dos dados antigos.
process.env.GROQ_TESTE = 'chave-de-teste';
const { criarBot, mensagem, limpar, pasta, EU_LID } = require('./ajudante');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

// dados no formato da versão anterior (src/data), com a conversa própria em @lid e um grupo
const legado = path.join(pasta, 'legado', 'src', 'data');
fs.mkdirSync(legado, { recursive: true });
fs.writeFileSync(path.join(legado, 'finance.json'), JSON.stringify({
    [EU_LID]: {
        saldo: 1430,
        cartoes: [{ nome: 'itau', limite: 1000 }, { nome: 'picpay', limite: 500 }],
        transacoes: [
            { tipo: 'receita', valor: 1500, metodo: 'salario', cartao: null, categoria: 'pagamento', data: '05/10/26', descricao: 'salário', timestamp: '2026-10-05T12:00:00.000Z' },
            { tipo: 'despesa', valor: 70, metodo: 'débito', cartao: null, categoria: 'comida', data: '15/10', descricao: 'mercado', timestamp: '2026-10-15T12:00:00.000Z' },
            { tipo: 'despesa', valor: 200, metodo: 'credito', cartao: 'itau', categoria: 'jogo', data: '16/10/2026', descricao: 'jogo novo', timestamp: '2026-10-16T12:00:00.000Z' },
        ],
    },
    '120363000000000000@g.us': { saldo: -10, cartoes: [], transacoes: [{ tipo: 'despesa', valor: 10, metodo: 'pix', categoria: 'teste', data: '16/10/2026', descricao: 'teste grupo', timestamp: '2026-10-16T13:00:00.000Z' }] },
}));
fs.writeFileSync(path.join(legado, 'advanced_finance.json'), JSON.stringify({ [EU_LID]: { fixos: [{ valor: 120, descricao: 'internet' }], transacoes: [] } }));
fs.writeFileSync(path.join(legado, 'goals.json'), JSON.stringify({ [EU_LID]: [{ titulo: 'viagem', valorAlvo: 3000, prioridade: 'alta', dataCriacao: '2026-10-14T00:00:00.000Z' }] }));

const { tratarMensagem } = require('../src/roteador');
const ia = require('../src/servicos/ia');
const { montarGrafico } = require('../src/comandos/relatorios');

async function enviar(texto, key) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key));
    return bot.ultima();
}

test.after(limpar);

test('importa os dados da versão anterior na conversa própria', async () => {
    const saldo = await enviar('#saldo');
    assert.ok(saldo.includes('R$ 1.430,00'), saldo); // 1500 - 70 (crédito não mexe no saldo)
    assert.ok(saldo.includes('itau: fatura R$ 200,00 · livre R$ 800,00 de R$ 1.000,00'), saldo);
    assert.ok((await enviar('#fixo')).includes('internet'));
    assert.ok((await enviar('#meta')).includes('viagem'));
    const extrato = await enviar('#extrato');
    assert.ok(extrato.includes('1. 🟢') && extrato.includes('salário') && extrato.includes('💳 itau'), extrato);
    // a conversa do grupo continua separada
    assert.ok((await enviar('#extrato', { remoteJid: '120363000000000000@g.us', participant: EU_LID })).includes('teste grupo'));
});

test('a mesma conversa achada pelo número de telefone usa a mesma carteira', async () => {
    assert.ok((await enviar('#saldo', { remoteJid: '5511912345678@s.whatsapp.net' })).includes('R$ 1.430,00'));
});

test('despesa: formatos curtos e completos', async () => {
    let r = await enviar('#despesa 20 ifood');
    assert.ok(r.includes('nº 4') && r.includes('🏷️ ifood') && r.includes('R$ 1.410,00'), r);
    r = await enviar('#despesa 35,90 pix comida lanche da tarde');
    assert.ok(r.includes('lanche da tarde') && r.includes('🏷️ comida'), r);
    r = await enviar('#despesa 50 credito');
    assert.ok(r.includes('de qual cartão'), r);
    r = await enviar('#despesa 50 picpay uber 15/10 corridas');
    assert.ok(r.includes('fatura picpay: R$ 50,00') && r.includes('15/10'), r);
    r = await enviar('#despesa 900 credito itau eletronicos fone');
    assert.ok(r.includes('passou do limite'), r);
    assert.ok((await enviar('#despesa')).includes('faltou o valor'));
});

test('extrato com filtros e apagar', async () => {
    assert.ok((await enviar('#extrato picpay')).includes('corridas'));
    assert.ok((await enviar('#extrato 10/2026')).includes('jogo novo'));
    assert.ok((await enviar('#extrato nada-disso')).includes('nada encontrado'));
    const r = await enviar('#apagar');
    assert.ok(r.includes('fone'), r);
});

test('cartões e pagamento de fatura', async () => {
    assert.ok((await enviar('#cartao adicionar nubank 2.000')).includes('adicionado com limite de R$ 2.000,00'));
    assert.ok((await enviar('#cartao listar')).includes('nubank'));
    let r = await enviar('#pagarfatura itau 50');
    assert.ok(r.includes('fatura restante: R$ 150,00'), r);
    r = await enviar('#pagarfatura itau');
    assert.ok(r.includes('fatura restante: R$ 0,00'), r);
    assert.ok((await enviar('#pagarfatura xpto 10')).includes('cartões:'));
    // apagar uma parte do pagamento apaga as duas
    const extrato = await enviar('#extrato fatura');
    const numero = extrato.match(/(\d+)\. 🔴 [^\n]*pagamento fatura itau · \*R\$ 150,00/)[1];
    assert.ok((await enviar(`#apagar ${numero}`)).includes('as duas partes'));
    assert.ok((await enviar('#cartao remover nubank')).includes('removido'));
});

test('fixos e metas', async () => {
    assert.ok((await enviar('#fixo adicionar 50 academia dia 5')).includes('vence dia 5'));
    assert.ok((await enviar('#fixo listar')).includes('R$ 170,00/mês'));
    assert.ok((await enviar('#fixo pagar 2')).includes('academia (R$ 50,00) lançado'));
    assert.ok((await enviar('#fixo remover 2')).includes('academia'));
    assert.ok((await enviar('#meta adicionar 1000 baixa console novo')).includes('prioridade baixa'));
    const r = await enviar('#meta guardar 1 3000');
    assert.ok(r.includes('100%') && r.includes('meta batida'), r);
    const lista = await enviar('#meta listar');
    assert.ok(lista.indexOf('viagem') < lista.indexOf('console'), lista);
    assert.ok((await enviar('#meta remover 2')).includes('console'));
});

test('parcelado: uma parcela por mês, fatura atual e limite comprometido', async () => {
    const fin = require('../src/servicos/financas');
    const { mesAtual } = require('../src/util/formato');
    const r = await enviar('#despesa 300 picpay 3x eletronicos fone');
    assert.ok(r.includes('3x de R$ 100,00') && r.includes('total R$ 300,00'), r);
    // o picpay já tinha R$ 50 de um teste anterior
    assert.ok(r.includes('fatura picpay: R$ 150,00 (+ R$ 200,00 nos próximos meses)'), r);
    assert.ok(r.includes('limite livre: R$ 150,00 de R$ 500,00'), r);
    const extrato = await enviar('#extrato eletronicos');
    assert.ok(extrato.includes('fone (1/3)') && extrato.includes('fone (3/3)') && extrato.includes('🗓️'), extrato);
    // valores que não dividem certo: a última parcela fica com o resto
    const r2 = await enviar('#despesa 100 pix 3x curso ingles');
    assert.ok(r2.includes('3x de R$ 33,33') && r2.includes('parcelas agendadas: R$ 66,67'), r2);
    const numero = Number((await enviar('#extrato curso')).match(/(\d+)\. /)[1]);
    assert.ok((await enviar(`#apagar ${numero}`)).includes('as 3 parcelas'));
    assert.strictEqual(fin.somarMeses('2026-01-31', 1), '2026-02-28');
    assert.ok(mesAtual().length === 7);
    // limpa o parcelado do picpay para não mexer nos próximos testes
    const n = Number((await enviar('#extrato eletronicos')).match(/(\d+)\. /)[1]);
    await enviar(`#apagar ${n}`);
});

test('limite por categoria avisa em 80% e 100%', async () => {
    assert.ok((await enviar('#limite lazer 100')).includes('limite de *lazer*: R$ 100,00'));
    assert.ok(!(await enviar('#despesa 50 pix lazer cinema')).includes('limite'));
    assert.ok((await enviar('#despesa 35 pix lazer pipoca')).includes('chegou a 85% do limite'));
    assert.ok((await enviar('#despesa 20 pix lazer jogo')).includes('passou do limite'));
    assert.ok((await enviar('#limite')).includes('🚨 *lazer*'));
    assert.ok((await enviar('#saldo')).includes('🚨 lazer'));
    assert.ok((await enviar('#limite remover lazer')).includes('removido'));
});

test('gráfico do mês por categoria', async () => {
    const r = await enviar('#grafico 10/2026');
    assert.ok(r.includes('outubro/2026') && r.includes('jogo') && r.includes('fixos x variáveis'), r);
});

test('iagerente lança o que a IA entendeu', async () => {
    const original = ia.perguntarIA;
    ia.perguntarIA = async () => '<think>ok</think>```json\n[{"acao":"despesa","valor":45,"metodo":"pix","categoria":"ifood","data":"02/11/2026","descricao":"lanche"},'
        + '{"acao":"despesa","valor":120,"metodo":"credito","cartao":"picpay","categoria":"mercado","descricao":"compras"},'
        + '{"acao":"despesa","valor":600,"parcelas":3,"metodo":"credito","cartao":"itau","categoria":"casa","descricao":"cadeira"},'
        + '{"acao":"fixo","valor":40,"descricao":"spotify"},{"acao":"despesa","valor":"abc"}]\n```';
    try {
        const r = await enviar('#iagerente gastei 45 no ifood e 120 de mercado no picpay');
        assert.ok(r.includes('lanche') && r.includes('💳 picpay') && r.includes('spotify') && r.includes('ignorei'), r);
        assert.ok(r.includes('3x de R$ 200,00') && r.includes('fatura itau'), r);
    } finally {
        ia.perguntarIA = original;
    }
});

test('resetfin pede confirmação e guarda backup', async () => {
    assert.ok((await enviar('#resetfin')).includes('resetfin confirmar'));
    assert.ok((await enviar('#resetfin confirmar')).includes('apagado'));
    assert.ok((await enviar('#extrato')).includes('nenhum lançamento'));
    assert.ok((await enviar('#cartao')).includes('itau'), 'cartões continuam');
    assert.ok(fs.readdirSync(path.join(pasta, 'dados', 'backups')).length >= 1);
});

test('resetfin tudo zera a carteira; geral zera todas as conversas; backup vem antes', async () => {
    const grupo = { remoteJid: '120363000000000000@g.us', participant: EU_LID };
    await enviar('#fixo adicionar 10 teste');
    await enviar('#limite comida 300');
    assert.ok((await enviar('#resetfin')).includes('resetfin tudo confirmar'), 'sem confirmar, mostra as opções');
    assert.ok((await enviar('#resetfin tudo')).includes('para confirmar'));

    const bot = criarBot();
    await tratarMensagem(bot, mensagem('#resetfin tudo confirmar'));
    assert.ok(bot.enviadas[0].conteudo.fileName.startsWith('backup-assistente-'), 'manda o backup antes de apagar');
    assert.ok(bot.ultima().includes('zeradas') && bot.ultima().includes('1 limites'), bot.ultima());
    assert.ok((await enviar('#cartao')).includes('nenhum cartão'));
    assert.ok((await enviar('#fixo')).includes('nenhum gasto fixo'));
    assert.ok((await enviar('#limite')).includes('nenhum limite'));
    assert.ok((await enviar('#extrato', grupo)).includes('teste grupo'), 'a carteira do grupo continua');

    assert.ok((await enviar('#resetfin geral confirmar')).includes('conversa(s)'));
    assert.ok((await enviar('#extrato', grupo)).includes('nenhum lançamento'));
});

test('fixos x variáveis não conta duas vezes o fixo que já foi pago', () => {
    const conta = {
        cartoes: [], metas: [], limites: [],
        fixos: [{ descricao: 'aluguel', valor: 1000 }],
        transacoes: [
            { tipo: 'despesa', valor: 1000, metodo: 'conta', categoria: 'fixos', data: '2026-09-05', descricao: 'aluguel' },
            { tipo: 'despesa', valor: 500, metodo: 'pix', categoria: 'comida', data: '2026-09-10', descricao: 'mercado' },
        ],
    };
    const r = montarGrafico(conta, '2026-09');
    assert.ok(r.includes('fixos 67%') && r.includes('variáveis 33%'), r);
});
