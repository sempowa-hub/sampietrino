"""Scarica le chicche approvate dai follower (Firestore, collezione proposte, stato "approvata") per costruisci.py.
Esce dati/proposte-follower.json: luogo, zona, nome di chi l'ha proposta, perche, quando e stata decisa.
Serve l'accesso admin al progetto (gcloud auth come sempowa@gmail.com).

Uso: python3 strumenti/proposte.py
"""
import json
import subprocess
import urllib.request
from pathlib import Path

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'proposte-follower.json'
URL = 'https://firestore.googleapis.com/v1/projects/sampietrino-roma/databases/(default)/documents:runQuery'


def valore(v):
    for k in ('stringValue', 'integerValue', 'timestampValue', 'booleanValue'):
        if k in v:
            return v[k]
    return None


def main():
    token = subprocess.run(['gcloud', 'auth', 'print-access-token'], capture_output=True, text=True, check=True).stdout.strip()
    corpo = {'structuredQuery': {'from': [{'collectionId': 'proposte'}],
                                 'where': {'fieldFilter': {'field': {'fieldPath': 'stato'}, 'op': 'EQUAL', 'value': {'stringValue': 'approvata'}}}}}
    r = urllib.request.Request(URL, data=json.dumps(corpo).encode(), headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    righe = json.load(urllib.request.urlopen(r))
    out = []
    for riga in righe:
        doc = riga.get('document')
        if not doc:
            continue
        f = {k: valore(v) for k, v in doc['fields'].items()}
        out.append({'id': doc['name'].rsplit('/', 1)[-1], 'luogo': f.get('luogo'), 'zona': f.get('zona'), 'nome': f.get('nome'),
                    'perche': f.get('perche'), 'decisa': f.get('decisa') or f.get('quando')})
    out.sort(key=lambda x: (x['decisa'] or '', x['id']))
    USCITA.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f'Chicche approvate: {len(out)}. Scritto {USCITA}')


if __name__ == '__main__':
    main()
