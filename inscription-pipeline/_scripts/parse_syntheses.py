# Parse les Synthèse.pdf des 15 dossiers étudiants -> _data/etudiants.json
# Le texte des Synthèses est séquentiel : ligne(s) de label puis ligne(s) de valeur.
import fitz, json, os, re

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAITS = os.path.join(BASE, "_extraits")
OUT = os.path.join(BASE, "_data")

# Labels multi-lignes tels qu'ils apparaissent dans le texte extrait : on les
# remplace d'abord par leur forme canonique sur une seule ligne.
MULTILINE = [
    "Carte d'identité ou passeport en\ncours de validité",
    "Date d’expiration justificatif\nd’identité",
    "Numéro CVEC (Contribution de\nVie Etudiante et de Campus)",
    "Dernier diplôme obtenu pièce\njointe",
    "Comment avez-vous connu la\nformation ?",
    "Signatures échéancier de\npaiements",
    "Attestation de RQTH (handicap)",
    "Interessé par d’autres formations",
]

LABELS = [
    "Type de parcours", "Formation", "Interessé par d’autres formations",
    "Civilité", "Prénom", "Nom de famille", "Autres prénoms", "Nom d’usage",
    "Date de naissance", "Nationalité", "Adresse", "Numéro de téléphone",
    "E-mail", "Numéro de sécurité sociale", "Pays de naissance",
    "Carte d'identité ou passeport en cours de validité",
    "Type de justificatif d'identité", "Carte d'identité (verso)",
    "Photo d’identité", "Date d’expiration justificatif d’identité",
    "Département de naissance", "Commune de naissance",
    "Statut RQTH (handicap)", "Attestation de RQTH (handicap)", "INE",
    "Numéro CVEC (Contribution de Vie Etudiante et de Campus)",
    "Bulletins de notes - année N", "Bulletins de notes - année N-1",
    "Bulletins de notes - année N-2", "Relevé de notes de BAC",
    "Dernier diplôme obtenu", "CVEC pièce jointe",
    "Dernier diplôme obtenu pièce jointe", "Relevé de notes de BAC+2",
    "Responsable(s) ou parent(s)", "Payeur(s)", "Droit à l’image",
    "Comment avez-vous connu la formation ?", "Documents administratifs",
    "Signatures échéancier de paiements",
]
SECTIONS = {"Formation", "État civil", "Parcours scolaire - Universitaire",
            "Responsables / Parents", "Informations de paiement",
            "Informations complémentaires", "Signatures"}

def parse_synthese(path):
    doc = fitz.open(path)
    txt = "".join(p.get_text() for p in doc)
    doc.close()
    for ml in MULTILINE:
        txt = txt.replace(ml, ml.replace("\n", " "))
    lines = [l.strip() for l in txt.split("\n")]
    data, cur = {}, None
    label_set = set(LABELS)
    for line in lines:
        if not line:
            continue
        if line in SECTIONS and line != "Formation":
            cur = None
            continue
        # "Formation" est à la fois section et label ; le label suit "Type de parcours"
        if line in label_set:
            cur = line
            data.setdefault(cur, [])
            continue
        if cur is not None:
            data[cur].append(line)
    # Nettoyage : valeurs simples en str, pièces jointes ignorées
    clean = {}
    for k, v in data.items():
        joined = "\n".join(v)
        if joined.startswith("Type : "):  # métadonnées de pièce jointe
            clean[k] = "(pièce jointe)"
        else:
            clean[k] = joined
    return clean

def main():
    os.makedirs(OUT, exist_ok=True)
    result = {}
    for student in sorted(os.listdir(EXTRAITS)):
        sp = os.path.join(EXTRAITS, student, "Synthèse.pdf")
        if not os.path.isfile(sp):
            print(f"!! Synthèse absente pour {student}")
            continue
        result[student] = parse_synthese(sp)
    out = os.path.join(OUT, "etudiants.json")
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(result)} synthèses parsées -> {out}")
    # Contrôle : champs essentiels présents ?
    essentials = ["Prénom", "Nom de famille", "Date de naissance", "INE",
                  "Adresse", "E-mail", "Nationalité", "Commune de naissance"]
    for student, d in result.items():
        missing = [e for e in essentials if not d.get(e) or d.get(e) == "-"]
        flag = " MANQUE: " + ", ".join(missing) if missing else " OK"
        print(f"  {student}:{flag}")

if __name__ == "__main__":
    main()
