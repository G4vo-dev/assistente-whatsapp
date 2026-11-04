// Groq: a mais rápida. Texto, imagem (Llama 4 Scout) e áudio (Whisper, o melhor para transcrever).
const Groq = require('groq-sdk');
const { GROQ_API_KEY, GROQ_MODELO, GROQ_MODELO_AUDIO, GROQ_MODELO_VISAO } = require('../../config');

let cliente = null;

function obterCliente() {
    if (!cliente) cliente = new Groq({ apiKey: GROQ_API_KEY, timeout: 60000, maxRetries: 1 });
    return cliente;
}

module.exports = {
    nome: 'groq',
    titulo: 'Groq',
    sabe: { texto: true, imagem: true, pdf: false, audio: true },
    ligado: () => Boolean(GROQ_API_KEY),

    async texto({ sistema, pergunta, maxTokens, temperatura }) {
        const resposta = await obterCliente().chat.completions.create({
            model: GROQ_MODELO,
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [
                ...(sistema ? [{ role: 'system', content: sistema }] : []),
                { role: 'user', content: pergunta },
            ],
        });
        return resposta.choices[0]?.message?.content || '';
    },

    async arquivo({ pergunta, dados, tipo, maxTokens, temperatura }) {
        const resposta = await obterCliente().chat.completions.create({
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
        });
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
