"""Costruisce dati/gioco.json dalle fonti geografiche.

Zone: i poligoni di dati/fonti/quartieri-osm.geojson, uniti per nome.
Domande: calcolate dalla geometria, mai scritte a mano.
  - "Confina con X": zone che condividono con X almeno 100 m di confine.
  - "Nel Municipio N": zone che stanno per piu di meta nel municipio.
  - "Sul confine del Comune": zone che toccano il bordo esterno di Roma.

Uso: pip install shapely pyproj && python3 strumenti/costruisci.py
Si ferma con errore se un dato manca: niente silenzio verde.
"""
import json

import numpy as np
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely import transform as trasforma
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

RADICE = Path(__file__).resolve().parent.parent
FONTI = RADICE / 'dati' / 'fonti'
USCITA = RADICE / 'dati' / 'gioco.json'
CONFINE_MINIMO_M = 100
MIN_RISPOSTE, MAX_RISPOSTE = 4, 25
ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

utm = Transformer.from_crs(4326, 32633, always_xy=True)


def in_metri(geom):
    return trasforma(geom, lambda c: np.column_stack(utm.transform(c[:, 0], c[:, 1])))


def slug(testo):
    t = unicodedata.normalize('NFKD', testo).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def errore(msg):
    sys.exit(f'ERRORE: {msg}')


def carica(nome):
    f = FONTI / nome
    if not f.exists():
        errore(f'manca {f}')
    feats = json.loads(f.read_text())['features']
    if not feats:
        errore(f'{f} non ha nessun poligono')
    return feats


def percorso_svg(geom, origine):
    """Path SVG in km, y verso il basso, origine in alto a sinistra."""
    x0, y1 = origine
    parti = geom.geoms if geom.geom_type == 'MultiPolygon' else [geom]
    pezzi = []
    for p in parti:
        for anello in [p.exterior, *p.interiors]:
            pts = [f'{(x - x0) / 1000:.2f} {(y1 - y) / 1000:.2f}' for x, y in anello.coords[:-1]]
            pezzi.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(pezzi)


def main():
    notorieta = json.loads((RADICE / 'dati' / 'notorieta.json').read_text())['valori']

    per_nome = defaultdict(list)
    for f in carica('quartieri-osm.geojson'):
        per_nome[f['properties']['name']].append(in_metri(shape(f['geometry'])).buffer(0))
    zone = {n: unary_union(g) for n, g in per_nome.items()}

    mancanti = sorted(n for n in zone if n not in notorieta)
    if mancanti:
        errore(f'notorieta mancante per {len(mancanti)} zone: {", ".join(mancanti)}')

    municipi = {}
    for f in carica('municipi-osm.geojson'):
        municipi[f['properties']['num']] = in_metri(shape(f['geometry'])).buffer(0)
    if sorted(municipi) != list(range(1, 16)):
        errore(f'attesi 15 municipi, letti {sorted(municipi)}')
    comune = unary_union(list(municipi.values()))

    ids = {n: slug(n) for n in zone}
    if len(set(ids.values())) != len(ids):
        errore('due zone hanno lo stesso id')

    # Vicini: confine in comune di almeno CONFINE_MINIMO_M metri.
    vicini = defaultdict(set)
    nomi = sorted(zone)
    for i, a in enumerate(nomi):
        for b in nomi[i + 1:]:
            if zone[a].distance(zone[b]) > 5:
                continue
            comune_ab = zone[a].buffer(5).intersection(zone[b].buffer(5))
            if comune_ab.length / 2 >= CONFINE_MINIMO_M or comune_ab.area >= CONFINE_MINIMO_M * 10:
                vicini[a].add(b)
                vicini[b].add(a)

    domande = []
    for n in nomi:
        domande.append({
            'id': f'confina-{ids[n]}',
            'tipo': 'confina',
            'testo': f'Una zona che confina con {n}',
            'evidenzia': [ids[n]],
            'risposte': sorted(ids[v] for v in vicini[n]),
        })

    mun_di = {}
    for n in nomi:
        quote = {k: zone[n].intersection(m).area / zone[n].area for k, m in municipi.items()}
        k, q = max(quote.items(), key=lambda kv: kv[1])
        mun_di[n] = k if q > 0.5 else None
    for k in range(1, 16):
        domande.append({
            'id': f'municipio-{k}',
            'tipo': 'municipio',
            'testo': f'Una zona del Municipio {ROMANI[k]}',
            'evidenziaMunicipio': k,
            'risposte': sorted(ids[n] for n in nomi if mun_di[n] == k),
        })

    bordo = comune.boundary.buffer(150)
    domande.append({
        'id': 'bordo-comune',
        'tipo': 'bordo',
        'testo': 'Una zona che confina con un altro Comune o col Vaticano',
        'risposte': sorted(ids[n] for n in nomi if zone[n].intersects(bordo)),
    })

    giocabili = [d for d in domande if MIN_RISPOSTE <= len(d['risposte']) <= MAX_RISPOSTE]
    if len(giocabili) < 5:
        errore(f'solo {len(giocabili)} domande giocabili su {len(domande)}')

    minx, miny, maxx, maxy = comune.bounds
    origine = (minx, maxy)
    semplifica = lambda g: g.simplify(25, preserve_topology=True)
    dati = {
        'nota': 'Generato da strumenti/costruisci.py. Non modificare a mano. Confini: OpenStreetMap (ODbL), vecchia suddivisione toponomastica.',
        'attribuzione': 'Confini © OpenStreetMap contributors',
        'dimensioni': [round((maxx - minx) / 1000, 2), round((maxy - miny) / 1000, 2)],
        'comune': percorso_svg(semplifica(comune), origine),
        'municipi': [{'num': k, 'nome': f'Municipio {ROMANI[k]}', 'd': percorso_svg(semplifica(m), origine)}
                     for k, m in sorted(municipi.items())],
        'zone': [{
            'id': ids[n], 'nome': n, 'notorieta': notorieta[n], 'municipio': mun_di[n],
            'km2': round(zone[n].area / 1e6, 1), 'd': percorso_svg(semplifica(zone[n]), origine),
            'centro': [round((zone[n].representative_point().x - minx) / 1000, 2),
                       round((maxy - zone[n].representative_point().y) / 1000, 2)],
        } for n in nomi],
        'domande': giocabili,
    }
    USCITA.write_text(json.dumps(dati, ensure_ascii=False, separators=(',', ':')))

    coperta = unary_union(list(zone.values())).intersection(comune).area / comune.area
    print(f'Zone: {len(zone)} (da {sum(len(g) for g in per_nome.values())} poligoni)')
    print(f'Copertura del Comune: {coperta:.1%}')
    print(f'Domande: {len(giocabili)} giocabili su {len(domande)} '
          f'(scartate perche con meno di {MIN_RISPOSTE} o piu di {MAX_RISPOSTE} risposte: {len(domande) - len(giocabili)})')
    senza_vicini = [n for n in nomi if not vicini[n]]
    if senza_vicini:
        print(f'ATTENZIONE: zone senza vicini: {", ".join(senza_vicini)}')
    print(f'Scritto {USCITA.relative_to(RADICE)} ({USCITA.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
