"""Accorpa le localita della mappa 2026 nelle zone del gioco: una via di mezzo tra i 262 quartieri ufficiali
dentro il Raccordo (troppo specifici) e le vecchie 73 zone.

Regole, in ordine:
1. I 22 rioni restano com'erano.
2. Famiglie di nomi: Monteverde Vecchio + Monteverde Nuovo = Monteverde, Torrino Nord + Sud = Torrino...
   e qualche accorpamento a mano coi nomi che usa la gente (Appio San Giovanni + Tuscolano San Giovanni = San Giovanni).
3. Le zone funzionali restano solo se famose (Villa Borghese, Villa Ada...); le altre (ospedali, depositi,
   aeroporti) vanno nel quartiere con cui hanno piu confine.
4. I quartieri piu piccoli e meno nominati si fondono col vicino con cui hanno piu confine, finche le zone
   dentro il Raccordo sono OBIETTIVO. Il nome che resta e quello piu nominato.
Esce dati/fonti/zone-gioco.geojson: nome, notorieta, municipio, localita comprese.

Uso: python3 strumenti/accorpa_zone.py   (dopo strumenti/scarica_quartieri.py e scarica_gra.py)
"""
import json
import re
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import force_2d, transform as trasforma
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

RADICE = Path(__file__).resolve().parent.parent
FONTI = RADICE / 'dati' / 'fonti'
OBIETTIVO = 140
SOGLIA_GRA = 0.4
FUNZIONALI_FAMOSE = {'Villa Borghese', 'Villa Ada', 'Villa Pamphili', "Caffarella - Parco dell'Appia Antica", 'Parco degli Acquedotti',
                     'Foro Italico', 'Verano', 'Cinecittà', "Parco dell'Appia Antica"}
# Famiglie scritte a mano: nome di gioco -> localita ufficiali.
A_MANO = {
    'San Giovanni': ['Appio San Giovanni', 'Tuscolano San Giovanni'],
    'Appia Antica': ['Appia Antica', "Parco dell'Appia Antica"],
    'Caffarella': ["Caffarella - Parco dell'Appia Antica"],
    'Tor Marancia': ['Tor Marancia', "Tor Marancia - Parco dell'Appia Antica"],
    'Aurelio': ['Aurelio', 'Aurelio Gregorio VII'],
    'Trionfale': ['Eroi Trionfale', 'Igea Trionfale', 'Igea'],
    'Tuscolano': ['Tuscolano Lais'],
    'Cecchignola': ['Castello della Cecchignola', 'Città Militare della Cecchignola', 'Fosso della Cecchignola'],
}
SUFFISSI = r'\s+(Nord|Sud|Est|Ovest|Alta|Bassa|Vecchio|Vecchia|Nuovo|Nuova)$'
# Nomi che la gente usa davvero e che devono restare quando assorbono un vicino (la stima automatica li sottovaluta).
NOMI_FORTI = {'Appia Antica': 60, 'Ardeatino': 45, 'Tor di Quinto': 45, 'Portuense': 50, 'Tor di Valle': 40, 'Cecchignola': 45,
              'Valle Aurelia': 45, 'Collatino': 40, 'Colli Aniene': 45, 'Caffarella': 55, 'San Giovanni': 75, 'Tuscolano': 50,
              'Trionfale': 50, 'Monteverde': 65, 'Torrino': 40}

utm = Transformer.from_crs(4326, 32633, always_xy=True)
geo = Transformer.from_crs(32633, 4326, always_xy=True)
metri = lambda g: trasforma(g, lambda c: np.column_stack(utm.transform(c[:, 0], c[:, 1])))
gradi = lambda g: trasforma(g, lambda c: np.column_stack(geo.transform(c[:, 0], c[:, 1])))


def main():
    notorieta = json.loads((RADICE / 'dati' / 'notorieta.json').read_text())['valori']
    notorieta.update(NOMI_FORTI)
    forti = set(NOMI_FORTI) | set(A_MANO) | FUNZIONALI_FAMOSE
    gra = unary_union([metri(shape(f['geometry'])).buffer(0) for f in json.loads((FONTI / 'gra-osm.geojson').read_text())['features']])
    loc = {}
    for f in json.loads((FONTI / 'localita-2026.geojson').read_text())['features']:
        p = f['properties']
        g = metri(force_2d(shape(f['geometry']))).buffer(0)
        if g.intersection(gra).area / g.area < SOGLIA_GRA:
            continue
        loc[p['nome']] = {'g': g, 'tipo': p['tipo'], 'municipio': p['municipio']}

    # Ogni zona di gioco: nome, geometria, localita comprese.
    zone = {n: {'g': v['g'], 'tipo': v['tipo'], 'municipio': v['municipio'], 'comprende': [n]} for n, v in loc.items()}

    def fondi(dentro, chi, nome=None):
        a, b = zone.pop(dentro), zone.pop(chi)
        if not nome:
            # Chi assorbe tiene il suo nome, a meno che l'altro sia un nome forte o chiaramente piu nominato.
            nome = chi if (chi in forti and dentro not in forti) or notorieta.get(chi, 0) >= notorieta.get(dentro, 0) + 10 else dentro
        zone[nome] = {'g': a['g'].union(b['g']).buffer(0), 'tipo': 'rione' if 'rione' in (a['tipo'], b['tipo']) else 'quartiere',
                      'municipio': (a if a['g'].area >= b['g'].area else b)['municipio'], 'comprende': a['comprende'] + b['comprende']}
        notorieta[nome] = max(notorieta.get(dentro, 0), notorieta.get(chi, 0), notorieta.get(nome, 0))
        if nome in (dentro, chi) and (dentro in forti or chi in forti):
            forti.add(nome)
        return nome

    # 2. Famiglie a mano e famiglie per suffisso.
    for nome, membri in A_MANO.items():
        presenti = [m for m in membri if m in zone]
        if not presenti:
            continue
        corrente = presenti[0]
        for m in presenti[1:]:
            corrente = fondi(corrente, m, nome)
        if corrente != nome:
            zone[nome] = zone.pop(corrente)
            notorieta[nome] = max(notorieta.get(nome, 0), notorieta.get(corrente, 0))
    famiglie = {}
    for n, z in zone.items():
        if z['tipo'] == 'rione':
            continue
        radice = re.sub(SUFFISSI, '', n.split(' - ')[0]).strip()
        famiglie.setdefault(radice, []).append(n)
    for radice, membri in famiglie.items():
        if len(membri) < 2:
            continue
        corrente = membri[0]
        for m in membri[1:]:
            corrente = fondi(corrente, m, radice)

    def vicino_migliore(n):
        g = zone[n]['g'].buffer(15)
        candidati = [(g.intersection(z['g']).area, m) for m, z in zone.items() if m != n and g.intersects(z['g'])]
        candidati = [c for c in candidati if zone[c[1]]['tipo'] != 'rione' or zone[n]['tipo'] == 'rione']
        return max(candidati)[1] if candidati else None

    # 3. Zone funzionali non famose: nel quartiere con piu confine.
    for n in [n for n, z in zone.items() if z['tipo'] == 'zona funzionale' and n not in FUNZIONALI_FAMOSE and n not in A_MANO]:
        if n in zone:
            v = vicino_migliore(n)
            if v:  # una zona funzionale qualunque non da il suo nome (niente "Aeroporto dell'Urbe" per Castel Giubileo)
                fondi(v, n, None if n in forti else v)

    # 4. Quartieri piccoli e poco nominati, dal punteggio piu basso, finche si arriva all'obiettivo.
    while len(zone) > OBIETTIVO:
        candidati = [n for n, z in zone.items() if z['tipo'] == 'quartiere' and n not in forti]
        n = min(candidati, key=lambda n: zone[n]['g'].area / 1e6 * 0.6 + notorieta.get(n, 0) / 25)
        v = vicino_migliore(n)
        if not v:
            break
        fondi(v, n)

    feature = []
    for n, z in sorted(zone.items()):
        feature.append({'type': 'Feature', 'properties': {'nome': n, 'notorieta': notorieta.get(n, 20), 'municipio': z['municipio'],
                                                          'tipo': z['tipo'], 'comprende': sorted(z['comprende'])},
                        'geometry': mapping(gradi(z['g'].simplify(2)))})
    uscita = FONTI / 'zone-gioco.geojson'
    uscita.write_text(json.dumps({'type': 'FeatureCollection', 'features': feature}, ensure_ascii=False, separators=(',', ':')))
    print(f'Zone di gioco: {len(feature)} (da {len(loc)} localita dentro il Raccordo). Scritto {uscita.relative_to(RADICE)}')
    accorpate = [f['properties'] for f in feature if len(f['properties']['comprende']) > 1]
    for p in sorted(accorpate, key=lambda p: -len(p['comprende'])):
        print(f"  {p['nome']}: {', '.join(p['comprende'])}")


if __name__ == '__main__':
    main()
