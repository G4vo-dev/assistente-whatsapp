// Groq: a mais rápida. Texto e imagem (qwen3.8) e áudio (Whisper, o melhor para transcrever).
const Groq = require('groq-sdk');
const { GROQ_MODELO, GROQ_MODELO_AUDIO, GROQ_MODELO_VISAO, IA_RACIOCINIO } = require('../../config');
const { chaveDe } = require('./chaves');

const clientes = new Map(); // um cliente por chave (cada pessoa pode ter a sua: #chave)

// maxRetries 0: se a Groq bater no limite, a fila passa na hora para a próxima IA.
// (com 1, a biblioteca ficava parada esperando o tempo que a Groq pedisse, às vezes quase 1 minuto.)
function obterCliente() {
    const chave = chaveDe('groq');
    if (!clientes.has(chave)) clientes.set(chave, new Groq({ apiKey: chave, timeout: 60000, maxRetries: 0 }));
    return clientes.get(chave);
}

// Quanto o modelo "pensa" antes de responder. Pensar mais = resposta melhor, porém mais demorada.
// Os modelos qwen aceitam none/low/medium/high; os gpt-oss não aceitam none. Outros modelos: não mexe.
function opcoesDeRaciocinio(modelo, pedido = IA_RACIOCINIO) {
    if (!pedido || pedido === 'padrao') return {};
    if (/qwen/i.test(modelo)) {
        return pedido === 'none' ? { reasoning_effort: 'none' } : { reasoning_effort: pedido, reasoning_format: 'hidden' };
    }
    if (/gpt-oss/i.test(modelo)) {
        return { reasoning_effort: pedido === 'none' ? 'low' : pedido, reasoning_format: 'hidden' };
    }
    return {};
}

// Pede com as opções de raciocínio; se o modelo não aceitar (erro 400 falando de "reasoning"), pede de novo sem elas.
async function criarComRaciocinio(pedido, extras) {
    try {
        return await obterCliente().chat.completions.create({ ...pedido, ...extras });
    } catch (erro) {
        if (erro?.status !== 400 || !Object.keys(extras).length || !/reasoning/i.test(erro.message)) throw erro;
        return obterCliente().chat.completions.create(pedido);
    }
}

module.exports = {
    opcoesDeRaciocinio,
    nome: 'groq',
    titulo: 'Groq',
    sabe: { texto: true, imagem: true, pdf: false, audio: true },
    ligado: () => Boolean(chaveDe('groq')),

    async texto({ sistema, pergunta, maxTokens, temperatura, raciocinio }) {
        const resposta = await criarComRaciocinio({
            model: GROQ_MODELO,
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [
                ...(sistema ? [{ role: 'system', content: sistema }] : []),
                { role: 'user', content: pergunta },
            ],
        }, opcoesDeRaciocinio(GROQ_MODELO, raciocinio));
        return resposta.choices[0]?.message?.content || '';
    },

    async arquivo({ pergunta, dados, tipo, maxTokens, temperatura }) {
        // ler comprovante e extrato é copiar o que está escrito: não precisa "pensar" (fica bem mais rápido)
        const resposta = await criarComRaciocinio({
            model: GROQ_MODELO_VISAO,
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: pergunta },
                    { type: 'image_url', image_url: { url: `data:${tipo};base64,${dados.toString('base64')}` } },
                ],
            }],
        }, opcoesDeRaciocinio(GROQ_MODELO_VISAO, 'none'));
        return resposta.choices[0]?.message?.content || '';
    },

    async audio({ dados, nome, tipo }) {
        const arquivo = await Groq.toFile(dados, nome, { type: tipo });
        const resposta = await obterCliente().audio.transcriptions.create({
            file: arquivo, model: GROQ_MODELO_AUDIO, language: 'pt', response_format: 'json',
        });
        return String(resposta.text || '').trim();
    },
};
