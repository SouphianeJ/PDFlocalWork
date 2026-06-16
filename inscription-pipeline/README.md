# inscription-pipeline

Pipeline d'assemblage des **dossiers d'inscription administrative CY / ILEPS** à
partir des exports `.zip` de [360.ileps.fr](https://360.ileps.fr). Pour chaque
étudiant, il produit un dossier prêt à déposer : formulaire « Dossier IA » CY
pré-rempli + relevé de bac + pièce d'identité (recto-verso fusionnés) + diplôme
bac+2, et un fichier d'anomalies listant les pièces à réclamer.

> Brique Python autonome, déposée ici en vue d'une **intégration à l'app
> PDFlocalWork** (voir [`INTEGRATION_SPEC.md`](./INTEGRATION_SPEC.md)).

## Statut
- **Validé** sur une promotion réelle de 29 étudiants (LC3 CPSS Grenoble 2025-2026).
- Le dépôt ne contient **que le code + le template vierge + la doc**. Toutes les
  données étudiants (`_extraits/`, `_final/`, `_data/`, `_ocr/…`, `*.zip`) sont
  **git-ignorées** : elles restent locales sur le poste pour les tests.

## Prérequis
```bash
pip install -r requirements.txt
# + binaire Tesseract OCR (système) si on traite des relevés scannés — voir _ocr/README.md
```

## Lancer
```bash
# 1) déposer les export-dossier-*.zip dans ce dossier (ou des dossiers déjà
#    extraits dans _extraits/), puis :
python _scripts/run_pipeline.py
```
L'orchestrateur enchaîne l'automatisable et **s'arrête à l'étape manuelle** si un
étudiant manque dans les tables BAC/BTS de `construire_donnees.py` (code retour 2).

Le dossier de travail (`BASE`) est par défaut la racine de `inscription-pipeline/` ;
surchargeable via la variable d'environnement `INSCRIPTION_BASE`.

## Étapes (`_scripts/`)
| Script | Rôle | Nature |
|---|---|---|
| `00_extraire.py` | dézippe les exports → `_extraits/` | auto |
| `parse_syntheses.py` | lit les `Synthèse.pdf` → `_data/etudiants.json` | auto |
| `01_extraire_tables.py` | pré-remplit BAC/BTS depuis la couche **texte** des relevés | aide saisie |
| `02_ocr_scans.py` | **OCR** (Tesseract) des relevés en **scan-image** → `_ocr/` | aide saisie |
| `construire_donnees.py` | tables BAC/BTS/CSP + anomalies → `donnees_formulaire.json` | **manuel** |
| `remplir_dossier_ia.py` | remplit le formulaire AcroForm CY | auto |
| `assembler_dossiers.py` | fusion identité, dédup BTS, assemblage → `_final/` | auto |
| `verifier_dossiers.py` | contrôle final pièce par pièce | auto |
| `run_pipeline.py` | orchestrateur (auto → gate manuel → auto) | — |

Ordre conseillé : `01_extraire_tables` → `02_ocr_scans` → relire les `a_verifier*`
→ compléter les tables de `construire_donnees.py` → `run_pipeline.py`.

## Données & confidentialité
Les exports contiennent des données personnelles (état civil, INE, adresses,
scans d'identité). **Tout traitement reste local** ; rien n'est versionné ni
envoyé. C'est aligné avec le modèle « local-only » de PDFlocalWork.
