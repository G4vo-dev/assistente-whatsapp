// Pessoas que o dono liberou para usar o bot (além das que estão em PERMITIDOS no .env).
const { ler, salvar } = require('./armazenamento');
const { autorEhUmDos } = require('../util/mensagem');

const ARQUIVO = 'confiaveis.json';

function listar() {
    const dados = ler(ARQUIVO, []);
    return Array.isArray(dados) ? dados : [];
}

// "21 97777-6666" -> "5521977776666". Sem DDI, assume Brasil (55). Devolve null se não parecer um número.
function normalizarNumero(texto) {
    let n = String(texto || '').replace(/\D/g, '');
    if (n.length === 10 || n.length === 11) n = `55${n}`;
    return n.length >= 12 && n.length <= 15 ? n : null;
}

function adicionar(numero) {
    const lista = listar();
    if (lista.includes(numero)) return false;
    salvar(ARQUIVO, [...lista, numero]);
    return true;
}

function remover(numero) {
    const lista = listar();
    if (!lista.includes(numero)) return false;
    salvar(ARQUIVO, lista.filter((n) => n !== numero));
    return true;
}

function autorEhConfiavel(key) {
    const lista = listar();
    return lista.length > 0 && autorEhUmDos(key, lista);
}

module.exports = { listar, normalizarNumero, adicionar, remover, autorEhConfiavel };
