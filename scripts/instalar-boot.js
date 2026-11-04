// Faz o bot ligar sozinho quando o celular reinicia (precisa do app Termux:Boot).
// Rode com: npm run instalar-boot      Para desfazer: npm run instalar-boot -- remover
const fs = require('fs');
const os = require('os');
const path = require('path');

const prefixo = process.env.PREFIX || '';
const pastaBoot = path.join(os.homedir(), '.termux', 'boot');
const arquivo = path.join(pastaBoot, 'assistente-whatsapp.sh');
const pastaBot = path.resolve(__dirname, '..');

if (!prefixo.includes('com.termux')) {
    console.log('❌ isso só funciona no Termux (Android).');
    process.exit(1);
}

if (process.argv[2] === 'remover') {
    fs.rmSync(arquivo, { force: true });
    console.log('🗑️ o bot não vai mais ligar sozinho quando o celular reiniciar.');
    process.exit(0);
}

const roteiro = `#!${prefixo}/bin/sh
# criado pelo assistente-whatsapp (npm run instalar-boot)
termux-wake-lock
cd "${pastaBot}" || exit 1
mkdir -p dados
LOG=dados/bot.log
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then mv "$LOG" "$LOG.antigo"; fi
sh scripts/iniciar.sh >> "$LOG" 2>&1
`;

fs.mkdirSync(pastaBoot, { recursive: true });
fs.writeFileSync(arquivo, roteiro, { mode: 0o755 });
fs.chmodSync(arquivo, 0o755);
console.log(`✅ pronto! criado ${arquivo}`);
console.log('');
console.log('falta só:');
console.log('1. instalar o app Termux:Boot (do F-Droid, o mesmo lugar de onde veio o seu Termux)');
console.log('2. abrir o Termux:Boot uma vez e fechar');
console.log('3. reiniciar o celular para testar. o que o bot escrever fica em dados/bot.log (npm run log)');
