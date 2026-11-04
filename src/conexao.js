// Conecta no WhatsApp, mostra o código de pareamento e reconecta sozinho quando a conexão cai.
const readline = require('readline');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { PASTA_AUTH, NUMERO_DONO } = require('./config');
const { tratarMensagem } = require('./roteador');
const { enviar } = require('./envio');
const lembretes = require('./servicos/lembretes');
const agenda = require('./agenda');

const MAX_ATRASO_SEGUNDOS = 120; // mensagens que chegam atrasadas (bot estava offline) até 2 min ainda valem
const PRECISA_PAREAR = 2; // código de saída que avisa o scripts/iniciar.sh para não ficar religando
let tentativas = 0;

function perguntar(texto) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(texto, (resposta) => { rl.close(); resolve(resposta); }));
}

async function numeroParaParear() {
    // ligado sozinho (Termux:Boot): não tem como digitar nem ver o código
    if (!process.stdin.isTTY) {
        console.log('🔑 o bot precisa ser pareado: abra o Termux e rode npm start');
        process.exit(PRECISA_PAREAR);
    }
    if (NUMERO_DONO) return NUMERO_DONO;
    const digitado = await perguntar('\n📱 digite seu número com DDI e DDD (ex: 5511999999999): ');
    return digitado.replace(/\D/g, '');
}

function recente(msg) {
    const enviadoEm = Number(msg.messageTimestamp) || 0;
    return Date.now() / 1000 - enviadoEm <= MAX_ATRASO_SEGUNDOS;
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
    });

    sock.ev.on('creds.update', saveCreds);

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
            console.log('✅ bot conectado e pronto! mande #menu na conversa com você mesmo.');
        }

        if (connection === 'close') {
            lembretes.definirEnvio(null);
            agenda.parar();
            const codigo = lastDisconnect?.error?.output?.statusCode;
            if (codigo === DisconnectReason.loggedOut) {
                console.log('🚪 o WhatsApp desconectou este aparelho. apague a pasta auth_info_baileys e rode de novo para parear.');
                process.exit(PRECISA_PAREAR);
            }
            tentativas += 1;
            const segundos = Math.min(30, 2 ** tentativas);
            console.log(`⚠️ conexão caiu (código ${codigo ?? '?'}). reconectando em ${segundos}s...`);
            setTimeout(() => {
                iniciarBot().catch((erro) => console.error('❌ falha ao reconectar:', erro));
            }, segundos * 1000);
        }
    });

    sock.ev.on('messages.upsert', async ({ type, messages }) => {
        for (const msg of messages) {
            // "append" = mensagem atrasada ou cópia do que o bot mandou; só vale se for recente
            if (type !== 'notify' && !recente(msg)) continue;
            await tratarMensagem(sock, msg).catch((erro) => console.error('❌ erro ao tratar mensagem:', erro));
        }
    });
}

module.exports = { iniciarBot };
