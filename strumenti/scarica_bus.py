"""Scarica da OpenStreetMap i percorsi delle linee di autobus piu note di Roma (64, 40, 75...), per le domande
"Una zona dove passa il 64". Esce dati/fonti/osm-bus.geojson.

Uso: python3 strumenti/scarica_bus.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scarica_luoghi import chiedi, ROMA  # noqa: E402
from scarica_osm_extra import linee  # noqa: E402

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'fonti' / 'osm-bus.geojson'
# Linee storiche e note: quelle che un romano nomina (il 64 dei borseggiatori, il 40 espresso, l'H, il 590 del Colosseo...).
LINEE = ['23', '30', '40', '44', '46', '49', '51', '60', '62', '63', '64', '70', '71', '75', '81', '85', '87', '90', '105', '115', '116',
         '117', '118', '170', '280', '310', '360', '492', '590', '628', '660', '714', '780', '910', '913', '916', '990', 'H', 'C2', 'C3']


def main():
    filtro = '|'.join(LINEE)
    per = defaultdict(list)
    for e in chiedi(f'relation["route"="bus"]["ref"~"^({filtro})$"]["network"~"ATAC|Roma",i]{ROMA};out geom;'):
        per[e['tags']['ref']] += linee([e])
    f = [{'type': 'Feature', 'properties': {'linea': ref}, 'geometry': {'type': 'MultiLineString', 'coordinates': ls}} for ref, ls in per.items()]
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'features': f}, separators=(',', ':')))
    print(f'Linee bus: {sorted(per)}. Scritto {USCITA}')


if __name__ == '__main__':
    main()
