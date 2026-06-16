"use client";

import Link from "next/link";
import { useState } from "react";
import type { GenerateResult, StudentRecord } from "@/lib/inscription/types";

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
const th: React.CSSProperties = {
  textAlign: "left", padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--line)",
  fontSize: "0.78rem", color: "var(--muted)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--line)", fontSize: "0.85rem" };

function confidenceBadge(c: string) {
  const map: Record<string, string> = { haute: "var(--accent)", "à vérifier": "#b8860b", manuel: "#b23b3b" };
  return (
    <span style={{ color: map[c] ?? "var(--muted)", fontWeight: 600, fontSize: "0.75rem" }}>
      {c === "haute" ? "auto" : c}
    </span>
  );
}

export function InscriptionWorkbench() {
  const [folderPath, setFolderPath] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [results, setResults] = useState<GenerateResult[] | null>(null);
  const [status, setStatus] = useState("Indiquez le dossier contenant les exports 360 déjà extraits (un sous-dossier par étudiant).");
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true); setResults(null);
    try {
      const data = await postJson<{ students: StudentRecord[] }>("/api/inscription/analyze", { folderPath });
      setStudents(data.students);
      setStatus(data.students.length ? `${data.students.length} étudiant(s) analysé(s).` : "Aucun étudiant trouvé (sous-dossiers avec Synthèse.pdf attendus).");
    } catch (e) {
      setStatus(`Erreur d'analyse : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const data = await postJson<{ results: GenerateResult[] }>("/api/inscription/generate", { folderPath, students });
      setResults(data.results);
      const errs = data.results.filter((r) => r.error).length;
      setStatus(errs ? `${data.results.length} dossier(s) générés, ${errs} en erreur.` : `${data.results.length} dossier(s) générés dans _final/.`);
    } catch (e) {
      setStatus(`Erreur de génération : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem", display: "grid", gap: "1.25rem" }}>
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
          <input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="C:\\…\\exports"
            style={{ flex: "1 1 320px", padding: "0.55rem 0.75rem", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--panel-strong)" }}
          />
          <button onClick={analyze} disabled={busy || !folderPath} style={{ ...primaryBtn, opacity: busy || !folderPath ? 0.5 : 1 }}>
            {busy ? "…" : "Analyser"}
          </button>
        </div>
        <p style={{ marginTop: "0.6rem", fontSize: "0.82rem", color: "var(--muted)" }}>{status}</p>
      </section>

      {students.length > 0 && (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>Revue ({students.length})</h2>
            <button onClick={generate} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
              Générer les dossiers
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Étudiant", "Né(e)", "INE", "Bac", "Mention", "Établissement bac", "BTS", "Anomalies"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td style={td}>{s.sexe === "F" ? "Mme" : "M."} {s.prenom} {s.nom}</td>
                    <td style={td}>{s.naissanceJJ}/{s.naissanceMM}/{s.naissanceAAAA}</td>
                    <td style={td}>{s.ine || "—"}</td>
                    <td style={td}>{s.bac.annee || "—"} {s.bac.intitule} {confidenceBadge(s.bac.confidence)}</td>
                    <td style={td}>{s.bac.mention || "—"}</td>
                    <td style={td}>{s.bac.etablissement || <span style={{ color: "#b23b3b" }}>inconnu</span>}</td>
                    <td style={td}>{s.bts.session || "—"} {s.bts.specialite} {confidenceBadge(s.bts.confidence)}</td>
                    <td style={{ ...td, color: s.anomalies.length > 1 ? "#b8860b" : "var(--muted)" }}>{s.anomalies.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: "0.6rem", fontSize: "0.78rem", color: "var(--muted)" }}>
            Les champs sans établissement / en « à vérifier » sont à compléter (édition de la grille : phase suivante). La date et la signature restent vides pour l&apos;étudiant.
          </p>
        </section>
      )}

      {results && (
        <section style={card}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Résultat</h2>
          <ul style={{ listStyle: "none", display: "grid", gap: "0.3rem" }}>
            {results.map((r) => (
              <li key={r.id} style={{ fontSize: "0.85rem" }}>
                <strong>{r.id}</strong> — {r.error ? <span style={{ color: "#b23b3b" }}>erreur : {r.error}</span> : `${r.pieces.length} pièces, ${r.anomalies.length} anomalie(s)`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
