"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { GenerateResult, StudentRecord, VerifyResponse } from "@/lib/inscription/types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

const card: React.CSSProperties = {
  background: "var(--panel)", border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)", padding: "1.25rem", boxShadow: "var(--shadow)",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--accent)", color: "#fff", padding: "0.55rem 1.1rem",
  borderRadius: "var(--radius-sm)", fontWeight: 600,
};
const ghostBtn: React.CSSProperties = {
  background: "var(--accent-soft)", color: "var(--accent-strong)",
  padding: "0.35rem 0.7rem", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "0.78rem",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--line)",
  fontSize: "0.78rem", color: "var(--muted)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--line)", fontSize: "0.85rem", verticalAlign: "top" };
const inp: React.CSSProperties = {
  width: "100%", padding: "0.3rem 0.45rem", border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)", background: "var(--panel-strong)", fontSize: "0.82rem",
};

function badge(c: string) {
  const map: Record<string, string> = { haute: "var(--accent)", "à vérifier": "#b8860b", manuel: "#b23b3b" };
  return <span style={{ color: map[c] ?? "var(--muted)", fontWeight: 600, fontSize: "0.72rem" }}>{c === "haute" ? "auto" : c}</span>;
}

type DeepKey = `bac.${keyof StudentRecord["bac"]}` | `bts.${keyof StudentRecord["bts"]}` | keyof StudentRecord;

type OcrRecovery = {
  kind: "bac" | "bts";
  info: (StudentRecord["bac"] | StudentRecord["bts"]) | null;
  anomalies: string[];
  chars: number;
};

function mergeNonEmpty<T extends object>(cur: T, inc: T): T {
  const out = { ...cur };
  for (const [k, v] of Object.entries(inc)) if (v !== "" && v != null) (out as Record<string, unknown>)[k] = v;
  return out;
}

export function InscriptionWorkbench() {
  const [folderPath, setFolderPath] = useState("");
  const [resolvedFolder, setResolvedFolder] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [results, setResults] = useState<GenerateResult[] | null>(null);
  const [report, setReport] = useState<VerifyResponse | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState("Indiquez le dossier des exports 360 déjà extraits (un sous-dossier par étudiant, avec Synthèse.pdf).");
  const [busy, setBusy] = useState(false);

  function update(id: string, key: DeepKey, value: string | boolean) {
    setStudents((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      if (key.startsWith("bac.")) return { ...s, bac: { ...s.bac, [key.slice(4)]: value } };
      if (key.startsWith("bts.")) return { ...s, bts: { ...s.bts, [key.slice(4)]: value } };
      return { ...s, [key]: value };
    }));
  }

  async function analyze() {
    setBusy(true); setResults(null); setReport(null);
    try {
      const data = await postJson<{ folderPath: string; students: StudentRecord[] }>("/api/inscription/analyze", { folderPath });
      setStudents(data.students);
      setResolvedFolder(data.folderPath);
      setStatus(data.students.length ? `${data.students.length} étudiant(s) analysé(s). Corrigez la grille puis générez.` : "Aucun étudiant trouvé (sous-dossiers avec Synthèse.pdf attendus).");
    } catch (e) {
      setStatus(`Erreur d'analyse : ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  async function generate() {
    setBusy(true); setReport(null);
    try {
      const data = await postJson<{ results: GenerateResult[] }>("/api/inscription/generate", { folderPath: resolvedFolder || folderPath, students });
      setResults(data.results);
      const errs = data.results.filter((r) => r.error).length;
      setStatus(errs ? `${data.results.length} dossier(s) générés, ${errs} en erreur.` : `${data.results.length} dossier(s) générés dans _final/.`);
    } catch (e) {
      setStatus(`Erreur de génération : ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true);
    try {
      const data = await postJson<VerifyResponse>("/api/inscription/verify", { folderPath: resolvedFolder || folderPath, students });
      setReport(data);
      setStatus(data.ok ? `Contrôle : ${data.checked}/${data.checked} OK.` : `Contrôle : ${data.issues.length} dossier(s) avec écarts.`);
    } catch (e) {
      setStatus(`Erreur de vérification : ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  async function runOcr(id: string, kind: "bac" | "bts") {
    setBusy(true);
    try {
      const rec = await postJson<OcrRecovery>("/api/inscription/ocr", { folderPath: resolvedFolder || folderPath, id, kind });
      if (!rec.info) {
        setStatus(`OCR ${kind} (${id}) : rien d'exploitable — ${rec.anomalies[0] ?? `${rec.chars} caractères lus`}.`);
        return;
      }
      setStudents((prev) => prev.map((s) => {
        if (s.id !== id) return s;
        return kind === "bac"
          ? { ...s, bac: mergeNonEmpty(s.bac, rec.info as StudentRecord["bac"]) }
          : { ...s, bts: mergeNonEmpty(s.bts, rec.info as StudentRecord["bts"]) };
      }));
      setStatus(`OCR ${kind} (${id}) : ${rec.chars} caractères lus, champs proposés — à relire.`);
    } catch (e) {
      setStatus(`OCR : ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  function previewUrl(id: string, fileName: string) {
    const dir = `${resolvedFolder}/_final/${id}`;
    return `/api/fs/file?folderPath=${encodeURIComponent(dir)}&fileName=${encodeURIComponent(fileName)}`;
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem", display: "grid", gap: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>Dossiers d&apos;inscription CY / ILEPS</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Analyse les exports 360, pré-remplit le formulaire CY et assemble un dossier par étudiant. Tout reste local.
          </p>
        </div>
        <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Outils PDF</Link>
      </header>

      <section style={card}>
        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
          Dossier des exports (chemin local)
        </label>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} placeholder="C:\\…\\exports"
            style={{ ...inp, flex: "1 1 320px", padding: "0.55rem 0.75rem" }} />
          <button onClick={analyze} disabled={busy || !folderPath} style={{ ...primaryBtn, opacity: busy || !folderPath ? 0.5 : 1 }}>
            {busy ? "…" : "Analyser"}
          </button>
        </div>
        <p style={{ marginTop: "0.6rem", fontSize: "0.82rem", color: "var(--muted)" }}>{status}</p>
      </section>

      {students.length > 0 && (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", gap: "0.6rem", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.05rem" }}>Revue ({students.length})</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={generate} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>Générer</button>
              <button onClick={verify} disabled={busy || !results} style={{ ...ghostBtn, opacity: busy || !results ? 0.5 : 1, padding: "0.55rem 1.1rem" }}>Vérifier</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>{["Étudiant", "Né(e)", "Bac", "Mention", "Établissement bac", "BTS", "Anom.", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const open = editId === s.id;
                  const res = results?.find((r) => r.id === s.id);
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td style={td}>{s.sexe === "F" ? "Mme" : "M."} {s.prenom} {s.nom}</td>
                        <td style={td}>{s.naissanceJJ}/{s.naissanceMM}/{s.naissanceAAAA}</td>
                        <td style={td}>{s.bac.annee || "—"} {s.bac.intitule} {badge(s.bac.confidence)}</td>
                        <td style={td}>{s.bac.mention || "—"}</td>
                        <td style={td}>{s.bac.etablissement || <span style={{ color: "#b23b3b" }}>inconnu</span>}</td>
                        <td style={td}>{s.bts.session || "—"} {s.bts.specialite} {badge(s.bts.confidence)}</td>
                        <td style={{ ...td, color: s.anomalies.length > 1 ? "#b8860b" : "var(--muted)" }}>{s.anomalies.length}</td>
                        <td style={td}><button onClick={() => setEditId(open ? null : s.id)} style={ghostBtn}>{open ? "fermer" : "éditer"}</button></td>
                      </tr>
                      {open && (
                        <tr>
                          <td style={{ ...td, background: "var(--accent-soft)" }} colSpan={8}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.6rem" }}>
                              {([
                                ["INE", "ine", s.ine],
                                ["Bac année", "bac.annee", s.bac.annee],
                                ["Bac intitulé", "bac.intitule", s.bac.intitule],
                                ["Bac mention", "bac.mention", s.bac.mention],
                                ["Bac établissement", "bac.etablissement", s.bac.etablissement],
                                ["Bac code étab.", "bac.codeEtablissement", s.bac.codeEtablissement],
                                ["BTS session", "bts.session", s.bts.session],
                                ["BTS spécialité", "bts.specialite", s.bts.specialite],
                                ["BTS établissement", "bts.etablissement", s.bts.etablissement],
                                ["CSP père", "cspPere", s.cspPere],
                                ["CSP mère", "cspMere", s.cspMere],
                              ] as [string, DeepKey, string][]).map(([label, key, val]) => (
                                <label key={key} style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                                  {label}
                                  <input value={val} onChange={(e) => update(s.id, key, e.target.value)} style={inp} />
                                </label>
                              ))}
                              <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.4rem", alignSelf: "end" }}>
                                <input type="checkbox" checked={s.droitImage} onChange={(e) => update(s.id, "droitImage", e.target.checked)} /> Droit à l&apos;image
                              </label>
                            </div>
                            <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                              {s.bac.source !== "texte" && (
                                <button onClick={() => runOcr(s.id, "bac")} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}>Tenter l&apos;OCR du bac</button>
                              )}
                              {s.bts.source !== "texte" && (
                                <button onClick={() => runOcr(s.id, "bts")} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}>Tenter l&apos;OCR du BTS</button>
                              )}
                              {(s.bac.source === "ocr" || s.bts.source === "ocr") && (
                                <span style={{ fontSize: "0.72rem", color: "#b8860b" }}>champs OCR proposés — à relire</span>
                              )}
                            </div>
                            {s.anomalies.length > 0 && (
                              <ul style={{ marginTop: "0.6rem", paddingLeft: "1.1rem", fontSize: "0.78rem", color: "var(--muted)" }}>
                                {s.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            )}
                            {res && !res.error && (
                              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                                {res.pieces.map((p) => (
                                  <a key={p} href={previewUrl(s.id, p)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.78rem", fontWeight: 600 }}>{p}</a>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: "0.6rem", fontSize: "0.78rem", color: "var(--muted)" }}>
            Date et signature laissées vides pour l&apos;étudiant. Modifiez la grille puis régénérez si besoin.
          </p>
        </section>
      )}

      {report && (
        <section style={card}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Contrôle — {report.ok ? <span style={{ color: "var(--accent)" }}>{report.checked}/{report.checked} OK</span> : `${report.issues.length} dossier(s) avec écarts`}
          </h2>
          {report.issues.map((iss) => (
            <div key={iss.id} style={{ fontSize: "0.82rem", marginBottom: "0.4rem" }}>
              <strong>{iss.id}</strong>
              <ul style={{ paddingLeft: "1.1rem", color: "#b23b3b" }}>{iss.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
