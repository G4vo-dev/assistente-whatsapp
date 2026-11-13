// Conecta no WhatsApp, mostra o código de pareamento e reconecta sozinho quando a conexão cai.
const readline = require('readline');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    proto,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { PASTA_AUTH, NUMERO_DONO, PREFIXO } = require('./config');
const { tratarMensagem } = require('./roteador');
const { enviar, mensagemEnviada } = require('./envio');
const estado = require('./estado');
const { meuJid, carteiraDa } = require('./carteira');
const lembretes = require('./servicos/lembretes');
const agenda = require('./agenda');

const MAX_ATRASO_SEGUNDOS = 120; // mensagens que chegam atrasadas (bot estava offline) até 2 min ainda valem
// códigos de saída que avisam o scripts/iniciar.sh para não ficar religando
const SAIDA = { PRECISA_PAREAR: 2, OUTRA_COPIA: 3 };
let tentativas = 0;

// Dados dos grupos guardados: sem isso, cada resposta num grupo pergunta ao WhatsApp quem está no grupo antes de enviar.
const grupos = new Map();

function perguntar(texto) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(texto, (resposta) => { rl.close(); resolve(resposta); }));
}

async function numeroParaParear() {
    // ligado sozinho (Termux:Boot): não tem como digitar nem ver o código
    if (!process.stdin.isTTY) {
        console.log('🔑 o bot precisa ser pareado: abra o Termux e rode npm start');
        process.exit(SAIDA.PRECISA_PAREAR);
    }
    if (NUMERO_DONO) return NUMERO_DONO;
    const digitado = await perguntar('\n📱 digite seu número com DDI e DDD (ex: 5511999999999): ');
    return digitado.replace(/\D/g, '');
}

function recente(msg) {
    const enviadoEm = Number(msg.messageTimestamp) || 0;
    return Date.now() / 1000 - enviadoEm <= MAX_ATRASO_SEGUNDOS;
}

// Mensagem "trancada": chegou, mas a chave de criptografia estava velha e o bot não conseguiu abrir.
// O Baileys pede para o celular mandar de novo. Se em 20 s ela não chegar aberta, o bot avisa na
// conversa com você mesmo, para você não ficar esperando uma resposta que não vem.
const SEGUNDOS_ESPERANDO_REENVIO = 20;
const trancadas = new Map(); // id -> timer
let ultimoAvisoTrancada = 0;

function mensagemTrancada(sock, msg) {
    if (msg.message || msg.messageStubType !== proto.WebMessageInfo.StubType.CIPHERTEXT) return false;
    const id = msg.key?.id;
    console.log('🔒 chegou uma mensagem que não consegui abrir; pedi para o celular mandar de novo');
    if (!id || !msg.key.fromMe || trancadas.has(id) || carteiraDa(sock, msg.key).chave !== 'eu') return true;
    trancadas.set(id, setTimeout(() => {
        trancadas.delete(id);
        console.log('🔒 o celular não reenviou a mensagem trancada');
        const destino = meuJid(sock);
        if (!destino || Date.now() - ultimoAvisoTrancada < 2 * 60 * 1000) return;
        ultimoAvisoTrancada = Date.now();
        enviar(sock, destino, { text: '🔒 recebi uma mensagem sua, mas o WhatsApp não deixou eu abrir (chave de criptografia trocada). mande de novo, por favor.' }).catch(() => {});
    }, SEGUNDOS_ESPERANDO_REENVIO * 1000));
    return true;
}

// A mensagem trancada chegou aberta (o celular reenviou): cancela o aviso.
function destrancou(msg) {
    const timer = msg.message && trancadas.get(msg.key?.id);
    if (!timer) return;
    clearTimeout(timer);
    trancadas.delete(msg.key.id);
    console.log('🔓 o celular reenviou a mensagem; abrindo agora');
}

// DEBUG_MSG=1 npm start: uma linha por mensagem que chega, para saber se ela chegou ao bot.
// Mostra só o começo do texto (para achar o comando), nunca a mensagem inteira.
function depurar(type, msg) {
    if (!process.env.DEBUG_MSG) return;
    const jid = String(msg.key?.remoteJid || '?');
    const onde = jid.endsWith('@g.us') ? 'grupo' : jid.endsWith('@lid') ? 'privado(lid)' : jid.endsWith('@s.whatsapp.net') ? 'privado(número)' : jid;
    const tipo = msg.message ? Object.keys(msg.message).filter((k) => k !== 'messageContextInfo').join(',') : `sem conteúdo (stub ${msg.messageStubType ?? '-'})`;
    let texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    // nunca mostra chave de IA (#chave ...) no log
    if (/^\W?\s*(chave|chaves|minhachave|apikey)\b/i.test(texto)) texto = '(chave escondida)';
    const atraso = Math.round(Date.now() / 1000 - (Number(msg.messageTimestamp) || 0));
    console.log(`🔎 ${type} · ${msg.key?.fromMe ? 'você' : 'outra pessoa'} · ${onde} · ${tipo} · ${atraso}s${texto ? ` · "${texto.slice(0, 12)}"` : ''}`);
}

// Mostra no log quando o WhatsApp entregou a mensagem com atraso (problema de internet ou do celular, não do bot).
// Mensagens internas que o celular manda ao conectar (chaves, sincronização) ficam de fora.
function avisarAtraso(msg) {
    const enviadoEm = Number(msg.messageTimestamp) || 0;
    const atraso = enviadoEm ? Math.round(Date.now() / 1000 - enviadoEm) : 0;
    if (!msg.message || msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) return;
    if (atraso >= 10) console.log(`🐢 mensagem chegou ao bot ${atraso}s depois de enviada`);
}

// Guarda os dados de um grupo quando o bot precisa deles (o Baileys pede pelo cachedGroupMetadata).
async function lembrarGrupo(sock, jid) {
    if (!jid?.endsWith('@g.us') || grupos.has(jid)) return;
    try {
        grupos.set(jid, await sock.groupMetadata(jid));
    } catch { /* tenta de novo na próxima */ }
}

// O que fazer quando a conexão cai, pelo código que o WhatsApp mandou.
function aoCair(codigo) {
    if (codigo === DisconnectReason.loggedOut) {
        return { sair: SAIDA.PRECISA_PAREAR, aviso: '🚪 o WhatsApp desconectou este aparelho. apague a pasta auth_info_baileys e rode de novo para parear.' };
    }
    if (codigo === DisconnectReason.connectionReplaced) {
        return { sair: SAIDA.OUTRA_COPIA, aviso: '⛔ outra cópia do bot conectou com esta mesma sessão (em outra pasta ou outro aparelho). deixe só uma ligada.' };
    }
    return { reconectar: true };
}

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
    const numero = state.creds.registered ? null : await numeroParaParear();
    const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        // false = o celular continua recebendo notificações normalmente
        markOnlineOnConnect: false,
        getMessage: async (key) => mensagemEnviada(key.id),
        cachedGroupMetadata: async (jid) => {
            await lembrarGrupo(sock, jid);
            return grupos.get(jid);
        },
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('groups.update', (mudancas) => {
        for (const g of mudancas) if (g.id && grupos.has(g.id)) grupos.set(g.id, { ...grupos.get(g.id), ...g });
    });
    // entrou ou saiu alguém: busca de novo na próxima vez
    sock.ev.on('group-participants.update', ({ id }) => grupos.delete(id));

    let pediuCodigo = false;
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        // Ainda não pareado: pede o código assim que o WhatsApp estiver pronto.
        if (qr && numero && !pediuCodigo && !sock.authState.creds.registered) {
            pediuCodigo = true;
            try {
                const codigo = await sock.requestPairingCode(numero);
                console.log(`\n🔑 SEU CÓDIGO DE PAREAMENTO: ${codigo}`);
                console.log('   no celular: WhatsApp > Aparelhos conectados > Conectar aparelho > Conectar com número de telefone\n');
            } catch (erro) {
                console.log('❌ erro ao pedir o código de pareamento:', erro.message);
            }
        }

        if (connection === 'open') {
            tentativas = 0;
            lembretes.definirEnvio((jid, texto) => enviar(sock, jid, { text: texto }));
            lembretes.retomarPendentes();
            agenda.iniciar(sock);
            console.log(`✅ bot conectado e pronto! mande ${PREFIXO}menu na conversa com você mesmo.`);
            // avisa na conversa com você mesmo que ligou ou que voltou depois de cair
            const aviso = estado.mensagemDeConexao(estado.atual.conectou());
            const destino = meuJid(sock);
            if (aviso && destino) enviar(sock, destino, { text: aviso }).catch(() => {});
        }

        if (connection === 'close') {
            lembretes.definirEnvio(null);
            agenda.parar();
            const codigo = lastDisconnect?.error?.output?.statusCode;
            estado.atual.caiu(codigo);
            const decisao = aoCair(codigo);
            if (decisao.sair) {
                console.log(decisao.aviso);
                process.exit(decisao.sair);
            }
            tentativas += 1;
            const segundos = Math.min(30, 2 ** tentativas);
            console.log(`⚠️ conexão caiu (código ${codigo ?? '?'}). reconectando em ${segundos}s...`);
            setTimeout(() => {
                iniciarBot().catch((erro) => console.error('❌ falha ao reconectar:', erro));
            }, segundos * 1000);
        }
    });

    sock.ev.on('messages.upsert', ({ type, messages }) => {
        for (const msg of messages) {
            depurar(type, msg);
            // "append" = mensagem atrasada ou cópia do que o bot mandou; só vale se for recente
            if (type !== 'notify' && !recente(msg)) continue;
            if (mensagemTrancada(sock, msg)) continue;
            destrancou(msg);
            avisarAtraso(msg);
            // cada mensagem roda por conta própria: uma IA demorando não segura as outras
            tratarMensagem(sock, msg).catch((erro) => console.error('❌ erro ao tratar mensagem:', erro));
        }
    });
}

module.exports = { iniciarBot, aoCair, SAIDA, mensagemTrancada, destrancou };
