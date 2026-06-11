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

## Security model

This app's API can read, write and delete local files, so two protections are built in:

- **Local-only requests**: every API route rejects requests whose `Host` is not localhost (DNS-rebinding protection) or whose `Origin`/`Sec-Fetch-Site` headers indicate the request was triggered by another website open in your browser (drive-by CSRF protection).
- **Optional root folder restriction**: set the `PDF_WORK_ROOT` environment variable to confine all file operations to one directory tree. Example:

```bash
# PowerShell
$env:PDF_WORK_ROOT = "C:\Users\you\Documents\PDFs"; npm run dev
```

When unset, the app can browse any folder your user account can access (path mode). The browser picker mode is always confined to the folder you explicitly grant.

## Project layout

- `app/api/fs/*` — file-system routes (list, suggest, file preview, rename, delete, zip)
- `app/api/pdf/*` — PDF routes (merge, split, compress, rotate, pagecount)
- `lib/server/` — server-side helpers (fs utils, pdf utils via `pdf-lib` + `sharp`, request guard, error mapping)
- `lib/browser/` — browser-side PDF helpers (File System Access API + canvas-based compression)
- `lib/shared.ts` — types and pure helpers shared by both sides (extensions, file-name normalization, page-range parsing)
- `components/workbench/` — UI building blocks (`PathBar`, `FolderSidebar`, `FileTable`, `PreviewPanel`, `ActionPanels`) and the `FileBackend` abstraction that hides the path-mode vs. picker-mode difference
- `tests/` — vitest unit tests for the pure helpers (run with `npm test`)
