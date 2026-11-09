// Avisos automáticos, backup, restauração e exportação para planilha.
const fin = require('../servicos/financas');
const backup = require('../servicos/backup');
const midia = require('../servicos/midia');
const agenda = require('../agenda');
const { acharMidia } = require('../util/mensagem');
const { normalizar, lerMes, nomeDoMes, hojeISO, agoraEmBrasilia } = require('../util/formato');

// Planilha CSV que abre certinho no Excel e no Google Planilhas (ponto e vírgula, vírgula nos centavos).
function montarCsv(transacoes) {
    const campo = (valor) => {
        const texto = String(valor ?? '');
        return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const linhas = [['nº', 'data', 'tipo', 'valor', 'método', 'cartão', 'categoria', 'descrição', 'parcela'].join(';')];
    for (const { t, numero } of transacoes) {
        const [ano, mes, dia] = t.data.split('-');
        linhas.push([
            numero, `${dia}/${mes}/${ano}`, t.tipo, (t.tipo === 'despesa' ? -t.valor : t.valor).toFixed(2).replace('.', ','),
            t.metodo, t.cartao || '', t.categoria, t.descricao, t.parcela ? `${t.parcela.atual}/${t.parcela.total}` : '',
        ].map(campo).join(';'));
    }
    return `\ufeff${linhas.join('\r\n')}\r\n`;
}

function acharTarefa(texto) {
    const alvo = normalizar(texto);
    const apelidos = { fixo: 'fixos', contas: 'fixos', semana: 'semanal', mes: 'mensal', fechamento: 'mensal' };
    const id = apelidos[alvo] || alvo;
    return agenda.TAREFAS.find((t) => t.id === id) || null;
}

module.exports = {
    titulo: '💾 *avisos & backup*',
    comandos: [
        {
            nome: 'avisos',
            apelidos: ['automaticos'],
            soDono: true,
            uso: 'avisos [ligar | desligar | testar] [nome]',
            descricao: 'mensagens automáticas na conversa com você',
            ajuda: 'nomes: fixos, semanal, mensal, backup. "testar" manda o aviso agora. só o dono usa.',
            exemplos: ['avisos', 'avisos desligar backup', 'avisos testar semanal'],
            async executar(ctx) {
                const acao = normalizar(ctx.args[0]);
                const p = ctx.prefixo;
                if (['ligar', 'desligar', 'testar'].includes(acao)) {
                    const tarefa = acharTarefa(ctx.args[1]);
                    if (!tarefa) return ctx.responder(`❌ use um destes nomes: ${agenda.TAREFAS.map((t) => t.id).join(', ')}`);
                    if (acao !== 'testar') {
                        agenda.ligarDesligar(tarefa.id, acao === 'ligar');
                        return ctx.responder(`${acao === 'ligar' ? '✅' : '⛔'} ${tarefa.nome}: ${acao === 'ligar' ? 'ligado' : 'desligado'}.`);
                    }
                    const conteudo = agenda.conteudoDaTarefa(tarefa.id, ctx.bot, agoraEmBrasilia(), { forcar: true });
                    if (!conteudo) return ctx.responder(`📭 ${tarefa.nome}: nada para avisar agora.`);
                    return ctx.responder(conteudo);
                }
                const linhas = agenda.listarTarefas().map((t) => `${t.ligada ? '✅' : '⛔'} *${t.id}* · ${t.nome} (${t.quando})`);
                await ctx.responder(`⏰ *avisos automáticos*\nvão para a conversa com você mesmo.\n\n${linhas.join('\n')}\n\npara mudar: ${p}avisos desligar [nome]\npara ver agora: ${p}avisos testar [nome]`);
            },
        },
        {
            nome: 'backup',
            soDono: true,
            descricao: 'manda agora o arquivo de backup',
            ajuda: 'o bot também manda sozinho todo dia às 22h quando algo mudou. guarde o arquivo: com ele você recupera tudo se trocar de celular. '
                + 'só o dono usa, porque o arquivo tem as finanças de todas as conversas.',
            async executar(ctx) {
                const { texto } = backup.montarBackup();
                await ctx.responder(backup.mensagemDeBackup(texto, hojeISO()));
            },
        },
        {
            nome: 'restaurar',
            soDono: true,
            uso: 'restaurar confirmar',
            descricao: 'volta as finanças de um arquivo de backup',
            ajuda: 'responda o arquivo de backup (backup-assistente-....json) com #restaurar confirmar. '
                + 'os dados atuais são guardados em dados/backups antes. só o dono usa.',
            async executar(ctx) {
                const alvo = acharMidia(ctx.msg, ctx.conteudo, ['documentMessage', 'documentWithCaptionMessage']);
                const nome = alvo?.info?.fileName || '';
                if (!alvo || !backup.ehArquivoDeBackup(nome)) {
                    return ctx.responder(`❌ responda o arquivo de backup (backup-assistente-....json) com ${ctx.prefixo}restaurar confirmar`);
                }
                if (normalizar(ctx.args[0]) !== 'confirmar') {
                    return ctx.responder(`⚠️ isso troca TODAS as finanças e lembretes atuais pelos do arquivo ${nome}.\npara confirmar, responda o arquivo com *${ctx.prefixo}restaurar confirmar*`);
                }
                let conteudo;
                try {
                    conteudo = JSON.parse((await midia.baixarDaMensagem(ctx.bot, alvo.mensagem)).toString('utf8'));
                } catch {
                    return ctx.responder('❌ não consegui ler esse arquivo.');
                }
                if (!backup.ehBackup(conteudo)) return ctx.responder('❌ esse arquivo não é um backup do assistente.');
                const r = backup.restaurar(conteudo);
                await ctx.responder(`✅ backup de ${r.criadoEm} restaurado: ${r.lancamentos} lançamento(s) e ${r.lembretes} lembrete(s).`);
            },
        },
        {
            nome: 'exportar',
            apelidos: ['planilha', 'csv'],
            uso: 'exportar [mês | tudo]',
            descricao: 'planilha dos lançamentos (Excel/Planilhas)',
            exemplos: ['exportar', 'exportar 10/2026'],
            async executar(ctx) {
                const conta = fin.lerConta(ctx.conta);
                let lista = conta.transacoes.map((t, i) => ({ t, numero: i + 1 }));
                const mes = ctx.texto && normalizar(ctx.texto) !== 'tudo' ? lerMes(ctx.texto) : null;
                if (ctx.texto && normalizar(ctx.texto) !== 'tudo' && !mes) return ctx.responder(`❌ não entendi o mês. ex: ${ctx.prefixo}exportar 10/2026`);
                if (mes) lista = lista.filter(({ t }) => t.data.startsWith(mes));
                if (!lista.length) return ctx.responder('📭 nenhum lançamento para exportar.');
                await ctx.responder({
                    document: Buffer.from(montarCsv(lista), 'utf8'),
                    mimetype: 'text/csv',
                    fileName: `financas-${mes || 'tudo'}.csv`,
                    caption: `📄 ${lista.length} lançamento(s)${mes ? ` de ${nomeDoMes(mes)}` : ''}. abre no Excel ou no Google Planilhas.`,
                });
            },
        },
    ],
    montarCsv,
};
