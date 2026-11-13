// Configurações do bot. Tudo pode ser trocado pelo arquivo .env (veja .env.example).
const path = require('path');

const RAIZ = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

function lista(texto, padrao) {
    return String(texto || padrao).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

// Modo privado: finanças, comprovantes e áudios só vão para a Groq (ficam de fora as IAs cujo plano
// grátis avisa que usa o que você manda, e o OpenRouter, que repassa para empresas variadas).
const MODO_PRIVADO = /^(sim|true|1|on|ligado)$/i.test(String(process.env.IA_MODO_PRIVADO || '').trim());
const privada = (filas) => (MODO_PRIVADO ? filas.filter((nome) => nome === 'groq') : filas);

// Número do .env (0 ou mais); vazio ou inválido usa o padrão.
function numero(texto, padrao) {
    const limpo = String(texto ?? '').trim();
    const valor = Number(limpo);
    return limpo !== '' && Number.isFinite(valor) && valor >= 0 ? valor : padrao;
}

// Modelos que a Groq desligou: se o .env ainda tiver um deles, usa o substituto (e avisa no log).
const MODELOS_DESLIGADOS = {
    'meta-llama/llama-4-scout-17b-16e-instruct': 'qwen/qwen3.8-27b', // desligado em 17/07/2026
    'meta-llama/llama-4-maverick-17b-128e-instruct': 'qwen/qwen3.8-27b', // desligado em 09/03/2026
    'llama-3.3-70b-versatile': 'qwen/qwen3.8-27b', // desligado em 16/08/2026
    'qwen/qwen3-32b': 'qwen/qwen3.8-27b',
};

function modeloGroq(nomeNoEnv, padrao) {
    const pedido = String(nomeNoEnv || '').trim() || padrao;
    const novo = MODELOS_DESLIGADOS[pedido];
    if (!novo) return pedido;
    console.log(`⚠️ a Groq desligou o modelo ${pedido}; usando ${novo}. troque no .env para este aviso sumir.`);
    return novo;
}

// IA_RACIOCINIO do .env em português ou inglês -> o nome que a Groq entende. Vazio ou desconhecido: "low".
function raciocinio(texto) {
    const t = String(texto || '').trim().toLowerCase();
    const nomes = { nenhum: 'none', none: 'none', baixo: 'low', low: 'low', medio: 'medium', médio: 'medium', medium: 'medium', alto: 'high', high: 'high', padrao: 'padrao', padrão: 'padrao' };
    return nomes[t] || 'low';
}

function somenteDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
}

// PERMITIDOS: números que também podem usar o bot (separados por vírgula) ou "todos".
const permitidos = String(process.env.PERMITIDOS || '').trim();

module.exports = {
    MODELOS_DESLIGADOS,
    RAIZ,
    // pasta onde ficam finanças, lembretes e backups
    PASTA_DADOS: process.env.PASTA_DADOS || path.join(RAIZ, 'dados'),
    // onde procurar os arquivos das versões antigas do bot para importar
    PASTA_LEGADO: process.env.PASTA_LEGADO || RAIZ,
    // login do WhatsApp (não apague, senão precisa parear de novo)
    PASTA_AUTH: path.join(RAIZ, 'auth_info_baileys'),
    // cópia de segurança do login (feita sozinha a cada hora)
    PASTA_AUTH_RESERVA: path.join(RAIZ, 'auth_info_baileys.reserva'),
    // número do bot (opcional: se ficar vazio, o bot pergunta na hora de parear)
    NUMERO_DONO: somenteDigitos(process.env.NUMERO_DONO),
    LIBERADO_PARA_TODOS: permitidos.toLowerCase() === 'todos',
    NUMEROS_PERMITIDOS: permitidos.toLowerCase() === 'todos'
        ? []
        : permitidos.split(',').map(somenteDigitos).filter(Boolean),
    PREFIXO: process.env.PREFIXO || '#',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    GROQ_MODELO: modeloGroq(process.env.GROQ_MODELO, 'qwen/qwen3.8-27b'),
    // modelo que transcreve áudio e modelo que enxerga imagens (comprovantes)
    GROQ_MODELO_AUDIO: process.env.GROQ_MODELO_AUDIO || 'whisper-large-v3-turbo',
    // o qwen3.8 também enxerga imagens (até 20 MB, 3 por pedido)
    GROQ_MODELO_VISAO: modeloGroq(process.env.GROQ_MODELO_VISAO, 'qwen/qwen3.8-27b'),
    // outras IAs (todas opcionais; quanto mais chaves, mais reservas na fila)
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODELO: process.env.GEMINI_MODELO || 'gemini-flash-latest,gemini-flash-lite-latest',
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
    MISTRAL_MODELO: process.env.MISTRAL_MODELO || 'mistral-small-latest',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_MODELO: process.env.OPENROUTER_MODELO || 'openrouter/free',
    // ordem das IAs em cada tarefa (a primeira que responder ganha)
    FILAS_IA: {
        texto: lista(process.env.IA_FILA_TEXTO, 'groq,gemini,mistral,openrouter'),
        financas: privada(lista(process.env.IA_FILA_FINANCAS, 'groq,gemini,mistral')),
        imagem: privada(lista(process.env.IA_FILA_IMAGEM, 'gemini,groq,mistral')),
        pdf: privada(lista(process.env.IA_FILA_PDF, 'gemini')),
        audio: privada(lista(process.env.IA_FILA_AUDIO, 'groq,gemini')),
    },
    IA_MODO_PRIVADO: MODO_PRIVADO,
    // quanto a IA de conversa "pensa" antes de responder: none (mais rápido), low, medium, high ou padrao.
    // nas finanças (lançar gastos) ela nunca pensa, porque só precisa transformar a frase em números.
    IA_RACIOCINIO: raciocinio(process.env.IA_RACIOCINIO),
    // áudio mandado na conversa com você mesmo é transcrito (e vira lançamento se for gasto/ganho)
    AUDIO_AUTOMATICO: !/^(nao|não|false|0|off|desligado)$/i.test(String(process.env.AUDIO_AUTOMATICO || 'sim').trim()),
    // modo figurinha: depois de um #s, fotos e vídeos mandados nesse tempo viram figurinha (0 desliga)
    SEGUNDOS_MODO_FIGURINHA: numero(process.env.SEGUNDOS_MODO_FIGURINHA, 10),
    // cidade do #clima quando você não digita nenhuma
    CIDADE_PADRAO: String(process.env.CIDADE_PADRAO || '').trim(),
};
