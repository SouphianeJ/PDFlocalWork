# Construit _data/donnees_formulaire.json : une fiche par étudiant prête à
# injecter dans le formulaire d'Inscription Administrative CY.
# Sources : _data/etudiants.json (Synthèses) + table BAC/BTS établie par lecture
# des relevés/diplômes (texte extrait ou lecture visuelle des scans).
import json, os, re, unicodedata

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ETUD = json.load(open(os.path.join(BASE, "_data", "etudiants.json"), encoding="utf-8"))

MOIS = {"janv.": "01", "févr.": "02", "mars": "03", "avr.": "04", "mai": "05",
        "juin": "06", "juil.": "07", "août": "08", "sept.": "09", "oct.": "10",
        "nov.": "11", "déc.": "12"}

CP_NAISSANCE = {  # commune de naissance (normalisée) -> code postal
    "grenoble": "38000", "saint martin d'hères": "38400", "saint martin d'heres": "38400",
    "saint-martin-d'hères": "38400", "st martin d'hères": "38400", "st martin d'heres": "38400",
    "la tronche": "38700", "aix-les-bains": "73100",
    "deauville": "14800", "rouen": "76000", "annonay": "07100",
}
DEP_NAISSANCE = {"Isère": "38", "Savoie": "73", "Calvados": "14", "Seine-Maritime": "76", "Ardèche": "07"}

# Table BAC : (année, intitulé, mention, établissement, code étab, dép)
# mention "" = inconnue (laisser vide) ; "SANS" = vérifié sans mention.
BAC = {
 "CLAP-Pauline":      ("2023", "TECHNOLOGIQUE STMG", "SANS", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "Cellauro-Calista":  ("2023", "TECHNOLOGIQUE STMG", "SANS", "", "", ""),
 "Chaix-Antoine":     ("2023", "GENERAL", "SANS", "LPO PABLO NERUDA - ST MARTIN D'HERES", "0382203N", "38"),
 "Coquet-Simon":      ("", "", "", "", "", ""),  # relevé bac ABSENT (DNB fourni)
 "Donini-Tania":      ("2023", "TECHNOLOGIQUE STMG", "ASSEZ BIEN", "", "", ""),
 "Gaujard-Samuel":    ("2023", "TECHNOLOGIQUE STMG", "SANS", "LGT MARIE REYNOARD - VILLARD BONNOT", "0383263R", "38"),
 "Lorenzo-Margaux":   ("2022", "PRO METIERS DU COMMERCE ET DE LA VENTE", "ASSEZ BIEN", "LPP LES CHARMILLES - GRENOBLE", "0381758E", "38"),
 "Mirabel-Martin":    ("2021", "PRO VENTE", "SANS", "", "", ""),
 "RADOUANT-NATHAN":   ("2023", "GENERAL", "", "LPO ANDRE ARGOUGES - GRENOBLE", "0381603L", "38"),
 "RIZZO-Lisa":        ("2023", "TECHNOLOGIQUE STMG", "SANS", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "Raga-Yann":         ("2023", "PRO AGORA", "ASSEZ BIEN", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "Rocchi-Lily":       ("2023", "GENERAL", "ASSEZ BIEN", "LPO LA SAULAIE - ST MARCELLIN", "0380063M", "38"),
 "Rollet-Antoine":    ("2023", "GENERAL", "SANS", "LGT ARISTIDE BERGES - SEYSSINET-PARISET", "0382780R", "38"),
 "salomon-clara":     ("2022", "TECHNOLOGIQUE STMG", "ASSEZ BIEN", "", "", ""),
 "Sarrazin-Faustine": ("2023", "TECHNOLOGIQUE STMG", "SANS", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 # --- vague 2 ---
 "Abecassis-Moliner-William": ("2023", "TECHNOLOGIQUE STMG", "SANS", "", "", ""),
 "Bensard-Lola":       ("2023", "TECHNOLOGIQUE STMG", "", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "Branco-Axel":        ("2023", "TECHNOLOGIQUE STMG", "SANS", "LPO DU GRESIVAUDAN - MEYLAN", "0382863F", "38"),
 "Colombo-Robin":      ("2022", "TECHNOLOGIQUE STMG", "SANS", "", "", ""),
 "Dansard-Arthur":     ("2023", "GENERAL", "", "LPO LA SAULAIE - ST MARCELLIN", "0380063M", "38"),
 "Daumas-Mathys":      ("2023", "TECHNOLOGIQUE STMG", "SANS", "LPO DU GRESIVAUDAN - MEYLAN", "0382863F", "38"),
 "Delapree-Jean":      ("2023", "TECHNOLOGIQUE STMG", "SANS", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "JACQUEMARD-Noah":    ("2023", "TECHNOLOGIQUE STMG", "SANS", "LPO DU GRESIVAUDAN - MEYLAN", "0382863F", "38"),
 "Nesta-Paolo":        ("2023", "TECHNOLOGIQUE STMG", "SANS", "", "", ""),
 "SCOLARI-Noemie":     ("2023", "GENERAL", "SANS", "LGT PR PHILIPPINE DUCHESNE - CORENC", "0383208F", "38"),
 "Sagot-Camille":      ("2022", "GENERAL", "SANS", "LPO PORTES DE L'OISANS - VIZILLE", "0380089R", "38"),
 "TUPIN-ELINA":        ("2023", "PRO AGORA", "BIEN", "", "", ""),
 "lloret-marti-clara": ("2023", "TECHNOLOGIQUE STMG", "ASSEZ BIEN", "", "", ""),
 "veaux-Marion":       ("2023", "GENERAL", "ASSEZ BIEN", "", "", ""),
}

# Table BTS : (session, spécialité, établissement, code, dép)
BTS = {
 "CLAP-Pauline":      ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Cellauro-Calista":  ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Chaix-Antoine":     ("2025", "COMMUNICATION", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Coquet-Simon":      ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Donini-Tania":      ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Gaujard-Samuel":    ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Lorenzo-Margaux":   ("2024", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Mirabel-Martin":    ("2025", "NDRC", "", ""),
 "RADOUANT-NATHAN":   ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "RIZZO-Lisa":        ("2025", "COMMUNICATION", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Raga-Yann":         ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Rocchi-Lily":       ("2025", "COMMUNICATION", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Rollet-Antoine":    ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "salomon-clara":     ("2024", "NDRC", "", ""),
 "Sarrazin-Faustine": ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 # --- vague 2 ---
 "Abecassis-Moliner-William": ("2025", "MCO", "", ""),
 "Bensard-Lola":       ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Branco-Axel":        ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Colombo-Robin":      ("2024", "GESTION DE LA PME", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Dansard-Arthur":     ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Daumas-Mathys":      ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Delapree-Jean":      ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "JACQUEMARD-Noah":    ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Nesta-Paolo":        ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "SCOLARI-Noemie":     ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "Sagot-Camille":      ("2025", "COMMUNICATION", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "TUPIN-ELINA":        ("2025", "NDRC", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "lloret-marti-clara": ("2025", "MCO", "LGT PR PHILIPPINE DUCHESNE - CORENC", "38"),
 "veaux-Marion":       ("2025", "COMMUNICATION", "LYCEE ARISTIDE BERGES - SEYSSINET-PARISET", "38"),
}

# CSP parents quand connue via Synthèse (sinon 99 = non renseigné)
CSP = {
 "Raga-Yann": {"mere": "52"},        # employés civils et agents de service FP
 "Sarrazin-Faustine": {"pere": "38"},# ingénieurs et cadres techniques d'entreprise
 # Rocchi : "Professions intermédiaires" trop générique -> laissé vide, anomalie
 "Rocchi-Lily": {"mere": ""},
 # vague 2 : "Employés" trop générique (52/54/55 possibles) -> vide, anomalie
 "SCOLARI-Noemie": {"pere": ""},
 "veaux-Marion": {"pere": ""},
}

ANOMALIES = {
 "Coquet-Simon": ["Relevé de notes du BAC ABSENT : le fichier fourni est une attestation du BREVET (DNB 2020). Bloc Baccalauréat laissé vide dans le formulaire.",
                   "Date de naissance corrompue dans la Synthèse ('22 févr. 5') corrigée en 22/02/2005 (cohérente avec n° sécu et DNB)."],
 "RADOUANT-NATHAN": ["Relevé bac fourni = relevé des épreuves ANTICIPÉES de 1ère (2021-2022) uniquement, pas le relevé final session 2023. Mention inconnue."],
 "Cellauro-Calista": ["Pas de numéro CVEC dans la Synthèse.", "Pas de photo d'identité fournie.", "Attestation de réussite bac (pas de relevé) : établissement du bac inconnu."],
 "Donini-Tania": ["Attestation de réussite bac (pas de relevé) : établissement du bac inconnu."],
 "Mirabel-Martin": ["Diplômes (bac pro 2021, BTS 2025) fournis sans relevés : établissements inconnus.",
                     "La pièce jointe CVEC est en réalité le diplôme BTS (mauvais upload), mais un n° CVEC est renseigné."],
 "salomon-clara": ["Diplôme bac (académie Aix-Marseille) sans relevé : établissement du bac inconnu.",
                    "BTS session 2024 : situation 2024/2025 inconnue, encadré non coché."],
 "Lorenzo-Margaux": ["BTS session 2024 : situation 2024/2025 inconnue, encadré non coché."],
 "Rocchi-Lily": ["CSP mère 'Professions intermédiaires' trop générique pour un code précis : champ laissé vide."],
 # --- vague 2 ---
 "Abecassis-Moliner-William": ["Diplômes (bac techno 2023, BTS MCO 2025) fournis sans relevés : établissements inconnus."],
 "Bensard-Lola": ["Relevé bac fourni = relevé des épreuves ANTICIPÉES de 1ère uniquement, pas le relevé final session 2023. Mention inconnue.",
                   "Pas de numéro CVEC dans la Synthèse.",
                   "Pas de fichier 'dernier diplôme obtenu' (le relevé BTS NDRC 2025 fait foi)."],
 "Colombo-Robin": ["BTS Gestion de la PME session 2024 : situation 2024/2025 inconnue, encadré non coché.",
                    "Diplôme bac 2022 sans relevé : établissement du bac inconnu."],
 "Dansard-Arthur": ["Relevé bac fourni = relevé des épreuves ANTICIPÉES de 1ère uniquement, pas le relevé final session 2023. Mention inconnue."],
 "Daumas-Mathys": ["Verso de la CNI MANQUANT (recto seul fourni)."],
 "Nesta-Paolo": ["Attestation de réussite bac (pas de relevé) : établissement du bac inconnu."],
 "SCOLARI-Noemie": ["CSP père 'Employés' trop générique pour un code précis : champ laissé vide."],
 "TUPIN-ELINA": ["Attestation de réussite bac pro (pas de relevé) : établissement du bac inconnu."],
 "lloret-marti-clara": ["Relevé bac = capture d'écran Cyclades (pas le document officiel) : établissement du bac inconnu."],
 "veaux-Marion": ["Le fichier 'relevé BTS' est un bulletin semestriel de lycée (mauvais upload) ; le diplôme BTS Communication 2025 fait foi.",
                   "Diplôme bac sans relevé : établissement du bac inconnu.",
                   "CSP père 'Employés' trop générique : champ laissé vide."],
}

def date_fr(s):
    m = re.match(r"(\d{1,2})\s+(\S+)\s+(\d{4})", s)
    if not m:
        return None
    return m.group(1).zfill(2), MOIS.get(m.group(2), "??"), m.group(3)

def premiere_ligne(s):
    return s.split("\n")[0].strip()

def parse_adresse(s):
    lignes = [l.strip() for l in s.split("\n")]
    rue, cp, ville = [], "", ""
    for l in lignes:
        m = re.match(r"(\d{2}\s?\d{3}),\s*(.+)", l)
        if m:
            cp, ville = m.group(1).replace(" ", ""), m.group(2).strip()
            break
        rue.append(l)
    return ", ".join(rue), cp, ville

# --- Frontière auto / manuel ---
# Les tables BAC/BTS ci-dessus sont la part "humaine" du pipeline (lecture des
# relevés/diplômes). Si un étudiant parsé n'y figure pas, on s'arrête proprement
# au lieu de planter, pour signaler ce qu'il reste à compléter à la main.
_manquants = sorted(s for s in ETUD if s not in BAC or s not in BTS)
if _manquants:
    print("STOP : étudiants absents des tables BAC/BTS de construire_donnees.py :")
    for s in _manquants:
        print(f"  - {s}")
    print("\nComplétez les tables BAC et BTS (après lecture de leurs relevés/")
    print("diplômes), puis relancez le pipeline.")
    raise SystemExit(2)

out = {}
for sid, d in ETUD.items():
    sexe = "F" if premiere_ligne(d["Civilité"]).startswith("Mme") else "M"
    nom = premiere_ligne(d["Nom de famille"]).upper()
    prenom = premiere_ligne(d["Prénom"]).upper()
    nom_usage = premiere_ligne(d.get("Nom d’usage", "-"))
    nom_usage = "" if nom_usage == "-" else nom_usage.upper()
    autres = premiere_ligne(d.get("Autres prénoms", "-"))
    autres = "" if autres == "-" else autres.upper()
    dn = date_fr(premiere_ligne(d["Date de naissance"]))
    if sid == "Coquet-Simon":
        dn = ("22", "02", "2005")  # corrigé (Synthèse corrompue)
    commune = premiere_ligne(d["Commune de naissance"])
    cp_n = CP_NAISSANCE.get(commune.lower().replace("’", "'").strip(), "")
    rue, cp, ville = parse_adresse(d["Adresse"])
    bac = BAC[sid]; bts = BTS[sid]
    annee_esf = str(int(bts[0]) - 2) if bts[0] else ""
    fin = bts[0]; debut = str(int(fin) - 1) if fin else ""
    docs = os.listdir(os.path.join(BASE, "_extraits", sid, "Documents"))
    a_photo = any(f.startswith("photo-d-identite") for f in docs)
    csp = {"pere": "99", "mere": "99"}; csp.update(CSP.get(sid, {}))
    out[sid] = {
        "sexe": sexe, "nom": nom, "nom_usage": nom_usage, "prenom": prenom,
        "autres_prenoms": autres, "naissance_jj": dn[0], "naissance_mm": dn[1],
        "naissance_aaaa": dn[2], "pays_naissance": "FRANCE",
        "cp_naissance": cp_n, "ville_naissance": commune.upper(),
        "nationalite": "FRANCAISE",
        "adresse": rue.upper(), "cp": cp, "ville": ville.upper(),
        "tel": premiere_ligne(d["Numéro de téléphone"]),
        "email": premiere_ligne(d["E-mail"]),
        "ine": d["INE"].replace(" ", ""),
        "annee_1ere_esf": annee_esf, "annee_1ere_cy": "2025",
        "bac_annee": bac[0], "bac_intitule": bac[1], "bac_mention": bac[2],
        "bac_etab": bac[3], "bac_code_etab": bac[4], "bac_dep": bac[5],
        "bac_pays": "FRANCE" if bac[0] else "",
        "dernier_etab_debut": debut[-2:] if debut else "",
        "dernier_etab_fin": fin[-2:] if fin else "",
        "dernier_etab_nom": bts[2], "dernier_etab_dep": bts[3],
        "dernier_etab_pays": "FRANCE" if bts[2] else "",
        "dernier_diplome_debut": debut[-2:] if debut else "",
        "dernier_diplome_fin": fin[-2:] if fin else "",
        "situation_2425_bts": bts[0] == "2025",
        "csp_pere": csp["pere"], "csp_mere": csp["mere"],
        "droit_image": premiere_ligne(d.get("Droit à l’image", "-")) == "Oui",
        "piece_scid": True, "piece_photo": a_photo, "piece_dipfm": True,
        "piece_rnb": sid != "Coquet-Simon",
        "anomalies": ANOMALIES.get(sid, []),
    }

dest = os.path.join(BASE, "_data", "donnees_formulaire.json")
json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(out)} fiches -> {dest}")
for sid, f in out.items():
    print(f"  {sid}: {f['sexe']} {f['prenom']} {f['nom']} né(e) {f['naissance_jj']}/{f['naissance_mm']}/{f['naissance_aaaa']} "
          f"INE {f['ine']} | bac {f['bac_annee'] or '???'} {f['bac_mention'] or 'mention?'} | BTS {f['dernier_etab_fin']} | anomalies: {len(f['anomalies'])}")
