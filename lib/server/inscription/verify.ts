/**
 * Contrôle final des dossiers générés (port de verifier_dossiers.py) :
 * présence des pièces, PDF valides, pages d'identité cohérentes, et relecture
 * des champs clés du formulaire rempli contre la fiche étudiant.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { StudentRecord, VerifyIssue } from "@/lib/inscription/types";

const TEXT_CHECKS: { field: string; get: (r: StudentRecord) => string }[] = [
  { field: "NINES ou BEA se trouve sur le relevé de notes du BAC", get: (r) => r.ine },
  { field: "Nom de naissance", get: (r) => r.nom },
  { field: "Prénom", get: (r) => r.prenom },
  { field: "Date de naissanceY", get: (r) => r.naissanceAAAA },
  { field: "Adresse courriel obligatoire", get: (r) => r.email },
  { field: "Année dobtention", get: (r) => r.bac.annee },
  { field: "Mention", get: (r) => r.bac.mention },
  { field: "Nom de létablissement", get: (r) => r.bts.etablissement },
];

async function pdfPageCount(filePath: string): Promise<number> {
  const doc = await PDFDocument.load(await fs.readFile(filePath), { ignoreEncryption: true });
  return doc.getPageCount();
}

async function verifyStudent(folderPath: string, record: StudentRecord): Promise<VerifyIssue> {
  const dir = path.join(folderPath, "_final", record.id);
  const problems: string[] = [];
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return { id: record.id, problems: ["dossier _final manquant (non généré ?)"] };
  }
  const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

  const has = (pred: (f: string) => boolean) => pdfs.some(pred);
  if (!has((f) => f.startsWith("Dossier IA"))) problems.push("pièce manquante : Dossier IA");
  if (!has((f) => f.startsWith("Bac") || f.startsWith("BREVET"))) problems.push("pièce manquante : bac");
  if (!has((f) => f.startsWith("Identité"))) problems.push("pièce manquante : identité");
  if (!has((f) => f.startsWith("BTS"))) problems.push("pièce manquante : BTS");

  for (const f of pdfs) {
    try {
      const n = await pdfPageCount(path.join(dir, f));
      if (n === 0) problems.push(`${f} : 0 page`);
      if (f.startsWith("Identité")) {
        const expected = f.includes("passeport") || f.includes("recto seul") ? 1 : 2;
        if (n < expected) problems.push(`${f} : ${n} page(s), attendu ≥ ${expected}`);
      }
    } catch (e) {
      problems.push(`${f} : illisible (${e instanceof Error ? e.message : "erreur"})`);
    }
  }

  const iaName = pdfs.find((f) => f.startsWith("Dossier IA"));
  if (iaName) {
    try {
      const doc = await PDFDocument.load(await fs.readFile(path.join(dir, iaName)));
      const form = doc.getForm();
      for (const { field, get } of TEXT_CHECKS) {
        const expected = get(record);
        if (!expected) continue;
        let actual = "";
        try {
          actual = form.getTextField(field).getText() ?? "";
        } catch {
          continue;
        }
        if (actual.trim() !== expected.trim()) {
          problems.push(`champ « ${field} » : "${actual}" ≠ attendu "${expected}"`);
        }
      }
      try {
        if (form.getRadioGroup("Masculin").getSelected() !== record.sexe) {
          problems.push("sexe non coché conformément à la fiche");
        }
      } catch { /* groupe absent */ }
    } catch (e) {
      problems.push(`Dossier IA illisible : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return { id: record.id, problems };
}

export async function verifyDossiers(folderPath: string, students: StudentRecord[]) {
  const issues: VerifyIssue[] = [];
  for (const r of students) {
    const issue = await verifyStudent(folderPath, r);
    if (issue.problems.length) issues.push(issue);
  }
  return { ok: issues.length === 0, checked: students.length, issues };
}
