#!/bin/sh
# Rifa img/og.png (anteprima dei link, 1200x630) e img/icona-180.png (icona per la schermata Home).
# Serve il server locale acceso (npm run gioca) e Google Chrome. Uso: sh strumenti/anteprima.sh [porta]
PORTA="${1:-8080}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$(dirname "$0")/.." || exit 1
"$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 --window-size=1200,630 --screenshot=img/og.png "http://localhost:$PORTA/strumenti/anteprima.html"
"$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 --window-size=180,180 --screenshot=img/icona-180.png "http://localhost:$PORTA/strumenti/anteprima.html?icona"
