/** Types partagés du flux d'inscription (utilisables côté serveur ET client). */

export type Confidence = "haute" | "à vérifier" | "manuel";

export type BacInfo = {
  annee: string;
  intitule: string;
  mention: string;
  etablissement: string;
  codeEtablissement: string;
  departement: string;
  confidence: Confidence;
  source: "texte" | "ocr" | "absent";
};

export type BtsInfo = {
  session: string;
  specialite: string;
  etablissement: string;
  departement: string;
  confidence: Confidence;
  source: "texte" | "ocr" | "absent";
};

/** Une fiche étudiant : pré-remplie par /analyze, corrigée dans la grille, consommée par /generate. */
export type StudentRecord = {
  id: string; // nom du sous-dossier (ex "CLAP-Pauline")
  sexe: "F" | "M";
  nom: string;
  prenom: string;
  nomUsage: string;
  autresPrenoms: string;
  naissanceJJ: string;
  naissanceMM: string;
  naissanceAAAA: string;
  villeNaissance: string;
  cpNaissance: string;
  paysNaissance: string;
  nationalite: string;
  adresse: string;
  cp: string;
  ville: string;
  tel: string;
  email: string;
  ine: string;
  anneeSup: string;
  anneeCY: string;
  bac: BacInfo;
  bts: BtsInfo;
  cspPere: string;
  cspMere: string;
  droitImage: boolean;
  aPhoto: boolean;
  aReleveBac: boolean;
  anomalies: string[];
};

export type AnalyzeResponse = {
  folderPath: string;
  students: StudentRecord[];
};

export type GenerateRequest = {
  folderPath: string;
  students: StudentRecord[];
};

export type GenerateResult = {
  id: string;
  pieces: string[];
  anomalies: string[];
  error?: string;
};

export type VerifyIssue = { id: string; problems: string[] };
export type VerifyResponse = { ok: boolean; checked: number; issues: VerifyIssue[] };
