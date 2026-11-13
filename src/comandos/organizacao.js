// Anotações rápidas e listas (compras, tarefas...). Cada conversa tem as suas.
const notas = require('../servicos/notas');

function mostrarLista(nome, itens) {
    if (!itens?.length) return `📭 a lista *${nome}* está vazia.`;
    return `📋 *${nome}*\n\n${itens.map((x, i) => `${i + 1}. ${x.feito ? '✅' : '⬜'} ${x.texto}`).join('\n')}`;
}

module.exports = {
    titulo: '📝 *anotações e listas*',
    comandos: [
        {
            nome: 'anotar',
            uso: 'anotar [texto]',
            descricao: 'guarda uma anotação',
            exemplos: ['anotar ligar para o banco amanhã'],
            async executar(ctx) {
                if (!ctx.texto) return ctx.responder(`❌ ex: ${ctx.prefixo}anotar ligar para o banco amanhã\n(ver todas: ${ctx.prefixo}notas)`);
                const numero = notas.mexer(ctx.conta.chave, (c) => c.notas.push({ texto: ctx.texto, criada: Date.now() }));
                await ctx.responder(`📝 anotado (nº ${numero}). ver todas: ${ctx.prefixo}notas`);
            },
        },
        {
            nome: 'notas',
            uso: 'notas [apagar nº]',
            descricao: 'mostra ou apaga suas anotações',
            exemplos: ['notas', 'notas apagar 2'],
            async executar(ctx) {
                if (ctx.args[0] === 'apagar') {
                    const posicao = parseInt(ctx.args[1], 10);
                    const apagada = posicao > 0 ? notas.mexer(ctx.conta.chave, (c) => c.notas.splice(posicao - 1, 1)[0]) : null;
                    if (!apagada) return ctx.responder(`❌ não achei essa nota. veja os números em ${ctx.prefixo}notas`);
                    return ctx.responder(`🗑️ nota apagada: ${apagada.texto}`);
                }
                const { notas: lista } = notas.ver(ctx.conta.chave);
                if (!lista.length) return ctx.responder(`📭 nenhuma nota. para criar: ${ctx.prefixo}anotar [texto]`);
                await ctx.responder(`📝 *suas notas*\n\n${lista.map((n, i) => `${i + 1}. ${n.texto}`).join('\n')}\n\npara apagar: ${ctx.prefixo}notas apagar [nº]`);
            },
        },
        {
            nome: 'lista',
            uso: 'lista [nome] [add|feito|apagar|limpar]',
            descricao: 'listas de compras, tarefas, o que quiser',
            ajuda: 'o nome da lista é uma palavra só. "add" aceita vários itens separados por vírgula. '
                + '"feito 2" marca o item 2; "apagar 2" tira o item 2; "limpar" apaga a lista inteira.',
            exemplos: ['lista mercado add leite, pão, ovos', 'lista mercado', 'lista mercado feito 2', 'lista mercado apagar 1', 'lista mercado limpar'],
            async executar(ctx) {
                const nome = notas.nomeDaLista(ctx.args[0]);
                if (!nome) return ctx.responder(`❌ ex: ${ctx.prefixo}lista mercado add leite, pão\n(ver todas as listas: ${ctx.prefixo}listas)`);
                const acao = (ctx.args[1] || '').toLowerCase();
                const chave = ctx.conta.chave;
                const resto = ctx.texto.slice(ctx.args[0].length).trim().slice(acao.length).trim();

                if (acao === 'add' || acao === 'adicionar') {
                    const itens = notas.separarItens(resto);
                    if (!itens.length) return ctx.responder(`❌ ex: ${ctx.prefixo}lista ${nome} add leite, pão`);
                    notas.mexer(chave, (c) => {
                        c.listas[nome] ||= [];
                        for (const texto of itens) c.listas[nome].push({ texto, feito: false });
                    });
                    return ctx.responder(`✅ ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} em *${nome}*.\n\n${mostrarLista(nome, notas.ver(chave).listas[nome])}`);
                }
                if (acao === 'limpar') {
                    const existia = notas.mexer(chave, (c) => { const tinha = Boolean(c.listas[nome]); delete c.listas[nome]; return tinha; });
                    return ctx.responder(existia ? `🗑️ lista *${nome}* apagada.` : `❌ não existe a lista *${nome}*.`);
                }
                if (acao === 'feito' || acao === 'apagar') {
                    const posicao = parseInt(resto, 10);
                    const item = posicao > 0 ? notas.mexer(chave, (c) => {
                        const lista = c.listas[nome] || [];
                        if (acao === 'apagar') return lista.splice(posicao - 1, 1)[0];
                        if (lista[posicao - 1]) lista[posicao - 1].feito = true;
                        return lista[posicao - 1];
                    }) : null;
                    if (!item) return ctx.responder(`❌ não achei esse item. veja os números em ${ctx.prefixo}lista ${nome}`);
                    return ctx.responder(acao === 'apagar' ? `🗑️ ${item.texto} removido de *${nome}*.` : `✅ ${item.texto} (feito)`);
                }
                if (acao) return ctx.responder(`❌ não entendi "${acao}". use add, feito, apagar ou limpar. detalhes: ${ctx.prefixo}ajuda lista`);
                await ctx.responder(mostrarLista(nome, notas.ver(chave).listas[nome]));
            },
        },
        {
            nome: 'listas',
            descricao: 'mostra todas as suas listas',
            async executar(ctx) {
                const { listas } = notas.ver(ctx.conta.chave);
                const nomes = Object.keys(listas);
                if (!nomes.length) return ctx.responder(`📭 nenhuma lista ainda. para criar: ${ctx.prefixo}lista mercado add leite, pão`);
                await ctx.responder(`📋 *suas listas*\n\n${nomes.map((n) => {
                    const feitos = listas[n].filter((x) => x.feito).length;
                    return `• ${n} · ${feitos}/${listas[n].length} feitos`;
                }).join('\n')}\n\nver uma: ${ctx.prefixo}lista [nome]`);
            },
        },
    ],
};
