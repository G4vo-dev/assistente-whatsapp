const fin = require('../servicos/financas');
const { depoisDeLancar } = require('../servicos/financas-texto');
const { ehAdicionar, ehRemover } = require('./subcomandos');
const { reais, lerValor, normalizar, barra, porcento, hojeISO, mesAtual, nomeDoMes } = require('../util/formato');

const ICONE_PRIORIDADE = { alta: '🔴', media: '🟡', baixa: '🟢' };

module.exports = {
    titulo: '📌 *fixos, metas & limites*',
    comandos: [
        {
            nome: 'fixo',
            apelidos: ['fixos'],
            uso: 'fixo [adicionar | listar | pagar | remover]',
            descricao: 'contas que se repetem todo mês',
            ajuda: '"pagar" lança a conta fixa como despesa de hoje.',
            exemplos: ['fixo adicionar 120 internet dia 10', 'fixo listar', 'fixo pagar 1', 'fixo remover 1'],
            async executar(ctx) {
                const acao = normalizar(ctx.args[0]);
                const p = ctx.prefixo;
                if (ehAdicionar(acao)) {
                    const valor = lerValor(ctx.args[1]);
                    let partes = ctx.args.slice(2);
                    let dia = null;
                    const posDia = partes.findIndex((x, i) => normalizar(x) === 'dia' && /^\d{1,2}$/.test(partes[i + 1] || ''));
                    if (posDia !== -1) {
                        dia = Math.min(31, Math.max(1, Number(partes[posDia + 1])));
                        partes = partes.filter((_, i) => i !== posDia && i !== posDia + 1);
                    }
                    const descricao = partes.join(' ');
                    if (!(valor > 0) || !descricao) return ctx.responder(`❌ uso: ${p}fixo adicionar [valor] [descrição] [dia N]\nex: ${p}fixo adicionar 120 internet dia 10`);
                    const numero = fin.alterarConta(ctx.conta, (c) => c.fixos.push({ descricao, valor, ...(dia ? { dia } : {}) }));
                    return ctx.responder(`📌 fixo nº ${numero} adicionado: ${descricao} · ${reais(valor)}${dia ? ` · vence dia ${dia}` : ''}`);
                }
                if (ehRemover(acao)) {
                    const n = parseInt(ctx.args[1], 10);
                    const removido = fin.alterarConta(ctx.conta, (c) => (n > 0 && c.fixos[n - 1] ? c.fixos.splice(n - 1, 1)[0] : null));
                    return ctx.responder(removido ? `🗑️ fixo removido: ${removido.descricao}` : `❌ número inválido. veja em ${p}fixo listar`);
                }
                if (acao === 'pagar') {
                    const n = parseInt(ctx.args[1], 10);
                    const resultado = fin.alterarConta(ctx.conta, (c) => {
                        const fixo = n > 0 ? c.fixos[n - 1] : null;
                        if (!fixo) return null;
                        const { transacao } = fin.adicionarTransacao(c, { tipo: 'despesa', valor: fixo.valor, metodo: 'conta', categoria: 'fixos', descricao: fixo.descricao, data: hojeISO() });
                        return { fixo, txt: depoisDeLancar(c, [transacao], p) };
                    });
                    if (!resultado) return ctx.responder(`❌ número inválido. veja em ${p}fixo listar`);
                    return ctx.responder(`✅ ${resultado.fixo.descricao} (${reais(resultado.fixo.valor)}) lançado como despesa.\n${resultado.txt}`);
                }
                const conta = fin.lerConta(ctx.conta);
                if (!conta.fixos.length) return ctx.responder(`📌 nenhum gasto fixo. adicione com ${p}fixo adicionar [valor] [descrição]`);
                const linhas = conta.fixos.map((f, i) => `${i + 1}. ${f.descricao} · ${reais(f.valor)}${f.dia ? ` · dia ${f.dia}` : ''}`);
                await ctx.responder(`📌 *gastos fixos*\n\n${linhas.join('\n')}\n\n➗ total: *${reais(fin.totalFixos(conta))}/mês*`);
            },
        },
        {
            nome: 'meta',
            apelidos: ['metas'],
            uso: 'meta [adicionar | listar | guardar | remover]',
            descricao: 'objetivos com barra de progresso',
            ajuda: 'prioridade: alta, media ou baixa (opcional). "guardar" soma no progresso da meta (não mexe no saldo).',
            exemplos: ['meta adicionar 5000 alta viagem pro nordeste', 'meta guardar 1 200', 'meta listar', 'meta remover 1'],
            async executar(ctx) {
                const acao = normalizar(ctx.args[0]);
                const p = ctx.prefixo;
                if (ehAdicionar(acao)) {
                    const valorAlvo = lerValor(ctx.args[1]);
                    const prioridade = fin.prioridadeValida(ctx.args[2]);
                    const titulo = ctx.args.slice(prioridade ? 3 : 2).join(' ');
                    if (!(valorAlvo > 0) || !titulo) return ctx.responder(`❌ uso: ${p}meta adicionar [valor] [prioridade] [título]\nex: ${p}meta adicionar 5000 alta viagem`);
                    const numero = fin.alterarConta(ctx.conta, (c) => c.metas.push({
                        titulo, valorAlvo, guardado: 0, prioridade: prioridade || 'media', criadaEm: new Date().toISOString(),
                    }));
                    return ctx.responder(`🎯 meta nº ${numero} criada: *${titulo}* · ${reais(valorAlvo)} · prioridade ${prioridade || 'media'}`);
                }
                if (acao === 'guardar' || acao === 'depositar') {
                    const n = parseInt(ctx.args[1], 10);
                    const valor = lerValor(ctx.args[2]);
                    const meta = fin.alterarConta(ctx.conta, (c) => {
                        const alvo = n > 0 && valor > 0 ? c.metas[n - 1] : null;
                        if (alvo) alvo.guardado = Math.round((alvo.guardado + valor) * 100) / 100;
                        return alvo;
                    });
                    if (!meta) return ctx.responder(`❌ uso: ${p}meta guardar [nº] [valor]\nex: ${p}meta guardar 1 200`);
                    const fracao = Math.min(1, meta.guardado / meta.valorAlvo);
                    let txt = `🎯 *${meta.titulo}*: ${reais(meta.guardado)} de ${reais(meta.valorAlvo)}\n${barra(fracao)} ${porcento(fracao)}`;
                    if (fracao >= 1) txt += '\n🎉 meta batida!';
                    return ctx.responder(txt);
                }
                if (ehRemover(acao)) {
                    const n = parseInt(ctx.args[1], 10);
                    const removida = fin.alterarConta(ctx.conta, (c) => (n > 0 && c.metas[n - 1] ? c.metas.splice(n - 1, 1)[0] : null));
                    return ctx.responder(removida ? `🗑️ meta removida: ${removida.titulo}` : `❌ número inválido. veja em ${p}meta listar`);
                }
                const conta = fin.lerConta(ctx.conta);
                if (!conta.metas.length) return ctx.responder(`🎯 nenhuma meta. crie com ${p}meta adicionar [valor] [prioridade] [título]`);
                const ordenadas = conta.metas
                    .map((m, i) => ({ m, numero: i + 1 }))
                    .sort((a, b) => (fin.ORDEM_PRIORIDADE[a.m.prioridade] ?? 1) - (fin.ORDEM_PRIORIDADE[b.m.prioridade] ?? 1));
                const linhas = ordenadas.map(({ m, numero }) => {
                    const fracao = Math.min(1, m.guardado / m.valorAlvo);
                    return `${numero}. ${ICONE_PRIORIDADE[m.prioridade] || '⚪'} *${m.titulo}*\n    ${barra(fracao)} ${porcento(fracao)} · ${reais(m.guardado)} de ${reais(m.valorAlvo)}`;
                });
                await ctx.responder(`🎯 *metas*\n\n${linhas.join('\n')}`);
            },
        },
        {
            nome: 'limite',
            apelidos: ['limites', 'orcamento'],
            uso: 'limite [categoria] [valor]',
            descricao: 'teto de gasto por categoria no mês',
            ajuda: 'quando os gastos da categoria chegam em 80% e em 100% do limite, o bot avisa na hora do lançamento.',
            exemplos: ['limite comida 400', 'limite', 'limite remover comida'],
            async executar(ctx) {
                const p = ctx.prefixo;
                if (ehRemover(ctx.args[0])) {
                    const removido = ctx.args[1] && fin.alterarConta(ctx.conta, (c) => fin.removerLimite(c, ctx.args[1]));
                    return ctx.responder(removido ? `🗑️ limite de *${removido.categoria}* removido.` : `❌ não achei esse limite. veja em ${p}limite`);
                }
                if (ctx.args.length >= 2) {
                    const valor = lerValor(ctx.args[1]);
                    if (!(valor > 0)) return ctx.responder(`❌ uso: ${p}limite [categoria] [valor]\nex: ${p}limite comida 400`);
                    const categoria = ctx.args[0].toLowerCase();
                    const situacao = fin.alterarConta(ctx.conta, (c) => {
                        fin.definirLimite(c, categoria, valor);
                        return fin.limitesDoMes(c).find((l) => normalizar(l.categoria) === normalizar(categoria));
                    });
                    return ctx.responder(`🎯 limite de *${categoria}*: ${reais(valor)} por mês.\neste mês: ${reais(situacao.gasto)} (${porcento(situacao.fracao)})`);
                }
                const limites = fin.limitesDoMes(fin.lerConta(ctx.conta));
                if (!limites.length) return ctx.responder(`🎯 nenhum limite. crie com ${p}limite [categoria] [valor]\nex: ${p}limite comida 400`);
                const linhas = limites
                    .sort((a, b) => b.fracao - a.fracao)
                    .map((l) => `${l.fracao >= 1 ? '🚨' : l.fracao >= 0.8 ? '⚠️' : '✅'} *${l.categoria}*\n    ${barra(Math.min(1, l.fracao))} ${porcento(l.fracao)} · ${reais(l.gasto)} de ${reais(l.valor)}`);
                await ctx.responder(`🎯 *limites de ${nomeDoMes(mesAtual())}*\n\n${linhas.join('\n')}`);
            },
        },
    ],
};
