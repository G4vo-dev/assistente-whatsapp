// Finanças: lançamentos, parcelas, cartões, faturas, gastos fixos, metas e limites por categoria.
// Cada conversa tem a sua "carteira". A conversa com você mesmo usa a carteira "eu".
const { ler, salvar, existe, backup } = require('./armazenamento');
const { migrar, haDadosAntigos } = require('./migracao');
const modelo = require('./financas-modelo');
const { contaVazia, completarConta, normalizarTransacao, mesclarContas } = modelo;
const { arredondar, normalizar, hojeISO, mesAtual, diasNoMes, reais, porcento } = require('../util/formato');
const { novoId } = require('../util/id');
const { numeroDoJid } = require('../util/mensagem');

const ARQUIVO = 'financas.json';

function carregar() {
    const atual = ler(ARQUIVO, null);
    if (atual?.versao === 3) return atual;
    if (atual === null && !haDadosAntigos()) return { versao: 3, contas: {} };
    if (existe(ARQUIVO)) backup(ARQUIVO);
    const migrado = migrar(atual);
    salvar(ARQUIVO, migrado);
    return migrado;
}

// ref = { chave: 'eu' ou jid, aliases: ['número', 'lid'...] }
// Se existir carteira antiga salva com outro ID da mesma pessoa, junta tudo na chave certa.
function contaDe(dados, ref) {
    let conta = dados.contas[ref.chave] ? completarConta(dados.contas[ref.chave]) : null;
    for (const outra of Object.keys(dados.contas)) {
        if (outra === ref.chave || !(ref.aliases || []).includes(numeroDoJid(outra))) continue;
        const achada = completarConta(dados.contas[outra]);
        conta = conta ? mesclarContas(conta, achada) : achada;
        delete dados.contas[outra];
    }
    dados.contas[ref.chave] = conta || contaVazia();
    return dados.contas[ref.chave];
}

function lerConta(ref) {
    return contaDe(carregar(), ref);
}

// Abre a carteira, roda a alteração e salva.
function alterarConta(ref, alteracao) {
    const dados = carregar();
    const resultado = alteracao(contaDe(dados, ref));
    salvar(ARQUIVO, dados);
    return resultado;
}

// Todas as carteiras (usado pelos avisos automáticos e pelo backup).
function todasAsContas() {
    const dados = carregar();
    for (const conta of Object.values(dados.contas)) completarConta(conta);
    return dados.contas;
}

// ---------- lançamentos ----------

function adicionarTransacao(conta, dados) {
    const t = normalizarTransacao({ ...dados, data: dados.data || hojeISO(), criadoEm: new Date().toISOString() });
    conta.transacoes.push(t);
    return { transacao: t, numero: conta.transacoes.length };
}

// Mesmo dia, N meses depois (31/01 + 1 mês = 28/02 ou 29/02).
function somarMeses(iso, meses) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
    alvo.setUTCDate(Math.min(dia, diasNoMes(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1)));
    return alvo.toISOString().slice(0, 10);
}

// Compra parcelada: cria uma parcela por mês, todas ligadas (apagar uma apaga todas).
function adicionarParcelado(conta, dados, parcelas) {
    const vinculo = novoId();
    const inicio = dados.data || hojeISO();
    const base = Math.floor((dados.valor / parcelas) * 100) / 100;
    const ultima = arredondar(dados.valor - base * (parcelas - 1));
    const criadas = [];
    for (let i = 0; i < parcelas; i++) {
        criadas.push(adicionarTransacao(conta, {
            ...dados,
            valor: i === parcelas - 1 ? ultima : base,
            data: somarMeses(inicio, i),
            vinculo,
            parcela: { atual: i + 1, total: parcelas },
        }));
    }
    return criadas;
}

// Remove pelo número do #extrato. Parcelas e pagamento de fatura saem todos juntos.
function removerTransacao(conta, numero) {
    const alvo = conta.transacoes[numero - 1];
    if (!alvo) return null;
    const antes = conta.transacoes.length;
    conta.transacoes = conta.transacoes.filter((t) => t !== alvo && !(alvo.vinculo && t.vinculo === alvo.vinculo));
    return { removida: alvo, quantidade: antes - conta.transacoes.length };
}

function ehCredito(t) {
    return t.metodo === 'credito';
}

function ehFuturo(t) {
    return t.data > hojeISO();
}

function nomeComParcela(t) {
    return t.parcela ? `${t.descricao} (${t.parcela.atual}/${t.parcela.total})` : t.descricao;
}

// Lançamentos com data futura (parcelas agendadas) só contam quando a data chegar.
function saldoEmConta(conta) {
    return arredondar(conta.transacoes
        .filter((t) => !ehCredito(t) && !ehFuturo(t))
        .reduce((soma, t) => soma + (t.tipo === 'receita' ? t.valor : -t.valor), 0));
}

function agendadoEmConta(conta) {
    return arredondar(conta.transacoes
        .filter((t) => !ehCredito(t) && ehFuturo(t))
        .reduce((soma, t) => soma + (t.tipo === 'despesa' ? t.valor : -t.valor), 0));
}

// ---------- cartões e faturas ----------

function acharCartao(conta, nome) {
    return modelo.acharCartao(conta.cartoes, nome);
}

function salvarCartao(conta, nome, limite) {
    const existente = acharCartao(conta, nome);
    if (existente) {
        existente.limite = arredondar(limite);
        return { cartao: existente, novo: false };
    }
    const cartao = { nome: String(nome).toLowerCase(), limite: arredondar(limite) };
    conta.cartoes.push(cartao);
    return { cartao, novo: true };
}

function removerCartao(conta, nome) {
    const cartao = acharCartao(conta, nome);
    if (!cartao) return null;
    conta.cartoes = conta.cartoes.filter((c) => c !== cartao);
    return cartao;
}

// fatura atual = compras até este mês - pagamentos. comprometido = tudo, incluindo parcelas futuras.
function situacaoDoCartao(conta, nomeCartao) {
    const alvo = normalizar(nomeCartao);
    const doCartao = conta.transacoes.filter((t) => ehCredito(t) && normalizar(t.cartao) === alvo);
    const ateEsteMes = mesAtual();
    let fatura = 0;
    let comprometido = 0;
    for (const t of doCartao) {
        const valor = t.tipo === 'despesa' ? t.valor : -t.valor;
        comprometido += valor;
        if (t.tipo !== 'despesa' || t.data.slice(0, 7) <= ateEsteMes) fatura += valor;
    }
    return { fatura: arredondar(fatura), comprometido: arredondar(comprometido), futuras: arredondar(comprometido - fatura) };
}

function faturaDe(conta, nomeCartao) {
    return situacaoDoCartao(conta, nomeCartao).fatura;
}

function faturas(conta) {
    const montar = (nome, limite) => {
        const s = situacaoDoCartao(conta, nome);
        return { nome, limite, gasto: s.fatura, futuras: s.futuras, comprometido: s.comprometido, livre: limite === null ? null : arredondar(limite - s.comprometido) };
    };
    const lista = conta.cartoes.map((c) => montar(c.nome, c.limite));
    // compras no crédito de cartões que foram removidos ou nunca cadastrados
    const conhecidos = new Set(conta.cartoes.map((c) => normalizar(c.nome)));
    const soltos = new Set(conta.transacoes.filter((t) => ehCredito(t) && !conhecidos.has(normalizar(t.cartao))).map((t) => t.cartao || ''));
    for (const nome of soltos) {
        const item = montar(nome, null);
        if (item.comprometido) lista.push({ ...item, nome: nome || 'sem cartão' });
    }
    return lista;
}

// Pagar fatura = sai da conta (pix) e abate do cartão. As duas partes ficam ligadas.
function pagarFatura(conta, nomeCartao, valor) {
    const vinculo = novoId();
    const base = { valor, categoria: 'fatura', data: hojeISO(), vinculo };
    adicionarTransacao(conta, { ...base, tipo: 'despesa', metodo: 'pix', descricao: `pagamento fatura ${nomeCartao}` });
    adicionarTransacao(conta, { ...base, tipo: 'receita', metodo: 'credito', cartao: nomeCartao, descricao: `abatimento fatura ${nomeCartao}` });
    return faturaDe(conta, nomeCartao);
}

// Avisos que todo lançamento no crédito deve mostrar.
function avisoDoCartao(conta, nomeCartao) {
    const cartao = acharCartao(conta, nomeCartao);
    const s = situacaoDoCartao(conta, nomeCartao);
    let txt = `💳 fatura ${nomeCartao}: ${reais(s.fatura)}`;
    if (s.futuras > 0) txt += ` (+ ${reais(s.futuras)} nos próximos meses)`;
    if (cartao) {
        txt += `\n💳 limite livre: ${reais(cartao.limite - s.comprometido)} de ${reais(cartao.limite)}`;
        if (s.comprometido > cartao.limite) txt += '\n⚠️ passou do limite do cartão!';
    }
    return txt;
}

// ---------- gastos fixos ----------

function totalFixos(conta) {
    return arredondar(conta.fixos.reduce((soma, f) => soma + f.valor, 0));
}

// ---------- metas ----------

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

function prioridadeValida(texto) {
    const p = normalizar(texto);
    return p in ORDEM_PRIORIDADE ? p : null;
}

// ---------- limites por categoria ----------

function gastoNaCategoria(conta, categoria, anoMes) {
    const alvo = normalizar(categoria);
    return arredondar(conta.transacoes
        .filter((t) => t.tipo === 'despesa' && t.categoria !== 'fatura' && normalizar(t.categoria) === alvo && t.data.startsWith(anoMes))
        .reduce((s, t) => s + t.valor, 0));
}

function definirLimite(conta, categoria, valor) {
    const alvo = normalizar(categoria);
    const existente = conta.limites.find((l) => normalizar(l.categoria) === alvo);
    if (existente) existente.valor = arredondar(valor);
    else conta.limites.push({ categoria: String(categoria).toLowerCase(), valor: arredondar(valor) });
}

function removerLimite(conta, categoria) {
    const alvo = normalizar(categoria);
    const existente = conta.limites.find((l) => normalizar(l.categoria) === alvo);
    if (existente) conta.limites = conta.limites.filter((l) => l !== existente);
    return existente || null;
}

function limitesDoMes(conta, anoMes = mesAtual()) {
    return conta.limites.map((l) => {
        const gasto = gastoNaCategoria(conta, l.categoria, anoMes);
        return { ...l, gasto, fracao: l.valor > 0 ? gasto / l.valor : 0 };
    });
}

// Depois de lançar despesas, avisa se alguma categoria cruzou 80% ou 100% do limite no mês.
function avisosDeLimite(conta, novas) {
    const grupos = new Map();
    for (const t of novas) {
        if (t.tipo !== 'despesa' || t.categoria === 'fatura') continue;
        const chave = `${normalizar(t.categoria)}|${t.data.slice(0, 7)}`;
        const grupo = grupos.get(chave) || { categoria: t.categoria, anoMes: t.data.slice(0, 7), soma: 0 };
        grupo.soma += t.valor;
        grupos.set(chave, grupo);
    }
    const avisos = [];
    for (const g of grupos.values()) {
        const limite = conta.limites.find((l) => normalizar(l.categoria) === normalizar(g.categoria));
        if (!limite || !(limite.valor > 0)) continue;
        const depois = gastoNaCategoria(conta, g.categoria, g.anoMes);
        const antes = depois - g.soma;
        const quando = g.anoMes === mesAtual() ? 'este mês' : `em ${g.anoMes.slice(5)}/${g.anoMes.slice(0, 4)}`;
        if (antes < limite.valor && depois >= limite.valor) {
            avisos.push(`🚨 *${limite.categoria}* passou do limite ${quando}: ${reais(depois)} de ${reais(limite.valor)}`);
        } else if (antes < limite.valor * 0.8 && depois >= limite.valor * 0.8) {
            avisos.push(`⚠️ *${limite.categoria}* chegou a ${porcento(depois / limite.valor)} do limite ${quando}: ${reais(depois)} de ${reais(limite.valor)}`);
        }
    }
    return avisos;
}

// ---------- relatórios ----------

// Estatísticas de um período. Pagamento de fatura não conta como gasto (já contou na compra).
function resumoDoPeriodo(conta, inicioISO, fimISO, rotulo) {
    const doPeriodo = conta.transacoes.filter((t) => t.data >= inicioISO && t.data <= fimISO && t.categoria !== 'fatura');
    const entradas = doPeriodo.filter((t) => t.tipo === 'receita' && !ehCredito(t));
    const saidas = doPeriodo.filter((t) => t.tipo === 'despesa');
    const somar = (lista) => arredondar(lista.reduce((s, t) => s + t.valor, 0));

    const grupos = new Map();
    for (const t of saidas) {
        const chave = normalizar(t.categoria);
        const grupo = grupos.get(chave) || { categoria: t.categoria, total: 0, quantidade: 0 };
        grupo.total = arredondar(grupo.total + t.valor);
        grupo.quantidade += 1;
        grupos.set(chave, grupo);
    }

    return {
        anoMes: rotulo,
        entradas: somar(entradas),
        saidas: somar(saidas),
        saidasConta: somar(saidas.filter((t) => !ehCredito(t))),
        saidasCartao: somar(saidas.filter(ehCredito)),
        porCategoria: [...grupos.values()].sort((a, b) => b.total - a.total),
        lancamentos: doPeriodo.length,
    };
}

function resumoDoMes(conta, anoMes) {
    return resumoDoPeriodo(conta, `${anoMes}-01`, `${anoMes}-31`, anoMes);
}

// Apaga só os lançamentos (cartões, fixos, metas e limites ficam). Guarda backup antes.
function resetarLancamentos(ref) {
    const copia = backup(ARQUIVO);
    const quantidade = alterarConta(ref, (conta) => {
        const total = conta.transacoes.length;
        conta.transacoes = [];
        return total;
    });
    return { quantidade, copia };
}

function contarConta(conta) {
    return {
        transacoes: conta.transacoes.length, cartoes: conta.cartoes.length,
        fixos: conta.fixos.length, metas: conta.metas.length, limites: conta.limites.length,
    };
}

// Zera a carteira inteira desta conversa: lançamentos, cartões, fixos, metas e limites. Guarda backup antes.
function resetarConta(ref) {
    const copia = backup(ARQUIVO);
    const apagado = alterarConta(ref, (conta) => {
        const antes = contarConta(conta);
        Object.assign(conta, contaVazia());
        return antes;
    });
    return { apagado, copia };
}

// Zera as carteiras de todas as conversas (inclusive grupos). Guarda backup antes.
function resetarTodasAsContas() {
    const copia = backup(ARQUIVO);
    const dados = carregar();
    const carteiras = Object.keys(dados.contas).length;
    const lancamentos = Object.values(dados.contas).reduce((s, c) => s + (c.transacoes?.length || 0), 0);
    dados.contas = {};
    salvar(ARQUIVO, dados);
    return { carteiras, lancamentos, copia };
}

// ---------- backup completo ----------

function dadosParaBackup() {
    return carregar();
}

function restaurarBackup(dados) {
    if (dados?.versao !== 3 || typeof dados.contas !== 'object') throw new Error('arquivo de backup inválido');
    backup(ARQUIVO);
    salvar(ARQUIVO, dados);
    return Object.values(dados.contas).reduce((s, c) => s + (c.transacoes?.length || 0), 0);
}

module.exports = {
    lerConta, alterarConta, todasAsContas,
    adicionarTransacao, adicionarParcelado, removerTransacao, somarMeses,
    saldoEmConta, agendadoEmConta, ehCredito, ehFuturo, nomeComParcela,
    acharCartao, salvarCartao, removerCartao, faturaDe, faturas, pagarFatura, avisoDoCartao,
    totalFixos, prioridadeValida, ORDEM_PRIORIDADE,
    definirLimite, removerLimite, limitesDoMes, avisosDeLimite,
    resumoDoMes, resumoDoPeriodo, resetarLancamentos, resetarConta, resetarTodasAsContas, contarConta,
    dadosParaBackup, restaurarBackup,
};
