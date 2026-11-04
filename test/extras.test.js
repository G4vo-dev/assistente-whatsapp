// Testes de áudio, comprovante, avisos automáticos, backup, planilha, comandos rápidos e #img.
process.env.GROQ_TESTE = 'chave-de-teste';
const { criarBot, mensagem, limpar, EU_LID } = require('./ajudante');
const test = require('node:test');
const assert = require('node:assert');

const { tratarMensagem } = require('../src/roteador');
const agenda = require('../src/agenda');
const ia = require('../src/servicos/ia');
const midia = require('../src/servicos/midia');

const originais = { ia: { ...ia }, midia: { ...midia }, fetch: global.fetch };
test.afterEach(() => {
    Object.assign(ia, originais.ia);
    Object.assign(midia, originais.midia);
    global.fetch = originais.fetch;
});
test.after(limpar);

async function enviar(texto, key, message) {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem(texto, key, message ? { message } : undefined));
    return bot;
}

const audio = { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } };
const respondendo = (texto, citada) => ({ extendedTextMessage: { text: texto, contextInfo: { stanzaId: 'CITADA1', quotedMessage: citada } } });

test('áudio na conversa própria: gasto vira lançamento, o resto vira texto', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('ogg');
    ia.transcreverAudio = async () => 'gastei 30 reais de uber no pix';
    ia.perguntarIA = async () => '[{"acao":"despesa","valor":30,"metodo":"pix","categoria":"uber","descricao":"uber"}]';
    let r = (await enviar('', {}, audio)).ultima();
    assert.ok(r.includes('gastei 30 reais') && r.includes('lançado') && r.includes('nº 1'), r);

    ia.transcreverAudio = async () => 'lembrar de ligar pra mãe amanhã';
    r = (await enviar('', {}, audio)).ultima();
    assert.strictEqual(r, '🎙️ lembrar de ligar pra mãe amanhã');

    // em outras conversas o áudio é ignorado (sem comando)
    assert.strictEqual((await enviar('', { remoteJid: '120363000000000000@g.us', participant: EU_LID }, audio)).enviadas.length, 0);
});

test('#transcrever respondendo um áudio e #iagerente respondendo um áudio', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('ogg');
    ia.transcreverAudio = async () => 'olá, tudo bem?';
    assert.strictEqual((await enviar('', {}, respondendo('#transcrever', audio))).ultima(), '🎙️ olá, tudo bem?');
    assert.ok((await enviar('#transcrever')).ultima().includes('responda um áudio'));

    ia.transcreverAudio = async () => 'comprei um fone de 200 em 2x no pix';
    ia.perguntarIA = async () => '[{"acao":"despesa","valor":200,"parcelas":2,"metodo":"pix","categoria":"eletronicos","descricao":"fone"}]';
    const r = (await enviar('', {}, respondendo('#iagerente', audio))).ultima();
    assert.ok(r.includes('2x de R$ 100,00'), r);
});

test('#comprovante lê a foto e lança', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('jpg');
    let pergunta = '';
    ia.perguntarSobreImagem = async (dados, tipo, texto) => {
        pergunta = texto;
        return '```json\n[{"acao":"despesa","valor":87.5,"metodo":"pix","categoria":"mercado","data":"02/11/2026","descricao":"Supermercado Bom Preço"}]\n```';
    };
    const r = (await enviar('', {}, { imageMessage: { caption: '#comprovante compra do mês', mimetype: 'image/jpeg' } })).ultima();
    assert.ok(r.includes('comprovante lançado') && r.includes('Supermercado Bom Preço') && r.includes('R$ 87,50'), r);
    assert.ok(pergunta.includes('compra do mês'));
    assert.ok((await enviar('#comprovante')).ultima().includes('mande a foto'));
    ia.perguntarSobreImagem = async () => '[]';
    assert.ok((await enviar('', {}, { imageMessage: { caption: '#comprovante', mimetype: 'image/jpeg' } })).ultima().includes('não achei um valor'));
});

test('avisos automáticos: contas fixas, resumos e backup, uma vez por dia', async () => {
    await enviar('#fixo adicionar 120 internet dia 10');
    await enviar('#fixo adicionar 50 academia dia 10');
    await enviar('#despesa 50 pix fixos academia 10/11/2026');
    const bot = criarBot();

    // 10/11/2026 às 10h (Brasília): só a internet ainda não foi paga
    assert.deepStrictEqual(await agenda.verificar(bot, new Date('2026-11-10T13:00:00Z')), ['fixos']);
    const aviso = bot.ultima();
    assert.ok(aviso.includes('internet') && !aviso.includes('academia'), aviso);
    assert.strictEqual(bot.enviadas[0].jid, '5511912345678@s.whatsapp.net');
    assert.deepStrictEqual(await agenda.verificar(bot, new Date('2026-11-10T14:00:00Z')), [], 'não repete no mesmo dia');

    // 10/11 às 22h30: backup (e não repete se nada mudou)
    assert.deepStrictEqual(await agenda.verificar(bot, new Date('2026-11-11T01:30:00Z')), ['backup']);
    assert.strictEqual(bot.enviadas.at(-1).conteudo.fileName, 'backup-assistente-2026-11-10.json');
    assert.deepStrictEqual(await agenda.verificar(bot, new Date('2026-11-12T01:30:00Z')), []);

    // domingo 15/11 às 20h30: resumo da semana
    assert.ok((await agenda.verificar(bot, new Date('2026-11-15T23:30:00Z'))).includes('semanal'));
    assert.ok(bot.ultima().includes('resumo da semana') && bot.ultima().includes('• fixos: R$ 50,00'), bot.ultima());

    // 1º/12 às 9h30: fechamento de novembro
    assert.ok((await agenda.verificar(bot, new Date('2026-12-01T12:30:00Z'))).includes('mensal'));
    assert.ok(bot.textos().some((t) => t.includes('fechamento de novembro/2026')));

    assert.ok((await enviar('#avisos desligar fixos')).ultima().includes('desligado'));
    assert.deepStrictEqual(await agenda.verificar(bot, new Date('2026-12-10T13:00:00Z')), []);
    assert.ok((await enviar('#avisos')).ultima().includes('⛔ *fixos*'));
    assert.ok((await enviar('#avisos ligar fixos')).ultima().includes('ligado'));
});

test('#backup, #restaurar e #exportar', async () => {
    const bot = await enviar('#backup');
    const arquivo = bot.enviadas.at(-1).conteudo;
    assert.ok(arquivo.fileName.startsWith('backup-assistente-'));
    await enviar('#despesa 999 pix teste apagar depois');
    assert.ok((await enviar('#extrato')).ultima().includes('R$ 999,00'));

    midia.baixarDaMensagem = async () => arquivo.document;
    const doc = { documentMessage: { fileName: arquivo.fileName, mimetype: 'application/json' } };
    assert.ok((await enviar('', {}, respondendo('#restaurar', doc))).ultima().includes('restaurar confirmar'));
    assert.ok((await enviar('', {}, respondendo('#restaurar confirmar', doc))).ultima().includes('restaurado'));
    assert.ok(!(await enviar('#extrato')).ultima().includes('R$ 999,00'));

    const planilha = (await enviar('#exportar 11/2026')).enviadas.at(-1).conteudo;
    const csv = planilha.document.toString('utf8');
    assert.strictEqual(planilha.mimetype, 'text/csv');
    assert.ok(csv.startsWith('﻿nº;data;tipo;valor') && csv.includes('10/11/2026;despesa;-50,00;pix;;fixos;academia'), csv);
});

test('comandos rápidos: clima, cep, pokémon e traduzir', async () => {
    global.fetch = async (url) => {
        const respostas = [
            ['geocoding-api', { results: [{ name: 'São Paulo', admin1: 'São Paulo', country_code: 'BR', latitude: -23.5, longitude: -46.6 }] }],
            ['api.open-meteo', {
                current: { temperature_2m: 24.4, apparent_temperature: 25.1, relative_humidity_2m: 70, weather_code: 2, wind_speed_10m: 11.6 },
                daily: { time: ['2026-11-03', '2026-11-04'], weather_code: [2, 63], temperature_2m_max: [27, 22], temperature_2m_min: [18, 17], precipitation_probability_max: [10, 80] },
            }],
            ['viacep', { cep: '01001-000', logradouro: 'Praça da Sé', complemento: 'lado ímpar', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ddd: '11' }],
            ['pokeapi', {
                id: 6, name: 'charizard', height: 17, weight: 905,
                types: [{ type: { name: 'fire' } }, { type: { name: 'flying' } }],
                abilities: [{ ability: { name: 'blaze' }, is_hidden: false }, { ability: { name: 'solar-power' }, is_hidden: true }],
                stats: [{ stat: { name: 'hp' }, base_stat: 78 }, { stat: { name: 'speed' }, base_stat: 100 }],
                sprites: { other: { 'official-artwork': { front_default: 'https://exemplo/charizard.png' } } },
            }],
        ];
        const achada = respostas.find(([trecho]) => url.includes(trecho));
        return { ok: Boolean(achada), status: achada ? 200 : 404, json: async () => achada?.[1] };
    };
    const clima = (await enviar('#clima são paulo')).ultima();
    assert.ok(clima.includes('Open-Meteo.com'), 'crédito obrigatório do Open-Meteo');
    assert.ok(clima.includes('*São Paulo, São Paulo*') && clima.includes('*24°C*') && clima.includes('amanhã: 17° a 22° · chuva 80%'), clima);
    assert.ok((await enviar('#cep 01001-000')).ultima().includes('Praça da Sé'));
    assert.ok((await enviar('#cep 123')).ultima().includes('8 números'));
    const poke = (await enviar('#pokemon charizard')).enviadas.at(-1).conteudo;
    assert.strictEqual(poke.image.url, 'https://exemplo/charizard.png');
    assert.ok(poke.caption.includes('PokéAPI'));
    assert.ok(poke.caption.includes('#0006 charizard') && poke.caption.includes('fogo / voador') && poke.caption.includes('solar power (oculta)'), poke.caption);

    let pedido = '';
    ia.perguntarIA = async (texto) => { pedido = texto; return 'good morning'; };
    assert.strictEqual((await enviar('#traduzir en bom dia')).ultima(), '🌎 good morning');
    assert.ok(pedido.includes('para inglês') && pedido.endsWith('bom dia'));
    await enviar('', {}, respondendo('#traduzir', { conversation: 'hola amigo' }));
    assert.ok(pedido.endsWith('hola amigo'));
});

test('#img transforma figurinha parada em foto', async () => {
    midia.baixarDaMensagem = async () => Buffer.from('webp');
    midia.figurinhaParaFoto = async () => Buffer.from('png');
    const bot = await enviar('', {}, respondendo('#img', { stickerMessage: { isAnimated: false } }));
    assert.strictEqual(bot.enviadas.at(-1).conteudo.image.toString(), 'png');
    assert.ok((await enviar('', {}, respondendo('#img', { stickerMessage: { isAnimated: true } }))).ultima().includes('animada'));
    assert.ok((await enviar('#img')).ultima().includes('responda uma figurinha'));
});
