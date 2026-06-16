# Remplit le formulaire d'Inscription Administrative CY (AcroForm) pour chaque
# étudiant à partir de _data/donnees_formulaire.json.
# Sortie : _final/<etudiant>/Dossier IA - <NOM> <Prénom>.pdf
import fitz, json, os

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(BASE, "Dossier IA 2025-2026 ILEPS LC3 GRENOBLE.pdf")
FINAL = os.path.join(BASE, "_final")
DATA = json.load(open(os.path.join(BASE, "_data", "donnees_formulaire.json"), encoding="utf-8"))

def champs_texte(f):
    """champ AcroForm -> valeur ; champs non listés = laissés tels quels."""
    return {
        "NINES ou BEA se trouve sur le relevé de notes du BAC": f["ine"],
        "Nationalité": f["nationalite"],
        "Nom de naissance": f["nom"],
        "Nom dusage ou marital": f["nom_usage"],
        "Prénom": f["prenom"],
        "Prénoms": f["autres_prenoms"],
        "Date de naissance": f["naissance_jj"],
        "Date de naissanceM": f["naissance_mm"],
        "Date de naissanceY": f["naissance_aaaa"],
        "Pays de naissance": f["pays_naissance"],
        "Code postal": f["cp_naissance"],
        "Ville de naissance": f["ville_naissance"],
        "Adresse": f["adresse"],
        "Code postal_2": f["cp"],
        "Ville": f["ville"],
        "num_telephone": f["tel"],
        "Adresse courriel obligatoire": f["email"],
        "Année de 1ère inscription en Enseignement Supérieur Français": f["annee_1ere_esf"],
        "Année de 1ère inscription à CY CERGY PARIS UNIVERSITÉ": f["annee_1ere_cy"],
        "Année dobtention": f["bac_annee"],
        "Intitulé": f["bac_intitule"],
        "Mention": f["bac_mention"],
        "Nom de létablissement dans lequel sest déroulée la scolarité": f["bac_etab"],
        "Code établissement  voir relevé de notes du bac": f["bac_code_etab"],
        "N dép": f["bac_dep"],
        "Pays": f["bac_pays"],
        # page 2
        "Année dinscription du dernier établissement fréquenté  20": f["dernier_etab_debut"],
        "20": f["dernier_etab_fin"],
        "Nom de létablissement": f["dernier_etab_nom"],
        "Dép_2": f["dernier_etab_dep"],
        "Pays_2": f["dernier_etab_pays"],
        "Année dobtention du dernier diplôme obtenu  20": f["dernier_diplome_debut"],
        "20_2": f["dernier_diplome_fin"],
        "Catégorie du père": f["csp_pere"],
        "Catégorie de la mère": f["csp_mere"],
        "Je soussigné e": f"{f['nom']} {f['prenom']}" if f["droit_image"] else "",
    }

def cases(f):
    """case à cocher -> état souhaité (les autres cases ne sont pas modifiées)"""
    return {
        "SCID": f["piece_scid"],
        "PHOT1": f["piece_photo"],
        "DIPFM": f["piece_dipfm"],
        "RNB": f["piece_rnb"],
        "B BTS": f["situation_2425_bts"],
        "01 BTS": True,    # type du dernier établissement fréquenté : BTS
        "010 BTS": True,   # dernier diplôme obtenu : BTS
    }

def remplir(sid, f):
    doc = fitz.open(TEMPLATE)
    textes, coches = champs_texte(f), cases(f)
    remplis, coches_ok = 0, 0
    for page in doc:
        for w in page.widgets():
            nom = w.field_name
            if w.field_type_string == "Text" and nom in textes:
                if textes[nom]:
                    w.field_value = textes[nom]
                    w.update()
                    remplis += 1
            elif w.field_type_string == "CheckBox" and nom in coches:
                if coches[nom]:
                    w.field_value = True
                    w.update()
                    coches_ok += 1
            elif w.field_type_string == "RadioButton" and nom == "Masculin":
                etats = [s for s in w.button_states().get("normal", []) if s != "Off"]
                if f["sexe"] in etats:
                    w.field_value = f["sexe"]
                    w.update()
                    coches_ok += 1
    dossier = os.path.join(FINAL, sid)
    os.makedirs(dossier, exist_ok=True)
    out = os.path.join(dossier, f"Dossier IA - {f['nom']} {f['prenom']}.pdf")
    doc.save(out, deflate=True)
    doc.close()
    return out, remplis, coches_ok

for sid, f in DATA.items():
    out, n, c = remplir(sid, f)
    print(f"{sid}: {n} champs texte, {c} cases/radio -> {os.path.basename(out)}")
print("Terminé.")
