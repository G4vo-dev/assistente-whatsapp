#!/bin/sh
# Liga o bot e religa sozinho se ele cair (rode com: npm run iniciar).
# Se o WhatsApp pedir para parear de novo, para de religar e avisa.
cd "$(dirname "$0")/.." || exit 1
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

while true; do
    node index.js
    codigo=$?
    if [ "$codigo" -eq 2 ]; then
        echo "🔑 precisa parear de novo: rode npm start no Termux."
        exit 2
    fi
    if [ "$codigo" -eq 3 ]; then
        echo "⛔ o bot já está ligado em outro lugar: não vou religar este."
        exit 3
    fi
    if [ "$codigo" -eq 130 ]; then
        exit 0 # Ctrl+C
    fi
    echo "🔁 o bot parou (código $codigo). religando em 10 segundos... (Ctrl+C para sair)"
    sleep 10
done
