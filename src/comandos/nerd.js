const { comandoDeIA } = require('./pergunta-ia');

const FORMATO = ' responda em português com a formatação do WhatsApp (*negrito*, _itálico_), sem markdown com ## ou **.';

module.exports = {
    titulo: '🧪 *técnico & nerd*',
    comandos: [
                comandoDeIA({
            nome: 'mc',
            uso: 'mc [addon]',
            descricao: 'explica um addon/mod de Minecraft',
            exemplo: 'iron furnaces',
            sistema: 'você é especialista em Minecraft Bedrock e Java. para o addon/mod pedido, explique o que ele faz, '
                + 'as principais mecânicas e onde achar (ex: MCPEDL, CurseForge, Modrinth). seja prático.' + FORMATO,
        }),
        comandoDeIA({
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
