// OpenRouter: uma chave para vários modelos grátis ("openrouter/free" sorteia um a cada pedido).
// Fica por último e só na fila de conversa, porque cada resposta pode vir de uma empresa diferente.
const { OPENROUTER_MODELO } = require('../../config');
const { chaveDe } = require('./chaves');
const { postarJson, textoDoChat } = require('./http');

const URL = 'https://openrouter.ai/api/v1/chat/completions';

module.exports = {
    nome: 'openrouter',
    titulo: 'OpenRouter',
    sabe: { texto: true, imagem: false, pdf: false, audio: false },
    ligado: () => Boolean(chaveDe('openrouter')),

    async texto({ sistema, pergunta, maxTokens, temperatura }) {
        const dados = await postarJson(URL, { Authorization: `Bearer ${chaveDe('openrouter')}`, 'X-Title': 'assistente-whatsapp' }, {
            model: OPENROUTER_MODELO,
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [
                ...(sistema ? [{ role: 'system', content: sistema }] : []),
                { role: 'user', content: pergunta },
            ],
        });
        return textoDoChat(dados);
    },
};
