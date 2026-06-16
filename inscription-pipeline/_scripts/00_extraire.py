# Étape 0 du pipeline : extrait tous les export-dossier-*.zip présents dans le
# dossier local_parcoursup vers _extraits/<Nom-Prénom>/ (idempotent, écrase).
import os, re, zipfile

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAITS = os.path.join(BASE, "_extraits")

def main():
    os.makedirs(EXTRAITS, exist_ok=True)
    zips = [f for f in os.listdir(BASE)
            if f.startswith("export-dossier-") and f.endswith(".zip")]
    if not zips:
        deja = [d for d in os.listdir(EXTRAITS)
                if os.path.isdir(os.path.join(EXTRAITS, d))] if os.path.isdir(EXTRAITS) else []
        if deja:
            print(f"Aucun zip à extraire ; {len(deja)} dossier(s) déjà présent(s) dans "
                  f"_extraits — étape ignorée.")
            return 0
        print("Aucun export-dossier-*.zip trouvé dans", BASE, "et _extraits est vide.")
        return 1
    n = 0
    for z in sorted(zips):
        m = re.match(r"export-dossier-(.+)-\d{14}\.zip", z)
        if not m:
            print(f"  (ignoré, nom inattendu) {z}")
            continue
        student = m.group(1)
        dest = os.path.join(EXTRAITS, student)
        with zipfile.ZipFile(os.path.join(BASE, z)) as zf:
            zf.extractall(dest)
        n += 1
        print(f"  OK {student}")
    print(f"{n} dossier(s) extrait(s) dans {EXTRAITS}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
