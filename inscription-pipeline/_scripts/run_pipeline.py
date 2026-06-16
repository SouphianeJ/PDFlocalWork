# Orchestrateur du pipeline d'assemblage des dossiers d'inscription.
#
# Enchaîne toute la partie AUTOMATISABLE et s'arrête proprement sur l'étape
# MANUELLE (les tables BAC/BTS de construire_donnees.py) si elle n'est pas
# complète pour tous les étudiants.
#
# Usage :
#   python run_pipeline.py
#
# Aides OPTIONNELLES à la saisie des tables (à lancer AVANT, hors orchestrateur,
# car leur sortie doit être relue avant de devenir les tables) :
#   01_extraire_tables.py  pré-remplit BAC/BTS depuis la couche texte des relevés
#   02_ocr_scans.py        OCR (Tesseract) des relevés fournis en scan-image
#
# Flux :
#   00_extraire.py        [auto]   zips -> _extraits/
#   parse_syntheses.py    [auto]   Synthèses -> _data/etudiants.json
#   construire_donnees.py [MANUEL] tables BAC/BTS/CSP -> _data/donnees_formulaire.json
#                                  (gate : s'arrête si un étudiant manque dans les tables)
#   remplir_dossier_ia.py [auto]   formulaires AcroForm remplis
#   assembler_dossiers.py [auto]   identité fusionnée, dédup BTS, assemblage _final/
#   verifier_dossiers.py  [auto]   contrôle final
import os, subprocess, sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))

ETAPES = [
    ("Extraction des zips",            "00_extraire.py",        "auto"),
    ("Lecture des Synthèses",          "parse_syntheses.py",    "auto"),
    ("Construction des données",       "construire_donnees.py", "MANUEL (tables)"),
    ("Remplissage des formulaires",    "remplir_dossier_ia.py", "auto"),
    ("Assemblage des dossiers",        "assembler_dossiers.py", "auto"),
    ("Vérification finale",            "verifier_dossiers.py",  "auto"),
]

def run(script):
    return subprocess.run([sys.executable, "-X", "utf8", os.path.join(SCRIPTS, script)]).returncode

def main():
    for i, (titre, script, nature) in enumerate(ETAPES, 1):
        print(f"\n{'='*64}\n[{i}/{len(ETAPES)}] {titre}  ({nature})\n{'='*64}")
        code = run(script)
        if script == "construire_donnees.py" and code == 2:
            # Gate manuel : des étudiants manquent dans les tables.
            print(f"\n{'#'*64}")
            print("# Pipeline arrêté à l'étape MANUELLE (voir liste ci-dessus).")
            print("# Les étapes aval (remplissage, assemblage, vérification)")
            print("# ne seront exécutées qu'une fois les tables complétées.")
            print(f"{'#'*64}")
            return 2
        if code != 0:
            print(f"\nÉchec à l'étape « {titre} » (code {code}). Arrêt.")
            return code
    print(f"\n{'='*64}\nPipeline terminé : tous les dossiers sont dans _final/.\n{'='*64}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
