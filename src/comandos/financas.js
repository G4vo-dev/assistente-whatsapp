const fin = require('../servicos/financas');
const { interpretarLancamento } = require('../servicos/lancamento');
const { linhaDoExtrato, depoisDeLancar } = require('../servicos/financas-texto');
const { ehAdicionar, ehRemover } = require('./subcomandos');
const { reais, lerValor, lerMes, dataCurta, nomeDoMes, mesAtual, normalizar } = require('../util/formato');

function lancamento(tipo) {
    return async (ctx) => {
        const conta = fin.lerConta(ctx.conta);
        const lido = interpretarLancamento(ctx.args, conta.cartoes, tipo);
        const p = ctx.prefixo;
        if (lido.erro === 'valor') {
            return ctx.responder(`❌ faltou o valor.\nuso: ${p}${tipo} [valor] [método] [cartão] [categoria] [data] [descrição]\nex: ${p}${tipo} 35,90 pix comida lanche da tarde`);
        }
        if (lido.erro === 'parcelas') return ctx.responder('❌ dá pra parcelar de 2x até 48x.');
        if (lido.erro === 'sem_cartao') {
            return ctx.responder(`💳 cadastre um cartão primeiro: ${p}cartao adicionar [nome] [limite]\nex: ${p}cartao adicionar nubank 2000`);
        }
        if (lido.erro === 'qual_cartao') {
            const nomes = conta.cartoes.map((c) => c.nome).join(', ');
            return ctx.responder(`💳 de qual cartão? (${nomes})\nex: ${p}${tipo} ${ctx.args[0]} credito ${conta.cartoes[0].nome} ${ctx.args.slice(2).join(' ') || 'mercado compras'}`);
        }

        const { parcelas, ...dados } = lido;
        const { criadas, txt } = fin.alterarConta(ctx.conta, (c) => {
            const lista = parcelas > 1 ? fin.adicionarParcelado(c, { tipo, ...dados }, parcelas) : [fin.adicionarTransacao(c, { tipo, ...dados })];
            return { criadas: lista, txt: depoisDeLancar(c, lista.map((x) => x.transacao), ctx.prefixo) };
        });
        const primeira = criadas[0].transacao;
        const icone = tipo === 'receita' ? '🟢' : '🔴';
        let cabecalho;
        if (criadas.length > 1) {
            const ultima = criadas.at(-1).transacao;
            cabecalho = `${icone} ${tipo} parcelada nº ${criadas[0].numero} a ${criadas.at(-1).numero}: ${primeira.descricao}\n`
                + `💸 ${criadas.length}x de ${reais(primeira.valor)} (total ${reais(lido.valor)})\n`
                + `🏷️ ${primeira.categoria} · 📅 de ${dataCurta(primeira.data)} até ${dataCurta(ultima.data)}`;
        } else {
            cabecalho = `${icone} ${tipo} nº ${criadas[0].numero} registrada: ${primeira.descricao} · *${reais(primeira.valor)}*\n🏷️ ${primeira.categoria} · 📅 ${dataCurta(primeira.data)}`;
        }
        await ctx.responder(`${cabecalho}\n${txt}`);
    };
}

module.exports = {
    titulo: '💰 *financeiro*',
    comandos: [
        {
            nome: 'saldo',
            descricao: 'saldo em conta, faturas e resumo do mês',
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                const mes = fin.resumoDoMes(conta, mesAtual());
                let txt = `💰 *saldo em conta:* ${reais(fin.saldoEmConta(conta))}`;
                const agendado = fin.agendadoEmConta(conta);
                if (agendado > 0) txt += `\n🗓️ parcelas agendadas: ${reais(agendado)}`;
                const faturas = fin.faturas(conta);
                if (faturas.length) {
                    txt += '\n\n💳 *cartões*';
                    for (const f of faturas) {
                        txt += `\n• ${f.nome}: fatura ${reais(f.gasto)}`;
                        if (f.futuras > 0) txt += ` (+ ${reais(f.futuras)} futuras)`;
                        if (f.limite !== null) txt += ` · livre ${reais(f.livre)} de ${reais(f.limite)}`;
                    }
                }
                const limites = fin.limitesDoMes(conta).filter((l) => l.fracao >= 0.8);
                for (const l of limites) txt += `\n${l.fracao >= 1 ? '🚨' : '⚠️'} ${l.categoria}: ${reais(l.gasto)} de ${reais(l.valor)} (limite)`;
                txt += `\n\n📅 *${nomeDoMes(mes.anoMes)}:* entrou ${reais(mes.entradas)} · saiu ${reais(mes.saidas)}`;
                if (conta.fixos.length) txt += `\n📌 fixos: ${reais(fin.totalFixos(conta))}/mês`;
                await ctx.responder(txt);
            },
        },
        {
            nome: 'receita',
            apelidos: ['entrada', 'ganho'],
            uso: 'receita [valor] [método] [categoria] [descrição]',
            descricao: 'registra dinheiro que entrou',
            exemplos: ['receita 1.500 pix salario empresa', 'receita 50 presente'],
            executar: lancamento('receita'),
        },
        {
            nome: 'despesa',
            apelidos: ['gasto', 'saida'],
            uso: 'despesa [valor] [método] [cartão] [parcelas] [categoria] [descrição]',
            descricao: 'registra um gasto',
            ajuda: 'só o valor é obrigatório. métodos: pix, debito, credito, dinheiro, boleto. '
                + 'no crédito, diga o cartão (ou só o nome do cartão). parcelado: 4x (cada parcela cai num mês). '
                + 'a data pode ser 15/10, ontem ou hoje.',
            exemplos: ['despesa 35,90 pix comida lanche', 'despesa 120 credito nubank mercado compras da semana', 'despesa 400 itau 4x eletronicos fone', 'despesa 80 itau uber 15/10 corridas', 'despesa 20 ifood'],
            executar: lancamento('despesa'),
        },
        {
            nome: 'extrato',
            uso: 'extrato [mês | cartão | categoria | tudo]',
            descricao: 'lançamentos numerados',
            exemplos: ['extrato', 'extrato 10/2026', 'extrato nubank', 'extrato comida', 'extrato tudo'],
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                if (!conta.transacoes.length) {
                    return ctx.responder(`📊 nenhum lançamento ainda. comece com ${ctx.prefixo}receita ou ${ctx.prefixo}despesa.`);
                }
                const filtro = ctx.texto;
                let lista = conta.transacoes.map((t, i) => ({ t, numero: i + 1 }));
                let titulo = '📊 *extrato*';
                const mes = filtro && lerMes(filtro);
                if (normalizar(filtro) === 'tudo') {
                    titulo += ' (tudo)';
                } else if (mes) {
                    lista = lista.filter(({ t }) => t.data.startsWith(mes));
                    titulo += ` de ${nomeDoMes(mes)}`;
                } else if (filtro) {
                    const alvo = normalizar(filtro);
                    lista = lista.filter(({ t }) => normalizar(t.cartao) === alvo || normalizar(t.categoria) === alvo || normalizar(t.metodo) === alvo);
                    titulo += ` · ${filtro}`;
                }
                if (!lista.length) return ctx.responder(`📊 nada encontrado para "${filtro}".`);
                const total = lista.length;
                if (!filtro) lista = lista.slice(-20);
                if (total > lista.length) titulo += ` (últimos ${lista.length} de ${total})`;

                let txt = `${titulo}\n\n${lista.map(({ t, numero }) => linhaDoExtrato(t, numero)).join('\n')}`;
                if (filtro) {
                    const soma = lista.reduce((s, { t }) => s + (t.tipo === 'receita' ? t.valor : -t.valor), 0);
                    txt += `\n\n➗ total: ${reais(soma)}`;
                } else {
                    txt += `\n\n💰 saldo em conta: *${reais(fin.saldoEmConta(conta))}*`;
                }
                txt += `\n🗑️ para apagar: ${ctx.prefixo}apagar [nº]`;
                await ctx.responder(txt);
            },
        },
        {
            nome: 'apagar',
            apelidos: ['removertrans', 'desfazer'],
            uso: 'apagar [nº]',
            descricao: 'apaga um lançamento (sem nº: o último)',
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                const numero = ctx.args[0] ? parseInt(ctx.args[0], 10) : conta.transacoes.length;
                const resultado = numero > 0 ? fin.alterarConta(ctx.conta, (c) => fin.removerTransacao(c, numero)) : null;
                if (!resultado) return ctx.responder(`❌ não achei o lançamento ${ctx.args[0] || ''}. veja os números em ${ctx.prefixo}extrato`);
                const { removida, quantidade } = resultado;
                let txt = `🗑️ apagado: ${removida.descricao} (${reais(removida.valor)})`;
                if (removida.parcela) txt += `\n(as ${quantidade} parcelas dessa compra foram apagadas)`;
                else if (quantidade > 1) txt += '\n(as duas partes do pagamento de fatura foram apagadas)';
                txt += `\n💰 saldo em conta: *${reais(fin.saldoEmConta(fin.lerConta(ctx.conta)))}*`;
                await ctx.responder(txt);
            },
        },
        {
            nome: 'cartao',
            apelidos: ['cartoes'],
            uso: 'cartao [adicionar | listar | remover]',
            descricao: 'cadastra cartões de crédito',
            exemplos: ['cartao adicionar nubank 2000', 'cartao listar', 'cartao remover nubank'],
            async executar(ctx) {
                const acao = ctx.args[0];
                const nome = ctx.args[1];
                const p = ctx.prefixo;
                if (ehAdicionar(acao)) {
                    const limite = lerValor(ctx.args[2]);
                    if (!nome || !(limite >= 0)) return ctx.responder(`❌ uso: ${p}cartao adicionar [nome] [limite]\nex: ${p}cartao adicionar nubank 2000`);
                    const { cartao, novo } = fin.alterarConta(ctx.conta, (c) => fin.salvarCartao(c, nome, limite));
                    return ctx.responder(`💳 cartão *${cartao.nome}* ${novo ? 'adicionado' : 'atualizado'} com limite de ${reais(cartao.limite)}.`);
                }
                if (ehRemover(acao)) {
                    const removido = nome && fin.alterarConta(ctx.conta, (c) => fin.removerCartao(c, nome));
                    if (!removido) return ctx.responder(`❌ cartão não encontrado. veja em ${p}cartao listar`);
                    return ctx.responder(`🗑️ cartão *${removido.nome}* removido. (os lançamentos dele continuam no extrato)`);
                }
                const faturas = fin.faturas(fin.lerConta(ctx.conta)).filter((f) => f.limite !== null);
                if (!faturas.length) return ctx.responder(`💳 nenhum cartão. cadastre com ${p}cartao adicionar [nome] [limite]`);
                const linhas = faturas.map((f) => `• *${f.nome}*: limite ${reais(f.limite)} · fatura ${reais(f.gasto)}${f.futuras > 0 ? ` (+ ${reais(f.futuras)} futuras)` : ''} · livre ${reais(f.livre)}`);
                await ctx.responder(`💳 *seus cartões*\n${linhas.join('\n')}`);
            },
        },
        {
            nome: 'pagarfatura',
            apelidos: ['fatura'],
            uso: 'pagarfatura [cartão] [valor]',
            descricao: 'paga a fatura (sem valor: paga tudo)',
            exemplos: ['pagarfatura nubank 500', 'pagarfatura nubank'],
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                const cartao = fin.acharCartao(conta, ctx.args[0]);
                if (!cartao) {
                    const nomes = conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum cadastrado';
                    return ctx.responder(`❌ uso: ${ctx.prefixo}pagarfatura [cartão] [valor]\ncartões: ${nomes}`);
                }
                const aberta = fin.faturaDe(conta, cartao.nome);
                const valor = ctx.args[1] ? lerValor(ctx.args[1]) : aberta;
                if (!(valor > 0)) return ctx.responder(`✅ a fatura do *${cartao.nome}* já está zerada.`);
                const restante = fin.alterarConta(ctx.conta, (c) => fin.pagarFatura(c, cartao.nome, valor));
                const saldo = fin.saldoEmConta(fin.lerConta(ctx.conta));
                await ctx.responder(`✅ pagamento de ${reais(valor)} na fatura do *${cartao.nome}*.\n💳 fatura restante: ${reais(restante)}\n💰 saldo em conta: *${reais(saldo)}*`);
            },
        },
    ],
};
