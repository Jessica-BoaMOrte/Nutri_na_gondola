#!/bin/sh
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
    python3 servidor/app.py --abrir
elif command -v python >/dev/null 2>&1; then
    python servidor/app.py --abrir
else
    echo "Python não foi encontrado. Instale em https://www.python.org/downloads/ e abra este arquivo de novo."
fi
