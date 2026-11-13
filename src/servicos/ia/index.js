// O que o resto do bot usa para falar com IA. Por baixo, cada pedido passa pela fila de IAs (fila.js).
const fila = require('./fila');

const REGRAS_DE_FORMATO = 'responda em português, de forma direta e completa, sem enrolação. '
    + 'use a formatação do WhatsApp (*negrito*, _itálico_) e não use markdown com ## ou **.';

const PERSONALIDADE_PADRAO = 'você é um assistente geral de WhatsApp: ajuda com qualquer assunto (estudos, trabalho, dinheiro, saúde em geral, '
    + 'tecnologia, textos, ideias, dúvidas do dia a dia). raciocine com cuidado, dê a resposta completa e correta, e diga quando não tiver certeza.';

// Dá para trocar o jeito de responder com IA_PERSONALIDADE no .env; as regras de formato continuam valendo.
function sistemaPadrao() {
    const personalidade = String(process.env.IA_PERSONALIDADE || '').trim() || PERSONALIDADE_PADRAO;
    return `${personalidade} ${REGRAS_DE_FORMATO}`;
}

// Tamanho máximo da resposta (em "tokens", mais ou menos 3/4 de palavra cada). IA_MAX_TOKENS no .env ajusta.
function limiteDeResposta() {
    const n = parseInt(process.env.IA_MAX_TOKENS, 10);
    return n > 0 ? Math.min(n, 8000) : 2048;
}

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
        // [texto](link) não vira link no WhatsApp: fica "texto (link)"
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, rotulo, link) => (rotulo === link ? link : `${rotulo} (${link})`))
        .trim();
}

// As respostas de erro das funções abaixo começam com ❌ (assim o comando sabe que não deu certo).
function ehFalha(resposta) {
    return String(resposta || '').startsWith('❌');
}

function mensagemDeFalha(tarefa, erro) {
    if (!fila.disponivel(tarefa)) return SEM_CHAVE;
    return `❌ ${erro.message}. tente de novo em alguns minutos.`;
}

// tarefa: "texto" (conversa) ou "financas" (dados de dinheiro: fica fora das IAs que sorteiam modelos).
// raciocinio: quanto a IA pensa antes (none/low/medium/high). Nas finanças é "none": só converte frase em JSON,
// e assim responde bem mais rápido.
async function perguntarIA(pergunta, { sistema = sistemaPadrao(), maxTokens = limiteDeResposta(), temperatura = 0.7, tarefa = 'texto', raciocinio } = {}) {
    const pensar = raciocinio || (tarefa === 'financas' ? 'none' : undefined);
    try {
        const { texto } = await fila.executar(tarefa, (p) => p.texto({ sistema, pergunta, maxTokens, temperatura, raciocinio: pensar }));
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

function lerJsonEntre(texto, abre, fecha) {
    const inicio = texto.indexOf(abre);
    const fim = texto.lastIndexOf(fecha);
    if (inicio === -1 || fim <= inicio) return undefined;
    try {
        return JSON.parse(texto.slice(inicio, fim + 1));
    } catch {
        return undefined;
    }
}

// Pega a lista JSON de ações de dentro da resposta da IA (uma ação sozinha vira lista de um item).
function extrairListaJson(texto) {
    const limpo = String(texto || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/```(?:json)?/gi, '');
    const lista = lerJsonEntre(limpo, '[', ']');
    if (Array.isArray(lista)) return lista;
    const objeto = lerJsonEntre(limpo, '{', '}');
    return objeto?.acao ? [objeto] : null;
}

module.exports = {
    perguntarIA, perguntarSobreImagem, transcreverAudio, extrairListaJson, limparResposta, iaLigada, ehFalha,
    situacao: fila.situacao, SEM_CHAVE,
};
