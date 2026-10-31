"""Scarica la mappa ufficiale dei quartieri di Roma (2026) dal GeoServer di Roma Capitale.

Delibera dell'Assemblea Capitolina n. 150 del 1 ottobre 2026: rioni, quartieri e zone funzionali coi nomi
che usa la gente (Pigneto, Garbatella, San Lorenzo...). Layer WFS DIPAU:nuova_geografia_urbana_localita.
Esce dati/fonti/localita-2026.geojson: una feature per localita, con nome leggibile, tipo, municipio e codice.

Uso: python3 strumenti/scarica_quartieri.py   (serve accesso a geoportale.comune.roma.it)
Si ferma se il layer non risponde o se mancano rioni: niente silenzio verde.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'fonti' / 'localita-2026.geojson'
WFS = 'https://geoportale.comune.roma.it/geoserver/ows?' + urllib.parse.urlencode({
    'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': 'DIPAU:nuova_geografia_urbana_localita',
    'outputFormat': 'application/json', 'srsName': 'EPSG:4326'})
MINUSCOLE = {'di', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'de', 'e', 'a', 'al', 'alla', 'alle', 'in', 'da', 'dal', 'dalla'}


def leggibile(nome):
    """CINECITTA' EST -> Cinecitta Est con l'accento giusto; DELL'APPIA -> dell'Appia; TOR DE' SCHIAVI -> Tor de' Schiavi."""
    parole = []
    for i, p in enumerate(nome.strip().split()):
        if p == '-':
            parole.append('-')
            continue
        bassa = p.lower()
        if re.fullmatch(r'[IVX]+', p):  # numeri romani: Tiburtino III
            parole.append(p)
            continue
        if bassa == "de'":
            parole.append("de'")
            continue
        # L'apostrofo finale dopo una vocale e un accento scritto all'antica: CITTA' -> città.
        bassa = re.sub(r"([aeiou])'$", lambda m: {'a': 'à', 'e': 'è', 'i': 'ì', 'o': 'ò', 'u': 'ù'}[m.group(1)], bassa)
        if "'" in bassa:  # dell'appia, sant'andrea
            testa, coda = bassa.split("'", 1)
            testa = testa if (i and testa in {'dell', 'd', 'l', 'nell', 'all', 'sull'}) else testa.capitalize()
            parole.append(f"{testa}'{coda.capitalize()}")
        elif i and bassa in MINUSCOLE:
            parole.append(bassa)
        else:
            parole.append(bassa.capitalize())
    return ' '.join(parole)


def piatta(coords):
    """Via la quota (il WFS manda x, y, z) e arrotondamento a 6 decimali, circa 10 cm."""
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 6), round(coords[1], 6)]
    return [piatta(c) for c in coords]


def main():
    richiesta = urllib.request.Request(WFS, headers={'User-Agent': 'sampietrino/0.1'})
    with urllib.request.urlopen(richiesta, timeout=180) as r:
        dati = json.load(r)
    feature = []
    for f in dati['features']:
        p = f['properties']
        feature.append({'type': 'Feature', 'properties': {
            'nome': leggibile(p['nome_localita']), 'tipo': p['tipo_localita'].lower(), 'municipio': p['cod_municipio'],
            'codice': p['cod_localita'],
        }, 'geometry': {'type': f['geometry']['type'], 'coordinates': piatta(f['geometry']['coordinates'])}})
    tipi = {}
    for f in feature:
        tipi[f['properties']['tipo']] = tipi.get(f['properties']['tipo'], 0) + 1
    print(f'Localita scaricate: {len(feature)} ({", ".join(f"{n} {t}" for t, n in sorted(tipi.items()))})')
    if tipi.get('rione') != 22:
        sys.exit(f'ERRORE: attesi 22 rioni, letti {tipi.get("rione")}')
    if tipi.get('quartiere', 0) < 330:
        sys.exit(f'ERRORE: solo {tipi.get("quartiere")} quartieri, la delibera ne approva 334')
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'fonte': 'Roma Capitale, Geoportale, DIPAU:nuova_geografia_urbana_localita (delibera AC 150/2026)',
                                  'features': feature}, ensure_ascii=False, separators=(',', ':')))
    print(f'Scritto {USCITA}')


if __name__ == '__main__':
    main()
