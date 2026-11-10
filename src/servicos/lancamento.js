// Entende o que foi digitado em #receita / #despesa.
// Formato: [valor] [método] [cartão] [parcelas] [categoria] [data] [descrição] — só o valor é obrigatório.
const { lerValor, lerData, normalizar } = require('../util/formato');
const { metodoConhecido, acharCartao } = require('./financas-modelo');

// Devolve { valor, metodo, cartao, parcelas, categoria, data, descricao } ou { erro, ... }.
function interpretarLancamento(args, cartoes, tipo) {
    const partes = [...args];
    const valor = lerValor(partes.shift());
    if (!(valor > 0)) return { erro: 'valor' };

    // a data pode vir em qualquer lugar: 15/10, 15/10/2026, hoje, ontem
    let data = null;
    const posicaoData = partes.findIndex((p) => lerData(p));
    if (posicaoData !== -1) data = lerData(partes.splice(posicaoData, 1)[0]);

    // parcelas em qualquer lugar: 4x, 10x, "em 3x"
    let parcelas = 1;
    const posicaoParcelas = partes.findIndex((p) => /^\d{1,2}x$/i.test(p));
    if (posicaoParcelas !== -1) {
        parcelas = parseInt(partes[posicaoParcelas], 10);
        if (parcelas < 1 || parcelas > 48) return { erro: 'parcelas' };
        const inicio = normalizar(partes[posicaoParcelas - 1]) === 'em' ? posicaoParcelas - 1 : posicaoParcelas;
        partes.splice(inicio, posicaoParcelas - inicio + 1);
    }

    let metodo = 'conta';
    let cartao = null;
    const metodoDigitado = metodoConhecido(partes[0]);
    if (metodoDigitado) {
        metodo = metodoDigitado;
        partes.shift();
    } else if (acharCartao(cartoes, partes[0])) {
        // "#despesa 50 itau ..." = crédito no cartão itau
        metodo = 'credito';
    }

    if (metodo === 'credito') {
        const escolhido = acharCartao(cartoes, partes[0]);
        if (escolhido) {
            cartao = escolhido.nome;
            partes.shift();
        } else if (cartoes.length === 1) {
            cartao = cartoes[0].nome;
        } else {
            return { erro: cartoes.length ? 'qual_cartao' : 'sem_cartao' };
        }
    }

    // 2+ palavras: a primeira é a categoria. 1 palavra: vale como categoria e descrição.
    let categoria = 'outros';
    let descricao = tipo;
    if (partes.length >= 2) {
        categoria = partes.shift().toLowerCase();
        descricao = partes.join(' ');
    } else if (partes.length === 1) {
        categoria = partes[0].toLowerCase();
        descricao = partes[0];
    }

    return { valor, metodo, cartao, parcelas, categoria, data, descricao };
}

module.exports = { interpretarLancamento };
