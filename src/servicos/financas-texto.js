// Textos prontos das finanças, usados pelos comandos e pelos avisos automáticos.
const fin = require('./financas');
const { reais, dataCurta, nomeDoMes, mesAtual, barra, porcento, normalizar } = require('../util/formato');

// Uma linha do #extrato: "3. 🔴 15/10 mercado · *R$ 70,00* · debito · 🏷️ comida"
function linhaDoExtrato(t, numero) {
    const icone = fin.ehFuturo(t) ? '🗓️' : t.tipo === 'receita' ? '🟢' : '🔴';
    const forma = fin.ehCredito(t) ? `💳 ${t.cartao || '?'}` : t.metodo;
    return `${numero}. ${icone} ${dataCurta(t.data)} ${fin.nomeComParcela(t)} · *${reais(t.valor)}* · ${forma} · 🏷️ ${t.categoria}`;
}

// Texto que vai depois de qualquer lançamento: fatura do cartão ou saldo, e avisos de limite.
function depoisDeLancar(conta, novas, prefixo = '#') {
    const linhas = [];
    const cartoes = [...new Set(novas.filter(fin.ehCredito).map((t) => t.cartao))];
    for (const cartao of cartoes) linhas.push(fin.avisoDoCartao(conta, cartao));
    if (cartoes.length) linhas.push(`(no crédito o saldo em conta só muda quando você usar ${prefixo}pagarfatura)`);
    if (novas.some((t) => !fin.ehCredito(t))) {
        linhas.push(`💰 saldo em conta: *${reais(fin.saldoEmConta(conta))}*`);
        const agendado = fin.agendadoEmConta(conta);
        if (agendado > 0) linhas.push(`🗓️ parcelas agendadas: ${reais(agendado)}`);
    }
    linhas.push(...fin.avisosDeLimite(conta, novas));
    return linhas.join('\n');
}

// #grafico e fechamento do mês: entradas x saídas, gastos por categoria e fixos x variáveis.
function montarGrafico(conta, anoMes) {
    const mes = fin.resumoDoMes(conta, anoMes);
    const fixos = fin.totalFixos(conta);
    if (!mes.lancamentos && !fixos) return `📊 sem lançamentos em ${nomeDoMes(anoMes)}.`;

    let txt = `📊 *${nomeDoMes(anoMes)}*\n\n`;
    txt += `🟢 entrou: ${reais(mes.entradas)}\n`;
    txt += `🔴 saiu: ${reais(mes.saidas)}`;
    if (mes.saidasCartao) txt += ` (conta ${reais(mes.saidasConta)} + cartão ${reais(mes.saidasCartao)})`;
    const sobra = mes.entradas - mes.saidas;
    txt += `\n${sobra >= 0 ? '💰 sobrou' : '⚠️ faltou'}: ${reais(Math.abs(sobra))}\n`;

    if (mes.porCategoria.length) {
        const largura = Math.min(12, Math.max(...mes.porCategoria.map((g) => g.categoria.length)));
        const linhas = mes.porCategoria.slice(0, 8).map((g) => {
            const fracao = mes.saidas ? g.total / mes.saidas : 0;
            const nome = g.categoria.slice(0, largura).padEnd(largura);
            return `${nome} ${barra(fracao, 8)} ${porcento(fracao).padStart(4)} ${reais(g.total)}`;
        });
        if (mes.porCategoria.length > 8) {
            const resto = mes.porCategoria.slice(8).reduce((s, g) => s + g.total, 0);
            linhas.push(`${'outras'.padEnd(largura)} ${barra(resto / mes.saidas, 8)} ${porcento(resto / mes.saidas).padStart(4)} ${reais(resto)}`);
        }
        txt += `\n*gastos por categoria*\n\`\`\`\n${linhas.join('\n')}\n\`\`\`\n`;
    }

    if (fixos) {
        // o fixo pago com #fixo pagar já está nas saídas (categoria "fixos"): não conta duas vezes
        const fixosPagos = mes.porCategoria.find((g) => normalizar(g.categoria) === 'fixos')?.total || 0;
        const variaveis = Math.max(0, mes.saidas - fixosPagos);
        const fracaoFixos = fixos / (fixos + variaveis);
        const blocos = Math.round(fracaoFixos * 10);
        txt += `\n📌 *fixos x variáveis* (fixos cadastrados: ${reais(fixos)}/mês)\n`;
        txt += `${'🟩'.repeat(blocos)}${'🟥'.repeat(10 - blocos)}\n🟩 fixos ${porcento(fracaoFixos)} · 🟥 variáveis ${porcento(1 - fracaoFixos)}\n`;
    }

    if (mes.entradas > 0 && mes.saidas > mes.entradas) {
        txt += '\n⚠️ você gastou mais do que entrou neste mês. veja as categorias maiores acima.';
    } else if (mes.entradas > 0) {
        txt += `\n💡 você gastou ${porcento(mes.saidas / mes.entradas)} do que entrou.`;
    }
    return txt.trim();
}

// Resumo curto para a IA (sem mandar o histórico inteiro).
function resumoParaIA(conta) {
    const mes = fin.resumoDoMes(conta, mesAtual());
    const categorias = mes.porCategoria.slice(0, 10).map((g) => `${g.categoria}: ${reais(g.total)} (${g.quantidade}x)`).join('; ');
    const faturas = fin.faturas(conta).map((f) => `${f.nome}: ${reais(f.gasto)}${f.limite !== null ? ` de ${reais(f.limite)}` : ''}`).join('; ');
    const metas = conta.metas.map((m) => `${m.titulo} (${m.prioridade}): ${reais(m.guardado)} de ${reais(m.valorAlvo)}`).join('; ');
    const fixos = conta.fixos.map((f) => `${f.descricao}: ${reais(f.valor)}`).join('; ');
    return [
        `saldo em conta: ${reais(fin.saldoEmConta(conta))}`,
        `mês atual (${nomeDoMes(mes.anoMes)}): entrou ${reais(mes.entradas)}, saiu ${reais(mes.saidas)}`,
        `gastos por categoria: ${categorias || 'nenhum'}`,
        `faturas de cartão: ${faturas || 'nenhuma'}`,
        `gastos fixos: ${fixos || 'nenhum'} (total ${reais(fin.totalFixos(conta))}/mês)`,
        `metas: ${metas || 'nenhuma'}`,
    ].join('\n');
}

module.exports = { linhaDoExtrato, depoisDeLancar, montarGrafico, resumoParaIA };
