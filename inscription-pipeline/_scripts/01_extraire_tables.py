# Étape 1bis (optionnelle) : pré-remplit les tables BAC/BTS automatiquement
# depuis la couche texte des relevés, et liste ce qui doit rester en lecture
# humaine (scans-image, anomalies, faible confiance).
#
# Sorties :
#   _data/tables_auto.json  -> champs extraits automatiquement (à recopier/valider
#                              dans construire_donnees.py)
#   _data/a_verifier.txt    -> dossiers nécessitant une lecture/décision humaine
#
# À la fin : compare l'extraction auto avec les tables saisies à la main
# (donnees_formulaire.json) pour mesurer le taux d'accord.
import fitz, json, os, re, unicodedata

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAITS = os.path.join(BASE, "_extraits")
DATA = os.path.join(BASE, "_data")

def texte(path):
    try:
        d = fitz.open(path)
        t = "\n".join(p.get_text() for p in d)
        d.close()
        return t
    except Exception:
        return ""

def trouver(docs, prefixe):
    for f in sorted(os.listdir(docs)):
        if f.startswith(prefixe):
            return os.path.join(docs, f)
    return None

def code_to_dep(code):
    return str(int(code[0:3])) if code and code[0:3].isdigit() else ""

def etablissement(txt):
    """Renvoie (code, nom) du premier établissement RNE trouvé."""
    m = re.search(r"(\d{7}[A-Z])\s+([A-ZÉÈÀ][^\n(]{3,70})", txt)
    if not m:
        return "", ""
    nom = re.sub(r"\s*\(\d{7}[A-Z]\)\s*$", "", m.group(2)).strip()
    nom = re.sub(r"\s{2,}", " ", nom)
    return m.group(1), nom

SPEC_BTS = {
    "management commercial opérationnel": "MCO",
    "négociation et digitalisation de la relation client": "NDRC",
    "communication": "COMMUNICATION",
    "gestion de la pme": "GESTION DE LA PME",
}

def mention_explicite(txt):
    m = re.search(r"Admis\s+Mention\s+(Très Bien|Bien|Assez Bien)", txt, re.I)
    return m.group(1).upper() if m else None

def mention_depuis_moyenne(txt):
    m = re.search(r"MOYENNE FINALE\s*\n\s*([\d.,]+)", txt)
    if not m:
        return None, None
    moy = float(m.group(1).replace(",", "."))
    if moy >= 16: men = "TRÈS BIEN"
    elif moy >= 14: men = "BIEN"
    elif moy >= 12: men = "ASSEZ BIEN"
    else: men = "SANS"
    return men, moy

def extraire_bac(txt):
    info, anomalies = {"_source": "texte"}, []
    low = txt.lower()
    # mauvais documents
    if "diplôme national du brevet" in low or "diplome national du brevet" in low:
        return None, ["Document = BREVET (DNB), PAS le relevé du bac."]
    if "provisoires" in low and ("anticipée" in low or "année scolaire" in low):
        return None, ["Relevé d'épreuves ANTICIPÉES de 1ère, pas le relevé final du bac."]
    attestation = "attestation de réussite" in low
    # type + série
    if re.search(r"baccalauréat général", low):
        info["intitule"] = "GENERAL"
    elif re.search(r"baccalauréat technologique", low):
        info["intitule"] = "TECHNOLOGIQUE"
        if "stmg" in low or "sciences et technologies du management" in low:
            info["intitule"] = "TECHNOLOGIQUE STMG"
    elif re.search(r"baccalauréat professionnel", low):
        info["intitule"] = "PRO"
        if "assistance à la gestion" in low:
            info["intitule"] = "PRO AGORA"
    # année
    m = re.search(r"session\s*:?\s*(\d{4})", low)
    if m:
        info["annee"] = m.group(1)
    # mention
    men = mention_explicite(txt)
    moy = None
    if not men:
        men, moy = mention_depuis_moyenne(txt)
    info["mention"] = men or ""
    if moy is not None:
        info["_moyenne"] = moy
    # établissement
    if not attestation:
        code, nom = etablissement(txt)
        info["code_etab"], info["etab"], info["dep"] = code, nom, code_to_dep(code)
    else:
        info["code_etab"] = info["etab"] = info["dep"] = ""
        anomalies.append("Attestation de réussite (pas de relevé) : établissement du bac inconnu.")
    # confiance
    manque = [k for k in ("annee", "intitule") if not info.get(k)]
    if not info.get("etab") and not attestation:
        manque.append("etab")
    if not info.get("mention"):
        manque.append("mention")
    info["_confiance"] = "haute" if not manque else "à vérifier (" + ",".join(manque) + ")"
    return info, anomalies

def extraire_bts(txt):
    info, anomalies = {"_source": "texte"}, []
    low = txt.lower()
    est_releve = "brevet de technicien supérieur" in low or "relevé de notes" in low
    if not est_releve and ("bulletin" in low or "semestre" in low):
        return None, ["Fichier = bulletin de lycée, PAS le relevé d'examen BTS."]
    m = re.search(r"session\s*:?\s*(\d{4})", low)
    info["session"] = m.group(1) if m else ""
    ms = re.search(r"spécialité\s+(.+)", txt, re.I)
    spec_brute = ms.group(1).strip() if ms else ""
    info["specialite"] = SPEC_BTS.get(spec_brute.lower(), spec_brute)
    code, nom = etablissement(txt)
    info["code_etab"], info["etab"], info["dep"] = code, nom, code_to_dep(code)
    manque = [k for k in ("session", "specialite", "etab") if not info.get(k)]
    info["_confiance"] = "haute" if not manque else "à vérifier (" + ",".join(manque) + ")"
    return info, anomalies

def main():
    resultat, a_verifier = {}, []
    for sid in sorted(os.listdir(EXTRAITS)):
        docs = os.path.join(EXTRAITS, sid, "Documents")
        if not os.path.isdir(docs):
            continue
        fiche = {"anomalies": []}
        # BAC
        p = trouver(docs, "releve-de-notes-de-bac.")
        t = texte(p) if p else ""
        if not t.strip():
            fiche["bac"] = {"_source": "scan-image", "_confiance": "OCR/vision requis"}
            a_verifier.append(f"{sid} | BAC : scan-image sans texte -> lecture manuelle requise")
        else:
            bac, ano = extraire_bac(t)
            if bac is None:
                fiche["bac"] = {"_source": "anomalie", "_confiance": "lecture manuelle"}
                a_verifier.append(f"{sid} | BAC : {ano[0]}")
            else:
                fiche["bac"] = bac
                if "vérifier" in bac["_confiance"]:
                    a_verifier.append(f"{sid} | BAC : confiance {bac['_confiance']}")
            fiche["anomalies"] += ano
        # BTS
        p = trouver(docs, "releve-de-notes-de-bac2")
        t = texte(p) if p else ""
        if not t.strip():
            fiche["bts"] = {"_source": "scan-image", "_confiance": "OCR/vision requis"}
            a_verifier.append(f"{sid} | BTS : scan-image sans texte -> lecture manuelle requise")
        else:
            bts, ano = extraire_bts(t)
            if bts is None:
                fiche["bts"] = {"_source": "anomalie", "_confiance": "lecture manuelle"}
                a_verifier.append(f"{sid} | BTS : {ano[0]}")
            else:
                fiche["bts"] = bts
                if "vérifier" in bts["_confiance"]:
                    a_verifier.append(f"{sid} | BTS : confiance {bts['_confiance']}")
            fiche["anomalies"] += ano
        resultat[sid] = fiche

    json.dump(resultat, open(os.path.join(DATA, "tables_auto.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "a_verifier.txt"), "w", encoding="utf-8") as fh:
        fh.write("Dossiers nécessitant une lecture / décision humaine\n" + "=" * 55 + "\n")
        for ligne in a_verifier:
            fh.write(f"- {ligne}\n")

    n = len(resultat)
    bac_auto = sum(1 for f in resultat.values() if f["bac"].get("_confiance") == "haute")
    bts_auto = sum(1 for f in resultat.values() if f["bts"].get("_confiance") == "haute")
    print(f"{n} étudiants traités.")
    print(f"  BAC : {bac_auto}/{n} extraits avec confiance haute")
    print(f"  BTS : {bts_auto}/{n} extraits avec confiance haute")
    print(f"  {len(a_verifier)} point(s) à vérifier -> _data/a_verifier.txt")

    # --- Validation : accord avec les tables saisies à la main ---
    ref_path = os.path.join(DATA, "donnees_formulaire.json")
    if os.path.exists(ref_path):
        ref = json.load(open(ref_path, encoding="utf-8"))
        champs = [("bac", "annee", "bac_annee"), ("bac", "code_etab", "bac_code_etab"),
                  ("bac", "mention", "bac_mention"), ("bts", "code_etab", None)]
        ok = tot = 0
        divergences = []
        for sid, f in resultat.items():
            r = ref.get(sid, {})
            for sect, k, refk in champs:
                auto = (f[sect].get(k) or "").strip()
                if refk:
                    att = (r.get(refk) or "").strip()
                else:
                    continue  # bts code non stocké dans la ref, ignoré
                if not auto and not att:
                    continue
                tot += 1
                if auto.upper() == att.upper():
                    ok += 1
                else:
                    divergences.append(f"{sid} {sect}.{k}: auto='{auto}' vs manuel='{att}'")
        print(f"\nAccord auto vs manuel (année/code bac, mention) : {ok}/{tot}")
        for d in divergences:
            print("  ≠", d)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
