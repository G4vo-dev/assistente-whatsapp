// Junta todos os comandos e monta o #menu e o #ajuda sozinhos.
// Para criar um comando novo: adicione um objeto { nome, uso, descricao, executar } num dos arquivos abaixo.
const { normalizar } = require('../util/formato');

const CATEGORIAS = [
    require('./midia'),
    require('./ia'),
    require('./assistente'),
    require('./financas'),
    require('./planejamento'),
    require('./relatorios'),
    require('./dados'),
    require('./utilitarios'),
    require('./rapidos'),
    require('./nerd'),
    require('./geral'),
];

const porNome = new Map();
for (const { comandos } of CATEGORIAS) {
    for (const comando of comandos) {
        for (const nome of [comando.nome, ...(comando.apelidos || [])]) {
            const chave = normalizar(nome);
            if (porNome.has(chave)) throw new Error(`comando repetido: ${nome}`);
            porNome.set(chave, comando);
        }
    }
}

function encontrarComando(nome) {
    return porNome.get(normalizar(nome));
}

// Distância entre palavras, para sugerir "#saldo" quando alguém digita "#sald".
function distancia(a, b) {
    const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let anterior = linha[0];
        linha[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const guardado = linha[j];
            linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
            anterior = guardado;
        }
    }
    return linha[b.length];
}

function sugerirComando(nome) {
    const alvo = normalizar(nome);
    let melhor = null;
    for (const [chave, comando] of porNome) {
        const d = distancia(alvo, chave);
        if (d <= 2 && chave.length > 1 && (!melhor || d < melhor.d)) melhor = { d, comando };
    }
    return melhor?.comando || null;
}

function montarMenu(prefixo) {
    let txt = '🤖 *assistente · comandos*\n';
    for (const { titulo, comandos } of CATEGORIAS) {
        txt += `\n${titulo}\n`;
        for (const c of comandos) txt += `${prefixo}${c.uso || c.nome} · ${c.descricao}\n`;
    }
    txt += `\n❓ detalhes e exemplos: ${prefixo}ajuda [comando]`;
    return txt;
}

function montarAjuda(nome, prefixo) {
    const c = encontrarComando(nome);
    if (!c) return `❌ não conheço o comando ${prefixo}${nome}. veja a lista em ${prefixo}menu`;
    let txt = `❓ *${prefixo}${c.uso || c.nome}*\n${c.descricao}`;
    if (c.ajuda) txt += `\n\n${c.ajuda}`;
    if (c.exemplos?.length) txt += `\n\n*exemplos*\n${c.exemplos.map((e) => `${prefixo}${e}`).join('\n')}`;
    if (c.apelidos?.length) txt += `\n\n*também funciona:* ${c.apelidos.map((a) => prefixo + a).join(', ')}`;
    return txt;
}

module.exports = { encontrarComando, sugerirComando, montarMenu, montarAjuda };
