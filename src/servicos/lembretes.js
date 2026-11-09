// Lembretes salvos em arquivo: continuam valendo mesmo se o bot reiniciar ou a conexão cair.
const { ler, salvar } = require('./armazenamento');
const { novoId } = require('../util/id');

const ARQUIVO = 'lembretes.json';
const timers = new Map();
let enviar = null; // (jid, texto) => Promise; definido quando o bot conecta

function definirEnvio(funcao) {
    enviar = funcao;
}

function todos() {
    return ler(ARQUIVO, []);
}

function remover(id) {
    salvar(ARQUIVO, todos().filter((l) => l.id !== id));
}

function agendar(lembrete, espera = Math.max(0, lembrete.quando - Date.now())) {
    clearTimeout(timers.get(lembrete.id));
    // setTimeout aceita no máximo ~24 dias; para prazos maiores, confere de novo depois
    const timer = setTimeout(() => disparar(lembrete.id), Math.min(espera, 2 ** 31 - 1));
    timer.unref?.();
    timers.set(lembrete.id, timer);
}

async function disparar(id) {
    timers.delete(id);
    const lembrete = todos().find((l) => l.id === id);
    if (!lembrete) return;
    if (lembrete.quando > Date.now() + 1000) return agendar(lembrete);
    try {
        if (!enviar) throw new Error('bot desconectado');
        await enviar(lembrete.jid, `⏰ *LEMBRETE:* ${lembrete.texto}`);
        remover(id);
    } catch (erro) {
        console.error(`⚠️ lembrete não enviado (${erro.message}). tento de novo em 30s.`);
        agendar(lembrete, 30000);
    }
}

function criar(jid, minutos, texto) {
    const lembrete = {
        id: novoId(),
        jid,
        quando: Date.now() + minutos * 60000,
        texto,
    };
    salvar(ARQUIVO, [...todos(), lembrete]);
    agendar(lembrete);
    return lembrete;
}

function listar(jid) {
    return todos().filter((l) => l.jid === jid).sort((a, b) => a.quando - b.quando);
}

// Cancela pelo número que aparece em #lembretes (1, 2, 3...).
function cancelar(jid, posicao) {
    const lembrete = listar(jid)[posicao - 1];
    if (!lembrete) return null;
    clearTimeout(timers.get(lembrete.id));
    timers.delete(lembrete.id);
    remover(lembrete.id);
    return lembrete;
}

// Chamado quando o bot conecta: agenda tudo o que ficou pendente.
function retomarPendentes() {
    for (const lembrete of todos()) {
        if (!timers.has(lembrete.id)) agendar(lembrete);
    }
}

// Para backup e restauração.
function exportar() {
    return todos();
}

function importar(lista) {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    salvar(ARQUIVO, Array.isArray(lista) ? lista : []);
    retomarPendentes();
}

module.exports = { definirEnvio, criar, listar, cancelar, retomarPendentes, exportar, importar };
