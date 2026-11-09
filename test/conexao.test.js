// Testes do que acontece quando a conexão cai e da trava que impede duas cópias do bot ligadas ao mesmo tempo.
require('./ajudante');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { once } = require('events');
const test = require('node:test');
const assert = require('node:assert');

const { aoCair } = require('../src/conexao');
const { pegarTrava, portaDaPasta } = require('../src/servicos/trava');

const RAIZ = path.join(__dirname, '..');

test('quando a conexão cai: reconecta, pede para parear de novo ou para se outra cópia assumiu', () => {
    assert.strictEqual(aoCair(428).reconectar, true, 'conexão fechada');
    assert.strictEqual(aoCair(515).reconectar, true, 'o WhatsApp pede para reiniciar depois de parear');
    assert.strictEqual(aoCair(undefined).reconectar, true, 'sem código');
    assert.strictEqual(aoCair(401).sair, 2, 'aparelho desconectado: precisa parear');
    assert.strictEqual(aoCair(440).sair, 3, 'outra cópia conectou com a mesma sessão');
});

test('só uma cópia do bot por pasta', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-trava-'));
    const codigo = `require(${JSON.stringify(path.join(RAIZ, 'src', 'servicos', 'trava'))}).pegarTrava(${JSON.stringify(pasta)})`
        + '.then((ok) => { console.log(ok); setInterval(() => {}, 1000); })';
    const primeira = spawn(process.execPath, ['-e', codigo]);
    const [saida] = await once(primeira.stdout, 'data');
    assert.strictEqual(String(saida).trim(), 'true');
    assert.strictEqual(await pegarTrava(pasta), false, 'a segunda cópia não liga');
    primeira.kill();
    await once(primeira, 'exit');
    assert.strictEqual(await pegarTrava(pasta), true, 'depois que a primeira fecha, liga normalmente');
});

test('porta ocupada por outro programa não impede o bot de ligar', async () => {
    const pasta = path.join(os.tmpdir(), 'assistente-outro-programa');
    const servidor = net.createServer((conexao) => conexao.end('outro programa')).listen(portaDaPasta(pasta), '127.0.0.1');
    await once(servidor, 'listening');
    try {
        assert.strictEqual(await pegarTrava(pasta), true);
    } finally {
        servidor.close();
    }
});

test('scripts/iniciar.sh para de religar quando outra cópia já está ligada (código 3)', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-node-falso-'));
    fs.writeFileSync(path.join(pasta, 'node'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
    const r = spawnSync('sh', [path.join(RAIZ, 'scripts', 'iniciar.sh')], {
        env: { ...process.env, PATH: `${pasta}:${process.env.PATH}` }, encoding: 'utf8', timeout: 5000,
    });
    assert.strictEqual(r.status, 3, `${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes('já está ligado'), r.stdout);
});
