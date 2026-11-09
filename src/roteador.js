// Recebe cada mensagem, confere quem pode usar e chama o comando certo.
const config = require('./config');
const { encontrarComando, sugerirComando } = require('./comandos');
const { figurinhaAtiva } = require('./comandos/midia');
const { audioAutomatico } = require('./comandos/assistente');
const { enviar, foiEnviadaPeloBot } = require('./envio');
const { conteudoDa, textoDo, temMidia, autorEhUmDos, numerosDoAutor } = require('./util/mensagem');
const { carteiraDa } = require('./carteira');
const avisos = require('./servicos/avisos');

// Você (mensagens que saem do seu WhatsApp) sempre pode. Outras pessoas só se estiverem no PERMITIDOS do .env.
function podeUsar(msg) {
    if (msg.key.fromMe) return true;
    if (config.LIBERADO_PARA_TODOS) return true;
    return config.NUMEROS_PERMITIDOS.length > 0 && autorEhUmDos(msg.key, config.NUMEROS_PERMITIDOS);
}

function separarComando(texto) {
    const corpo = texto.slice(config.PREFIXO.length).trimStart();
    const nome = corpo.split(/\s+/)[0] || '';
    const resto = corpo.slice(nome.length).trim();
    return { nome, resto, args: resto ? resto.split(/\s+/) : [] };
}

function criarContexto(bot, msg, conteudo, { resto = '', args = [], automatico = false } = {}) {
    const jid = msg.key.remoteJid;
    return {
        bot,
        msg,
        conteudo,
        jid,
        args,
        texto: resto,
        prefixo: config.PREFIXO,
        automatico,
        conta: carteiraDa(bot, msg.key),
        responder(resposta, { citar = false } = {}) {
            const corpo = typeof resposta === 'string' ? { text: resposta } : resposta;
            return enviar(bot, jid, corpo, citar ? { quoted: msg } : {});
        },
        reagir(emoji) {
            return enviar(bot, jid, { react: { text: emoji, key: msg.key } }).catch(() => {});
        },
    };
}

async function rodar(comando, ctx) {
    console.log(`▶️ ${config.PREFIXO}${comando.nome}${ctx.texto ? ' ' + ctx.texto : ''}${ctx.automatico ? ' (modo figurinha)' : ''}`);
    try {
        await comando.executar(ctx);
    } catch (erro) {
        console.error(`❌ erro no ${config.PREFIXO}${comando.nome}:`, erro);
        await ctx.reagir('❌');
        await ctx.responder(`❌ deu erro no ${config.PREFIXO}${comando.nome}: ${erro.message}`).catch(() => {});
    }
}

async function tratarMensagem(bot, msg) {
    if (!msg.message || !msg.key?.remoteJid) return;
    if (msg.key.remoteJid === 'status@broadcast' || foiEnviadaPeloBot(msg.key.id)) return;
    if (!podeUsar(msg)) return;

    const conteudo = conteudoDa(msg);
    const texto = textoDo(conteudo).trim();

    if (!texto.startsWith(config.PREFIXO)) {
        // modo figurinha: foto/vídeo logo depois de um #s vira figurinha
        if (temMidia(conteudo) && figurinhaAtiva(msg.key.remoteJid)) {
            await rodar(encontrarComando('s'), criarContexto(bot, msg, conteudo, { automatico: true }));
            return;
        }
        // áudio na conversa com você mesmo: transcreve e lança se for gasto/ganho
        if (conteudo?.audioMessage && msg.key.fromMe && config.AUDIO_AUTOMATICO) {
            const ctx = criarContexto(bot, msg, conteudo, { automatico: true });
            if (ctx.conta.chave === 'eu') {
                await rodar({ nome: 'audio automático', executar: audioAutomatico }, ctx);
            }
        }
        return;
    }

    const { nome, resto, args } = separarComando(texto);
    if (!nome) return;
    const ctx = criarContexto(bot, msg, conteudo, { resto, args });

    const comando = encontrarComando(nome);
    if (!comando) {
        // fora da conversa com você mesmo, "#tbt" ou "#sextou" é hashtag, não comando: não responde
        if (ctx.conta.chave !== 'eu') return;
        const parecido = sugerirComando(nome);
        const dica = parecido ? `você quis dizer *${config.PREFIXO}${parecido.nome}*? ` : '';
        return ctx.responder(`🤔 não conheço *${config.PREFIXO}${nome}*. ${dica}mande *${config.PREFIXO}menu* para ver os comandos.`);
    }

    // quem não é o dono recebe uma vez o aviso de privacidade (LGPD)
    const autor = numerosDoAutor(msg.key)[0];
    if (!msg.key.fromMe && autor && avisos.primeiraVez(`privacidade:${autor}`)) {
        await ctx.responder(avisos.PRIVACIDADE_PARA_OUTROS);
    }

    if (comando.soDono && !msg.key.fromMe) {
        return ctx.responder(`🔒 só o dono do bot pode usar o ${config.PREFIXO}${comando.nome}.`);
    }
    await rodar(comando, ctx);
}

module.exports = { tratarMensagem };
