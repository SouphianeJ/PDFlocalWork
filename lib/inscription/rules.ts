/**
 * Règles métier PURES du pipeline d'inscription (aucune dépendance Node/PDF).
 * Portées depuis les scripts Python (construire_donnees.py, 01_extraire_tables.py).
 * Couvertes par tests/inscription-rules.test.ts.
 */

export const MONTHS_FR: Record<string, string> = {
  "janv.": "01", janvier: "01", "févr.": "02", février: "02", fevrier: "02",
  mars: "03", "avr.": "04", avril: "04", mai: "05", juin: "06",
  "juil.": "07", juillet: "07", août: "08", aout: "08", "sept.": "09",
  septembre: "09", "oct.": "10", octobre: "10", "nov.": "11", novembre: "11",
  "déc.": "12", décembre: "12", decembre: "12",
};

export type FrenchDate = { jj: string; mm: string; aaaa: string };

/** "25 août 2005" -> { jj:"25", mm:"08", aaaa:"2005" } ; null si non reconnu. */
export function parseFrenchDate(input: string): FrenchDate | null {
  const m = input.trim().match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS_FR[m[2].toLowerCase()];
  if (!mm) return null;
  return { jj: m[1].padStart(2, "0"), mm, aaaa: m[3] };
}

/** Première ligne non vide d'une valeur multi-ligne (gère les seconds responsables). */
export function firstLine(value: string): string {
  return (value || "").split("\n")[0].trim();
}

/** Mention déduite d'une moyenne /20 (barème Éducation nationale). "SANS" si admis sans mention. */
export function mentionFromMoyenne(moyenne: number): string {
  if (moyenne >= 16) return "TRÈS BIEN";
  if (moyenne >= 14) return "BIEN";
  if (moyenne >= 12) return "ASSEZ BIEN";
  if (moyenne >= 10) return "SANS";
  return "";
}

/** Code établissement RNE (ex "0383208F") -> département ("38"). */
export function codeToDepartment(code: string): string {
  return /^\d{3}/.test(code) ? String(parseInt(code.slice(0, 3), 10)) : "";
}

/** Année d'entrée dans l'enseignement supérieur = session du BTS − 2. */
export function supEntryYear(btsSession: string): string {
  const y = parseInt(btsSession, 10);
  return Number.isFinite(y) ? String(y - 2) : "";
}

const BTS_SPECIALITIES: Record<string, string> = {
  "management commercial opérationnel": "MCO",
  "négociation et digitalisation de la relation client": "NDRC",
  communication: "COMMUNICATION",
  "gestion de la pme": "GESTION DE LA PME",
};

/** Normalise un libellé de spécialité BTS vers son sigle, sinon renvoie le libellé tel quel. */
export function normalizeBtsSpecialty(label: string): string {
  return BTS_SPECIALITIES[label.trim().toLowerCase()] ?? label.trim();
}
