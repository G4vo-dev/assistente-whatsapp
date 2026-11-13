// Testes do #status, dos avisos de queda/volta e do backup diário no aparelho.
const { criarBot, mensagem, limpar } = require('./ajudante');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { tratarMensagem } = require('../src/roteador');
const estado = require('../src/estado');
const { guardarBackupDiario } = require('../src/servicos/armazenamento');
const { PASTA_DADOS } = require('../src/config');

test.after(limpar);

test('primeira conexão avisa que ligou', () => {
    const e = estado.novo();
    const msg = estado.mensagemDeConexao(e.conectou(1000));
    assert.match(msg, /assistente ligado/);
});

test('depois de uma queda avisa que voltou e quanto tempo ficou fora', () => {
    const e = estado.novo();
    e.conectou(1000);
    e.caiu(428, 2000);
    const msg = estado.mensagemDeConexao(e.conectou(2000 + 95 * 1000));
    assert.match(msg, /voltei/);
    assert.match(msg, /1 min/);
    assert.match(msg, /428/);
});

test('duração em português', () => {
    assert.strictEqual(estado.duracao(30), '30 s');
    assert.strictEqual(estado.duracao(95), '1 min');
    assert.strictEqual(estado.duracao(3 * 3600 + 120), '3 h 2 min');
    assert.strictEqual(estado.duracao(2 * 86400 + 3600), '2 d 1 h');
});

test('#status mostra o nome, a conexão, IAs e lembretes', async () => {
    const bot = criarBot();
    await tratarMensagem(bot, mensagem('#status'));
    const txt = bot.ultima();
    assert.match(txt, /assistente \d+\.\d+\.\d+/);
    assert.match(txt, /ligado há/);
    assert.match(txt, /IAs/);
    assert.match(txt, /lembretes/);
    assert.match(txt, /memória/);
});

test('backup diário no aparelho guarda só os 7 mais novos', () => {
    for (let dia = 1; dia <= 9; dia++) {
        guardarBackupDiario(`2026-11-0${dia}`, `{"dia":${dia}}`, 7);
    }
    const pasta = path.join(PASTA_DADOS, 'backups');
    const arquivos = fs.readdirSync(pasta).filter((n) => n.startsWith('diario-')).sort();
    assert.strictEqual(arquivos.length, 7);
    assert.strictEqual(arquivos[0], 'diario-2026-11-03.json');
    assert.strictEqual(arquivos.at(-1), 'diario-2026-11-09.json');
});

test('padrão do prefixo é "#" quando não há PREFIXO no ambiente', () => {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['-e', "console.log(require('./src/config').PREFIXO)"], {
        cwd: path.join(__dirname, '..'),
        env: { PATH: process.env.PATH, PASTA_DADOS: path.join(PASTA_DADOS, 'x') },
        encoding: 'utf8',
    });
    assert.strictEqual(r.stdout.trim(), '#');
});

test('piscadas de menos de 20 s não geram aviso', () => {
    const e = estado.novo();
    e.conectou(1000);
    e.caiu(408, 2000);
    assert.strictEqual(estado.mensagemDeConexao(e.conectou(2000 + 5000)), null);
});
