// Lista os modelos das IAs que têm chave no .env (rode com: npm run modelos).
// Use os nomes em GROQ_MODELO, GEMINI_MODELO, MISTRAL_MODELO ou OPENROUTER_MODELO.
const Groq = require('groq-sdk');
const config = require('../src/config');

async function buscar(url, cabecalhos) {
    const resposta = await fetch(url, { headers: cabecalhos, signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 120)}`);
    return resposta.json();
}

const IAS = [
    {
        nome: 'Groq', chave: config.GROQ_API_KEY, atuais: [config.GROQ_MODELO, config.GROQ_MODELO_AUDIO, config.GROQ_MODELO_VISAO],
        listar: async () => (await new Groq({ apiKey: config.GROQ_API_KEY }).models.list()).data.map((m) => m.id),
    },
    {
        nome: 'Gemini', chave: config.GEMINI_API_KEY, atuais: config.GEMINI_MODELO.split(','),
        listar: async () => (await buscar('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': config.GEMINI_API_KEY }))
            .models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', '')),
    },
    {
        nome: 'Mistral', chave: config.MISTRAL_API_KEY, atuais: [config.MISTRAL_MODELO],
        listar: async () => (await buscar('https://api.mistral.ai/v1/models', { Authorization: `Bearer ${config.MISTRAL_API_KEY}` })).data.map((m) => m.id),
    },
    {
        nome: 'OpenRouter (só os grátis)', chave: config.OPENROUTER_API_KEY, atuais: [config.OPENROUTER_MODELO],
        listar: async () => (await buscar('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${config.OPENROUTER_API_KEY}` }))
            .data.filter((m) => m.id.endsWith(':free') || m.id === 'openrouter/free').map((m) => m.id),
    },
];

async function main() {
    for (const ia of IAS) {
        console.log(`\n━━━ ${ia.nome} ━━━`);
        if (!ia.chave) {
            console.log('sem chave no .env');
            continue;
        }
        try {
            const atuais = ia.atuais.map((m) => m.trim());
            for (const id of [...new Set(await ia.listar())].sort()) console.log(`${atuais.includes(id) ? '👉' : '  '} ${id}`);
            console.log(`em uso: ${atuais.join(', ')}`);
        } catch (erro) {
            console.log(`❌ ${erro.message}`);
        }
    }
}

main();
