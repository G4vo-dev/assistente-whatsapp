// Testes da cópia de segurança do login do WhatsApp (auth_info_baileys.reserva).
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const { copiarLogin } = require('../src/servicos/login');

function pastaTemporaria() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-login-'));
}

test('cópia: copia o login quando o creds.json é válido', () => {
    const pasta = pastaTemporaria();
    const origem = path.join(pasta, 'auth');
    const destino = path.join(pasta, 'reserva');
    fs.mkdirSync(origem);
    fs.writeFileSync(path.join(origem, 'creds.json'), '{"ok":true}');
    fs.writeFileSync(path.join(origem, 'session-1.json'), '{}');
    assert.strictEqual(copiarLogin(origem, destino), true);
    assert.strictEqual(fs.readFileSync(path.join(destino, 'creds.json'), 'utf8'), '{"ok":true}');
    assert.ok(fs.existsSync(path.join(destino, 'session-1.json')));
});

test('cópia: não sobrescreve a reserva boa com um login corrompido', () => {
    const pasta = pastaTemporaria();
    const origem = path.join(pasta, 'auth');
    const destino = path.join(pasta, 'reserva');
    fs.mkdirSync(origem);
    fs.mkdirSync(destino);
    fs.writeFileSync(path.join(destino, 'creds.json'), '{"bom":true}');
    fs.writeFileSync(path.join(origem, 'creds.json'), '{quebrado');
    assert.strictEqual(copiarLogin(origem, destino), false);
    assert.strictEqual(fs.readFileSync(path.join(destino, 'creds.json'), 'utf8'), '{"bom":true}');
});

test('cópia: pasta de origem inexistente não dá erro', () => {
    const pasta = pastaTemporaria();
    assert.strictEqual(copiarLogin(path.join(pasta, 'nao-existe'), path.join(pasta, 'reserva')), false);
});
