module.exports = {
    titulo: 'ℹ️ *ajuda*',
    comandos: [
        {
            nome: 'menu',
            apelidos: ['comandos', 'help'],
            descricao: 'esta lista',
            async executar(ctx) {
                // require aqui dentro porque o index.js também carrega este arquivo
                const { montarMenu } = require('./index');
                await ctx.responder(montarMenu(ctx.prefixo));
            },
        },
        {
            nome: 'ajuda',
            uso: 'ajuda [comando]',
            descricao: 'explica um comando com exemplos',
            exemplos: ['ajuda despesa', 'ajuda s'],
            async executar(ctx) {
                const { montarAjuda, montarMenu } = require('./index');
                if (!ctx.args[0]) return ctx.responder(montarMenu(ctx.prefixo));
                await ctx.responder(montarAjuda(ctx.args[0].replace(ctx.prefixo, ''), ctx.prefixo));
            },
        },
        {
            nome: 'privacidade',
            apelidos: ['termos', 'lgpd', 'dados'],
            descricao: 'o que o bot guarda, pra onde manda e como apagar',
            async executar(ctx) {
                const ia = require('../servicos/ia');
                const { IA_MODO_PRIVADO } = require('../config');
                const p = ctx.prefixo;
                const { provedores, filas } = ia.situacao();
                const ligadas = provedores.filter((x) => x.ligado).map((x) => x.titulo).join(', ') || 'nenhuma';
                const sensiveis = [...new Set([...filas.financas, ...filas.imagem, ...filas.pdf, ...filas.audio])].join(', ') || 'nenhuma';
                await ctx.responder([
                    '🔒 *privacidade e seus dados*',
                    '',
                    '*o que fica guardado* (só no aparelho do dono, na pasta dados/)',
                    '• finanças de cada conversa: lançamentos, cartões, fixos, metas e limites',
                    '• lembretes marcados',
                    '• backups e o registro do bot (bot.log)',
                    'fotos, vídeos e áudios *não* ficam guardados: são apagados logo depois de usados.',
                    '',
                    '*o que vai para fora*',
                    `• IAs ligadas: ${ligadas}. só recebem o que você manda num comando de IA.`,
                    `• finanças, comprovantes e áudios vão para: ${sensiveis}`,
                    `• modo privado: ${IA_MODO_PRIVADO ? '✅ ligado (dados sensíveis só na Groq)' : '⛔ desligado (ligue com IA_MODO_PRIVADO=sim no .env)'}`,
                    '• nos planos grátis do Gemini e da Mistral, o que você manda pode ser usado para melhorar as IAs deles.',
                    `• ${p}clima, ${p}cep e ${p}pokemon consultam os sites desses serviços.`,
                    '',
                    '*como apagar*',
                    `• finanças desta conversa: ${p}resetfin tudo confirmar`,
                    `• lembretes: ${p}lembretes e ${p}cancelar [nº]`,
                    '• tudo: o dono apaga a pasta dados/ do bot',
                    '',
                    'termos completos: arquivo TERMOS-E-PRIVACIDADE.md do projeto.',
                ].join('\n'));
            },
        },
        {
            nome: 'ping',
            descricao: 'vê se o bot está on',
            async executar(ctx) {
                const segundos = Math.round(process.uptime());
                const ligado = segundos < 3600 ? `${Math.round(segundos / 60)} min` : `${(segundos / 3600).toFixed(1)} h`;
                await ctx.responder(`pong 🏓 (ligado há ${ligado})`);
            },
        },
    ],
};
