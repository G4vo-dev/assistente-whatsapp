// O que o resto do bot usa para falar com IA. Por baixo, cada pedido passa pela fila de IAs (fila.js).
const fila = require('./fila');

const SISTEMA_PADRAO = 'você é um assistente de WhatsApp amigável, gamer e nerd. responda em português, de forma direta. '
    + 'use a formatação do WhatsApp (*negrito*, _itálico_) e não use markdown com ## ou **.';

const SEM_CHAVE = '❌ IA desligada: coloque a chave de pelo menos uma IA (GROQ_API_KEY ou GEMINI_API_KEY) no arquivo .env e reinicie o bot.';

function iaLigada(tarefa = 'texto') {
    return fila.disponivel(tarefa);
}

// Alguns modelos mandam o "raciocínio" entre <think></think> e usam markdown: limpa para o WhatsApp.
function limparResposta(texto) {
    return String(texto || '')
        .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
        .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .trim();
}

function mensagemDeFalha(tarefa, erro) {
    if (!fila.disponivel(tarefa)) return SEM_CHAVE;
    return `❌ ${erro.message}. tente de novo em alguns minutos.`;
}

// tarefa: "texto" (conversa) ou "financas" (dados de dinheiro: fica fora das IAs que sorteiam modelos).
async function perguntarIA(pergunta, { sistema = SISTEMA_PADRAO, maxTokens = 1024, temperatura = 0.7, tarefa = 'texto' } = {}) {
    try {
        const { texto } = await fila.executar(tarefa, (p) => p.texto({ sistema, pergunta, maxTokens, temperatura }));
        return limparResposta(texto) || '❌ a IA não respondeu nada. tente perguntar de outro jeito.';
    } catch (erro) {
        return mensagemDeFalha(tarefa, erro);
    }
}

// Imagem (jpeg/png...) ou PDF com uma pergunta.
async function perguntarSobreImagem(dados, tipo, pergunta, { maxTokens = 800, temperatura = 0.1 } = {}) {
    const tarefa = tipo === 'application/pdf' ? 'pdf' : 'imagem';
    try {
        const { texto } = await fila.executar(tarefa, (p) => p.arquivo({ pergunta, dados, tipo, maxTokens, temperatura }));
        return limparResposta(texto);
    } catch (erro) {
        if (tarefa === 'pdf' && !fila.disponivel('pdf')) {
            return '❌ para ler PDF, coloque a GEMINI_API_KEY no .env (ou mande um print do comprovante).';
        }
        return mensagemDeFalha(tarefa, erro);
    }
}

// Áudio -> texto. Lança erro se nenhuma IA conseguir.
async function transcreverAudio(dados, nome = 'audio.ogg', tipo = 'audio/ogg') {
    try {
        const { texto } = await fila.executar('audio', (p) => p.audio({ dados, nome, tipo }));
        return texto;
    } catch (erro) {
        throw new Error(fila.disponivel('audio') ? erro.message : 'nenhuma IA de áudio configurada (GROQ_API_KEY ou GEMINI_API_KEY)', { cause: erro });
    }
}

// Pega o primeiro array JSON de dentro da resposta da IA.
function extrairListaJson(texto) {
    const limpo = String(texto || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/```(?:json)?/gi, '');
    const inicio = limpo.indexOf('[');
    const fim = limpo.lastIndexOf(']');
    if (inicio === -1 || fim <= inicio) return null;
    try {
        const lista = JSON.parse(limpo.slice(inicio, fim + 1));
        return Array.isArray(lista) ? lista : null;
    } catch {
        return null;
    }
}

module.exports = {
    perguntarIA, perguntarSobreImagem, transcreverAudio, extrairListaJson, limparResposta, iaLigada,
    situacao: fila.situacao, SEM_CHAVE,
};
