// Mistral: plano grátis com muitos tokens por mês. Boa reserva para texto e imagem.
const { MISTRAL_API_KEY, MISTRAL_MODELO } = require('../../config');
const { postarJson, textoDoChat } = require('./http');

const URL = 'https://api.mistral.ai/v1/chat/completions';

async function conversar(mensagens, { maxTokens, temperatura }) {
    const dados = await postarJson(URL, { Authorization: `Bearer ${MISTRAL_API_KEY}` }, {
        model: MISTRAL_MODELO,
        max_tokens: maxTokens,
        temperature: temperatura,
        messages: mensagens,
    });
    return textoDoChat(dados);
}

module.exports = {
    nome: 'mistral',
    titulo: 'Mistral',
    sabe: { texto: true, imagem: true, pdf: false, audio: false },
    ligado: () => Boolean(MISTRAL_API_KEY),

    texto({ sistema, pergunta, maxTokens, temperatura }) {
        return conversar([
            ...(sistema ? [{ role: 'system', content: sistema }] : []),
            { role: 'user', content: pergunta },
        ], { maxTokens, temperatura });
    },

    arquivo({ pergunta, dados, tipo, maxTokens, temperatura }) {
        return conversar([{
            role: 'user',
            content: [
                { type: 'text', text: pergunta },
                { type: 'image_url', image_url: `data:${tipo};base64,${dados.toString('base64')}` },
            ],
        }], { maxTokens, temperatura });
    },
};
