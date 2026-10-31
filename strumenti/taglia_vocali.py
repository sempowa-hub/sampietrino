"""Taglia i vocali di Themino in clip singole: una per variante, tagliate sulle pause.

Ogni file registrato contiene le varianti di una dicitura separate da almeno mezzo secondo di silenzio.
Le clip escono tutte allo stesso volume (loudnorm), mono, con una dissolvenza di 15 ms, in mp3 leggero:
audio/<nome>-<n>.mp3 e audio/voci.json con quante varianti ha ogni dicitura.

Uso: python3 strumenti/taglia_vocali.py <cartella dei vocali>
     i file si chiamano come le diciture: INIZIO_PARTITA.m4a, DA_MINO.m4a, CHICCA.m4a, ROMANO_DE_ROMA.m4a,
     CE_STA.m4a, DA_CARTOLINA.m4a, DA_BUCA.m4a, CAPOLINEA.m4a (basta che il nome contenga queste parole).
Serve ffmpeg.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

USCITA = Path(__file__).resolve().parent.parent / 'audio'
NOMI = {'INIZIO_PARTITA': 'daje', 'DA_MINO': 'da-mino', 'CHICCA': 'chicca', 'ROMANO_DE_ROMA': 'romano',
        'CE_STA': 'ce-sta', 'DA_CARTOLINA': 'cartolina', 'DA_BUCA': 'buca', 'CAPOLINEA': 'capolinea'}
MARGINE = 0.08  # secondi lasciati prima e dopo la voce


def segmenti(file):
    """Tratti di voce tra un silenzio e l'altro (sotto -35 dB per almeno 0,45 s)."""
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(file), '-af', 'silencedetect=noise=-35dB:d=0.45', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    durata = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()[2]) + 60 * float(re.search(r'Duration: (\d+):(\d+)', err).group(2))
    inizi = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', err)]
    fini = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', err)]
    voce, cursore = [], 0.0
    for a, b in zip(inizi, fini + [durata]):
        if a - cursore > 0.25:
            voce.append((max(0, cursore - MARGINE), a + MARGINE))
        cursore = b
    if durata - cursore > 0.25:
        voce.append((max(0, cursore - MARGINE), durata))
    return voce


def main():
    cartella = Path(sys.argv[1])
    USCITA.mkdir(exist_ok=True)
    conteggi = {}
    for file in sorted(cartella.glob('*.m4a')):
        chiave = next((k for k in NOMI if k in file.stem.upper()), None)
        if not chiave:
            print(f'salto {file.name}: non e una dicitura conosciuta')
            continue
        nome = NOMI[chiave]
        tratti = segmenti(file)
        for i, (a, b) in enumerate(tratti, 1):
            d = b - a
            filtro = f'loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.015,afade=t=out:st={max(0, d - 0.03):.3f}:d=0.03'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{a:.3f}', '-t', f'{d:.3f}', '-i', str(file),
                            '-af', filtro, '-ac', '1', '-ar', '44100', '-b:a', '80k', str(USCITA / f'{nome}-{i}.mp3')], check=True)
        conteggi[nome] = len(tratti)
        print(f'{nome}: {len(tratti)} varianti ({", ".join(f"{b - a:.1f}s" for a, b in tratti)})')
    (USCITA / 'voci.json').write_text(json.dumps(conteggi, ensure_ascii=False, indent=1))
    print(f'Scritto {USCITA / "voci.json"}')


if __name__ == '__main__':
    main()
