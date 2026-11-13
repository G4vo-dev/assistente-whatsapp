// Testes de #estudar, #quiz e #resposta (a IA é de mentira).
const { criarBot, mensagem, limpar } = require('./ajudante');
process.env.GROQ_TESTE = 'chave-groq';
const test = require('node:test');
const assert = require('node:assert');
const { tratarMensagem } = require('../src/roteador');
const ia = require('../src/servicos/ia');

const original = { ...ia };
test.afterEach(() => Object.assign(ia, original));
test.after(limpar);

async function enviar(texto) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto));
    return bot.ultima();
}

test('#estudar pede a explicação do tema à IA e ensina o porquê', async () => {
    let pedido = '';
    ia.perguntarIA = async (pergunta, opcoes) => { pedido = `${opcoes?.sistema}\n${pergunta}`; return 'explicação de laços'; };
    const resposta = await enviar('#estudar laços de repetição');
    assert.match(resposta, /explicação de laços/);
    assert.match(pedido, /laços de repetição/);
    assert.match(pedido, /por ?quê/i);
});

test('#estudar sem tema explica o uso', async () => {
    assert.match(await enviar('#estudar'), /estudar \[tema\]|ex:/);
});

test('#quiz faz uma pergunta e #resposta corrige, com placar', async () => {
    ia.perguntarIA = async () => '```json\n{"pergunta":"O que é uma variável?","resposta":"um espaço na memória com nome","explicacao":"guarda um valor"}\n```';
    const pergunta = await enviar('#quiz variáveis');
    assert.match(pergunta, /O que é uma variável\?/);
    ia.perguntarIA = async () => 'CERTO\nisso mesmo!';
    const certo = await enviar('#resposta guarda um valor com nome');
    assert.match(certo, /✅/);
    assert.match(certo, /1\/1/);
    // a pergunta já foi respondida
    assert.match(await enviar('#resposta de novo'), /nenhuma pergunta/);
});

test('#resposta errada mostra o gabarito e a explicação', async () => {
    ia.perguntarIA = async () => '{"pergunta":"2+2?","resposta":"4","explicacao":"soma simples"}';
    await enviar('#quiz soma');
    ia.perguntarIA = async () => 'ERRADO\nnão é isso';
    const errado = await enviar('#resposta 5');
    assert.match(errado, /❌/);
    assert.match(errado, /4/);
    assert.match(errado, /soma simples/);
});

test('#quiz com resposta inválida da IA avisa sem quebrar', async () => {
    ia.perguntarIA = async () => 'não consegui fazer json';
    assert.match(await enviar('#quiz qualquer'), /❌/);
});
