// Palavras aceitas para "adicionar" e "remover" nos comandos com subcomando (#cartao, #fixo, #meta, #limite).
const { normalizar } = require('../util/formato');

const ADICIONAR = ['adicionar', 'add', 'novo', 'nova', 'criar'];
const REMOVER = ['remover', 'apagar', 'excluir', 'del', 'rm'];

const ehAdicionar = (palavra) => ADICIONAR.includes(normalizar(palavra));
const ehRemover = (palavra) => REMOVER.includes(normalizar(palavra));

module.exports = { ehAdicionar, ehRemover };
