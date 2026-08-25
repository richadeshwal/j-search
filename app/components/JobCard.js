"use client";

function formatSalary(job) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency || "";
  const fmt = (n) => `${Math.round(n / 1000)}k`;
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax) {
    return `${currency} ${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`.trim();
  }
  const single = job.salaryMax ?? job.salaryMin;
  return `${currency} ${fmt(single)}`.trim();
}

function timeAgo(iso) {
  if (!iso) return "Unknown date";
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return "Just posted";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobCard({ job, mode, onDiscard, onApply, onUndoApply, onUndoDiscard }) {
  const salary = formatSalary(job);

  return (
    <div className="job-card">
      <div className="job-card-top">
        <div>
          <p className="job-title">{job.title}</p>
          <p className="job-company">{job.company} &middot; {job.location}</p>
        </div>
      </div>

      <div className="badge-row">
        {job.isRemote && <span className="badge good">Remote</span>}
        {job.isGta && <span className="badge">GTA</span>}
        {job.isLikelyHybrid && <span className="badge">Likely hybrid</span>}
        {job.meetsSalaryTarget && <span className="badge good">$150k+</span>}
        {salary && <span className="badge warn">{salary}</span>}
        {job.employmentType && <span className="badge subtle">{job.employmentType}</span>}
        <span className="badge subtle">{job.source}</span>
      </div>

      <div className="job-footer">
        <span className="job-posted">Posted {timeAgo(job.postedAt)}</span>
        <div className="job-actions">
          {job.applyLink && (
            <a className="btn primary" href={job.applyLink} target="_blank" rel="noreferrer">
              View posting
            </a>
          )}
          {mode === "active" && (
            <>
              <button className="btn" onClick={() => onApply(job)}>Mark applied</button>
              <button className="btn discard" onClick={() => onDiscard(job)}>Discard</button>
            </>
          )}
          {mode === "applied" && (
            <button className="btn subtle" onClick={() => onUndoApply(job)}>Undo</button>
          )}
          {mode === "discarded" && (
            <button className="btn subtle" onClick={() => onUndoDiscard(job)}>Restore</button>
          )}
        </div>
      </div>
    </div>
  );
}
