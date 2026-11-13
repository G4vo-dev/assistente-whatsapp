// Entende o que a pessoa quer mudar no #editar ("12 mercado", "3-7 valor 45,90", "12 nubank"...).
const fin = require('./financas');
const { metodoConhecido } = require('./financas-modelo');
const { reais, lerValor, lerData, dataCurta, normalizar } = require('../util/formato');

// "3" -> [3], "3,5" -> [3, 5], "3-6" -> [3, 4, 5, 6], "3,8-10" -> [3, 8, 9, 10]. Devolve null se não for uma lista.
function lerNumeros(texto) {
    if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(String(texto || ''))) return null;
    const numeros = [];
    for (const parte of texto.split(',')) {
        const [de, ate = de] = parte.split('-').map(Number);
        for (let n = Math.min(de, ate); n <= Math.max(de, ate) && numeros.length < 100; n++) if (!numeros.includes(n)) numeros.push(n);
    }
    return numeros;
}

const CAMPOS = {
    valor: 'valor', v: 'valor', preco: 'valor',
    categoria: 'categoria', cat: 'categoria', tag: 'categoria',
    descricao: 'descricao', desc: 'descricao', nome: 'descricao',
    data: 'data', dia: 'data',
    tipo: 'tipo',
    metodo: 'metodo', forma: 'metodo', pagamento: 'metodo',
    cartao: 'cartao',
};
const TIPOS = { receita: 'receita', entrada: 'receita', ganho: 'receita', despesa: 'despesa', gasto: 'despesa', saida: 'despesa' };
const PALAVRAS_SOLTAS = ['para', 'pra', 'como', 'e', '=', '->', '→'];

// Lê o valor de um campo dito com palavra-chave ("valor 45,90"). Devolve null se deu certo ou o texto do erro.
function lerCampo(campo, palavra, m, usarCartao) {
    if (campo === 'valor') {
        m.valor = lerValor(palavra);
        return m.valor > 0 ? null : `"${palavra}" não é um valor. ex: valor 45,90`;
    }
    if (campo === 'data') {
        m.data = lerData(palavra);
        return m.data ? null : `"${palavra}" não é uma data. ex: data 15/11`;
    }
    if (campo === 'tipo') {
        m.tipo = TIPOS[normalizar(palavra)];
        return m.tipo ? null : 'o tipo é receita ou despesa.';
    }
    if (campo === 'cartao') return usarCartao(palavra) ? null : `não achei o cartão "${palavra}".`;
    if (campo === 'metodo') {
        m.metodo = metodoConhecido(palavra);
        return m.metodo ? null : `não conheço o método "${palavra}". use pix, debito, credito, dinheiro, boleto ou transferencia.`;
    }
    m.categoria = normalizar(palavra);
    return null;
}

// Com palavra-chave ("valor 45,90", "categoria mercado", "descricao padaria do zé") ou direto: valor (45,90),
// data (15/11), tipo (receita), método (pix), cartão (nubank); a primeira palavra que sobrar vira a categoria
// e o resto vira a descrição. Devolve { mudancas } ou { erro }.
function lerMudancas(partes, cartoes, prefixo = '#') {
    const m = {};
    const soltas = [];
    const usarCartao = (nome) => {
        const cartao = fin.acharCartao({ cartoes }, nome);
        if (!cartao) return false;
        m.metodo = 'credito';
        m.cartao = cartao.nome;
        return true;
    };
    for (let i = 0; i < partes.length; i++) {
        const palavra = partes[i];
        const chave = normalizar(palavra);
        if (PALAVRAS_SOLTAS.includes(chave)) continue;
        const campo = CAMPOS[chave];
        if (campo) {
            const depois = partes.slice(i + 1);
            const resto = depois.filter((x) => !PALAVRAS_SOLTAS.includes(normalizar(x)));
            if (!resto[0]) return { erro: `faltou dizer o novo ${campo === 'descricao' ? 'texto' : campo}.` };
            if (campo === 'descricao') {
                m.descricao = resto.join(' ');
                break;
            }
            const erro = lerCampo(campo, resto[0], m, usarCartao);
            if (erro) return { erro };
            i += depois.indexOf(resto[0]) + 1;
            continue;
        }
        if (m.valor === undefined && lerValor(palavra) > 0) m.valor = lerValor(palavra);
        else if (!m.data && lerData(palavra)) m.data = lerData(palavra);
        else if (!m.tipo && TIPOS[chave]) m.tipo = TIPOS[chave];
        else if (!m.metodo && metodoConhecido(palavra)) m.metodo = metodoConhecido(palavra);
        else if (m.cartao || !usarCartao(palavra)) soltas.push(palavra);
    }
    if (soltas.length && !m.categoria) m.categoria = normalizar(soltas.shift());
    if (soltas.length && !m.descricao) m.descricao = soltas.join(' ');
    if (m.metodo === 'credito' && !m.cartao) {
        if (cartoes.length === 1) m.cartao = cartoes[0].nome;
        else if (!cartoes.length) return { erro: `cadastre o cartão antes: ${prefixo}cartao adicionar [nome] [limite]` };
        else return { erro: `de qual cartão? (${cartoes.map((c) => c.nome).join(', ')}) ex: credito ${cartoes[0].nome}` };
    }
    if (!Object.keys(m).length) return { erro: 'não entendi o que mudar.' };
    return { mudancas: m };
}

// ["categoria outros → mercado", ...] para cada campo que mudou.
function oQueMudou(antes, depois) {
    const formas = (t) => (t.metodo === 'credito' ? `crédito ${t.cartao || '?'}` : t.metodo);
    const campos = [
        ['valor', (t) => reais(t.valor)],
        ['data', (t) => dataCurta(t.data)],
        ['tipo', (t) => t.tipo],
        ['forma', formas],
        ['categoria', (t) => t.categoria],
        ['descrição', (t) => t.descricao],
    ];
    return campos.filter(([, ler]) => ler(antes) !== ler(depois)).map(([nome, ler]) => `${nome} ${ler(antes)} → ${ler(depois)}`);
}

module.exports = { lerNumeros, lerMudancas, oQueMudou };
