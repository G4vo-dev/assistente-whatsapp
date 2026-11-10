const fin = require('../servicos/financas');
const ia = require('../servicos/ia');
const backup = require('../servicos/backup');
const { montarGrafico, resumoParaIA } = require('../servicos/financas-texto');
const { lerMes, mesAtual, normalizar, hojeISO } = require('../util/formato');

module.exports = {
    titulo: '📊 *relatórios*',
    comandos: [
        {
            nome: 'grafico',
            apelidos: ['relatorio', 'resumo'],
            uso: 'grafico [mês]',
            descricao: 'gastos por categoria e fixos x variáveis',
            exemplos: ['grafico', 'grafico 10/2026', 'grafico outubro'],
            async executar(ctx) {
                const anoMes = (ctx.texto && lerMes(ctx.texto)) || mesAtual();
                await ctx.responder(montarGrafico(fin.lerConta(ctx.conta), anoMes));
            },
        },
        {
            nome: 'dicas',
            descricao: 'a IA analisa suas finanças e dá dicas',
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                if (!conta.transacoes.length && !conta.fixos.length) {
                    return ctx.responder(`💡 registre alguns gastos primeiro com ${ctx.prefixo}despesa.`);
                }
                await ctx.reagir('⏳');
                const resposta = await ia.perguntarIA(
                    `Estes são os números financeiros de uma pessoa no Brasil:\n${resumoParaIA(conta)}\n\n`
                    + 'Dê de 3 a 5 dicas práticas e específicas para esses números (onde cortar, quanto guardar, como pagar as faturas). '
                    + 'Seja direto, use valores em reais e no máximo 12 linhas.',
                    { sistema: 'você é um consultor financeiro pessoal brasileiro, prático e gentil. responda em português, com formatação do WhatsApp.', tarefa: 'financas' },
                );
                if (ia.ehFalha(resposta)) {
                    await ctx.reagir('❌');
                    return ctx.responder(resposta, { citar: true });
                }
                await ctx.responder(`💡 *dicas financeiras*\n\n${resposta}\n\n⚠️ _conteúdo gerado por IA, só para informação. não é recomendação de investimento nem consultoria financeira; a IA pode errar._`, { citar: true });
                await ctx.reagir('✅');
            },
        },
        {
            nome: 'resetfin',
            uso: 'resetfin [tudo | geral] confirmar',
            descricao: 'apaga as finanças (pede confirmação)',
            ajuda: '"#resetfin confirmar" apaga só os lançamentos (cartões, fixos, metas e limites ficam). '
                + '"#resetfin tudo confirmar" zera a carteira desta conversa inteira. '
                + '"#resetfin geral confirmar" zera as carteiras de todas as conversas, inclusive grupos (só você pode). '
                + 'antes de apagar, o bot manda o arquivo de backup para o dono: dá para desfazer com #restaurar. '
                + 'quando outra pessoa apaga, a cópia fica guardada com o dono.',
            exemplos: ['resetfin', 'resetfin tudo confirmar'],
            async executar(ctx) {
                const p = ctx.prefixo;
                const palavras = ctx.args.map(normalizar);
                const modo = palavras.includes('geral') ? 'geral' : palavras.includes('tudo') ? 'tudo' : 'lancamentos';
                const confirmado = palavras.includes('confirmar');
                const conta = fin.lerConta(ctx.conta);
                const n = fin.contarConta(conta);

                if (modo === 'geral' && !ctx.msg.key.fromMe) {
                    return ctx.responder('❌ só o dono do bot pode zerar as finanças de todas as conversas.');
                }
                if (!confirmado) {
                    if (modo === 'lancamentos') {
                        return ctx.responder(`⚠️ *o que você quer apagar?*\n\n`
                            + `• só os lançamentos (${n.transacoes}): *${p}resetfin confirmar*\n`
                            + `  (cartões, fixos, metas e limites ficam)\n\n`
                            + `• tudo desta conversa: *${p}resetfin tudo confirmar*\n`
                            + `  (${n.transacoes} lançamentos, ${n.cartoes} cartões, ${n.fixos} fixos, ${n.metas} metas, ${n.limites} limites)\n\n`
                            + `• tudo de todas as conversas, inclusive grupos: *${p}resetfin geral confirmar*\n\n`
                            + `antes de apagar eu mando o backup aqui, pra dar pra desfazer com ${p}restaurar.`);
                    }
                    const alvo = modo === 'geral' ? 'as finanças de TODAS as conversas' : `TUDO desta conversa: ${n.transacoes} lançamentos, ${n.cartoes} cartões, ${n.fixos} fixos, ${n.metas} metas e ${n.limites} limites`;
                    return ctx.responder(`⚠️ isso apaga ${alvo}.\npara confirmar, mande: *${p}resetfin ${modo} confirmar*`);
                }

                // o backup tem as finanças de todas as conversas: só vai para o dono (a cópia fica em dados/backups)
                const dono = ctx.msg.key.fromMe;
                if (dono) {
                    const { texto } = backup.montarBackup();
                    await ctx.responder(backup.mensagemDeBackup(texto, hojeISO()));
                }
                const desfazer = dono
                    ? `para desfazer: responda o backup acima com *${p}restaurar confirmar*`
                    : 'uma cópia de segurança ficou guardada com o dono do bot, caso precise desfazer.';

                if (modo === 'lancamentos') {
                    const { quantidade } = fin.resetarLancamentos(ctx.conta);
                    return ctx.responder(`🔄 ${quantidade} lançamento(s) apagado(s). cartões, fixos, metas e limites continuam.\n${desfazer}`);
                }
                if (modo === 'tudo') {
                    const { apagado } = fin.resetarConta(ctx.conta);
                    return ctx.responder(`🧹 finanças desta conversa zeradas: ${apagado.transacoes} lançamentos, ${apagado.cartoes} cartões, ${apagado.fixos} fixos, ${apagado.metas} metas e ${apagado.limites} limites.\n${desfazer}`);
                }
                const { carteiras, lancamentos } = fin.resetarTodasAsContas();
                await ctx.responder(`🧹 finanças zeradas em ${carteiras} conversa(s), ${lancamentos} lançamento(s) no total. começando do zero!\n${desfazer}`);
            },
        },
    ],
};
