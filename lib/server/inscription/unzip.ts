/**
 * Dézippage des exports 360 (port de 00_extraire.py).
 * Les noms internes sont stockés en UTF-8 (ex "Synthèse.pdf" = octets C3 A8) :
 * on lit les octets bruts (decodeStrings:false) et on les décode en UTF-8 —
 * yauzl en mode décodé retomberait sur CP437 si le flag UTF-8 n'est pas posé.
 */
import path from "node:path";
import { promises as fs, createWriteStream } from "node:fs";
import yauzl from "yauzl";

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip illisible"));
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.readEntry();
      zip.on("entry", (entry: yauzl.Entry) => {
        const rawName = (entry.fileName as unknown as Buffer).toString("utf8").replace(/\\/g, "/");
        const target = path.join(destDir, rawName);
        const rel = path.relative(destDir, target);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          zip.readEntry(); // garde anti zip-slip
          return;
        }
        if (rawName.endsWith("/")) {
          fs.mkdir(target, { recursive: true }).then(() => zip.readEntry(), reject);
          return;
        }
        fs.mkdir(path.dirname(target), { recursive: true })
          .then(() => zip.openReadStream(entry, (e, rs) => {
            if (e || !rs) return reject(e ?? new Error("flux illisible"));
            const ws = createWriteStream(target);
            rs.on("error", reject);
            ws.on("error", reject);
            ws.on("close", () => zip.readEntry());
            rs.pipe(ws);
          }), reject);
      });
    });
  });
}

async function isNonEmptyDir(dir: string): Promise<boolean> {
  try {
    return (await fs.readdir(dir)).length > 0;
  } catch {
    return false;
  }
}

/**
 * Extrait tous les `export-dossier-*.zip` de `folderPath` dans
 * `folderPath/_extraits/<NomÉtudiant>/`. Idempotent (saute si déjà extrait).
 * Renvoie la liste des étudiants extraits cette fois-ci.
 */
export async function extractExports(folderPath: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(folderPath);
  } catch {
    return [];
  }
  const zips = entries.filter((f) => f.startsWith("export-dossier-") && f.endsWith(".zip"));
  const extracted: string[] = [];
  for (const z of zips.sort()) {
    const m = z.match(/^export-dossier-(.+)-\d{14}\.zip$/);
    if (!m) continue;
    const name = m[1];
    const dest = path.join(folderPath, "_extraits", name);
    if (await isNonEmptyDir(dest)) continue; // déjà extrait
    await fs.mkdir(dest, { recursive: true });
    await extractZip(path.join(folderPath, z), dest);
    extracted.push(name);
  }
  return extracted;
}
