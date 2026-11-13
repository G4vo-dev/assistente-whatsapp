// Anotações e listas de cada conversa (ficam em dados/notas.json).
const { ler, salvar } = require('./armazenamento');
const { normalizar } = require('../util/formato');

const ARQUIVO = 'notas.json';

function todas() {
    return ler(ARQUIVO, {});
}

function doChat(tudo, chave) {
    if (!tudo[chave]) tudo[chave] = { notas: [], listas: {} };
    tudo[chave].notas ||= [];
    tudo[chave].listas ||= {};
    return tudo[chave];
}

// Lê, deixa o chamador mexer e salva.
function mexer(chave, funcao) {
    const tudo = todas();
    const resultado = funcao(doChat(tudo, chave));
    salvar(ARQUIVO, tudo);
    return resultado;
}

function ver(chave) {
    return doChat(todas(), chave);
}

function nomeDaLista(texto) {
    return normalizar(texto).replace(/[^a-z0-9_-]/g, '');
}

// "leite, pão\novos" -> ["leite", "pão", "ovos"]
function separarItens(texto) {
    return String(texto || '').split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
}

function exportar() {
    return todas();
}

function importar(dados) {
    salvar(ARQUIVO, dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {});
}

module.exports = { mexer, ver, nomeDaLista, separarItens, exportar, importar };
