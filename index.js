const { iniciarBot, SAIDA } = require('./src/conexao');
const { pegarTrava } = require('./src/servicos/trava');
const { RAIZ } = require('./src/config');

process.on('unhandledRejection', (erro) => console.error('⚠️ erro não tratado:', erro));

async function ligar() {
    if (!(await pegarTrava(RAIZ))) {
        console.log('⛔ o bot já está ligado nesta pasta (pelo npm run iniciar, pelo Termux:Boot ou em outra aba do Termux).');
        console.log('   se foi pelo Termux:Boot, veja o que ele está fazendo com: npm run log');
        process.exit(SAIDA.OUTRA_COPIA);
    }
    console.log('🤖 iniciando o assistente...');
    await iniciarBot();
}

ligar().catch((erro) => {
    console.error('❌ não consegui iniciar o bot:', erro);
    process.exit(1);
});
