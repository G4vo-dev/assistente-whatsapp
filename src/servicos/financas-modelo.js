// Formato dos dados de finanças e conversão dos formatos antigos.
const { arredondar, normalizar, lerData, isoDoDia } = require('../util/formato');
const { novoId } = require('../util/id');

function contaVazia() {
    return { transacoes: [], cartoes: [], fixos: [], metas: [], limites: [] };
}

// Garante que contas salvas por versões anteriores tenham todos os campos.
function completarConta(conta) {
    for (const campo of ['transacoes', 'cartoes', 'fixos', 'metas', 'limites']) {
        if (!Array.isArray(conta[campo])) conta[campo] = [];
    }
    return conta;
}

const METODOS = {
    pix: 'pix',
    debito: 'debito',
    credito: 'credito',
    dinheiro: 'dinheiro',
    especie: 'dinheiro',
    boleto: 'boleto',
    ted: 'transferencia',
    doc: 'transferencia',
    transferencia: 'transferencia',
    vale: 'vale',
    va: 'vale',
    vr: 'vale',
    conta: 'conta',
};

function metodoConhecido(texto) {
    return METODOS[normalizar(texto)] || null;
}

function acharCartao(cartoes, nome) {
    const alvo = normalizar(nome);
    return alvo ? cartoes.find((c) => normalizar(c.nome) === alvo) || null : null;
}

// Converte datas antigas ("15/10", "15/10/26", ISO) para AAAA-MM-DD.
function dataParaISO(data, referencia) {
    const ref = referencia ? new Date(referencia) : null;
    const anoRef = ref && !Number.isNaN(ref.getTime()) ? ref.getFullYear() : undefined;
    if (/^\d{4}-\d{2}-\d{2}/.test(data || '')) {
        return data.length > 10 ? isoDoDia(new Date(data)) : data;
    }
    const lida = data ? lerData(data, anoRef) : null;
    if (lida) return lida;
    return isoDoDia(ref && !Number.isNaN(ref.getTime()) ? ref : new Date());
}

function normalizarTransacao(t) {
    const criadoEm = t.criadoEm || t.timestamp || (/^\d{4}-\d{2}-\d{2}T/.test(t.data || '') ? t.data : new Date().toISOString());
    let metodo = normalizar(t.metodo) || 'conta';
    let cartao = t.cartao ? normalizar(t.cartao) : null;
    if (metodo.startsWith('credito-')) {
        cartao = cartao || metodo.slice('credito-'.length);
        metodo = 'credito';
    }
    return {
        id: t.id || novoId(),
        tipo: t.tipo === 'receita' ? 'receita' : 'despesa',
        valor: arredondar(t.valor),
        metodo: metodoConhecido(metodo) || metodo,
        cartao: metodo === 'credito' ? cartao : null,
        categoria: String(t.categoria || 'outros').toLowerCase(),
        data: dataParaISO(t.data, criadoEm),
        descricao: String(t.descricao || '').trim() || (t.tipo === 'receita' ? 'receita' : 'despesa'),
        criadoEm,
        ...(t.vinculo ? { vinculo: t.vinculo } : {}),
        ...(t.parcela?.total > 1 ? { parcela: { atual: Number(t.parcela.atual), total: Number(t.parcela.total) } } : {}),
    };
}

// Remove lançamentos repetidos (o mesmo arquivo antigo pode ter sido copiado duas vezes).
function semRepetidos(transacoes) {
    const vistos = new Set();
    return transacoes.filter((t) => {
        const chave = `${t.tipo}|${t.valor}|${t.descricao}|${t.criadoEm}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

function normalizarConta(conta = {}) {
    return {
        transacoes: semRepetidos((conta.transacoes || []).filter((t) => Number(t.valor) > 0).map(normalizarTransacao)),
        cartoes: (conta.cartoes || []).map((c) => ({ nome: String(c.nome).toLowerCase(), limite: arredondar(c.limite || 0) })),
        fixos: (conta.fixos || []).map((f) => ({
            descricao: String(f.descricao || 'fixo'),
            valor: arredondar(f.valor || 0),
            ...(f.dia ? { dia: Number(f.dia) } : {}),
        })),
        metas: (conta.metas || []).map((m) => ({
            titulo: String(m.titulo || 'meta'),
            valorAlvo: arredondar(m.valorAlvo || 0),
            guardado: arredondar(m.guardado || 0),
            prioridade: normalizar(m.prioridade) || 'media',
            criadaEm: m.criadaEm || m.dataCriacao || new Date().toISOString(),
        })),
        limites: (conta.limites || []).map((l) => ({ categoria: String(l.categoria).toLowerCase(), valor: arredondar(l.valor || 0) })),
    };
}

// Junta duas contas (ex.: a mesma pessoa salva com o número e com o @lid).
function mesclarContas(a, b) {
    const ids = new Set(a.transacoes.map((t) => t.id));
    const transacoes = [...a.transacoes, ...b.transacoes.filter((t) => !ids.has(t.id))]
        .sort((x, y) => String(x.criadoEm).localeCompare(String(y.criadoEm)));
    const cartoes = [...a.cartoes];
    for (const c of b.cartoes) if (!cartoes.some((x) => normalizar(x.nome) === normalizar(c.nome))) cartoes.push(c);
    const limites = [...(a.limites || [])];
    for (const l of b.limites || []) if (!limites.some((x) => normalizar(x.categoria) === normalizar(l.categoria))) limites.push(l);
    return { transacoes, cartoes, fixos: [...a.fixos, ...b.fixos], metas: [...a.metas, ...b.metas], limites };
}

module.exports = { contaVazia, completarConta, metodoConhecido, acharCartao, normalizarTransacao, normalizarConta, mesclarContas };
