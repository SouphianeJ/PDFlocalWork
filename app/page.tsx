import Link from "next/link";
import { PdfLocalWorkbench } from "@/components/pdf-local-workbench";

export default function Home() {
  return (
    <>
      <Link
        href="/inscription"
        style={{
          position: "fixed", top: 12, right: 16, zIndex: 50,
          background: "var(--accent-soft)", color: "var(--accent-strong)",
          padding: "0.35rem 0.75rem", borderRadius: "var(--radius-sm)",
          fontWeight: 600, fontSize: "0.8rem", border: "1px solid var(--line)",
        }}
      >
        Inscriptions →
      </Link>
      <PdfLocalWorkbench />
    </>
  );
}
