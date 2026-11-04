const ia = require('../servicos/ia');

// Comandos que são perguntas prontas para a IA.
function especialista({ nome, apelidos, uso, descricao, exemplo, sistema }) {
    return {
        nome,
        apelidos,
        uso,
        descricao,
        exemplos: [`${nome} ${exemplo}`],
        async executar(ctx) {
            if (!ctx.texto) return ctx.responder(`❌ ex: ${ctx.prefixo}${nome} ${exemplo}`);
            await ctx.reagir('⏳');
            await ctx.responder(await ia.perguntarIA(ctx.texto, { sistema }), { citar: true });
            await ctx.reagir('✅');
        },
    };
}

const FORMATO = ' responda em português com a formatação do WhatsApp (*negrito*, _itálico_), sem markdown com ## ou **.';

module.exports = {
    titulo: '🧪 *técnico & nerd*',
    comandos: [
        especialista({
            nome: 'mc',
            uso: 'mc [addon]',
            descricao: 'explica um addon/mod de Minecraft',
            exemplo: 'iron furnaces',
            sistema: 'você é especialista em Minecraft Bedrock e Java. para o addon/mod pedido, explique o que ele faz, '
                + 'as principais mecânicas e onde achar (ex: MCPEDL, CurseForge, Modrinth). seja prático.' + FORMATO,
        }),
        especialista({
            nome: 'quimica',
            apelidos: ['elemento'],
            uso: 'quimica [pergunta/conta]',
            descricao: 'cálculos e dados de química',
            exemplo: 'massa molar H2O',
            sistema: 'você é um técnico em química sênior. resolva cálculos passo a passo ou traga dados técnicos precisos '
                + '(massa molar, distribuição eletrônica, estequiometria, propriedades). seja direto e estruturado.' + FORMATO,
        }),
    ],
};
