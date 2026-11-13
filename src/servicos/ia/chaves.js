// Chaves de IA de cada pessoa (#chave). Quem usa o bot pode colocar a própria chave da Groq, do Gemini, da
// Mistral ou do OpenRouter; os comandos dessa pessoa passam a gastar a cota dela, não a do dono.
//
// Como funciona: o roteador roda cada comando dentro de comChaves(pessoa, ...). Os provedores pedem a chave
// com chaveDe('groq') e recebem a da pessoa que mandou o comando (AsyncLocalStorage leva essa informação
// por todos os await, sem precisar passar a pessoa de função em função).
// Fora de um comando (avisos automáticos, testes), vale a chave do dono.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('../../config');
const { ler, salvar } = require('../armazenamento');
const { numerosDoAutor, variantesDoNumero } = require('../../util/mensagem');

const ARQUIVO = 'chaves.json';
const DONO = 'dono';

const IAS = {
    groq: { titulo: 'Groq', env: 'GROQ_API_KEY', site: 'console.groq.com/keys' },
    gemini: { titulo: 'Google Gemini', env: 'GEMINI_API_KEY', site: 'aistudio.google.com/apikey' },
    mistral: { titulo: 'Mistral', env: 'MISTRAL_API_KEY', site: 'console.mistral.ai' },
    openrouter: { titulo: 'OpenRouter', env: 'OPENROUTER_API_KEY', site: 'openrouter.ai/keys' },
};

const contexto = new AsyncLocalStorage();
let cache = null;

// ---------- arquivo ----------

// { pessoas: [{ numeros: ['5511...', '1179...'] ou ['dono'], chaves: { groq: '...' }, atualizado }] }
function dados() {
    if (!cache) {
        const lido = ler(ARQUIVO, {});
        cache = { pessoas: Array.isArray(lido.pessoas) ? lido.pessoas : [] };
    }
    return cache;
}

function gravar(novo) {
    cache = novo;
    salvar(ARQUIVO, novo);
    // só o usuário do aparelho que roda o bot lê o arquivo (onde o sistema deixar)
    try {
        fs.chmodSync(path.join(config.PASTA_DADOS, ARQUIVO), 0o600);
    } catch { /* Android/Termux às vezes não deixa: segue */ }
}

// "dono" para você; os números (com as variantes do 9º dígito) para os outros.
function numerosDa(pessoa) {
    return pessoa === DONO ? [DONO] : [...new Set(pessoa.flatMap(variantesDoNumero))];
}

function registroDa(pessoa, d = dados()) {
    const meus = numerosDa(pessoa);
    return d.pessoas.find((p) => p.numeros.some((n) => meus.includes(n))) || null;
}

function chavesDa(pessoa) {
    return { ...(registroDa(pessoa)?.chaves || {}) };
}

function guardarChave(pessoa, nome, chave) {
    const d = dados();
    let registro = registroDa(pessoa, d);
    if (!registro) {
        registro = { numeros: [], chaves: {} };
        d.pessoas.push(registro);
    }
    registro.numeros = [...new Set([...registro.numeros, ...numerosDa(pessoa)])];
    registro.chaves[nome] = chave;
    registro.atualizado = new Date().toISOString();
    gravar(d);
}

// nome = uma IA ou "tudo". Devolve quantas chaves saíram.
function removerChave(pessoa, nome) {
    const d = dados();
    const registro = registroDa(pessoa, d);
    if (!registro) return 0;
    const nomes = nome === 'tudo' ? Object.keys(registro.chaves) : [nome].filter((n) => registro.chaves[n]);
    for (const n of nomes) delete registro.chaves[n];
    if (!Object.keys(registro.chaves).length) d.pessoas = d.pessoas.filter((p) => p !== registro);
    gravar(d);
    return nomes.length;
}

// ---------- quem está pedindo ----------

// Quem mandou a mensagem: "dono" (sai do seu WhatsApp) ou a lista de números da pessoa.
function pessoaDaMensagem(key) {
    return key.fromMe ? DONO : numerosDoAutor(key);
}

function comChaves(pessoa, funcao) {
    return contexto.run({ pessoa }, funcao);
}

function ehDono() {
    const pessoa = contexto.getStore()?.pessoa;
    return !pessoa || pessoa === DONO;
}

// Quem não tem chave própria usa a do dono? (EMPRESTAR_CHAVES no .env; padrão: sim)
function emprestar() {
    return !/^(nao|não|false|0|off|desligado)$/i.test(String(process.env.EMPRESTAR_CHAVES || 'sim').trim());
}

// A chave que vale agora para essa IA, e de quem ela é: { chave, de: 'sua' | 'dono' | null }.
function chaveEOrigem(nome) {
    const pessoa = contexto.getStore()?.pessoa || DONO;
    const propria = chavesDa(pessoa)[nome];
    if (propria) return { chave: propria, de: 'sua' };
    const doDono = pessoa === DONO ? config[IAS[nome].env] : (emprestar() && (chavesDa(DONO)[nome] || config[IAS[nome].env]));
    if (doDono) return { chave: doDono, de: 'dono' };
    return { chave: '', de: null };
}

function chaveDe(nome) {
    return chaveEOrigem(nome).chave;
}

// Pedaço curto e fixo de cada chave: separa o "descanso" da fila por chave (o limite de uma pessoa não para as outras).
function idDaChave(nome) {
    const chave = chaveDe(nome);
    return chave ? crypto.createHash('sha256').update(chave).digest('hex').slice(0, 10) : '-';
}

// ---------- ler e testar a chave ----------

// "gsk_abc...xyz9" -> "gsk_…xyz9" (nunca mostra a chave inteira)
function mascarar(chave) {
    const t = String(chave || '');
    const inicio = t.match(/^(gsk_|AIza|sk-or-v1-|sk-or-)/)?.[0] || '';
    return `${inicio}…${t.slice(-4)}`;
}

// Descobre a IA pelo jeito da chave. Devolve o nome ou null.
function adivinharIA(chave) {
    if (/^gsk_[A-Za-z0-9]{20,}$/.test(chave)) return 'groq';
    if (/^AIza[0-9A-Za-z_-]{30,}$/.test(chave)) return 'gemini';
    if (/^sk-or-[A-Za-z0-9-]{20,}$/.test(chave)) return 'openrouter';
    if (/^[A-Za-z0-9]{32}$/.test(chave)) return 'mistral';
    return null;
}

function pareceChave(texto) {
    return /^[A-Za-z0-9_-]{20,200}$/.test(String(texto || ''));
}

const TESTES = {
    groq: (k) => ['https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${k}` }],
    gemini: (k) => ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': k }],
    mistral: (k) => ['https://api.mistral.ai/v1/models', { Authorization: `Bearer ${k}` }],
    openrouter: (k) => ['https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${k}` }],
};

// Pergunta para a própria IA se a chave vale (pedido que não gasta cota). Devolve 'ok', 'invalida' ou 'sem_resposta'.
async function testarChave(nome, chave) {
    const [url, headers] = TESTES[nome](chave);
    try {
        const resposta = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        if (resposta.ok) return 'ok';
        if ([400, 401, 403].includes(resposta.status)) return 'invalida';
        return 'sem_resposta';
    } catch {
        return 'sem_resposta';
    }
}

module.exports = {
    IAS, DONO,
    pessoaDaMensagem, comChaves, ehDono, emprestar,
    chaveDe, chaveEOrigem, idDaChave, chavesDa, guardarChave, removerChave,
    mascarar, adivinharIA, pareceChave, testarChave,
};
