// Modo demonstração: converse com o bot no terminal, sem precisar de WhatsApp.
//   npm run demo                 conversa livre (digite comandos como #menu, #despesa 30 ifood...)
//   npm run demo -- --roteiro    roda uma conversa de exemplo pronta
// Os dados ficam numa pasta temporária, apagada no fim. As IAs funcionam se houver chave no .env.
const os = require('os');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-demo-'));
process.env.PASTA_DADOS = path.join(pasta, 'dados');
process.env.PASTA_LEGADO = path.join(pasta, 'legado');
process.env.NUMERO_DONO = '';

// esconde o registro interno ("▶️ #saldo") para a conversa ficar limpa
const logOriginal = console.log;
console.log = (...partes) => { if (!String(partes[0]).startsWith('▶️')) logOriginal(...partes); };

const { tratarMensagem } = require('../src/roteador');

const EU = '5500000000000@s.whatsapp.net';
let contador = 0;

const bot = {
    user: { id: '5500000000000:1@s.whatsapp.net' },
    async sendMessage(jid, conteudo, opcoes = {}) {
        if (conteudo.text) logOriginal(`\n🤖 ${conteudo.text.replace(/\n/g, '\n   ')}`);
        else if (conteudo.sticker) logOriginal('\n🤖 [figurinha]');
        else if (conteudo.image) logOriginal(`\n🤖 [imagem]${conteudo.caption ? ` ${conteudo.caption}` : ''}`);
        else if (conteudo.document) logOriginal(`\n🤖 [arquivo ${conteudo.fileName}] ${conteudo.caption || ''}`);
        return { key: { id: opcoes.messageId || `DEMO${++contador}`, remoteJid: jid, fromMe: true } };
    },
};

async function enviar(texto) {
    await tratarMensagem(bot, {
        key: { remoteJid: EU, fromMe: true, id: `VOCE${++contador}` },
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: texto },
    });
}

const ROTEIRO = [
    '#cartao adicionar nubank 2000',
    '#receita 3500 pix salario empresa',
    '#despesa 89,90 pix mercado compras da semana',
    '#editar 2 valor 92,40',
    '#despesa 1200 nubank 6x eletronicos celular novo',
    '#limite ifood 150',
    '#despesa 45 ifood',
    '#despesa 80 ifood pizza de sexta',
    '#fixo adicionar 120 internet dia 10',
    '#meta adicionar 5000 alta viagem de férias',
    '#meta guardar 1 750',
    '#saldo',
    '#grafico',
    '#lista mercado add leite, pão, café',
    '#lembrar todo dia 8h tomar remédio',
    '#sald',
];

function encerrar() {
    fs.rmSync(pasta, { recursive: true, force: true });
    process.exit(0);
}

async function roteiro() {
    for (const comando of ROTEIRO) {
        logOriginal(`\n👤 ${comando}`);
        await enviar(comando);
    }
    encerrar();
}

function conversa() {
    logOriginal('💬 modo demonstração: digite comandos como no WhatsApp (#menu para começar, "sair" para fechar).');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\n👤 ' });
    rl.prompt();
    rl.on('line', async (linha) => {
        const texto = linha.trim();
        if (['sair', 'exit', 'quit'].includes(texto.toLowerCase())) return rl.close();
        if (texto) await enviar(texto);
        rl.prompt();
    });
    rl.on('close', encerrar);
}

if (process.argv.includes('--roteiro')) roteiro();
else conversa();
