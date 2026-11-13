// Cópia de segurança do login do WhatsApp: se a pasta auth_info_baileys estragar, dá para voltar
// para a reserva em vez de parear de novo.
const fs = require('fs');
const path = require('path');

// Copia a pasta do login para a reserva, mas só se o creds.json estiver íntegro (não estraga uma reserva boa).
function copiarLogin(origem, destino) {
    try {
        JSON.parse(fs.readFileSync(path.join(origem, 'creds.json'), 'utf8'));
    } catch {
        return false;
    }
    const temporario = `${destino}.novo`;
    fs.rmSync(temporario, { recursive: true, force: true });
    fs.cpSync(origem, temporario, { recursive: true });
    fs.rmSync(destino, { recursive: true, force: true });
    fs.renameSync(temporario, destino);
    return true;
}

// A primeira cópia sai 10 min depois de ligar (o login já está estável), depois uma por hora.
function copiarDeHoraEmHora(origem, destino) {
    const guardar = () => {
        try {
            copiarLogin(origem, destino);
        } catch (erro) {
            console.error('⚠️ não consegui copiar o login:', erro.message);
        }
    };
    setTimeout(() => {
        guardar();
        setInterval(guardar, 60 * 60 * 1000).unref();
    }, 10 * 60 * 1000).unref();
}

module.exports = { copiarLogin, copiarDeHoraEmHora };
