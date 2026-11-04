// Envia mensagens e lembra o ID delas, para o bot nunca responder a si mesmo.
const { generateMessageIDV2 } = require('@whiskeysockets/baileys');

const enviadas = new Set();

function foiEnviadaPeloBot(id) {
    return enviadas.has(id);
}

function guardar(id) {
    enviadas.add(id);
    if (enviadas.size > 1000) enviadas.delete(enviadas.values().next().value);
}

// O ID é criado antes de enviar porque o WhatsApp devolve a própria mensagem na hora.
async function enviar(bot, jid, conteudo, opcoes = {}) {
    const messageId = generateMessageIDV2(bot.user?.id);
    guardar(messageId);
    return bot.sendMessage(jid, conteudo, { ...opcoes, messageId });
}

module.exports = { enviar, foiEnviadaPeloBot };
