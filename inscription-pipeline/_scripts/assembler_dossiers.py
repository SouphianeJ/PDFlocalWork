# Assemble le dossier final de chaque étudiant dans _final/<etudiant>/ :
#  - Dossier IA rempli (déjà généré par remplir_dossier_ia.py)
#  - Bac : relevé / diplôme / attestation (nom de fichier honnête selon contenu)
#  - Identité : recto+verso fusionnés en un seul PDF (images converties)
#  - BTS : relevé et/ou diplôme (déduplication par hash)
#  - _ANOMALIES.txt : éléments manquants ou douteux (contrat pro inclus)
import fitz, hashlib, json, os, shutil

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAITS = os.path.join(BASE, "_extraits")
FINAL = os.path.join(BASE, "_final")
DATA = json.load(open(os.path.join(BASE, "_data", "donnees_formulaire.json"), encoding="utf-8"))

# Étudiants dont le "relevé bac" n'est pas un relevé classique (constaté par lecture)
NOM_FICHIER_BAC = {
    "Coquet-Simon": "BREVET DNB 2020 - ATTENTION relevé bac MANQUANT.pdf",
    "Cellauro-Calista": "Bac - attestation de réussite 2023.pdf",
    "Donini-Tania": "Bac - attestation de réussite 2023.pdf",
    "Mirabel-Martin": "Bac pro 2021 - diplôme.pdf",
    "salomon-clara": "Bac techno 2022 - diplôme.pdf",
    "RADOUANT-NATHAN": "Bac - relevé épreuves anticipées 1ère (relevé final MANQUANT).pdf",
    "Rollet-Antoine": "Bac 2023 - relevé + diplôme.pdf",
    # --- vague 2 ---
    "Abecassis-Moliner-William": "Bac techno 2023 - diplôme.pdf",
    "Bensard-Lola": "Bac - relevé épreuves anticipées 1ère (relevé final MANQUANT).pdf",
    "Colombo-Robin": "Bac techno 2022 - diplôme.pdf",
    "Dansard-Arthur": "Bac - relevé épreuves anticipées 1ère (relevé final MANQUANT).pdf",
    "Nesta-Paolo": "Bac - attestation de réussite 2023.pdf",
    "TUPIN-ELINA": "Bac pro - attestation de réussite 2023 (mention Bien).pdf",
    "lloret-marti-clara": "Bac - capture relevé Cyclades 2023 (document officiel MANQUANT).pdf",
    "veaux-Marion": "Bac général 2023 - diplôme.pdf",
}

# Cas où le fichier "relevé bac+2" n'est pas un relevé BTS
NOM_FICHIER_BTS2 = {
    "veaux-Marion": "BTS - bulletin lycée (PAS le relevé d'examen).pdf",
}

def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def en_pdf(path):
    """Retourne des bytes PDF pour un fichier PDF ou image."""
    if path.lower().endswith(".pdf"):
        return open(path, "rb").read()
    img = fitz.open(path)
    pdf = img.convert_to_pdf()
    img.close()
    return pdf

def trouver(dossier, prefixe):
    for f in sorted(os.listdir(dossier)):
        if f.startswith(prefixe):
            return os.path.join(dossier, f)
    return None

rapport = {}
for sid, fiche in DATA.items():
    src = os.path.join(EXTRAITS, sid, "Documents")
    dst = os.path.join(FINAL, sid)
    os.makedirs(dst, exist_ok=True)
    contenu, anomalies = [], list(fiche["anomalies"])

    # 1. Bac
    bac = trouver(src, "releve-de-notes-de-bac.")
    if bac:
        nom = NOM_FICHIER_BAC.get(sid, "Bac - relevé de notes.pdf")
        shutil.copy2(bac, os.path.join(dst, nom))
        contenu.append(nom)
    else:
        anomalies.append("Aucun fichier relevé/diplôme bac dans l'export.")

    # 2. Identité fusionnée
    recto = trouver(src, "carte-d-identite-ou-passeport")
    verso = trouver(src, "carte-d-identite-verso")
    if recto:
        doc = fitz.open()
        for part in [recto] + ([verso] if verso else []):
            doc.insert_pdf(fitz.open("pdf", en_pdf(part)))
        PASSEPORTS = {"RIZZO-Lisa", "SCOLARI-Noemie"}  # type déclaré en Synthèse
        if verso:
            type_ji = "CNI recto-verso"
        elif sid in PASSEPORTS:
            type_ji = "passeport"
        else:
            type_ji = "CNI recto seul (verso MANQUANT)"
        nom = f"Identité - {type_ji}.pdf"
        doc.save(os.path.join(dst, nom), deflate=True)
        doc.close()
        contenu.append(nom)
    else:
        anomalies.append("Justificatif d'identité ABSENT.")

    # 3. BTS : relevé et/ou diplôme (dédupliqué)
    bts_releve = trouver(src, "releve-de-notes-de-bac2")
    bts_diplome = trouver(src, "dernier-diplome-obtenu-piece-jointe")
    if bts_releve and bts_diplome and md5(bts_releve) == md5(bts_diplome):
        shutil.copy2(bts_releve, os.path.join(dst, "BTS - relevé ou diplôme.pdf"))
        contenu.append("BTS - relevé ou diplôme.pdf")
    else:
        if bts_releve:
            nom_r = NOM_FICHIER_BTS2.get(sid, "BTS - relevé de notes.pdf")
            shutil.copy2(bts_releve, os.path.join(dst, nom_r))
            contenu.append(nom_r)
        if bts_diplome:
            shutil.copy2(bts_diplome, os.path.join(dst, "BTS - diplôme ou attestation.pdf"))
            contenu.append("BTS - diplôme ou attestation.pdf")
    if not bts_releve and not bts_diplome:
        anomalies.append("Aucune pièce bac+2 dans l'export.")

    # 4. Contrat pro : jamais présent dans les exports 360
    anomalies.append("Contrat pro non fourni dans l'export 360 (à récupérer séparément).")

    # 5. Fichier anomalies
    if anomalies:
        with open(os.path.join(dst, "_ANOMALIES.txt"), "w", encoding="utf-8") as fh:
            fh.write(f"Anomalies / pièces manquantes — {fiche['nom']} {fiche['prenom']}\n")
            fh.write("=" * 60 + "\n")
            for a in anomalies:
                fh.write(f"- {a}\n")
    rapport[sid] = {"contenu": contenu, "anomalies": anomalies}
    print(f"{sid}: {len(contenu)+1} pièces, {len(anomalies)} anomalie(s)")

json.dump(rapport, open(os.path.join(BASE, "_data", "assemblage.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("Assemblage terminé.")
