// Uma cópia só do bot por pasta. Duas cópias ligadas juntas responderiam tudo duas vezes, e o WhatsApp
// ficaria derrubando uma e outra. A primeira cópia ocupa uma porta local (só dentro do aparelho),
// que o sistema libera sozinho quando o bot fecha ou cai.
const net = require('net');
const crypto = require('crypto');

const SINAL = 'assistente-whatsapp-ligado';

// Cada pasta do bot tem a sua porta, entre 40000 e 59999.
function portaDaPasta(pasta) {
    return 40000 + (crypto.createHash('sha1').update(pasta).digest().readUInt16BE(0) % 20000);
}

// Outra cópia do bot responde com o SINAL; outro programa usando a mesma porta, não.
function respondeComoBot(porta) {
    return new Promise((resolve) => {
        let recebido = '';
        const conexao = net.connect(porta, '127.0.0.1');
        conexao.setTimeout(2000, () => conexao.destroy());
        conexao.on('data', (pedaco) => { recebido += pedaco; });
        conexao.on('error', () => {});
        conexao.on('close', () => resolve(recebido.startsWith(SINAL)));
    });
}

// true: este é o único bot ligado nesta pasta (e a porta fica ocupada até ele fechar).
async function pegarTrava(pasta) {
    const porta = portaDaPasta(pasta);
    const servidor = net.createServer((conexao) => conexao.end(SINAL));
    const erro = await new Promise((resolve) => {
        servidor.once('error', resolve);
        servidor.listen(porta, '127.0.0.1', () => resolve(null));
    });
    if (!erro) {
        servidor.unref();
        return true;
    }
    if (erro.code !== 'EADDRINUSE') return true; // não deu para conferir: liga mesmo assim
    if (await respondeComoBot(porta)) return false;
    console.log(`⚠️ a porta ${porta} está com outro programa; não deu para conferir se há outra cópia do bot ligada.`);
    return true;
}

module.exports = { pegarTrava, portaDaPasta };
