// A IA responde como assistente geral (sem personalidade gamer/nerd) e usa o limite de resposta configurado.
const { limpar } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');
const ia = require('../src/servicos/ia');
const fila = require('../src/servicos/ia/fila');

test.after(limpar);

const executarOriginal = fila.executar;
test.afterEach(() => {
    fila.executar = executarOriginal;
    delete process.env.IA_PERSONALIDADE;
    delete process.env.IA_MAX_TOKENS;
});

// IA de mentira que guarda o que recebeu
function espionar() {
    const visto = {};
    fila.executar = async (tarefa, funcao) => ({ texto: await funcao({ texto: async (args) => { Object.assign(visto, args); return 'ok'; } }) });
    return visto;
}

test('o padrão é um assistente geral, não gamer nem nerd', async () => {
    const visto = espionar();
    await ia.perguntarIA('qual a capital da França?');
    assert.doesNotMatch(visto.sistema, /nerd|gamer/i);
    assert.match(visto.sistema, /qualquer assunto/);
    assert.match(visto.sistema, /português/);
});

test('IA_PERSONALIDADE troca o jeito de responder', async () => {
    process.env.IA_PERSONALIDADE = 'você é um professor de história.';
    const visto = espionar();
    await ia.perguntarIA('quem foi Dom Pedro I?');
    assert.match(visto.sistema, /^você é um professor de história\./);
    assert.match(visto.sistema, /formatação do WhatsApp/); // a regra de formatação continua valendo
});

test('respostas podem ser longas por padrão e IA_MAX_TOKENS ajusta', async () => {
    let visto = espionar();
    await ia.perguntarIA('explique em detalhes');
    assert.ok(visto.maxTokens >= 2048, `maxTokens ${visto.maxTokens}`);
    process.env.IA_MAX_TOKENS = '4000';
    visto = espionar();
    await ia.perguntarIA('explique em detalhes');
    assert.strictEqual(visto.maxTokens, 4000);
});

test('um sistema passado de fora (ex.: #iaeco) continua valendo', async () => {
    const visto = espionar();
    await ia.perguntarIA('oi', { sistema: 'sistema específico' });
    assert.strictEqual(visto.sistema, 'sistema específico');
});
