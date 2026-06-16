/**
 * Extraction + parsing des PDF d'un export 360 (couche texte).
 * Port TS de parse_syntheses.py et 01_extraire_tables.py.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import {
  codeToDepartment,
  mentionFromMoyenne,
  normalizeBtsSpecialty,
} from "@/lib/inscription/rules";
import type { BacInfo, BtsInfo } from "@/lib/inscription/types";

export async function pdfText(bytes: Uint8Array): Promise<string> {
  // mergePages:false conserve les sauts de ligne (un par item de texte) ;
  // mergePages:true collerait tout sur une seule ligne séparée par des espaces.
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function pdfTextFromFile(filePath: string): Promise<string> {
  try {
    const buf = await fs.readFile(filePath);
    return await pdfText(new Uint8Array(buf));
  } catch {
    return "";
  }
}

/** Dossier d'un étudiant : `<folder>/_extraits/<id>` si présent, sinon `<folder>/<id>`. */
export async function studentDir(folderPath: string, id: string): Promise<string> {
  const inExtraits = path.join(folderPath, "_extraits", id);
  try {
    if ((await fs.stat(inExtraits)).isDirectory()) return inExtraits;
  } catch {
    /* pas sous _extraits */
  }
  return path.join(folderPath, id);
}

/** Cherche dans un dossier le premier fichier dont le nom commence par `prefix`. */
export async function findByPrefix(dir: string, prefix: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).sort();
  } catch {
    return null;
  }
  const hit = entries.find((f) => f.toLowerCase().startsWith(prefix.toLowerCase()));
  return hit ? path.join(dir, hit) : null;
}

// ── Synthèse.pdf ────────────────────────────────────────────────────────────

// Labels dont le texte s'étale sur deux lignes dans l'extraction : on les
// recompacte sur une seule ligne avant le découpage.
const MULTILINE_LABELS = [
  "Carte d'identité ou passeport en\ncours de validité",
  "Date d’expiration justificatif\nd’identité",
  "Numéro CVEC (Contribution de\nVie Etudiante et de Campus)",
  "Dernier diplôme obtenu pièce\njointe",
  "Comment avez-vous connu la\nformation ?",
  "Signatures échéancier de\npaiements",
];

const SECTIONS = new Set([
  "Formation", "État civil", "Parcours scolaire - Universitaire",
  "Responsables / Parents", "Informations de paiement",
  "Informations complémentaires", "Signatures",
]);

const LABELS = [
  "Type de parcours", "Formation", "Interessé par d’autres formations",
  "Civilité", "Prénom", "Nom de famille", "Autres prénoms", "Nom d’usage",
  "Date de naissance", "Nationalité", "Adresse", "Numéro de téléphone",
  "E-mail", "Numéro de sécurité sociale", "Pays de naissance",
  "Carte d'identité ou passeport en cours de validité",
  "Type de justificatif d'identité", "Carte d'identité (verso)",
  "Photo d’identité", "Date d’expiration justificatif d’identité",
  "Département de naissance", "Commune de naissance",
  "Statut RQTH (handicap)", "Attestation de RQTH (handicap)", "INE",
  "Numéro CVEC (Contribution de Vie Etudiante et de Campus)",
  "Bulletins de notes - année N", "Relevé de notes de BAC",
  "Dernier diplôme obtenu", "CVEC pièce jointe",
  "Dernier diplôme obtenu pièce jointe", "Relevé de notes de BAC+2",
  "Responsable(s) ou parent(s)", "Payeur(s)", "Droit à l’image",
  "Comment avez-vous connu la formation ?", "Documents administratifs",
  "Signatures échéancier de paiements",
].sort((a, b) => b.length - a.length); // plus longs d'abord pour matcher au plus précis

export function parseSynthese(rawText: string): Record<string, string> {
  let text = rawText;
  for (const ml of MULTILINE_LABELS) text = text.split(ml).join(ml.replace(/\n/g, " "));
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const data: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    if (SECTIONS.has(line) && line !== "Formation") {
      current = null;
      continue;
    }
    const label = LABELS.find((l) => line === l || line.startsWith(l + " "));
    if (label) {
      current = label;
      const rest = line.slice(label.length).trim();
      data[label] = rest ? [rest] : [];
      continue;
    }
    if (current) (data[current] ??= []).push(line);
  }

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const joined = v.join("\n");
    clean[k] = joined.startsWith("Type : ") ? "(pièce jointe)" : joined;
  }
  return clean;
}

// ── Relevés / diplômes ───────────────────────────────────────────────────────

function findEtablissement(text: string): { code: string; nom: string } {
  const m = text.match(/(\d{7}[A-Z])\s+([A-ZÉÈÀ][^\n(]{3,70})/);
  if (!m) return { code: "", nom: "" };
  const nom = m[2].replace(/\s*\(\d{7}[A-Z]\)\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return { code: m[1], nom };
}

function explicitMention(text: string): string | null {
  const m = text.match(/Admis\s+Mention\s+(Très Bien|Bien|Assez Bien)/i);
  return m ? m[1].toUpperCase() : null;
}

function mentionFromText(text: string): string | null {
  const m = text.match(/MOYENNE FINALE\s+([\d.,]+)/);
  if (!m) return null;
  return mentionFromMoyenne(parseFloat(m[1].replace(",", ".")));
}

export function extraireBac(text: string): { info: BacInfo | null; anomalies: string[] } {
  const low = text.toLowerCase();
  if (low.includes("diplôme national du brevet") || low.includes("diplome national du brevet")) {
    return { info: null, anomalies: ["Document = BREVET (DNB), PAS le relevé du bac."] };
  }
  if (low.includes("provisoires") && (low.includes("anticipée") || low.includes("année scolaire"))) {
    return { info: null, anomalies: ["Relevé d'épreuves ANTICIPÉES de 1ère, pas le relevé final du bac."] };
  }
  const attestation = low.includes("attestation de réussite");
  const anomalies: string[] = [];

  let intitule = "";
  if (/baccalauréat général/.test(low)) intitule = "GENERAL";
  else if (/baccalauréat technologique/.test(low)) {
    intitule = "TECHNOLOGIQUE";
    if (low.includes("stmg") || low.includes("sciences et technologies du management")) intitule = "TECHNOLOGIQUE STMG";
  } else if (/baccalauréat professionnel/.test(low)) {
    intitule = "PRO";
    if (low.includes("assistance à la gestion")) intitule = "PRO AGORA";
  }

  const annee = text.match(/session\s*:?\s*(\d{4})/i)?.[1] ?? "";
  const mention = explicitMention(text) ?? mentionFromText(text) ?? "";

  let code = "", nom = "", dep = "";
  if (attestation) {
    anomalies.push("Attestation de réussite (pas de relevé) : établissement du bac inconnu.");
  } else {
    ({ code, nom } = findEtablissement(text));
    dep = codeToDepartment(code);
  }

  const manque = [!annee && "annee", !intitule && "intitule", !attestation && !nom && "etab", !mention && "mention"].filter(Boolean);
  return {
    info: {
      annee, intitule, mention, etablissement: nom, codeEtablissement: code,
      departement: dep, confidence: manque.length ? "à vérifier" : "haute", source: "texte",
    },
    anomalies,
  };
}

export function extraireBts(text: string): { info: BtsInfo | null; anomalies: string[] } {
  const low = text.toLowerCase();
  const estReleve = low.includes("brevet de technicien supérieur") || low.includes("relevé de notes");
  if (!estReleve && (low.includes("bulletin") || low.includes("semestre"))) {
    return { info: null, anomalies: ["Fichier = bulletin de lycée, PAS le relevé d'examen BTS."] };
  }
  const session = text.match(/session\s*:?\s*(\d{4})/i)?.[1] ?? "";
  const specRaw = text.match(/spécialité\s+(.+)/i)?.[1]?.trim() ?? "";
  const specialite = normalizeBtsSpecialty(specRaw);
  const { code, nom } = findEtablissement(text);
  const manque = [!session && "session", !specialite && "specialite", !nom && "etab"].filter(Boolean);
  return {
    info: {
      session, specialite, etablissement: nom, departement: codeToDepartment(code),
      confidence: manque.length ? "à vérifier" : "haute", source: "texte",
    },
    anomalies: [],
  };
}
