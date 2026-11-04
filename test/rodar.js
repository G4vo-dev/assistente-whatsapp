// Roda cada arquivo de teste num processo separado e mostra um resumo no final.
// (O "node --test" às vezes falha no Termux ao juntar o resultado dos arquivos; assim não acontece.)
const path = require('path');
const { spawnSync } = require('child_process');

const arquivos = ['bot.test.js', 'financas.test.js', 'extras.test.js', 'ia.test.js', 'privacidade.test.js', 'midia.test.js'];
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
