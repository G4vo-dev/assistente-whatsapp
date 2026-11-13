// Guarda dados em arquivos JSON dentro da pasta "dados".
const fs = require('fs');
const path = require('path');
const { PASTA_DADOS } = require('../config');

function caminho(arquivo) {
    return path.join(PASTA_DADOS, arquivo);
}

function existe(arquivo) {
    return fs.existsSync(caminho(arquivo));
}

function ler(arquivo, padrao) {
    const destino = caminho(arquivo);
    let bruto;
    try {
        bruto = fs.readFileSync(destino, 'utf8');
    } catch (erro) {
        if (erro.code === 'ENOENT') return padrao;
        throw erro;
    }
    try {
        return JSON.parse(bruto);
    } catch {
        // Arquivo estragado: guarda uma cópia em vez de sobrescrever os dados.
        const copia = `${destino}.corrompido-${Date.now()}`;
        fs.renameSync(destino, copia);
        console.error(`⚠️ ${arquivo} estava corrompido. Cópia salva em ${copia}`);
        return padrao;
    }
}

// Escreve num arquivo temporário e troca no final, para não corromper se o bot cair no meio.
function salvar(arquivo, dados) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    const destino = caminho(arquivo);
    const temporario = `${destino}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2));
    fs.renameSync(temporario, destino);
}

// Copia o arquivo para dados/backups antes de uma operação perigosa (ex.: #resetfin).
function backup(arquivo) {
    if (!existe(arquivo)) return null;
    const pasta = caminho('backups');
    fs.mkdirSync(pasta, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = path.join(pasta, `${path.parse(arquivo).name}-${carimbo}.json`);
    fs.copyFileSync(caminho(arquivo), destino);
    return destino;
}

// Guarda o backup do dia em dados/backups/diario-AAAA-MM-DD.json e mantém só os mais novos.
function guardarBackupDiario(iso, texto, manter = 7) {
    const pasta = caminho('backups');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, `diario-${iso}.json`), texto);
    const antigos = fs.readdirSync(pasta).filter((n) => /^diario-.*\.json$/.test(n)).sort().slice(0, -manter);
    for (const nome of antigos) fs.rmSync(path.join(pasta, nome), { force: true });
}

// Data (AAAA-MM-DD) do backup diário mais novo guardado no aparelho, ou null.
function ultimoBackupDiario() {
    try {
        const nomes = fs.readdirSync(caminho('backups')).filter((n) => /^diario-.*\.json$/.test(n)).sort();
        return nomes.length ? nomes.at(-1).slice('diario-'.length, -'.json'.length) : null;
    } catch {
        return null;
    }
}

module.exports = { ler, salvar, existe, backup, guardarBackupDiario, ultimoBackupDiario };
