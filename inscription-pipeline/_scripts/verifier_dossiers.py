# Vérification finale dossier par dossier :
#  - présence des 3-4 pièces attendues + Dossier IA
#  - chaque PDF s'ouvre et a le bon nombre de pages (identité CNI >= 2 pages)
#  - relecture du Dossier IA rempli : les valeurs des champs correspondent
#    exactement aux données de donnees_formulaire.json
import fitz, json, os

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL = os.path.join(BASE, "_final")
DATA = json.load(open(os.path.join(BASE, "_data", "donnees_formulaire.json"), encoding="utf-8"))

CHAMPS_CLES = {
    "NINES ou BEA se trouve sur le relevé de notes du BAC": "ine",
    "Nom de naissance": "nom",
    "Prénom": "prenom",
    "Date de naissance": "naissance_jj",
    "Date de naissanceM": "naissance_mm",
    "Date de naissanceY": "naissance_aaaa",
    "Ville de naissance": "ville_naissance",
    "Adresse": "adresse",
    "Code postal_2": "cp",
    "Ville": "ville",
    "num_telephone": "tel",
    "Adresse courriel obligatoire": "email",
    "Année dobtention": "bac_annee",
    "Intitulé": "bac_intitule",
    "Mention": "bac_mention",
    "Nom de létablissement": "dernier_etab_nom",
}

ok_global = True
for sid, fiche in DATA.items():
    dossier = os.path.join(FINAL, sid)
    erreurs, infos = [], []
    fichiers = sorted(os.listdir(dossier))
    pdfs = [f for f in fichiers if f.endswith(".pdf")]

    # 1. pièces attendues
    a_dossier_ia = any(f.startswith("Dossier IA") for f in pdfs)
    a_bac = any(f.startswith(("Bac", "BREVET")) for f in pdfs)
    a_id = any(f.startswith("Identité") for f in pdfs)
    a_bts = any(f.startswith("BTS") for f in pdfs)
    for nom, present in [("Dossier IA", a_dossier_ia), ("pièce bac", a_bac),
                          ("identité", a_id), ("pièce BTS", a_bts)]:
        if not present:
            erreurs.append(f"pièce manquante : {nom}")

    # 2. intégrité des PDF + pages identité
    for f in pdfs:
        try:
            d = fitz.open(os.path.join(dossier, f))
            n = d.page_count
            if f.startswith("Identité"):
                attendu = 1 if ("passeport" in f or "recto seul" in f) else 2
                if n < attendu:
                    erreurs.append(f"{f}: {n} page(s), attendu >= {attendu}")
                infos.append(f"{f}: {n} p.")
            if n == 0:
                erreurs.append(f"{f}: 0 page")
            d.close()
        except Exception as e:
            erreurs.append(f"{f}: illisible ({e})")

    # 3. relecture des champs du formulaire rempli
    ia = next((f for f in pdfs if f.startswith("Dossier IA")), None)
    if ia:
        d = fitz.open(os.path.join(dossier, ia))
        valeurs = {}
        sexe_coche = None
        cases = {}
        for page in d:
            for w in page.widgets():
                if w.field_type_string == "Text":
                    valeurs[w.field_name] = (w.field_value or "").strip()
                elif w.field_type_string == "RadioButton" and w.field_name == "Masculin":
                    if w.field_value and w.field_value != "Off":
                        sexe_coche = w.field_value
                elif w.field_type_string == "CheckBox":
                    cases[w.field_name] = w.field_value not in (None, "Off", "", False)
        d.close()
        for champ, cle in CHAMPS_CLES.items():
            attendu = fiche[cle]
            obtenu = valeurs.get(champ, "")
            if attendu and obtenu != attendu:
                erreurs.append(f"champ '{champ}': '{obtenu}' != attendu '{attendu}'")
        if sexe_coche != fiche["sexe"]:
            erreurs.append(f"sexe coché '{sexe_coche}' != attendu '{fiche['sexe']}'")
        for case, cle in [("B BTS", "situation_2425_bts"), ("RNB", "piece_rnb"),
                           ("PHOT1", "piece_photo")]:
            if cases.get(case, False) != fiche[cle]:
                erreurs.append(f"case '{case}': {cases.get(case)} != attendu {fiche[cle]}")
        for case in ("01 BTS", "010 BTS", "Apprenti", "Formation apprentissage"):
            if not cases.get(case, False):
                erreurs.append(f"case '{case}' non cochée")

    statut = "OK" if not erreurs else "ERREURS"
    if erreurs:
        ok_global = False
    print(f"== {sid}: {statut} ({len(pdfs)} PDF)")
    for e in erreurs:
        print(f"   !! {e}")
print()
print("VERDICT GLOBAL:", "TOUT OK" if ok_global else "CORRECTIONS NECESSAIRES")
