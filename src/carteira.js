// Qual carteira de finanças usar: a conversa com você mesmo é "eu"; cada outra conversa (ou grupo) tem a sua.
const { NUMERO_DONO } = require('./config');
const { numeroDoJid, jidSemAparelho, variantesDoNumero } = require('./util/mensagem');

// Todos os IDs que são "você": número, @lid e o NUMERO_DONO do .env.
function meusNumeros(bot) {
    const meus = [bot.user?.id, bot.user?.lid].filter(Boolean).map(numeroDoJid);
    if (NUMERO_DONO) meus.push(...variantesDoNumero(NUMERO_DONO));
    return meus;
}

function carteiraPropria(bot) {
    return { chave: 'eu', aliases: meusNumeros(bot) };
}

function carteiraDa(bot, key) {
    const meus = meusNumeros(bot);
    const doChat = [key.remoteJid, key.remoteJidAlt].filter(Boolean).map(numeroDoJid);
    if (doChat.some((n) => meus.includes(n))) return { chave: 'eu', aliases: meus };
    return { chave: jidSemAparelho(key.remoteJid), aliases: doChat };
}

// Para onde mandar mensagens automáticas: a conversa com você mesmo.
function meuJid(bot) {
    return bot.user?.id ? jidSemAparelho(bot.user.id) : null;
}

module.exports = { carteiraDa, carteiraPropria, meuJid };
