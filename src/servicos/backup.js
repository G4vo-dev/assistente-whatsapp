// Arquivo de backup: as finanças de todas as conversas e os lembretes num JSON que volta com #restaurar.
const crypto = require('crypto');
const fin = require('./financas');
const lembretes = require('./lembretes');
const { PREFIXO } = require('../config');

const TIPO = 'backup-assistente';

function montarBackup() {
    const conteudo = {
        tipo: TIPO,
        versao: 1,
        criadoEm: new Date().toISOString(),
        financas: fin.dadosParaBackup(),
        lembretes: lembretes.exportar(),
    };
    const texto = JSON.stringify(conteudo, null, 2);
    // a assinatura só muda quando os dados mudam: o backup diário não repete o mesmo arquivo
    const assinatura = crypto.createHash('sha1').update(JSON.stringify([conteudo.financas, conteudo.lembretes])).digest('hex');
    return { texto, assinatura };
}

function mensagemDeBackup(texto, iso) {
    return {
        document: Buffer.from(texto),
        mimetype: 'application/json',
        fileName: `${TIPO}-${iso}.json`,
        caption: `💾 backup das finanças e lembretes.\npara restaurar: responda este arquivo com *${PREFIXO}restaurar confirmar*`,
    };
}

function ehArquivoDeBackup(nome) {
    return new RegExp(`^${TIPO}.*\\.json$`, 'i').test(nome || '');
}

function ehBackup(conteudo) {
    return conteudo?.tipo === TIPO;
}

// Troca as finanças e os lembretes atuais pelos do backup (as finanças atuais vão para dados/backups antes).
function restaurar(conteudo) {
    const lancamentos = fin.restaurarBackup(conteudo.financas);
    const lista = conteudo.lembretes || [];
    lembretes.importar(lista);
    return { lancamentos, lembretes: lista.length, criadoEm: String(conteudo.criadoEm).slice(0, 10) };
}

module.exports = { montarBackup, mensagemDeBackup, ehArquivoDeBackup, ehBackup, restaurar };
