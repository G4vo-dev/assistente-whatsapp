// Envia mensagens e lembra o ID delas, para o bot nunca responder a si mesmo.
const { generateMessageIDV2 } = require('@whiskeysockets/baileys');

// id -> conteúdo da mensagem (null enquanto ainda está sendo enviada)
const enviadas = new Map();
const LIMITE = 500;

function foiEnviadaPeloBot(id) {
    return enviadas.has(id);
}

function guardar(id, conteudo = null) {
    enviadas.delete(id);
    enviadas.set(id, conteudo);
    if (enviadas.size > LIMITE) enviadas.delete(enviadas.keys().next().value);
}

// Quando o seu celular não consegue abrir uma mensagem do bot, ele pede para reenviar.
// Sem o conteúdo guardado aqui, fica "Aguardando mensagem" por muito tempo.
function mensagemEnviada(id) {
    return enviadas.get(id) || undefined;
}

// O ID é criado antes de enviar porque o WhatsApp devolve a própria mensagem na hora.
async function enviar(bot, jid, conteudo, opcoes = {}) {
    const messageId = generateMessageIDV2(bot.user?.id);
    guardar(messageId);
    const enviada = await bot.sendMessage(jid, conteudo, { ...opcoes, messageId });
    if (enviada?.message) guardar(messageId, enviada.message);
    return enviada;
}

module.exports = { enviar, foiEnviadaPeloBot, mensagemEnviada };
