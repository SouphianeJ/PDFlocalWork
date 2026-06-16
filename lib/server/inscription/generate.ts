/**
 * Génération des dossiers finaux : remplissage du formulaire AcroForm CY,
 * fusion de la pièce d'identité, dédup BTS, assemblage dans _final/<étudiant>/.
 * Port TS de remplir_dossier_ia.py + assembler_dossiers.py.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import type { GenerateResult, StudentRecord } from "@/lib/inscription/types";
import { findByPrefix, studentDir } from "@/lib/server/inscription/extract";
import { codeToDepartment } from "@/lib/inscription/rules";

const TEMPLATE_PATH = path.join(
  process.cwd(), "inscription-pipeline", "Dossier IA 2025-2026 ILEPS LC3 GRENOBLE.pdf",
);

const last2 = (year: string) => (year ? year.slice(-2) : "");
const prevYear = (year: string) => {
  const y = parseInt(year, 10);
  return Number.isFinite(y) ? String(y - 1) : "";
};

function textMap(r: StudentRecord): Record<string, string> {
  return {
    "NINES ou BEA se trouve sur le relevé de notes du BAC": r.ine,
    "Nationalité": r.nationalite,
    "Nom de naissance": r.nom,
    "Nom dusage ou marital": r.nomUsage,
    "Prénom": r.prenom,
    "Prénoms": r.autresPrenoms,
    "Date de naissance": r.naissanceJJ,
    "Date de naissanceM": r.naissanceMM,
    "Date de naissanceY": r.naissanceAAAA,
    "Pays de naissance": r.paysNaissance,
    "Code postal": r.cpNaissance,
    "Ville de naissance": r.villeNaissance,
    "Adresse": r.adresse,
    "Code postal_2": r.cp,
    "Ville": r.ville,
    "num_telephone": r.tel,
    "Adresse courriel obligatoire": r.email,
    "Année de 1ère inscription en Enseignement Supérieur Français": r.anneeSup,
    "Année de 1ère inscription à CY CERGY PARIS UNIVERSITÉ": r.anneeCY,
    "Année dobtention": r.bac.annee,
    "Intitulé": r.bac.intitule,
    "Mention": r.bac.mention,
    "Nom de létablissement dans lequel sest déroulée la scolarité": r.bac.etablissement,
    "Code établissement  voir relevé de notes du bac": r.bac.codeEtablissement,
    "N dép": r.bac.departement || codeToDepartment(r.bac.codeEtablissement),
    "Pays": r.bac.annee ? "FRANCE" : "",
    "Année dinscription du dernier établissement fréquenté  20": last2(prevYear(r.bts.session)),
    "20": last2(r.bts.session),
    "Nom de létablissement": r.bts.etablissement,
    "Dép_2": r.bts.departement,
    "Pays_2": r.bts.etablissement ? "FRANCE" : "",
    "Année dobtention du dernier diplôme obtenu  20": last2(prevYear(r.bts.session)),
    "20_2": last2(r.bts.session),
    "Catégorie du père": r.cspPere,
    "Catégorie de la mère": r.cspMere,
    "Je soussigné e": r.droitImage ? `${r.nom} ${r.prenom}` : "",
  };
}

export async function fillForm(record: StudentRecord): Promise<Uint8Array> {
  const bytes = await fs.readFile(TEMPLATE_PATH);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  for (const [name, value] of Object.entries(textMap(record))) {
    if (!value) continue;
    try {
      form.getTextField(name).setText(value);
    } catch {
      /* champ absent : on ignore */
    }
  }

  const checks: Record<string, boolean> = {
    SCID: true, PHOT1: record.aPhoto, DIPFM: true, RNB: record.aReleveBac,
    "B BTS": record.bts.session === "2025", "01 BTS": true, "010 BTS": true,
  };
  for (const [name, on] of Object.entries(checks)) {
    if (!on) continue;
    try {
      form.getCheckBox(name).check();
    } catch {
      /* champ absent */
    }
  }
  try {
    form.getRadioGroup("Masculin").select(record.sexe);
  } catch {
    /* groupe absent */
  }

  return doc.save();
}

/** Convertit un fichier (PDF ou image) en pages ajoutées au document cible. */
async function appendToPdf(target: PDFDocument, filePath: string) {
  const buf = await fs.readFile(filePath);
  if (filePath.toLowerCase().endsWith(".pdf")) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await target.copyPages(src, src.getPageIndices());
    pages.forEach((p) => target.addPage(p));
    return;
  }
  const jpeg = await sharp(buf).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const meta = await sharp(jpeg).metadata();
  const img = await target.embedJpg(jpeg);
  const page = target.addPage([meta.width ?? img.width, meta.height ?? img.height]);
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
}

async function md5(filePath: string): Promise<string> {
  return createHash("md5").update(await fs.readFile(filePath)).digest("hex");
}

const NOM_FICHIER_BAC: Record<string, string> = {
  "Coquet-Simon": "BREVET DNB - ATTENTION relevé bac MANQUANT.pdf",
};

export async function assembleStudent(folderPath: string, record: StudentRecord): Promise<GenerateResult> {
  const srcDocs = path.join(await studentDir(folderPath, record.id), "Documents");
  const dst = path.join(folderPath, "_final", record.id);
  await fs.mkdir(dst, { recursive: true });

  const pieces: string[] = [];
  const anomalies = [...record.anomalies];

  // 1. Dossier IA rempli
  const iaName = `Dossier IA - ${record.nom} ${record.prenom}.pdf`;
  await fs.writeFile(path.join(dst, iaName), await fillForm(record));
  pieces.push(iaName);

  // 2. Bac
  const bac = await findByPrefix(srcDocs, "releve-de-notes-de-bac.");
  if (bac) {
    const name = NOM_FICHIER_BAC[record.id] ?? "Bac - relevé de notes.pdf";
    await fs.copyFile(bac, path.join(dst, name));
    pieces.push(name);
  } else {
    anomalies.push("Aucun fichier relevé/diplôme bac dans l'export.");
  }

  // 3. Identité fusionnée
  const recto = await findByPrefix(srcDocs, "carte-d-identite-ou-passeport");
  const verso = await findByPrefix(srcDocs, "carte-d-identite-verso");
  if (recto) {
    const merged = await PDFDocument.create();
    await appendToPdf(merged, recto);
    if (verso) await appendToPdf(merged, verso);
    const name = verso ? "Identité - CNI recto-verso.pdf" : "Identité - recto seul.pdf";
    await fs.writeFile(path.join(dst, name), await merged.save());
    pieces.push(name);
  } else {
    anomalies.push("Justificatif d'identité ABSENT.");
  }

  // 4. BTS (relevé et/ou diplôme, dédupliqués par hash)
  const btsReleve = await findByPrefix(srcDocs, "releve-de-notes-de-bac2");
  const btsDiplome = await findByPrefix(srcDocs, "dernier-diplome-obtenu-piece-jointe");
  if (btsReleve && btsDiplome && (await md5(btsReleve)) === (await md5(btsDiplome))) {
    await fs.copyFile(btsReleve, path.join(dst, "BTS - relevé ou diplôme.pdf"));
    pieces.push("BTS - relevé ou diplôme.pdf");
  } else {
    if (btsReleve) {
      await fs.copyFile(btsReleve, path.join(dst, "BTS - relevé de notes.pdf"));
      pieces.push("BTS - relevé de notes.pdf");
    }
    if (btsDiplome) {
      await fs.copyFile(btsDiplome, path.join(dst, "BTS - diplôme ou attestation.pdf"));
      pieces.push("BTS - diplôme ou attestation.pdf");
    }
  }
  if (!btsReleve && !btsDiplome) anomalies.push("Aucune pièce bac+2 dans l'export.");

  // 5. Anomalies
  if (anomalies.length) {
    const txt = `Anomalies / pièces manquantes — ${record.nom} ${record.prenom}\n${"=".repeat(60)}\n`
      + anomalies.map((a) => `- ${a}`).join("\n") + "\n";
    await fs.writeFile(path.join(dst, "_ANOMALIES.txt"), txt, "utf-8");
  }

  return { id: record.id, pieces, anomalies };
}

export async function generateDossiers(folderPath: string, students: StudentRecord[]): Promise<GenerateResult[]> {
  const results: GenerateResult[] = [];
  for (const r of students) {
    try {
      results.push(await assembleStudent(folderPath, r));
    } catch (error) {
      results.push({ id: r.id, pieces: [], anomalies: [], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
