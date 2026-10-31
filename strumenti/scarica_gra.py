"""Scarica il Grande Raccordo Anulare da OpenStreetMap e salva l'area che racchiude.

Nel database di OpenStreetMap il GRA e l'autostrada con sigla A90.
Le carreggiate si allargano di 40 m (per chiudere eventuali piccoli buchi nei dati)
e l'area dentro l'anello diventa dati/fonti/gra-osm.geojson.

Uso: python3 strumenti/scarica_gra.py   (serve accesso a overpass-api.de)
Si ferma con errore se l'anello non si chiude o se l'area non e plausibile.
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import transform as trasforma
from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import unary_union

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'fonti' / 'gra-osm.geojson'
SERVER = 'https://overpass-api.de/api/interpreter'
RICHIESTA = '''[out:json][timeout:90];
way["highway"="motorway"]["ref"~"(^|;) *A90 *(;|$)"](41.70,12.30,42.05,12.70);
out geom;'''

avanti = Transformer.from_crs(4326, 32633, always_xy=True)
indietro = Transformer.from_crs(32633, 4326, always_xy=True)


def converti(geom, t):
    return trasforma(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def main():
    corpo = urllib.parse.urlencode({'data': RICHIESTA}).encode()
    richiesta = urllib.request.Request(SERVER, data=corpo, headers={'User-Agent': 'sampietrino/0.1'})
    with urllib.request.urlopen(richiesta, timeout=120) as r:
        elementi = json.load(r)['elements']
    tratti = [LineString([(p['lon'], p['lat']) for p in e['geometry']]) for e in elementi if len(e.get('geometry', [])) > 1]
    print(f'Tratti di A90 scaricati: {len(tratti)}')
    if len(tratti) < 20:
        sys.exit(f'ERRORE: solo {len(tratti)} tratti, il GRA ne ha centinaia: la richiesta non ha trovato la strada')

    linee = converti(unary_union(tratti), avanti)
    lunghezza = linee.length / 1000
    print(f'Lunghezza totale delle carreggiate: {lunghezza:.0f} km (il GRA e circa 68 km, due carreggiate)')
    anello = linee.buffer(40)
    anelli = anello.geoms if anello.geom_type == 'MultiPolygon' else [anello]
    buchi = [Polygon(i) for a in anelli for i in a.interiors]
    if not buchi:
        sys.exit('ERRORE: le carreggiate non formano un anello chiuso (buchi nei dati oltre 80 m)')
    dentro = max(buchi, key=lambda p: p.area)
    km2 = dentro.area / 1e6
    print(f'Area dentro il GRA: {km2:.0f} km2')
    if not 250 < km2 < 500:
        sys.exit(f'ERRORE: {km2:.0f} km2 non e plausibile per il GRA (atteso 250-500)')

    geo = converti(dentro.simplify(10), indietro)
    USCITA.write_text(json.dumps({
        'type': 'FeatureCollection',
        'features': [{'type': 'Feature', 'properties': {'name': 'Dentro il Grande Raccordo Anulare', 'fonte': 'OpenStreetMap, A90'},
                      'geometry': mapping(geo)}],
    }))
    print(f'Scritto {USCITA}')


if __name__ == '__main__':
    main()
