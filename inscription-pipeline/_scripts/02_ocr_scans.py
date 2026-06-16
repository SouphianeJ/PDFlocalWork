# Étape 2 (optionnelle) : OCR des relevés/diplômes fournis en SCAN-IMAGE
# (sans couche texte), pour récupérer année / établissement / mention que
# 01_extraire_tables.py n'avait pas pu lire.
#
# Tout le traitement OCR est isolé dans le dossier _ocr/ :
#   _ocr/images/<etudiant>__<doc>/pXX.png   pages rendues (300 dpi)
#   _ocr/textes/<etudiant>__<doc>.txt        texte OCR brut
#   _ocr/resultats_ocr.json                  champs ré-extraits depuis l'OCR
#   _ocr/a_verifier_ocr.txt                  ce qui résiste encore à l'OCR
#
# Réutilise les extracteurs de 01_extraire_tables.py (source unique).
import importlib.util, json, os, sys
import fitz
from PIL import Image
import pytesseract
from pytesseract import Output

BASE = os.environ.get("INSCRIPTION_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAITS = os.path.join(BASE, "_extraits")
OCR = os.path.join(BASE, "_ocr")
IMAGES = os.path.join(OCR, "images")
TEXTES = os.path.join(OCR, "textes")
DATA = os.path.join(BASE, "_data")

# Binaire tesseract installé via scoop (PATH de la session pas forcément à jour)
TESSERACT = os.path.join(os.environ["USERPROFILE"], "scoop", "apps", "tesseract",
                         "current", "tesseract.exe")
if os.path.exists(TESSERACT):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT
LANG = "fra+eng"
DPI = 300
SEUIL_TEXTE = 40   # en dessous : on considère le PDF comme un scan-image

# Documents candidats à l'OCR (ceux porteurs d'infos bac / bac+2)
DOCS = {
    "bac": "releve-de-notes-de-bac.",
    "bts": "releve-de-notes-de-bac2",
    "diplome": "dernier-diplome-obtenu-piece-jointe",
}

# --- import des extracteurs de 01_extraire_tables.py (nom non importable tel quel) ---
spec = importlib.util.spec_from_file_location(
    "extr", os.path.join(BASE, "_scripts", "01_extraire_tables.py"))
extr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extr)

def a_du_texte(path):
    try:
        d = fitz.open(path)
        t = "".join(p.get_text() for p in d)
        d.close()
        return len(t.strip()) >= SEUIL_TEXTE
    except Exception:
        return True  # en cas de doute, ne pas OCR

def trouver(docs_dir, prefixe):
    for f in sorted(os.listdir(docs_dir)):
        if f.startswith(prefixe):
            return os.path.join(docs_dir, f)
    return None

def corriger_rotation(img):
    """Redresse l'image via l'analyse d'orientation (osd) si confiance suffisante."""
    try:
        osd = pytesseract.image_to_osd(img, output_type=Output.DICT)
        angle = osd.get("rotate", 0)
        if angle:
            return img.rotate(-angle, expand=True)
    except Exception:
        pass
    return img

def ocr_pdf(path, dst_images):
    """Rend chaque page en PNG, OCR avec redressement, renvoie le texte concaténé."""
    os.makedirs(dst_images, exist_ok=True)
    doc = fitz.open(path)
    morceaux = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(DPI / 72, DPI / 72))
        png = os.path.join(dst_images, f"p{i+1:02d}.png")
        pix.save(png)
        img = corriger_rotation(Image.open(png))
        morceaux.append(pytesseract.image_to_string(img, lang=LANG, config="--psm 3"))
    doc.close()
    return "\n".join(morceaux)

def main():
    os.makedirs(IMAGES, exist_ok=True)
    os.makedirs(TEXTES, exist_ok=True)
    resultats, a_verifier = {}, []
    traite = 0
    for sid in sorted(os.listdir(EXTRAITS)):
        docs_dir = os.path.join(EXTRAITS, sid, "Documents")
        if not os.path.isdir(docs_dir):
            continue
        for kind, prefixe in DOCS.items():
            p = trouver(docs_dir, prefixe)
            if not p or a_du_texte(p):
                continue  # absent ou déjà lisible en texte -> pas d'OCR
            tag = f"{sid}__{kind}"
            print(f"OCR {tag} ...", flush=True)
            txt = ocr_pdf(p, os.path.join(IMAGES, tag))
            open(os.path.join(TEXTES, tag + ".txt"), "w", encoding="utf-8").write(txt)
            traite += 1
            # ré-extraction
            if kind == "bts":
                info, ano = extr.extraire_bts(txt)
            else:
                info, ano = extr.extraire_bac(txt)
            resultats.setdefault(sid, {})[kind] = {
                "champs": info, "anomalies": ano,
                "ocr_chars": len(txt.strip()),
            }
            if info is None or "vérifier" in (info or {}).get("_confiance", ""):
                a_verifier.append(f"{sid} | {kind} : OCR insuffisant "
                                  f"({(info or {}).get('_confiance', ano[:1])})")

    json.dump(resultats, open(os.path.join(OCR, "resultats_ocr.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    with open(os.path.join(OCR, "a_verifier_ocr.txt"), "w", encoding="utf-8") as fh:
        fh.write("Documents OCR encore incomplets (lecture humaine)\n" + "=" * 50 + "\n")
        for l in a_verifier:
            fh.write(f"- {l}\n")

    print(f"\n{traite} document(s) scan-image traité(s) par OCR.")

    # --- Validation : OCR vs tables saisies à la main ---
    ref_path = os.path.join(DATA, "donnees_formulaire.json")
    if os.path.exists(ref_path):
        ref = json.load(open(ref_path, encoding="utf-8"))
        print("\nApport de l'OCR (champ récupéré -> valeur manuelle attendue) :")
        recup_ok = recup_tot = 0
        for sid, parts in resultats.items():
            r = ref.get(sid, {})
            bac = (parts.get("bac") or {}).get("champs") or {}
            for k, refk in [("annee", "bac_annee"), ("code_etab", "bac_code_etab"),
                            ("mention", "bac_mention")]:
                auto = (bac.get(k) or "").strip()
                att = (r.get(refk) or "").strip()
                if att and auto:
                    recup_tot += 1
                    match = "OK" if auto.upper() == att.upper() else f"≠ (manuel='{att}')"
                    if auto.upper() == att.upper():
                        recup_ok += 1
                    print(f"  {sid} bac.{k}: OCR='{auto}' {match}")
        print(f"\nChamps bac récupérés par OCR et corrects : {recup_ok}/{recup_tot}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
