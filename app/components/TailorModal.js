"use client";

import { useEffect, useState } from "react";

async function downloadAsDocx(text, filename) {
  const { Document, Packer, Paragraph } = await import("docx");
  const paragraphs = text
    .split("\n")
    .map((line) => new Paragraph({ text: line }));

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TailorModal({ job, onClose }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${encodeURIComponent(job.id)}/tailor-resume`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to tailor resume");
        setText(data.tailored);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, [job.id]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const filename = `Resume - ${job.company} - ${job.title}.docx`.replace(/[/\\]/g, "-");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tailored resume — {job.title} @ {job.company}</h2>
          <button className="btn subtle" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {status === "loading" && <p className="empty-state">Tailoring your resume…</p>}
          {status === "error" && <p className="error-banner">{error}</p>}
          {status === "ready" && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </div>
        {status === "ready" && (
          <div className="modal-footer">
            <button className="btn" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
            <button className="btn primary" onClick={() => downloadAsDocx(text, filename)}>
              Download .docx
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
