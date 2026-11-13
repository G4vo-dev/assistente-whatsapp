// Arquivo de backup: as finanças de todas as conversas, os lembretes e as anotações num JSON que volta com #restaurar.
const crypto = require('crypto');
const fin = require('./financas');
const lembretes = require('./lembretes');
const notas = require('./notas');
const { PREFIXO } = require('../config');

const TIPO = 'backup-assistente';

function montarBackup() {
    const conteudo = {
        tipo: TIPO,
        versao: 2, // a 2 trouxe as anotações e listas
        criadoEm: new Date().toISOString(),
        financas: fin.dadosParaBackup(),
        lembretes: lembretes.exportar(),
        notas: notas.exportar(),
    };
    const texto = JSON.stringify(conteudo, null, 2);
    // a assinatura só muda quando os dados mudam: o backup diário não repete o mesmo arquivo
    const assinatura = crypto.createHash('sha1').update(JSON.stringify([conteudo.financas, conteudo.lembretes, conteudo.notas])).digest('hex');
    return { texto, assinatura };
}

function mensagemDeBackup(texto, iso) {
    return {
        document: Buffer.from(texto),
        mimetype: 'application/json',
        fileName: `${TIPO}-${iso}.json`,
        caption: `💾 backup das finanças, lembretes e anotações.\npara restaurar: responda este arquivo com *${PREFIXO}restaurar confirmar*`,
    };
}

function ehArquivoDeBackup(nome) {
    return new RegExp(`^${TIPO}.*\\.json$`, 'i').test(nome || '');
}

function ehBackup(conteudo) {
    return conteudo?.tipo === TIPO;
}

// Troca as finanças, os lembretes e as anotações atuais pelos do backup (as finanças atuais vão para dados/backups antes).
// Backup da versão 1 não tem anotações: as atuais ficam como estão.
function restaurar(conteudo) {
    const lancamentos = fin.restaurarBackup(conteudo.financas);
    const lista = conteudo.lembretes || [];
    lembretes.importar(lista);
    if (conteudo.notas) notas.importar(conteudo.notas);
    return { lancamentos, lembretes: lista.length, criadoEm: String(conteudo.criadoEm).slice(0, 10) };
}

module.exports = { montarBackup, mensagemDeBackup, ehArquivoDeBackup, ehBackup, restaurar };
