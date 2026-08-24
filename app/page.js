"use client";

import { useEffect, useState, useCallback } from "react";
import JobCard from "./components/JobCard";

const TABS = [
  { key: "newJobs", label: "New Jobs", mode: "active" },
  { key: "gtaJobs", label: "Toronto / GTA", mode: "active" },
  { key: "appliedJobs", label: "Applied", mode: "applied" },
  { key: "discardedJobs", label: "Discarded", mode: "discarded" },
];

export default function Home() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("newJobs");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/jobs", { cache: "no-store" });
    const data = await res.json();
    setState(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeFromView = (list, id) => list.filter((j) => j.id !== id);

  const handleDiscard = async (job) => {
    setState((s) => ({
      ...s,
      newJobs: removeFromView(s.newJobs, job.id),
      gtaJobs: removeFromView(s.gtaJobs, job.id),
      discardedJobs: [job, ...s.discardedJobs],
    }));
    await fetch(`/api/jobs/${encodeURIComponent(job.id)}/discard`, { method: "POST" });
  };

  const handleUndoDiscard = async (job) => {
    setState((s) => ({
      ...s,
      discardedJobs: removeFromView(s.discardedJobs, job.id),
      newJobs: [job, ...s.newJobs],
      gtaJobs: job.isGta ? [job, ...s.gtaJobs] : s.gtaJobs,
    }));
    await fetch(`/api/jobs/${encodeURIComponent(job.id)}/discard`, { method: "DELETE" });
  };

  const handleApply = async (job) => {
    const snapshot = { ...job, appliedAt: new Date().toISOString() };
    setState((s) => ({
      ...s,
      newJobs: removeFromView(s.newJobs, job.id),
      gtaJobs: removeFromView(s.gtaJobs, job.id),
      appliedJobs: [snapshot, ...s.appliedJobs],
    }));
    await fetch(`/api/jobs/${encodeURIComponent(job.id)}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
  };

  const handleUndoApply = async (job) => {
    setState((s) => ({
      ...s,
      appliedJobs: removeFromView(s.appliedJobs, job.id),
      newJobs: [job, ...s.newJobs],
      gtaJobs: job.isGta ? [job, ...s.gtaJobs] : s.gtaJobs,
    }));
    await fetch(`/api/jobs/${encodeURIComponent(job.id)}/apply`, { method: "DELETE" });
  };

  const activeTab = TABS.find((t) => t.key === tab);
  const list = state ? state[tab] || [] : [];

  return (
    <div className="container">
      <header className="app-header">
        <h1>AI/ML PM Job Tracker</h1>
        <div className="meta-row">
          <span>
            {state?.generatedAt
              ? `Last refreshed ${new Date(state.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
              : loading
              ? "Loading…"
              : "No data yet — waiting on the first scheduled fetch."}
          </span>
          <button className="refresh-btn" onClick={load}>Refresh</button>
        </div>
      </header>

      {state?.fetchErrors?.length > 0 && (
        <div className="error-banner">
          Some searches failed on the last run: {state.fetchErrors.join(" | ")}
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} {state ? `(${(state[t.key] || []).length})` : ""}
          </button>
        ))}
      </nav>

      <div className="job-list">
        {list.length === 0 && !loading && (
          <p className="empty-state">Nothing here yet.</p>
        )}
        {list.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            mode={activeTab.mode}
            onDiscard={handleDiscard}
            onApply={handleApply}
            onUndoApply={handleUndoApply}
            onUndoDiscard={handleUndoDiscard}
          />
        ))}
      </div>
    </div>
  );
}
