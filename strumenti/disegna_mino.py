"""Disegna Mino (Themino) in pixel art, a mano, in dieci espressioni: neutro, sorriso, risata, occhiolino, dubbioso,
pensieroso, triste, arrabbiato, buca (mano in faccia), stupore (mani in testa).

Niente foto: forme semplici su una griglia 56x56, colori piatti a due o tre toni, contorno d'inchiostro.
Uso: python3 strumenti/disegna_mino.py   -> img/mino-<espressione>.png (56x56) e img/mino-anteprima.png
"""
from pathlib import Path
from PIL import Image

L = 56
CX = 28
USCITA = Path(__file__).resolve().parent.parent / 'img'

COL = {
    'K': (30, 23, 18), 'C': (40, 39, 44), 'c': (62, 61, 68), 'h': (92, 91, 99), 'S': (16, 16, 18), 'B': (150, 150, 156),
    'H': (34, 26, 21), 'F': (201, 142, 100), 'f': (168, 112, 76), 'g': (228, 176, 134), 'r': (178, 98, 86),
    'D': (52, 33, 22), 'd': (84, 52, 32), 'e': (118, 74, 44), 'W': (246, 240, 230), 'Y': (84, 50, 30),
    'T': (248, 242, 232), 'M': (74, 30, 26), 'O': (18, 18, 20), 'o': (110, 110, 116),
    'L': (214, 205, 188), 'l': (182, 172, 152), 'N': (206, 164, 70), 'X': (34, 30, 28), 'A': (60, 52, 48),
}


def ellisse(cx, cy, rx, ry):
    return {(x, y) for x in range(L) for y in range(L) if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1}


def base():
    g = {}
    def metti(punti, c):
        for p in punti:
            if 0 <= p[0] < L and 0 <= p[1] < L:
                g[p] = c

    # Spalle e maglietta color pietra, con la stampa nera sul petto.
    spalle = {(x, y) for y in range(45, L) for x in range(L) if abs(x - CX) <= 15 + (y - 45) * 1.6}
    metti(spalle, 'L')
    metti({(x, y) for x, y in spalle if x > CX + 6}, 'l')
    metti({(x, y) for x in range(CX + 7, CX + 10) for y in range(49, L) if (x + y) % 3}, 'X')
    # Collo, con l'ombra sotto il mento, e la catenina d'oro.
    collo = {(x, y) for x in range(CX - 6, CX + 6) for y in range(36, 47)}
    metti(collo, 'F')
    metti({(x, y) for x, y in collo if y < 41}, 'f')
    metti({(x, 46 - abs(x - CX) // 3) for x in range(CX - 6, CX + 6)}, 'N')
    # Orecchie.
    for ox in (CX - 13, CX + 13):
        metti(ellisse(ox, 25, 2.2, 3.5), 'F')
        metti({(ox, 25), (ox, 26)}, 'f')
    # Testa: ovale di pelle, ombra a destra (luce da sinistra), luce sulla fronte.
    testa = ellisse(CX, 24, 12, 14)
    metti(testa, 'F')
    metti({(x, y) for x, y in testa if x - CX + (y - 24) * 0.25 > 6}, 'f')
    metti({(x, y) for x, y in testa if CX - 8 <= x <= CX - 4 and 16 <= y <= 18}, 'g')
    # Capelli corti ai lati, sotto il berretto.
    metti({(x, y) for x, y in testa if y <= 21 and (x <= CX - 10 or x >= CX + 10)}, 'H')
    # Berretto al contrario: calotta scura, cuciture, cinghia nera con la fibbia sulla fronte.
    calotta = {(x, y) for x, y in ellisse(CX, 15, 13, 9.5) if y <= 15}
    metti(calotta, 'C')
    metti({(x, y) for x, y in calotta if x < CX - 4 and y < 11}, 'c')
    metti({(x, y) for x, y in calotta if CX - 9 <= x <= CX - 6 and 8 <= y <= 9}, 'h')
    metti({(CX, y) for y in range(6, 15)}, 'c')
    metti({(x, y) for x in range(CX - 6, CX + 7) for y in (14, 15)}, 'S')
    metti({(x, 13) for x in range(CX - 3, CX + 4)}, 'H')  # ciuffo che spunta dall'apertura
    metti({(x, y) for x in range(CX - 1, CX + 2) for y in (14, 15)}, 'B')
    # Barba piena: basette, guance, mento lungo; tre toni.
    barba = {(x, y) for x, y in testa if y >= 27 or (y >= 20 and (x <= CX - 10 or x >= CX + 10))}
    barba |= {(x, y) for x, y in ellisse(CX, 33, 10, 7) if y >= 30}
    metti(barba, 'D')
    # Toni morbidi: guancia sinistra piu chiara (luce da sinistra), riflesso rossiccio sul mento.
    metti({(x, y) for x, y in barba if x <= CX - 6 and 26 <= y <= 34}, 'd')
    metti({(x, y) for x, y in barba if CX - 3 <= x <= CX + 1 and 34 <= y <= 36}, 'd')
    metti({(CX - 9, 31), (CX - 8, 33), (CX - 2, 35), (CX, 36)}, 'e')
    metti({(x, y) for x in range(CX - 5, CX + 6) for y in (27, 28)}, 'D')  # baffi
    # Naso: ombra sul lato destro e narici.
    metti({(CX + 1, y) for y in range(21, 26)} | {(CX + 2, 25)}, 'f')
    metti({(CX - 2, 26), (CX + 2, 26)}, 'f')
    # Orecchino nero a cerchio sull'orecchio sinistro di Mino (a destra per chi guarda).
    metti({(CX + 13, 29), (CX + 14, 30), (CX + 13, 31), (CX + 12, 30)}, 'O')
    metti({(CX + 14, 29)}, 'o')
    return g


def occhi_normali(g, alza=0):
    for ox in (CX - 5, CX + 5):
        for dx in (-2, -1, 0, 1):
            g[(ox + dx, 21)] = 'W'
        g[(ox - 1, 21)] = 'Y'; g[(ox, 21)] = 'K'
        g[(ox - 1, 20)] = g[(ox, 20)] = 'K'
        for dx in (-2, -1, 0, 1):
            g[(ox + dx, 20)] = 'K'
    sopracciglia(g, alza)


def sopracciglia(g, alza=0, arrabbiate=False):
    for ox, verso in ((CX - 5, -1), (CX + 5, 1)):
        for dx in range(-3, 3):
            y = 18 - alza + (1 if arrabbiate and dx * verso < 0 else 0)
            g[(ox + dx, y)] = 'H'
            g[(ox + dx, y - 1 if abs(dx) < 2 else y)] = 'H'


def bocca_neutra(g):
    for x in range(CX - 3, CX + 3):
        g[(x, 29)] = 'M'
    g[(CX - 4, 28)] = 'M'; g[(CX + 3, 28)] = 'M'  # angoli all'insu: sorriso a labbra chiuse
    for x in range(CX - 2, CX + 2):
        g[(x, 30)] = 'r'


def neutro():
    g = base()
    occhi_normali(g)
    bocca_neutra(g)
    return g


def sorriso():
    g = base()
    sopracciglia(g, alza=1)
    for ox in (CX - 5, CX + 5):  # occhi a mezzaluna, contenti
        for dx, dy in ((-2, 21), (-1, 20), (0, 20), (1, 21)):
            g[(ox + dx, dy)] = 'K'
    g[(CX - 9, 23)] = g[(CX + 8, 23)] = 'r'  # guance
    for x in range(CX - 5, CX + 5):  # bocca aperta: denti e fondo
        g[(x, 29)] = 'K'
    for x in range(CX - 4, CX + 4):
        g[(x, 30)] = 'T'
        g[(x, 31)] = 'M' if abs(x - CX + 0.5) < 3 else 'K'
    g[(CX - 5, 30)] = g[(CX + 4, 30)] = 'K'
    for x in range(CX - 3, CX + 3):
        g[(x, 32)] = 'K'
    return g


def buca():
    g = base()
    sopracciglia(g, arrabbiate=True)
    g[(CX + 4, 21)] = g[(CX + 5, 21)] = g[(CX + 6, 21)] = 'K'  # l'occhio che si vede, chiuso
    for x in range(CX - 2, CX + 4):  # bocca storta, amara
        g[(x, 30 - (1 if x > CX + 1 else 0))] = 'M'
    # Mano sulla faccia: palmo sull'occhio e sulla fronte, dita in obliquo, avambraccio dal basso a sinistra.
    palmo = ellisse(CX - 4, 20, 7.5, 6)
    for p in palmo:
        g[p] = 'F'
    for p in palmo:
        if p[0] > CX - 2:
            g[p] = 'f'
    for i in range(4):  # solchi tra le dita
        for t in range(5):
            g[(CX - 9 + i * 3 + t // 2, 15 + t)] = 'f'
    asse = lambda y: CX - 8 - (y - 24) * 0.22  # avambraccio che sale quasi dritto dal basso
    braccio = {(x, y) for y in range(24, L) for x in range(L) if abs(x - asse(y)) <= 3.4}
    for p in braccio:
        g[p] = 'F'
    for x, y in braccio:  # ombra sul lato destro e un tatuaggio (l'orologio)
        if x > asse(y) + 1:
            g[(x, y)] = 'f'
    for x, y in ((CX - 11, 38), (CX - 10, 38), (CX - 11, 39), (CX - 10, 40), (CX - 11, 40), (CX - 12, 46), (CX - 11, 47), (CX - 12, 48)):
        g[(x, y)] = 'A'
    for x in range(CX - 12, CX - 5):  # braccialetto
        if (x, 31) in braccio:
            g[(x, 31)] = 'N'
    return g


def stupore():
    g = base()
    sopracciglia(g, alza=2)
    for ox in (CX - 5, CX + 5):  # occhi spalancati, pupille piccole
        for dx in (-2, -1, 0, 1):
            for y in (20, 21, 22):
                g[(ox + dx, y)] = 'W'
        g[(ox - 1, 21)] = g[(ox, 21)] = 'K'
        for dx in (-2, -1, 0, 1):
            g[(ox + dx, 19)] = 'K'
    for x, y in ellisse(CX - 0.5, 31, 2.6, 2.6):  # bocca a O
        g[(x, y)] = 'M'
    for x in range(CX - 2, CX + 2):
        g[(x, 28)] = 'K'
    # Mani in testa: due mani sulla calotta, braccia aperte verso i bordi.
    for lato in (-1, 1):
        mano = ellisse(CX + lato * 10, 9, 5, 3.6)
        for p in mano:
            g[p] = 'F' if lato < 0 else 'f'
        for i in range(3):
            g[(CX + lato * (7 + i * 2), 6)] = 'f'
        gomito = (CX + lato * 23, 15)
        avambraccio = {(x, y) for x in range(L) for y in range(L)
                       if min(abs(x - CX - lato * 13), abs(x - gomito[0])) <= abs(gomito[0] - CX - lato * 13)
                       and lato * (x - CX) >= 12 and lato * (x - CX) <= 25 and abs(y - (9 + (lato * (x - CX) - 13) * 0.55)) <= 2.6}
        braccio = {(x, y) for y in range(15, 46) for x in range(L) if abs(x - (gomito[0] - lato * (y - 15) * 0.22)) <= 3.2}
        for p in avambraccio | braccio:
            g[p] = 'F' if lato < 0 else 'f'
        for p in braccio:  # ombra interna del braccio
            if lato * (p[0] - (gomito[0] - lato * (p[1] - 15) * 0.22)) < -1:
                g[p] = 'f'
    return g


def occhio_chiuso(g, ox, felice=True):
    """Mezzaluna: all'insu se felice (risata, occhiolino), dritta se no."""
    for dx, dy in (((-2, 21), (-1, 20), (0, 20), (1, 21)) if felice else ((-2, 21), (-1, 21), (0, 21), (1, 21))):
        g[(ox + dx, dy)] = 'K'


def occhio_aperto(g, ox, guarda=(0, 0)):
    for dx in (-2, -1, 0, 1):
        g[(ox + dx, 21)] = 'W'
        g[(ox + dx, 20)] = 'K'
    px = ox - 1 + guarda[0]
    g[(px, 21)] = 'Y'; g[(px + 1, 21)] = 'K'
    if guarda[1] < 0:  # sguardo in alto: la pupilla sale sulla palpebra
        g[(px, 21)] = 'W'; g[(px + 1, 21)] = 'W'; g[(px, 20)] = 'Y'; g[(px + 1, 20)] = 'K'
        for dx in (-2, -1, 0, 1):
            g[(ox + dx, 19)] = 'K'


def sopracciglio(g, ox, dy=0, pendenza=0):
    """pendenza > 0: l'interno scende (arrabbiato); < 0: l'interno sale (triste)."""
    verso = 1 if ox < CX else -1  # verso dell'interno della faccia
    for dx in range(-3, 3):
        interno = (dx * verso + 3) / 5  # 0 esterno, 1 interno
        y = 18 + dy + round(pendenza * interno)
        g[(ox + dx, y)] = 'H'
        if abs(dx) < 2:
            g[(ox + dx, y - 1)] = 'H'


def labbro(g):
    """Le bocche chiuse spariscono nella barba scura: sotto ogni tratto di bocca un pixel di labbro."""
    for (x, y), c in list(g.items()):
        if c == 'M' and g.get((x, y + 1)) in ('D', 'd', 'e'):
            g[(x, y + 1)] = 'r'
    return g


def risata():
    g = base()
    for ox in (CX - 5, CX + 5):
        sopracciglio(g, ox, -1)
        occhio_chiuso(g, ox)
    g[(CX - 9, 23)] = g[(CX + 8, 23)] = 'r'
    for x, y in ellisse(CX - 0.5, 31, 4.6, 2.8):  # bocca spalancata: denti sopra, lingua sotto
        g[(x, y)] = 'M'
    for x in range(CX - 4, CX + 4):
        g[(x, 29)] = 'T'
    for x in range(CX - 2, CX + 2):
        g[(x, 33)] = 'r'
    return g


def occhiolino():
    g = base()
    sopracciglio(g, CX - 5, -1)
    sopracciglio(g, CX + 5, 1)
    occhio_aperto(g, CX - 5)
    occhio_chiuso(g, CX + 5)
    for x in range(CX - 3, CX + 4):  # sorriso di lato, da furbo
        g[(x, 29 - (1 if x >= CX + 2 else 0))] = 'M'
    g[(CX + 4, 27)] = 'M'
    return labbro(g)


def dubbioso():
    g = base()
    sopracciglio(g, CX - 5, 0)
    sopracciglio(g, CX + 5, -2)  # un sopracciglio su: "vabbe..."
    occhio_aperto(g, CX - 5, (1, 0))
    occhio_aperto(g, CX + 5, (1, 0))
    for x in range(CX - 1, CX + 4):  # bocca tirata da una parte
        g[(x, 29)] = 'M'
    g[(CX + 4, 28)] = 'M'
    return labbro(g)


def pensieroso():
    g = base()
    sopracciglio(g, CX - 5, -1, -1)
    sopracciglio(g, CX + 5, -1, -1)
    occhio_aperto(g, CX - 5, (1, -1))
    occhio_aperto(g, CX + 5, (1, -1))
    for x in range(CX - 2, CX + 2):  # bocca chiusa, piccola
        g[(x, 29)] = 'M'
    return labbro(g)


def triste():
    g = base()
    sopracciglio(g, CX - 5, 0, -2)
    sopracciglio(g, CX + 5, 0, -2)
    for ox in (CX - 5, CX + 5):
        occhio_aperto(g, ox, (0, 0))
        for dx in (-2, -1, 0, 1):  # palpebre basse
            g[(ox + dx, 20)] = 'K'
            g[(ox + dx, 19)] = 'f'
    for x in range(CX - 3, CX + 3):  # bocca all'ingiu
        g[(x, 29)] = 'M'
    g[(CX - 4, 30)] = g[(CX + 3, 30)] = 'M'
    return labbro(g)


def arrabbiato():
    g = base()
    sopracciglio(g, CX - 5, 0, 2)
    sopracciglio(g, CX + 5, 0, 2)
    occhio_aperto(g, CX - 5)
    occhio_aperto(g, CX + 5)
    for x in range(CX - 4, CX + 4):  # denti stretti: "ma che stai a di'"
        g[(x, 29)] = 'K'; g[(x, 30)] = 'T'; g[(x, 31)] = 'K'
    for x in range(CX - 3, CX + 4, 2):
        g[(x, 30)] = 'K'
    return g


def disegna(g):
    im = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    px = im.load()
    for (x, y), c in g.items():
        px[x, y] = COL[c] + (255,)
    # Contorno d'inchiostro attorno alla figura.
    pieni = set(g)
    for x in range(L):
        for y in range(L):
            if (x, y) not in pieni and any((x + dx, y + dy) in pieni for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = COL['K'] + (255,)
    return im


if __name__ == '__main__':
    USCITA.mkdir(exist_ok=True)
    facce = {'neutro': neutro(), 'sorriso': sorriso(), 'risata': risata(), 'occhiolino': occhiolino(), 'dubbioso': dubbioso(),
             'pensieroso': pensieroso(), 'triste': triste(), 'arrabbiato': arrabbiato(), 'buca': buca(), 'stupore': stupore()}
    S, COLONNE = 5, 5
    righe = (len(facce) + COLONNE - 1) // COLONNE
    anteprima = Image.new('RGBA', (COLONNE * (L * S + 16) + 16, righe * (L * S + 16) + 16), (108, 84, 132, 255))
    for i, (nome, g) in enumerate(facce.items()):
        im = disegna(g)
        im.save(USCITA / f'mino-{nome}.png')
        anteprima.alpha_composite(im.resize((L * S, L * S), Image.NEAREST), (16 + i % COLONNE * (L * S + 16), 16 + i // COLONNE * (L * S + 16)))
    anteprima.save(USCITA / 'mino-anteprima.png')
    print('ok')
