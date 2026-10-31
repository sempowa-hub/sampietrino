"""Scarica da OpenStreetMap i luoghi delle categorie in dati/categorie.json.

Metro: le fermate delle relazioni route=subway con la sigla della linea (A, B, B1, C).
Altre categorie: il filtro Overpass scritto nella categoria.
Esce dati/fonti/luoghi-osm.geojson: un punto (o una linea, per il Tevere) per luogo,
con la categoria nelle proprieta.

Uso: python3 strumenti/scarica_luoghi.py   (serve accesso a overpass-api.de)
Si ferma con errore se una categoria non trova niente: niente silenzio verde.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
USCITA = RADICE / 'dati' / 'fonti' / 'luoghi-osm.geojson'
SERVER = 'https://overpass-api.de/api/interpreter'
ROMA = '(41.70,12.30,42.05,12.75)'


def chiedi(query):
    corpo = urllib.parse.urlencode({'data': f'[out:json][timeout:120];{query}'}).encode()
    richiesta = urllib.request.Request(SERVER, data=corpo, headers={'User-Agent': 'sampietrino/0.1'})
    with urllib.request.urlopen(richiesta, timeout=180) as r:
        return json.load(r)['elements']


def fermate_metro(linee):
    regex = '|'.join(linee)
    elementi = chiedi(f'rel["route"="subway"]["ref"~"^({regex})$"]{ROMA}->.r;node(r.r)->.n;.n out;')
    punti = []
    for e in elementi:
        if e.get('type') == 'node':
            punti.append({'type': 'Point', 'coordinates': [e['lon'], e['lat']], 'nome': e.get('tags', {}).get('name', '')})
    return punti


def luoghi(filtro):
    elementi = chiedi(f'{filtro}{ROMA};out geom;')
    geometrie = []
    for e in elementi:
        nome = e.get('tags', {}).get('name', '')
        if e['type'] == 'node':
            geometrie.append({'type': 'Point', 'coordinates': [e['lon'], e['lat']], 'nome': nome})
        elif e['type'] == 'way' and e.get('geometry'):
            coords = [[p['lon'], p['lat']] for p in e['geometry']]
            geometrie.append({'type': 'LineString', 'coordinates': coords, 'nome': nome})
        elif e['type'] == 'relation' and e.get('bounds'):
            b = e['bounds']
            centro = [(b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2]
            geometrie.append({'type': 'Point', 'coordinates': centro, 'nome': nome})
    return geometrie


def main():
    categorie = json.loads((RADICE / 'dati' / 'categorie.json').read_text())['categorie']
    if not categorie:
        sys.exit('ERRORE: nessuna categoria in dati/categorie.json')
    feature, vuote = [], []
    for c in categorie:
        trovati = fermate_metro(c['metro']) if 'metro' in c else luoghi(c['osm'])
        print(f'{c["id"]}: {len(trovati)} luoghi')
        if not trovati:
            vuote.append(c['id'])
        for g in trovati:
            nome = g.pop('nome')
            feature.append({'type': 'Feature', 'properties': {'categoria': c['id'], 'nome': nome}, 'geometry': g})
        time.sleep(1)
    if vuote:
        sys.exit(f'ERRORE: categorie senza nessun luogo: {", ".join(vuote)}. Controlla il filtro in dati/categorie.json')
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'features': feature}, ensure_ascii=False))
    print(f'Scritti {len(feature)} luoghi in {USCITA.relative_to(RADICE)}')


if __name__ == '__main__':
    main()
