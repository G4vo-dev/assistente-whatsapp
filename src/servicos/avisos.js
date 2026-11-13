// Avisos que o bot mostra uma única vez (ex.: privacidade para quem não é o dono).
const { ler, salvar } = require('./armazenamento');
const { PREFIXO } = require('../config');

const ARQUIVO = 'avisos.json';

function jaMostrado(chave) {
    return Boolean(ler(ARQUIVO, {})[chave]);
}

function marcar(chave) {
    const dados = ler(ARQUIVO, {});
    dados[chave] = new Date().toISOString();
    salvar(ARQUIVO, dados);
}

// Devolve true na primeira vez (e marca), false nas seguintes.
function primeiraVez(chave) {
    if (jaMostrado(chave)) return false;
    marcar(chave);
    return true;
}

const PRIVACIDADE_PARA_OUTROS = 'ℹ️ *antes de usar:* este é um bot pessoal. o que você manda aqui pode ser guardado neste aparelho '
    + 'e processado por serviços de IA de terceiros (Groq, Google, Mistral, OpenRouter), que podem estar fora do Brasil. '
    + `não mande dados de outras pessoas sem autorização. detalhes e como apagar seus dados: ${PREFIXO}privacidade\n`
    + `🔑 quer usar a IA com a sua própria chave (grátis)? ${PREFIXO}chave`;

module.exports = { primeiraVez, jaMostrado, marcar, PRIVACIDADE_PARA_OUTROS };
