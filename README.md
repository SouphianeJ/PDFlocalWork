# PDF Local Work

Local Next.js helper for fast PDF workflows (merge, split, compress, rotate, zip) on `http://localhost:3002`. Everything runs on your machine: files are read and written directly on your local disk, nothing is uploaded anywhere.

## Commands

```bash
npm install
npm run dev    # start the app on http://localhost:3002
npm run lint   # eslint
npm test       # vitest unit tests
npm run build  # production build
```

## Features

- Browse folders by local path (server-backed API) or with the browser directory picker (File System Access API) in supported browsers
- Multi-select PDFs and images, then **merge** into a single compressed PDF (selection order is preserved); a single selected file is **converted** to PDF
- **Compress** one or several PDFs (recompresses embedded JPEG/Flate images at screen / ebook / printer quality)
- **Split** one PDF by page ranges (`1-3, 5, 8-10`) or into one PDF per page
- **Rotate** all pages of a PDF in place (90°/180°/270°)
- **Zip** any subfolder (path mode), with collision-safe naming
- Rename on double-click, per-file delete with click-to-confirm, page counts, preview pane
- Keyboard shortcuts: `Ctrl+A` select all, `Delete` batch delete (with confirmation banner), `Escape` clear selection
- Output files never overwrite existing ones (collision-safe `name (1).pdf` naming)

### Inscription dossiers (CY / ILEPS)

Dedicated page at `/inscription` (link top-right of the home page) that assembles
student registration dossiers from [360.ileps.fr](https://360.ileps.fr) exports:

- **Analyze** a folder of already-extracted exports (one subfolder per student with
  `Synthèse.pdf` + `Documents/`): reads the synthèse and transcripts (text layer),
  pre-fills identity / bac / BTS with a confidence badge and flags anomalies
- **Review grid**: edit any field per student before generating
- **Generate**: fills the CY "Dossier IA" AcroForm (date/signature left blank for the
  student), fuses the ID card recto/verso, de-duplicates the BTS transcript/diploma,
  writes one dossier per student under `_final/` plus an `_ANOMALIES.txt`
- **Verify**: re-checks every generated dossier (pieces present, valid PDFs, form
  fields match the record)
- **Optional OCR** (best-effort) of transcripts provided as image-scans, fully local
  via `tesseract.js` + local `traineddata` (no network)

The standalone Python pipeline this was ported from lives in
[`inscription-pipeline/`](./inscription-pipeline/) (see its `INTEGRATION_SPEC.md`).
All student data stays local and is git-ignored.

## Security model

This app's API can read, write and delete local files, so two protections are built in:

- **Local-only requests**: every API route rejects requests whose `Host` is not localhost (DNS-rebinding protection) or whose `Origin`/`Sec-Fetch-Site` headers indicate the request was triggered by another website open in your browser (drive-by CSRF protection).
- **Optional root folder restriction**: set the `PDF_WORK_ROOT` environment variable to confine all file operations to one directory tree. Example:

```bash
# PowerShell
$env:PDF_WORK_ROOT = "C:\Users\you\Documents\PDFs"; npm run dev
```

When unset, the app can browse any folder your user account can access (path mode). The browser picker mode is always confined to the folder you explicitly grant.

The optional inscription OCR uses local Tesseract `traineddata`. Point it at your
tessdata folder with `INSCRIPTION_TESSDATA` (defaults to the scoop install path
`~/scoop/persist/tesseract/tessdata`).

## Project layout

- `app/api/fs/*` — file-system routes (list, suggest, file preview, rename, delete, zip)
- `app/api/pdf/*` — PDF routes (merge, split, compress, rotate, pagecount)
- `app/api/inscription/*` — inscription routes (analyze, generate, verify, ocr)
- `app/inscription/` + `components/inscription/` — inscription page and review-grid UI
- `lib/inscription/` — pure inscription rules + shared types (tested in `tests/`)
- `lib/server/inscription/` — extract (unpdf) / analyze / generate (`pdf-lib` + `sharp`) / verify / ocr (`tesseract.js`)
- `lib/server/` — server-side helpers (fs utils, pdf utils via `pdf-lib` + `sharp`, request guard, error mapping)
- `lib/browser/` — browser-side PDF helpers (File System Access API + canvas-based compression)
- `lib/shared.ts` — types and pure helpers shared by both sides (extensions, file-name normalization, page-range parsing)
- `components/workbench/` — UI building blocks (`PathBar`, `FolderSidebar`, `FileTable`, `PreviewPanel`, `ActionPanels`) and the `FileBackend` abstraction that hides the path-mode vs. picker-mode difference
- `tests/` — vitest unit tests for the pure helpers (run with `npm test`)
