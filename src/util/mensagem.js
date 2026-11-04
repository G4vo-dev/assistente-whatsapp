// Ajuda a ler as mensagens que chegam do WhatsApp.
const { normalizeMessageContent } = require('@whiskeysockets/baileys');

// Tira os "envelopes" (mensagem temporária, visualização única etc.) e devolve o conteúdo.
function conteudoDa(msg) {
    return normalizeMessageContent(msg.message);
}

function textoDo(conteudo) {
    if (!conteudo) return '';
    return conteudo.conversation
        || conteudo.extendedTextMessage?.text
        || conteudo.imageMessage?.caption
        || conteudo.videoMessage?.caption
        || conteudo.documentMessage?.caption
        || '';
}

function citadaDo(conteudo) {
    const info = conteudo?.extendedTextMessage?.contextInfo
        || conteudo?.imageMessage?.contextInfo
        || conteudo?.videoMessage?.contextInfo
        || conteudo?.stickerMessage?.contextInfo;
    if (!info?.quotedMessage) return null;
    return { info, conteudo: normalizeMessageContent(info.quotedMessage) };
}

function temMidia(conteudo) {
    return Boolean(conteudo?.imageMessage || conteudo?.videoMessage);
}

// Acha a mídia de um dos tipos pedidos na própria mensagem ou na mensagem respondida.
// Devolve { mensagem, tipo, info } pronto para baixar, ou null.
function acharMidia(msg, conteudo, tipos) {
    const tipoProprio = tipos.find((t) => conteudo?.[t]);
    if (tipoProprio) return { mensagem: msg, tipo: tipoProprio, info: conteudo[tipoProprio] };
    const citada = citadaDo(conteudo);
    const tipoCitado = citada && tipos.find((t) => citada.conteudo?.[t]);
    if (!tipoCitado) return null;
    return {
        mensagem: {
            key: { remoteJid: msg.key.remoteJid, id: citada.info.stanzaId, participant: citada.info.participant },
            message: citada.conteudo,
        },
        tipo: tipoCitado,
        info: citada.conteudo[tipoCitado],
    };
}

// "5511999999999:12@s.whatsapp.net" -> "5511999999999"
function numeroDoJid(jid) {
    return String(jid || '').split('@')[0].split(':')[0];
}

// "5511999999999:12@s.whatsapp.net" -> "5511999999999@s.whatsapp.net"
function jidSemAparelho(jid) {
    const [usuario, servidor] = String(jid || '').split('@');
    return `${usuario.split(':')[0]}@${servidor || 's.whatsapp.net'}`;
}

// Números brasileiros às vezes aparecem sem o 9 na frente (5511912345678 vira 551112345678).
function variantesDoNumero(numero) {
    const variantes = [numero];
    if (/^55\d{2}9\d{8}$/.test(numero)) variantes.push(numero.slice(0, 4) + numero.slice(5));
    if (/^55\d{2}[2-8]\d{7}$/.test(numero)) variantes.push(numero.slice(0, 4) + '9' + numero.slice(4));
    return variantes;
}

// Quem mandou a mensagem: em grupo é o participante, em conversa privada é o próprio chat.
// No WhatsApp novo pode vir um ID anônimo (@lid) e o número real no campo "Alt".
function numerosDoAutor(key) {
    const jids = key.remoteJid?.endsWith('@g.us')
        ? [key.participant, key.participantAlt]
        : [key.remoteJid, key.remoteJidAlt];
    return jids.filter(Boolean).map(numeroDoJid);
}

function autorEhUmDos(key, numeros) {
    const aceitos = numeros.flatMap(variantesDoNumero);
    return numerosDoAutor(key).some((n) => aceitos.includes(n));
}

module.exports = {
    conteudoDa, textoDo, citadaDo, temMidia, acharMidia,
    numeroDoJid, jidSemAparelho, variantesDoNumero, autorEhUmDos, numerosDoAutor,
};
