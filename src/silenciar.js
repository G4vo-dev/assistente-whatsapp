// A biblioteca de criptografia do WhatsApp (libsignal) escreve no log as chaves inteiras de cada sessão
// ("Closing session: SessionEntry {...}"). Isso enche a tela, esconde o que importa e mostra chaves que não
// deviam aparecer em print. Aqui essas mensagens viram uma linha curta (ou somem).
const SOMEM = [
    'Closing session:', 'Opening session:', 'Removing old closed session:', 'Session already closed', 'Session already open',
    'Decrypted message with closed session', 'Migrating session to:',
];
const RESUMOS = [
    ['Closing open session in favor of incoming prekey bundle', '🔑 o WhatsApp trocou a chave de criptografia de uma conversa (normal depois de reconectar)'],
    ['Failed to decrypt message with any known session', '🔒 não consegui abrir uma mensagem (chave de criptografia velha)'],
    ['Session error:', null],
];

function filtrar(original) {
    return (...partes) => {
        const texto = typeof partes[0] === 'string' ? partes[0] : '';
        if (SOMEM.some((inicio) => texto.startsWith(inicio))) return;
        const resumo = RESUMOS.find(([inicio]) => texto.startsWith(inicio));
        if (resumo) {
            if (resumo[1]) console.log(resumo[1]);
            return;
        }
        original(...partes);
    };
}

console.info = filtrar(console.info.bind(console));
console.warn = filtrar(console.warn.bind(console));
console.error = filtrar(console.error.bind(console));

module.exports = { filtrar };
