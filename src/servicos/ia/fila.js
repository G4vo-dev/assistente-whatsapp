// Fila de IAs: cada tarefa tem uma ordem (config FILAS_IA). Tenta a primeira; se falhar ou bater no limite,
// passa para a próxima. Quem bate no limite fica "descansando" um tempo e é pulado direto.
const { FILAS_IA } = require('../../config');

const PROVEDORES = {
    groq: require('./groq'),
    gemini: require('./gemini'),
    mistral: require('./mistral'),
    openrouter: require('./openrouter'),
};

// tarefa -> o que a IA precisa saber fazer
const CAPACIDADE = { texto: 'texto', financas: 'texto', imagem: 'imagem', pdf: 'pdf', audio: 'audio' };

const descanso = new Map(); // "groq:texto" -> { ate: timestamp, motivo }
const usos = {};
const ultimosErros = {};

class SemIADisponivel extends Error {
    constructor(tarefa, tentativas) {
        super(tentativas.length
            ? `nenhuma IA respondeu (${tentativas.join('; ')})`
            : `nenhuma IA configurada para ${tarefa}`);
        this.tentativas = tentativas;
    }
}

function statusDoErro(erro) {
    return erro?.status || erro?.response?.status || null;
}

function segundosParaEsperar(erro) {
    const cabecalho = typeof erro?.headers?.get === 'function' ? erro.headers.get('retry-after') : erro?.headers?.['retry-after'];
    return Number(erro?.esperarSegundos || cabecalho) || null;
}

// Decide por quanto tempo pular essa IA depois de um erro.
function registrarFalha(nome, capacidade, erro) {
    const status = statusDoErro(erro);
    let segundos = 0;
    let motivo = '';
    if (status === 429) {
        segundos = Math.min(15 * 60, Math.max(30, segundosParaEsperar(erro) || 60));
        motivo = 'limite atingido';
    } else if (status === 401 || status === 403) {
        segundos = 30 * 60;
        motivo = 'chave inválida ou sem permissão';
    } else if (status === 402) {
        segundos = 60 * 60;
        motivo = 'sem créditos';
    }
    ultimosErros[nome] = { quando: Date.now(), mensagem: String(erro?.message || erro).slice(0, 160) };
    if (segundos) descanso.set(`${nome}:${capacidade}`, { ate: Date.now() + segundos * 1000, motivo });
    return motivo || String(erro?.message || 'erro').slice(0, 80);
}

function descansando(nome, capacidade) {
    const d = descanso.get(`${nome}:${capacidade}`);
    if (!d) return null;
    if (d.ate <= Date.now()) {
        descanso.delete(`${nome}:${capacidade}`);
        return null;
    }
    return d;
}

function candidatos(tarefa) {
    const capacidade = CAPACIDADE[tarefa];
    return (FILAS_IA[tarefa] || [])
        .map((nome) => PROVEDORES[nome])
        .filter((p) => p && p.sabe[capacidade] && p.ligado());
}

function disponivel(tarefa) {
    return candidatos(tarefa).length > 0;
}

// chamar(provedor) faz o pedido; devolve { texto, provedor } da primeira IA que responder.
async function executar(tarefa, chamar) {
    const capacidade = CAPACIDADE[tarefa];
    const tentativas = [];
    for (const provedor of candidatos(tarefa)) {
        const parado = descansando(provedor.nome, capacidade);
        if (parado) {
            tentativas.push(`${provedor.nome}: ${parado.motivo}`);
            continue;
        }
        try {
            const texto = String(await chamar(provedor) || '').trim();
            if (!texto) throw new Error('resposta vazia');
            usos[provedor.nome] = (usos[provedor.nome] || 0) + 1;
            if (tentativas.length) console.log(`↪️ ${tarefa}: respondido pela ${provedor.nome} (antes: ${tentativas.join('; ')})`);
            return { texto, provedor: provedor.nome };
        } catch (erro) {
            const motivo = registrarFalha(provedor.nome, capacidade, erro);
            console.error(`⚠️ IA ${provedor.nome} (${tarefa}) falhou: ${motivo}`);
            tentativas.push(`${provedor.nome}: ${motivo}`);
        }
    }
    throw new SemIADisponivel(tarefa, tentativas);
}

// Para o #ias: o estado de cada IA e a ordem de cada fila.
function situacao() {
    const provedores = Object.values(PROVEDORES).map((p) => {
        const parados = Object.keys(CAPACIDADE)
            .map((t) => CAPACIDADE[t])
            .filter((c, i, todos) => todos.indexOf(c) === i)
            .map((c) => ({ capacidade: c, d: descansando(p.nome, c) }))
            .filter((x) => x.d);
        return { nome: p.nome, titulo: p.titulo, ligado: p.ligado(), usos: usos[p.nome] || 0, parados, ultimoErro: ultimosErros[p.nome] || null };
    });
    const filas = Object.fromEntries(Object.keys(CAPACIDADE).map((t) => [t, candidatos(t).map((p) => p.nome)]));
    return { provedores, filas };
}

function zerar() {
    descanso.clear();
    for (const chave of Object.keys(usos)) delete usos[chave];
    for (const chave of Object.keys(ultimosErros)) delete ultimosErros[chave];
}

module.exports = { PROVEDORES, executar, disponivel, situacao, zerar, SemIADisponivel };
