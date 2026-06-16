/**
 * Analyse d'un dossier d'exports 360 : détecte les sous-dossiers étudiants
 * (export déjà extrait : un dossier par étudiant avec Synthèse.pdf + Documents/)
 * et produit une fiche pré-remplie par étudiant.
 * Port TS de parse_syntheses.py + construire_donnees.py (partie automatique).
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { parseFrenchDate, firstLine, supEntryYear } from "@/lib/inscription/rules";
import type { StudentRecord } from "@/lib/inscription/types";
import {
  pdfTextFromFile, findByPrefix, parseSynthese, extraireBac, extraireBts,
} from "@/lib/server/inscription/extract";

// commune de naissance (normalisée) -> code postal (port du dict Python, complété au besoin)
const CP_NAISSANCE: Record<string, string> = {
  grenoble: "38000", "saint martin d'hères": "38400", "saint martin d'heres": "38400",
  "saint-martin-d'hères": "38400", "st martin d'hères": "38400", "st martin d'heres": "38400",
  "la tronche": "38700", "aix-les-bains": "73100", deauville: "14800",
  rouen: "76000", annonay: "07100",
};

function parseAdresse(value: string): { rue: string; cp: string; ville: string } {
  const lignes = value.split("\n").map((l) => l.trim());
  const rue: string[] = [];
  let cp = "", ville = "";
  for (const l of lignes) {
    const m = l.match(/^(\d{2}\s?\d{3}),\s*(.+)$/);
    if (m) {
      cp = m[1].replace(/\s/g, "");
      ville = m[2].trim();
      break;
    }
    rue.push(l);
  }
  return { rue: rue.join(", "), cp, ville };
}

async function hasSynthese(dir: string): Promise<string | null> {
  return (await findByPrefix(dir, "Synthèse.")) ?? (await findByPrefix(dir, "Synthese."));
}

/** Sous-dossiers étudiants (ou le dossier lui-même s'il contient une Synthèse). */
async function studentDirs(folderPath: string): Promise<{ id: string; dir: string }[]> {
  const out: { id: string; dir: string }[] = [];
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(folderPath, e.name);
    if (await hasSynthese(dir)) out.push({ id: e.name, dir });
  }
  if (out.length === 0 && (await hasSynthese(folderPath))) {
    out.push({ id: path.basename(folderPath), dir: folderPath });
  }
  return out;
}

async function buildRecord(id: string, dir: string): Promise<StudentRecord> {
  const synthPath = (await hasSynthese(dir))!;
  const s = parseSynthese(await pdfTextFromFile(synthPath));
  const docs = path.join(dir, "Documents");

  const anomalies: string[] = [];
  const get = (k: string) => firstLine(s[k] ?? "");
  const dash = (v: string) => (v === "-" ? "" : v);

  const sexe: "F" | "M" = get("Civilité").startsWith("Mme") ? "F" : "M";
  const dn = parseFrenchDate(get("Date de naissance")) ?? { jj: "", mm: "", aaaa: "" };
  const commune = get("Commune de naissance");
  const { rue, cp, ville } = parseAdresse(s["Adresse"] ?? "");

  // bac / bts depuis les pièces
  const bacFile = await findByPrefix(docs, "releve-de-notes-de-bac.");
  const bacRes = bacFile
    ? extraireBac(await pdfTextFromFile(bacFile))
    : { info: null, anomalies: ["Aucun fichier relevé/diplôme bac dans l'export."] };
  const btsFile = await findByPrefix(docs, "releve-de-notes-de-bac2");
  const btsRes = btsFile
    ? extraireBts(await pdfTextFromFile(btsFile))
    : { info: null, anomalies: ["Aucune pièce bac+2 dans l'export."] };
  anomalies.push(...bacRes.anomalies, ...btsRes.anomalies);
  if (!bacFile || bacRes.info === null) anomalies.push("Bac : à lire/compléter manuellement (scan-image, diplôme, ou doc erroné).");

  const bac = bacRes.info ?? {
    annee: "", intitule: "", mention: "", etablissement: "", codeEtablissement: "",
    departement: "", confidence: "manuel" as const, source: "absent" as const,
  };
  const bts = btsRes.info ?? {
    session: "", specialite: "", etablissement: "", departement: "",
    confidence: "manuel" as const, source: "absent" as const,
  };

  const docFiles = await fs.readdir(docs).catch(() => [] as string[]);
  const aPhoto = docFiles.some((f) => f.startsWith("photo-d-identite"));
  const aReleveBac = Boolean(bacFile) && bacRes.info !== null;

  anomalies.push("Contrat pro non fourni dans l'export 360 (à récupérer séparément).");

  return {
    id, sexe,
    nom: get("Nom de famille").toUpperCase(),
    prenom: get("Prénom").toUpperCase(),
    nomUsage: dash(get("Nom d’usage")).toUpperCase(),
    autresPrenoms: dash(get("Autres prénoms")).toUpperCase(),
    naissanceJJ: dn.jj, naissanceMM: dn.mm, naissanceAAAA: dn.aaaa,
    villeNaissance: commune.toUpperCase(),
    cpNaissance: CP_NAISSANCE[commune.toLowerCase().trim()] ?? "",
    paysNaissance: "FRANCE",
    nationalite: "FRANCAISE",
    adresse: rue.toUpperCase(), cp, ville: ville.toUpperCase(),
    tel: get("Numéro de téléphone"),
    email: get("E-mail"),
    ine: (s["INE"] ?? "").replace(/\s/g, ""),
    anneeSup: supEntryYear(bts.session),
    anneeCY: "2025",
    bac, bts,
    cspPere: "99", cspMere: "99",
    droitImage: get("Droit à l’image") === "Oui",
    aPhoto, aReleveBac,
    anomalies,
  };
}

export async function analyzeFolder(folderPath: string): Promise<StudentRecord[]> {
  const dirs = await studentDirs(folderPath);
  const records: StudentRecord[] = [];
  for (const { id, dir } of dirs) records.push(await buildRecord(id, dir));
  return records;
}
