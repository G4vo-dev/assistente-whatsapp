// Google Gemini: o melhor para ler imagem e o único da fila que lê PDF. Também entende áudio.
// Tenta os modelos de GEMINI_MODELO em ordem (se um não existir ou bater no limite, vai para o próximo).
const { GEMINI_MODELO } = require('../../config');
const { chaveDe } = require('./chaves');
const { ErroDeIA, postarJson } = require('./http');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function modelos() {
    return GEMINI_MODELO.split(',').map((m) => m.trim()).filter(Boolean);
}

function arquivoInline(dados, tipo) {
    return { inlineData: { mimeType: tipo, data: dados.toString('base64') } };
}

async function gerar({ sistema, partes, temperatura }) {
    let ultimoErro = null;
    for (const modelo of modelos()) {
        try {
            const dados = await postarJson(`${BASE}/${modelo}:generateContent`, { 'x-goog-api-key': chaveDe('gemini') }, {
                ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
                contents: [{ role: 'user', parts: partes }],
                generationConfig: { temperature: temperatura },
            });
            const candidato = dados?.candidates?.[0];
            const texto = (candidato?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
            if (!texto) {
                const motivo = dados?.promptFeedback?.blockReason || candidato?.finishReason || 'resposta vazia';
                throw new ErroDeIA(`sem resposta (${motivo})`);
            }
            return texto;
        } catch (erro) {
            ultimoErro = erro;
            // modelo inexistente, no limite ou sobrecarregado ("high demand"): tenta o próximo da lista
            if ([404, 429, 500, 503].includes(erro.status) || erro.name === 'TimeoutError') continue;
            throw erro;
        }
    }
    throw ultimoErro || new ErroDeIA('nenhum modelo configurado em GEMINI_MODELO');
}

module.exports = {
    nome: 'gemini',
    titulo: 'Google Gemini',
    sabe: { texto: true, imagem: true, pdf: true, audio: true },
    ligado: () => Boolean(chaveDe('gemini')),

    texto({ sistema, pergunta, temperatura }) {
        return gerar({ sistema, partes: [{ text: pergunta }], temperatura });
    },

    arquivo({ pergunta, dados, tipo, temperatura }) {
        return gerar({ partes: [arquivoInline(dados, tipo), { text: pergunta }], temperatura });
    },

    async audio({ dados, tipo }) {
        const texto = await gerar({
            partes: [
                arquivoInline(dados, tipo),
                { text: 'Transcreva este áudio exatamente como foi falado, em português. Responda só com a transcrição, sem comentários.' },
            ],
            temperatura: 0,
        });
        return texto.trim();
    },
};
