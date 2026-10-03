"use client";

import { useEffect, useState } from "react";

export default function ResumePage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("loading");
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    fetch("/api/resume")
      .then((r) => r.json())
      .then((data) => {
        setText(data.text || "");
        setStatus("idle");
      });
  }, []);

  const save = async () => {
    setStatus("saving");
    await fetch("/api/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setStatus("idle");
    setSavedAt(new Date());
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Your Resume</h1>
        <p className="meta-row">
          Paste your full resume below (any length). When you tailor a resume for a
          specific job, this is the source of truth — nothing gets added that isn't
          already here.
        </p>
      </header>

      <textarea
        className="resume-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your resume text here..."
        disabled={status === "loading"}
      />

      <div className="job-footer" style={{ marginTop: 16 }}>
        <span className="job-posted">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ""}
        </span>
        <button className="btn primary" onClick={save} disabled={status !== "idle"}>
          {status === "saving" ? "Saving…" : "Save Resume"}
        </button>
      </div>

      <p style={{ marginTop: 24 }}>
        <a className="btn" href="/">← Back to jobs</a>
      </p>
    </div>
  );
}
