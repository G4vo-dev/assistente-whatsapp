// Roda cada arquivo de teste (test/*.test.js) num processo separado e mostra um resumo no final.
// (O "node --test" às vezes falha no Termux ao juntar o resultado dos arquivos; assim não acontece.)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arquivos = fs.readdirSync(__dirname).filter((nome) => nome.endsWith('.test.js')).sort();
const falharam = [];

for (const arquivo of arquivos) {
    console.log(`\n━━━ ${arquivo} ━━━`);
    const resultado = spawnSync(process.execPath, [path.join(__dirname, arquivo)], { stdio: 'inherit' });
    if (resultado.status !== 0) falharam.push(arquivo);
}

console.log(falharam.length
    ? `\n❌ falhou: ${falharam.join(', ')}`
    : `\n✅ todos os ${arquivos.length} arquivos de teste passaram`);
process.exit(falharam.length ? 1 : 0);
