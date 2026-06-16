import { describe, expect, it } from "vitest";
import {
  parseFrenchDate, firstLine, mentionFromMoyenne, codeToDepartment,
  supEntryYear, normalizeBtsSpecialty,
} from "@/lib/inscription/rules";
import { parseSynthese, extraireBac, extraireBts } from "@/lib/server/inscription/extract";

describe("rules", () => {
  it("parses french dates", () => {
    expect(parseFrenchDate("25 août 2005")).toEqual({ jj: "25", mm: "08", aaaa: "2005" });
    expect(parseFrenchDate("5 mars 2003")).toEqual({ jj: "05", mm: "03", aaaa: "2003" });
    expect(parseFrenchDate("nimporte quoi")).toBeNull();
  });

  it("keeps only the first line (second responsable)", () => {
    expect(firstLine("Yann\nValérie")).toBe("Yann");
    expect(firstLine("M.")).toBe("M.");
  });

  it("derives mention from moyenne", () => {
    expect(mentionFromMoyenne(16.2)).toBe("TRÈS BIEN");
    expect(mentionFromMoyenne(14)).toBe("BIEN");
    expect(mentionFromMoyenne(12.01)).toBe("ASSEZ BIEN");
    expect(mentionFromMoyenne(10.96)).toBe("SANS");
    expect(mentionFromMoyenne(9)).toBe("");
  });

  it("maps RNE code to department", () => {
    expect(codeToDepartment("0383208F")).toBe("38");
    expect(codeToDepartment("0731234A")).toBe("73");
    expect(codeToDepartment("xxx")).toBe("");
  });

  it("computes sup entry year = BTS session - 2", () => {
    expect(supEntryYear("2025")).toBe("2023");
    expect(supEntryYear("2024")).toBe("2022");
    expect(supEntryYear("")).toBe("");
  });

  it("normalizes BTS specialty labels", () => {
    expect(normalizeBtsSpecialty("Management commercial opérationnel")).toBe("MCO");
    expect(normalizeBtsSpecialty("Négociation et digitalisation de la relation client")).toBe("NDRC");
    expect(normalizeBtsSpecialty("Communication")).toBe("COMMUNICATION");
    expect(normalizeBtsSpecialty("Autre chose")).toBe("Autre chose");
  });
});

describe("parseSynthese", () => {
  const sample = [
    "Formation",
    "Type de parcours 1ère inscription",
    "État civil",
    "Civilité Mme.",
    "Prénom Pauline",
    "Nom de famille CLAP",
    "Date de naissance 25 août 2005",
    "Adresse",
    "40 IMPASSE DE LA ROSE",
    "38420, DOMENE",
    "Isère",
    "France",
    "E-mail p.clap@philippine-duchesne.fr",
    "INE 081191586DD",
    "Droit à l’image Oui",
  ].join("\n");

  it("extracts labelled values incl. multiline address", () => {
    const s = parseSynthese(sample);
    expect(s["Civilité"]).toBe("Mme.");
    expect(s["Nom de famille"]).toBe("CLAP");
    expect(s["INE"]).toBe("081191586DD");
    expect(s["Adresse"]).toContain("40 IMPASSE DE LA ROSE");
    expect(s["Adresse"]).toContain("38420, DOMENE");
    expect(s["Droit à l’image"]).toBe("Oui");
  });
});

describe("transcripts", () => {
  it("flags a brevet uploaded instead of the bac", () => {
    const { info, anomalies } = extraireBac("ATTESTATION DE RÉUSSITE DIPLÔME NATIONAL DU BREVET");
    expect(info).toBeNull();
    expect(anomalies[0]).toMatch(/BREVET/);
  });

  it("flags anticipated 1ère transcripts", () => {
    const { info } = extraireBac("Baccalauréat général session 2023 année scolaire 2021 - 2022 résultats provisoires");
    expect(info).toBeNull();
  });

  it("extracts a clean technological bac", () => {
    const txt = "Baccalauréat technologique session 2023 STMG\n0383208F LGT PR PHILIPPINE DUCHESNE - CORENC\nMOYENNE FINALE 10.96";
    const { info } = extraireBac(txt);
    expect(info?.annee).toBe("2023");
    expect(info?.intitule).toBe("TECHNOLOGIQUE STMG");
    expect(info?.codeEtablissement).toBe("0383208F");
    expect(info?.departement).toBe("38");
    expect(info?.mention).toBe("SANS");
    expect(info?.confidence).toBe("haute");
  });

  it("detects a lycée bulletin uploaded instead of the BTS transcript", () => {
    const { info, anomalies } = extraireBts("LYCEE ARISTIDE BERGES Bulletin du 2ème semestre");
    expect(info).toBeNull();
    expect(anomalies[0]).toMatch(/bulletin/i);
  });
});
