// Monta um "WhatsApp de mentira" para testar os comandos sem conectar de verdade.
// Precisa ser carregado ANTES de qualquer arquivo de src/ (ele define o .env de teste).
const os = require('os');
const fs = require('fs');
const path = require('path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-teste-'));
process.env.PASTA_DADOS = path.join(pasta, 'dados');
process.env.PASTA_LEGADO = path.join(pasta, 'legado');
process.env.NUMERO_DONO = '';
process.env.PERMITIDOS = process.env.PERMITIDOS_TESTE || '';
process.env.PREFIXO = '#';
process.env.GROQ_API_KEY = process.env.GROQ_TESTE || '';
// os testes nunca usam as chaves e opções do seu .env (para não gastar sua cota de IA)
process.env.GEMINI_API_KEY = process.env.GEMINI_TESTE || '';
process.env.MISTRAL_API_KEY = process.env.MISTRAL_TESTE || '';
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_TESTE || '';
for (const nome of ['IA_FILA_TEXTO', 'IA_FILA_FINANCAS', 'IA_FILA_IMAGEM', 'IA_FILA_PDF', 'IA_FILA_AUDIO', 'CIDADE_PADRAO', 'SEGUNDOS_MODO_FIGURINHA',
    'GEMINI_MODELO', 'MISTRAL_MODELO', 'OPENROUTER_MODELO', 'IA_MODO_PRIVADO']) {
    process.env[nome] = '';
}
process.env.AUDIO_AUTOMATICO = 'sim';

// esconde os logs de comando ("▶️ #saldo") para o resultado dos testes ficar limpo
if (!process.env.MOSTRAR_LOGS) {
    console.log = () => {};
    // avisos esperados (IA falhando de propósito nos testes da fila)
    const erroOriginal = console.error;
    console.error = (...partes) => { if (!String(partes[0]).startsWith('⚠️ IA')) erroOriginal(...partes); };
}

const EU_PN = '5511912345678@s.whatsapp.net';
const EU_LID = '117900000000090@lid';
let contador = 0;

function criarBot() {
    const enviadas = [];
    return {
        user: { id: '5511912345678:7@s.whatsapp.net', lid: '117900000000090:7@lid' },
        enviadas,
        textos: () => enviadas.filter((e) => e.conteudo.text).map((e) => e.conteudo.text),
        ultima: () => enviadas.filter((e) => e.conteudo.text).at(-1)?.conteudo.text,
        async sendMessage(jid, conteudo, opcoes = {}) {
            const id = opcoes.messageId || `BOT${++contador}`;
            enviadas.push({ jid, conteudo, opcoes, id });
            return { key: { id, remoteJid: jid, fromMe: true } };
        },
    };
}

function mensagem(texto, key = {}, extra = {}) {
    return {
        key: { remoteJid: EU_LID, fromMe: true, id: `MSG${++contador}`, ...key },
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: extra.message || { conversation: texto },
    };
}

function limpar() {
    fs.rmSync(pasta, { recursive: true, force: true });
}

module.exports = { pasta, criarBot, mensagem, limpar, EU_PN, EU_LID };
