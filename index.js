const { iniciarBot } = require('./src/conexao');

process.on('unhandledRejection', (erro) => console.error('⚠️ erro não tratado:', erro));

console.log('🤖 iniciando o assistente...');
iniciarBot().catch((erro) => {
    console.error('❌ não consegui iniciar o bot:', erro);
    process.exit(1);
});
