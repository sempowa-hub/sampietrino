"""Scarica da OpenStreetMap parchi, ville e riserve di Roma come aree vere (poligoni), non come punti o perimetri.

Servono alle domande "Una zona con una villa storica" e "Una zona con un grande parco": una zona vale
solo se ci sta un pezzo vero dell'area (src: strumenti/costruisci.py, regola "cuore" delle categorie).
Prende leisure=park, leisure=nature_reserve, boundary=protected_area con un nome, dentro il Raccordo.
Esce dati/fonti/parchi-osm.geojson: nome, ettari, tipo OSM.

Uso: python3 strumenti/scarica_parchi.py   (serve accesso a overpass-api.de)
"""
import json
import sys
from pathlib import Path

from pyproj import Transformer
from shapely import transform as trasforma
from shapely.geometry import LineString, Polygon, mapping, shape
from shapely.ops import polygonize, unary_union
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scarica_luoghi import chiedi, ROMA  # noqa: E402

RADICE = Path(__file__).resolve().parent.parent
USCITA = RADICE / 'dati' / 'fonti' / 'parchi-osm.geojson'
GRA = RADICE / 'dati' / 'fonti' / 'gra-osm.geojson'
MINIMO_HA = 1  # sotto 1 ettaro sono giardinetti; tra 1 e 2 ci sono ancora ville vere (Leopardi, Fiorelli)

utm = Transformer.from_crs(4326, 32633, always_xy=True)
geo = Transformer.from_crs(32633, 4326, always_xy=True)
metri = lambda g: trasforma(g, lambda c: np.column_stack(utm.transform(c[:, 0], c[:, 1])))
gradi = lambda g: trasforma(g, lambda c: np.column_stack(geo.transform(c[:, 0], c[:, 1])))


def area(e):
    """Poligono di una way chiusa o di una relazione multipolygon (anelli esterni meno quelli interni)."""
    if e['type'] == 'way':
        c = [(p['lon'], p['lat']) for p in e.get('geometry', [])]
        return Polygon(c).buffer(0) if len(c) > 3 and c[0] == c[-1] else None
    fuori, dentro = [], []
    for m in e.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'):
            continue
        linea = LineString([(p['lon'], p['lat']) for p in m['geometry']])
        (dentro if m.get('role') == 'inner' else fuori).append(linea)
    if not fuori:
        return None
    esterno = unary_union(list(polygonize(unary_union(fuori))))
    if dentro:
        esterno = esterno.difference(unary_union(list(polygonize(unary_union(dentro)))))
    return esterno.buffer(0) if not esterno.is_empty else None


def main():
    gra = unary_union([metri(shape(f['geometry'])).buffer(0) for f in json.loads(GRA.read_text())['features']])
    filtri = ['leisure"="park', 'leisure"="nature_reserve', 'boundary"="protected_area']
    corpo = ''.join(f'way["{f}"]["name"]{ROMA};relation["{f}"]["name"]{ROMA};' for f in filtri)
    elementi = chiedi(f'({corpo});out geom;')
    feature, visti = [], set()
    for e in elementi:
        g = area(e)
        if g is None or g.is_empty:
            continue
        m = metri(g).intersection(gra)
        ha = m.area / 1e4
        tag = e.get('tags', {})
        chiave = (tag['name'], round(ha))
        if ha < MINIMO_HA or chiave in visti:
            continue
        visti.add(chiave)
        tipo = 'riserva' if tag.get('leisure') == 'nature_reserve' or tag.get('boundary') == 'protected_area' else 'parco'
        feature.append({'type': 'Feature', 'properties': {'nome': tag['name'], 'ettari': round(ha, 1), 'tipo': tipo, 'osm': f"{e['type']}/{e['id']}"},
                        'geometry': mapping(gradi(m.simplify(3)))})
    feature.sort(key=lambda f: -f['properties']['ettari'])
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'features': feature}, ensure_ascii=False, separators=(',', ':')))
    print(f'Scritti {len(feature)} parchi sopra i {MINIMO_HA} ettari in {USCITA.relative_to(RADICE)}')
    for f in feature[:60]:
        p = f['properties']
        print(f"  {p['ettari']:>7} ha  {p['tipo']:<8} {p['nome']}")


if __name__ == '__main__':
    main()
