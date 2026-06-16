# _ocr/ — traitement OCR des relevés en scan-image

Dossier dédié à la récupération, par OCR, des informations (année, établissement,
mention) sur les relevés/diplômes fournis **sans couche texte** (photos, scans).
Alimenté par `_scripts/02_ocr_scans.py`.

## Prérequis (déjà installés)
- **Tesseract 5.5** via scoop : `~/scoop/apps/tesseract/current/tesseract.exe`
- Langues `fra`, `eng`, `osd` dans `~/scoop/persist/tesseract/tessdata/`
  (réinstallables : `Invoke-WebRequest …/tessdata_fast/raw/main/<lang>.traineddata`)
- Python : `pytesseract` + `Pillow` (+ `PyMuPDF` pour le rendu PDF→image)

## Contenu
- `images/<etudiant>__<doc>/pXX.png` — pages rendues à 300 dpi (intermédiaire,
  supprimables après coup)
- `textes/<etudiant>__<doc>.txt` — texte OCR brut (lisible à l'œil si l'extraction
  automatique a échoué)
- `resultats_ocr.json` — champs ré-extraits depuis l'OCR (mêmes extracteurs que
  `01_extraire_tables.py`)
- `a_verifier_ocr.txt` — documents dont l'OCR ne suffit pas (à lire à la main)

## Ce que l'OCR récupère / ne récupère pas
- **Récupéré de façon fiable** : année, **code établissement** et mention quand le
  document est un **vrai relevé** scanné (validé 10/10 contre la saisie manuelle,
  dont les codes établissement de Lorenzo, Rocchi, Rollet).
- **Hors de portée de l'OCR** : l'établissement sur un **diplôme** ou une
  **attestation** (l'info n'y figure pas), et certains libellés de série quand la
  mise en page diffère d'un relevé officiel (capture d'écran Cyclades). Le texte OCR
  reste écrit dans `textes/` pour une lecture humaine rapide.

## Relancer
```
python _scripts/02_ocr_scans.py
```
Idempotent : ré-OCR tous les documents scan-image détectés et réécrit les sorties.
