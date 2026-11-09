// Mensagens automáticas: contas fixas do dia, resumo da semana, resumo do mês e backup diário.
// Vão sempre para a conversa com você mesmo. O que já foi enviado fica anotado em dados/agenda.json.
const fin = require('./servicos/financas');
const backup = require('./servicos/backup');
const { ler, salvar } = require('./servicos/armazenamento');
const { montarGrafico } = require('./servicos/financas-texto');
const { enviar } = require('./envio');
const { carteiraPropria, meuJid } = require('./carteira');
const { reais, normalizar, isoDoDia, dataCurta, nomeDoMes, porcento, agoraEmBrasilia, diasNoMes } = require('./util/formato');
const { PREFIXO } = require('./config');

const ARQUIVO = 'agenda.json';

// ---------- tarefas ----------

// Contas fixas que vencem hoje (fixo com dia 31 vence no último dia de meses curtos) e ainda não foram pagas.
function avisoDeFixos(conta, agora) {
    const [ano, numeroDoMes] = agora.iso.split('-').map(Number);
    const ultimoDia = diasNoMes(ano, numeroDoMes);
    const mes = agora.iso.slice(0, 7);
    const pagos = new Set(conta.transacoes
        .filter((t) => t.categoria === 'fixos' && t.data.startsWith(mes))
        .map((t) => normalizar(t.descricao)));
    const vencendo = conta.fixos
        .map((f, i) => ({ ...f, numero: i + 1 }))
        .filter((f) => f.dia && (f.dia === agora.dia || (f.dia > ultimoDia && agora.dia === ultimoDia)))
        .filter((f) => !pagos.has(normalizar(f.descricao)));
    if (!vencendo.length) return null;
    const linhas = vencendo.map((f) => `${f.numero}. ${f.descricao} · ${reais(f.valor)}`);
    return `📌 *contas que vencem hoje*\n\n${linhas.join('\n')}\n\npra lançar como paga: ${PREFIXO}fixo pagar [nº]`;
}

function resumoDaSemana(conta, agora) {
    const inicio = isoDoDia(new Date(agora.data.getTime() - 6 * 86400000));
    const r = fin.resumoDoPeriodo(conta, inicio, agora.iso, null);
    if (!r.lancamentos) return null;
    let txt = `📊 *resumo da semana* (${dataCurta(inicio)} a ${dataCurta(agora.iso)})\n\n🟢 entrou: ${reais(r.entradas)}\n🔴 saiu: ${reais(r.saidas)}`;
    if (r.porCategoria.length) {
        txt += `\n\n*onde mais gastou*\n${r.porCategoria.slice(0, 5).map((g) => `• ${g.categoria}: ${reais(g.total)}`).join('\n')}`;
    }
    const faturas = fin.faturas(conta).filter((f) => f.gasto > 0);
    if (faturas.length) txt += `\n\n💳 ${faturas.map((f) => `${f.nome}: ${reais(f.gasto)}`).join(' · ')}`;
    const limites = fin.limitesDoMes(conta).filter((l) => l.fracao >= 0.8);
    for (const l of limites) txt += `\n${l.fracao >= 1 ? '🚨' : '⚠️'} ${l.categoria}: ${porcento(l.fracao)} do limite do mês`;
    txt += `\n💰 saldo em conta: *${reais(fin.saldoEmConta(conta))}*`;
    return txt;
}

function resumoDoMesPassado(conta, agora) {
    const [ano, mes] = agora.iso.split('-').map(Number);
    const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
    if (!fin.resumoDoMes(conta, anterior).lancamentos) return null;
    return `🗓️ *fechamento de ${nomeDoMes(anterior)}*\n\n${montarGrafico(conta, anterior)}`;
}

const TAREFAS = [
    { id: 'fixos', nome: 'contas fixas que vencem no dia', quando: 'todo dia às 9h', hora: 9 },
    { id: 'semanal', nome: 'resumo da semana', quando: 'domingo às 20h', hora: 20, diaSemana: 0 },
    { id: 'mensal', nome: 'fechamento do mês', quando: 'dia 1 às 9h', hora: 9, diaMes: 1 },
    { id: 'backup', nome: 'backup das finanças', quando: 'todo dia às 22h (se algo mudou)', hora: 22 },
];

// ---------- estado ----------

function estado() {
    const e = ler(ARQUIVO, {});
    return { ultimas: e.ultimas || {}, desligadas: e.desligadas || [], assinaturaBackup: e.assinaturaBackup || null };
}

function ligarDesligar(id, ligado) {
    const e = estado();
    e.desligadas = e.desligadas.filter((x) => x !== id);
    if (!ligado) e.desligadas.push(id);
    salvar(ARQUIVO, e);
}

function listarTarefas() {
    const { desligadas } = estado();
    return TAREFAS.map((t) => ({ ...t, ligada: !desligadas.includes(t.id) }));
}

// ---------- execução ----------

// Gera a mensagem de uma tarefa (ou null se não há nada a dizer).
function conteudoDaTarefa(id, bot, agora, { forcar = false } = {}) {
    const conta = fin.lerConta(carteiraPropria(bot));
    if (id === 'fixos') return avisoDeFixos(conta, agora);
    if (id === 'semanal') return resumoDaSemana(conta, agora);
    if (id === 'mensal') return resumoDoMesPassado(conta, agora);
    if (id === 'backup') {
        const { texto, assinatura } = backup.montarBackup();
        if (!forcar && assinatura === estado().assinaturaBackup) return null;
        const e = estado();
        e.assinaturaBackup = assinatura;
        salvar(ARQUIVO, e);
        return backup.mensagemDeBackup(texto, agora.iso);
    }
    return null;
}

function deveRodar(tarefa, agora, e) {
    if (e.desligadas.includes(tarefa.id) || e.ultimas[tarefa.id] === agora.iso) return false;
    if (agora.hora < tarefa.hora) return false;
    if (tarefa.diaSemana !== undefined && agora.diaSemana !== tarefa.diaSemana) return false;
    if (tarefa.diaMes !== undefined && agora.dia !== tarefa.diaMes) return false;
    return true;
}

let rodando = false;

// Confere se alguma tarefa está na hora. Se o bot estava desligado no horário, roda assim que voltar (no mesmo dia).
async function verificar(bot, data = new Date()) {
    const destino = meuJid(bot);
    if (!destino || rodando) return [];
    rodando = true;
    const feitas = [];
    try {
        const agora = agoraEmBrasilia(data);
        for (const tarefa of TAREFAS) {
            const e = estado();
            if (!deveRodar(tarefa, agora, e)) continue;
            // marca antes de enviar: se der erro, não fica mandando de novo a cada minuto
            e.ultimas[tarefa.id] = agora.iso;
            salvar(ARQUIVO, e);
            try {
                const conteudo = conteudoDaTarefa(tarefa.id, bot, agora);
                if (conteudo) {
                    await enviar(bot, destino, typeof conteudo === 'string' ? { text: conteudo } : conteudo);
                    feitas.push(tarefa.id);
                }
            } catch (erro) {
                console.error(`⚠️ aviso automático "${tarefa.id}" falhou:`, erro.message);
            }
        }
    } finally {
        rodando = false;
    }
    return feitas;
}

let intervalo = null;

function iniciar(bot) {
    parar();
    intervalo = setInterval(() => verificar(bot).catch((e) => console.error('⚠️ agenda:', e.message)), 60 * 1000);
    intervalo.unref?.();
    setTimeout(() => verificar(bot).catch(() => {}), 30 * 1000).unref?.();
}

function parar() {
    clearInterval(intervalo);
    intervalo = null;
}

module.exports = { iniciar, parar, verificar, listarTarefas, ligarDesligar, conteudoDaTarefa, TAREFAS };
