// Traz os dados das versões antigas do bot para dados/financas.json (só roda uma vez).
// Os arquivos antigos não são apagados.
const fs = require('fs');
const path = require('path');
const { PASTA_LEGADO } = require('../config');
const { contaVazia, normalizarConta, mesclarContas } = require('./financas-modelo');

const ANTIGOS = {
    // versão com cartões, fixos e metas (src/data)
    financas: path.join(PASTA_LEGADO, 'src', 'data', 'finance.json'),
    fixos: path.join(PASTA_LEGADO, 'src', 'data', 'advanced_finance.json'),
    metas: path.join(PASTA_LEGADO, 'src', 'data', 'goals.json'),
    // primeira versão
    primeira: path.join(PASTA_LEGADO, 'database_finance.json'),
};

function lerJson(arquivo) {
    try {
        return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    } catch {
        return null;
    }
}

function haDadosAntigos() {
    return Object.values(ANTIGOS).some((arquivo) => fs.existsSync(arquivo));
}

// legado: conteúdo de dados/financas.json sem "versao" (formato { jid: { transacoes } })
function migrar(legado) {
    const brutas = {};
    const juntar = (jid, parte) => {
        brutas[jid] = brutas[jid] || contaVazia();
        for (const campo of ['transacoes', 'cartoes', 'fixos', 'metas']) {
            if (Array.isArray(parte[campo])) brutas[jid][campo].push(...parte[campo]);
        }
    };

    for (const fonte of [legado, lerJson(ANTIGOS.primeira), lerJson(ANTIGOS.financas)]) {
        if (!fonte || typeof fonte !== 'object') continue;
        for (const [jid, conta] of Object.entries(fonte)) {
            if (conta && typeof conta === 'object') juntar(jid, { transacoes: conta.transacoes, cartoes: conta.cartoes });
        }
    }
    for (const [jid, conta] of Object.entries(lerJson(ANTIGOS.fixos) || {})) {
        juntar(jid, { fixos: conta?.fixos });
    }
    for (const [jid, metas] of Object.entries(lerJson(ANTIGOS.metas) || {})) {
        juntar(jid, { metas: Array.isArray(metas) ? metas : [] });
    }

    const contas = {};
    for (const [jid, conta] of Object.entries(brutas)) {
        const normalizada = normalizarConta(conta);
        contas[jid] = contas[jid] ? mesclarContas(contas[jid], normalizada) : normalizada;
    }
    const total = Object.values(contas).reduce((soma, c) => soma + c.transacoes.length, 0);
    if (Object.keys(contas).length) {
        console.log(`📦 finanças antigas importadas: ${Object.keys(contas).length} conversa(s), ${total} lançamento(s).`);
    }
    return { versao: 3, contas };
}

module.exports = { migrar, haDadosAntigos };
