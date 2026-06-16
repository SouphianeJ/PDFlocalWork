# Spec — intégrer le pipeline « dossiers d'inscription » à PDFlocalWork

Réflexion de faisabilité pour transformer la brique Python (`inscription-pipeline/`)
en **fonctionnalité opérationnelle de l'app Next.js PDFlocalWork**, avec une UI.

---

## 1. Objectif

Aujourd'hui : 8 scripts Python (PyMuPDF / pytesseract) lancés en CLI, avec une
étape manuelle (les tables BAC/BTS). On veut une **page dédiée** dans PDFlocalWork
qui guide l'utilisateur : *choisir un dossier d'exports → l'app extrait, lit,
pré-remplit → l'utilisateur valide/corrige une grille → l'app génère les dossiers
finaux → contrôle*.

Contrainte forte : **données personnelles** (état civil, INE, scans d'identité).
Le modèle « tout en local, rien n'est uploadé » de PDFlocalWork est exactement le
bon cadre — c'est un argument fort pour intégrer ici plutôt qu'ailleurs.

---

## 2. État des lieux : pipeline Python ↔ stack PDFlocalWork

| Brique du pipeline | Fait en Python par | Équivalent dans PDFlocalWork |
|---|---|---|
| Dézipper les exports | `zipfile` | `archiver` (zip) + à ajouter : unzip (`unzipper`/`yauzl`) |
| Lire le texte des `Synthèse.pdf` / relevés | PyMuPDF `get_text()` | **rien** — pdf-lib n'extrait pas le texte |
| Remplir le formulaire AcroForm | PyMuPDF widgets | **pdf-lib** `form.getTextField().setText()` ✓ |
| Fusionner identité recto/verso, images→PDF | PyMuPDF + convert | **`lib/server/pdf-utils.ts`** (`mergePdfFiles`, `addImageToPdf` via `sharp`) ✓ |
| Dédup BTS (hash) / nommage anti-collision | `hashlib` | `findAvailablePdfName` existe déjà ✓ |
| OCR des relevés scannés | Tesseract (natif) | **rien** — à ajouter (tesseract.js ou sidecar) |
| Rendre une page PDF en image (pour l'OCR) | PyMuPDF `get_pixmap` | **rien** — pdf-lib ne rasterise pas |
| Sécurité accès disque local | (CLI, hors web) | **`lib/server/security.ts`** `requireLocalRequest` ✓ |

**Lecture clé :** ~70 % des briques ont déjà un équivalent natif dans l'app
(remplissage AcroForm, fusion, images, zip, sécurité, fs). Les **deux vrais
manques** sont (a) l'**extraction de texte PDF** et (b) l'**OCR + rasterisation**.

---

## 3. Faisabilité par brique

**Facile à porter en TypeScript (s'appuie sur l'existant) :**
- Remplissage du « Dossier IA » : pdf-lib lit les AcroForm ; la cartographie des
  champs est déjà documentée dans [`reference/champs_formulaire.txt`](./reference/champs_formulaire.txt)
  (97 champs : noms, types, cases radio Sexe, cases à cocher pièces).
- Assemblage des dossiers, fusion identité, dédup, nommage : réutilise
  `lib/server/pdf-utils.ts` quasi tel quel.
- Vérification finale : relecture des champs AcroForm via pdf-lib.

**Nouveau mais maîtrisé :**
- **Extraction de texte** (parsing des Synthèses + relevés à couche texte) :
  ajouter `pdfjs-dist` (ou `unpdf`). Le parsing lui-même est de la regex/sépa-ligne
  — directement transposable depuis `parse_syntheses.py` / `01_extraire_tables.py`.
- Dézippage : `yauzl`/`unzipper`.

**Point dur — l'OCR :**
- Il faut **rasteriser** chaque page (pdf-lib ne sait pas) **puis** OCR.
- Deux voies : `pdfjs-dist` + `@napi-rs/canvas` + **`tesseract.js`** (100 % JS/WASM,
  portable, mais plus lent et un cran moins précis que Tesseract natif), **ou**
  garder un **sidecar Python** (`02_ocr_scans.py`) appelé en `child_process`.
- Rappel mesuré : l'OCR ne récupère l'établissement que sur de **vrais relevés
  scannés** ; sur un diplôme/attestation l'info n'y est pas. L'OCR est donc une
  **aide optionnelle**, pas un bloquant du flux principal.

---

## 4. Options d'architecture

### Option A — Tout porter en TypeScript
Réimplémenter le pipeline dans `lib/server/` + routes `app/api/inscription/*`.
- ➕ Stack unique, un seul `npm install`, déployable comme le reste, profite
  nativement de la sécurité local-only et des helpers existants.
- ➖ Re-développer l'extraction texte (pdfjs) et surtout l'OCR (tesseract.js +
  rasterisation) ; OCR JS plus lent/moins précis.

### Option B — Sidecar Python appelé par les routes Next
Garder les scripts ; les routes API les lancent via `child_process` dans `PDF_WORK_ROOT`.
- ➕ Réutilise du code **déjà validé sur 29 dossiers**, OCR natif performant, dev rapide.
- ➖ Ajoute des dépendances système (Python + Tesseract) à installer/déployer ;
  casse la promesse « app Node pure » ; surface de sécurité (exécution de process)
  à revoir dans le guard.

### Option C — Hybride phasé *(recommandé)*
1. **Porter en TS le cœur déterministe** (dézip → parse texte → remplir → assembler
   → vérifier). C'est le gros du volume et ça épouse l'app.
2. **Faire des tables de décision une grille UI éditable** (le vrai « human-in-the-loop »).
3. **OCR en option** : d'abord tesseract.js opt-in (« tenter l'OCR sur les scans »),
   ou fallback documenté « lire le scan et compléter la grille à la main ». Sidecar
   Python possible plus tard si la précision l'exige.
- ➕ Livraison incrémentale, valeur dès la phase 1, dépendances lourdes repoussées
  et optionnelles.
- ➖ Coexistence temporaire de deux niveaux d'automatisation.

---

## 5. Recommandation

**Option C.** Le cœur déterministe se porte proprement sur pdf-lib + pdfjs + les
helpers existants, et c'est 100 % de l'app actuelle. La partie humaine (tables)
n'est pas un défaut à automatiser à tout prix : c'en est **le bon endroit pour une
UI** (grille de validation). L'OCR, dont le gain réel est partiel, reste une
amélioration branchable sans bloquer la mise en service.

---

## 6. Proposition d'UI

**Nouvelle page `app/inscription/page.tsx`** (onglet « Inscriptions » à côté du
workbench actuel), composant `components/inscription/InscriptionWorkbench.tsx`.

Flux en 4 temps, calqué sur les composants existants (`PathBar`, `FileTable`,
`ActionPanels`) :

1. **Source** — `PathBar` pour choisir le dossier contenant les `export-dossier-*.zip`
   (ou déjà extraits). Bouton « Analyser ».
2. **Revue** — un tableau (1 ligne/étudiant) : colonnes auto-remplies
   *Nom · Né(e) · INE · Bac (année/série/mention/établissement) · BTS · Anomalies*,
   chaque cellule **éditable**, avec un **badge de confiance** (auto-texte / OCR /
   à compléter) et la **liste des pièces manquantes**. ⇒ c'est l'UI des tables
   `construire_donnees.py`.
   - Bouton « Tenter l'OCR » sur les lignes en scan-image (option, §4).
3. **Génération** — « Générer les dossiers » → écrit `_final/<étudiant>/` (formulaire
   rempli + pièces fusionnées). Barre de progression par étudiant.
4. **Contrôle** — panneau récap (29/29 OK ou liste d'écarts), liens vers chaque
   dossier + `PreviewPanel` pour visualiser un PDF généré.

Réutilisations directes : `FileBackend` (path/picker), `PreviewPanel`,
`findAvailablePdfName`, le style global.

---

## 7. Routes API à ajouter

Même patron que `app/api/pdf/merge/route.ts` (zod + `requireLocalRequest` +
`errorResponse`, `runtime = "nodejs"`, opérations confinées à `PDF_WORK_ROOT`) :

| Route | Entrée | Sortie |
|---|---|---|
| `POST /api/inscription/analyze` | `{ folderPath }` | fiches étudiants pré-remplies + confiance + anomalies |
| `POST /api/inscription/ocr` | `{ folderPath, student, doc }` | champs ré-extraits par OCR (option) |
| `POST /api/inscription/generate` | `{ folderPath, fiches[] }` (grille validée) | dossiers écrits dans `_final/` |
| `POST /api/inscription/verify` | `{ folderPath }` | rapport de contrôle |

Helpers serveur à créer dans `lib/server/inscription/` : `synthese-parse.ts`
(pdfjs), `form-fill.ts` (pdf-lib + map de `reference/champs_formulaire.txt`),
`assemble.ts` (réutilise `pdf-utils`), `verify.ts`. Logique pure (parsing,
règles métier : année sup = session BTS−2, mention depuis moyenne, mapping CSP)
isolée dans `lib/shared` et **couverte par des tests vitest** (comme l'existant).

---

## 8. Modèle de données (human-in-the-loop)

La grille de revue échange un seul objet par étudiant (≈ `donnees_formulaire.json`
actuel) : identité + bac + bts + pièces + anomalies, plus un champ `_confiance`
par valeur. `analyze` le **pré-remplit**, l'utilisateur le **corrige**, `generate`
le **consomme**. Les « tables en dur » de `construire_donnees.py` disparaissent au
profit de cette grille : le code ne porte plus que les *règles*, plus les *décisions*.

---

## 9. Plan de livraison incrémental — état

- **P0** ✅ brique Python autonome dans le repo, données ignorées, pipeline rejouable, cette spec.
- **P1** ✅ routes `analyze` + `generate`, helpers TS (`lib/server/inscription/` : extract via
  unpdf, analyze, generate via pdf-lib+sharp), page `/inscription` (source → grille → générer),
  tests vitest des règles + parsing. Validé bout-en-bout sur échantillon réel.
- **P2** ✅ route `verify`, grille **éditable** (édition dépliable par étudiant), badges de
  confiance, panneau d'anomalies, **preview** des PDF générés via `api/fs/file`.
- **P3** ✅ OCR optionnel **pur-JS** (`unpdf.extractImages` → `sharp` → `tesseract.js` avec
  traineddata locaux, sans réseau ni canvas), boutons « Tenter l'OCR » dans la grille.
  Validé sur un relevé scanné (code établissement + année + département récupérés).
- **P4** ✅ lien de navigation depuis la home, doc README (feature + env `INSCRIPTION_TESSDATA`),
  ce statut.

- **P5** ✅ dézippage natif (`lib/server/inscription/unzip.ts` via yauzl, noms UTF-8
  préservés) : `analyze` accepte désormais un dossier de `export-dossier-*.zip` bruts,
  dézippés dans `_extraits/`. Validé bout-en-bout sur de vrais exports.

- **P6** ✅ redressement d'orientation OCR « sans régression » : lecture à 0°
  d'abord ; on ne tente 90/180/270° que si 0° n'a pas livré de code établissement,
  et on ne garde une rotation que si elle récupère strictement plus. (Les heuristiques
  par confiance et `rotateAuto`/OSD de tesseract.js se sont révélées contre-productives
  ou cassées dans ce build — d'où ce garde-fou.)

Reste ouvert : migration du dernier défaut de parsing du port Python (second
responsable / payeur).

## 10. Risques & points d'attention

- **PII** : ne jamais écrire hors `PDF_WORK_ROOT` ; garder le `.gitignore` strict ;
  pas de logs de contenu. (Aligné au modèle de sécurité existant.)
- **OCR** : dépendance la plus lourde — la garder optionnelle/différée.
- **Formats variables** : les exports 360 contiennent des uploads erronés (brevet
  au lieu du bac, bulletin au lieu d'un relevé, recto sans verso). Le pipeline les
  **détecte déjà** ; l'UI doit les **surfacer** sans bloquer (badge + anomalie).
- **Template versionné** : le « Dossier IA » vierge est commité ; si CY change le
  formulaire, régénérer `reference/champs_formulaire.txt` et la map de remplissage.
