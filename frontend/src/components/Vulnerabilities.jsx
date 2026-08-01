// src/components/Vulnerabilities.jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

function SevBadge({ sev }) {
  const cls = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    informational: 'bg-slate-800 text-slate-400 border border-slate-700 text-xs px-2 py-0.5 rounded-full',
  }[sev] || 'badge-medium';
  return <span className={cls}>{sev}</span>;
}

export default function Vulnerabilities() {
  const [vulns, setVulns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterSev, setFilterSev] = useState('');
  const [filterEx, setFilterEx] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    load();
    // Auto-refresh every 60 s so results appear automatically after a scan completes
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getVulnerabilities({ limit: 200 });
      setVulns(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const filtered = vulns.filter((v) => {
    if (filterSev && v.severity !== filterSev) return false;
    if (filterEx === 'yes' && !v.exploit_available) return false;
    if (filterEx === 'no' && v.exploit_available) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!v.name?.toLowerCase().includes(q) &&
        !(v.cve_id || '').toLowerCase().includes(q) &&
        !(v.service || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Vulnerabilities</h2>
          <p className="text-slate-400 text-sm">All detected vulnerabilities across your assets</p>
        </div>
        <button onClick={load} className="btn-ghost text-sm">↻ Refresh</button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search name / CVE / service…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#060910] border border-[#1e2d47] focus:border-cyan-500 outline-none text-slate-200 text-xs font-mono px-3 py-2 rounded-lg placeholder-slate-600 w-56"
        />
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value)}
          className="bg-[#060910] border border-[#1e2d47] text-slate-400 text-xs px-3 py-2 rounded-lg outline-none"
        >
          <option value="">All Severities</option>
          {['critical', 'high', 'medium', 'low', 'informational'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterEx}
          onChange={(e) => setFilterEx(e.target.value)}
          className="bg-[#060910] border border-[#1e2d47] text-slate-400 text-xs px-3 py-2 rounded-lg outline-none"
        >
          <option value="">Exploit: All</option>
          <option value="yes">Exploit Available</option>
          <option value="no">No Exploit</option>
        </select>
        <span className="ml-auto text-xs text-slate-500 self-center">{filtered.length} results</span>
      </div>

      {loading ? (
        <div className="card py-16 text-center text-slate-500 scan-pulse">Loading vulnerabilities…</div>
      ) : error ? (
        <div className="card py-12 text-center">
          <p className="text-red-400 mb-2">⚠ {error}</p>
          <button onClick={load} className="btn-ghost text-sm">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center text-slate-500 text-sm">
          {vulns.length === 0 ? 'No vulnerabilities found. Run a scan first.' : 'No results match your filters.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a1628] text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">CVE</th>
                <th className="text-left py-3 px-4">Severity</th>
                <th className="text-left py-3 px-4">CVSS</th>
                <th className="text-left py-3 px-4">Port / Service</th>
                <th className="text-left py-3 px-4">Exploit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setSelected(v)}
                  className="border-t border-[#1e2d47] hover:bg-[#0d1b2e] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 max-w-xs">
                    <p className="text-slate-200 truncate">{v.name}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-cyan-400 text-xs">
                    {v.cve_id ? (
                      <a href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`} target="_blank" rel="noreferrer" className="hover:underline text-cyan-400">
                        {v.cve_id}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4"><SevBadge sev={v.severity} /></td>
                  <td className="py-3 px-4 text-slate-300">{v.cvss_score ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-400 text-xs font-mono">
                    {[v.port, v.service].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="py-3 px-4">
                    {v.exploit_available
                      ? <span className="text-red-400 font-semibold">Yes</span>
                      : <span className="text-slate-600">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-xl max-h-[80vh] overflow-y-auto slide-in relative">
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white text-xl">✕</button>
            <div className="flex items-center gap-2 mb-4">
              <SevBadge sev={selected.severity} />
              {selected.cve_id && <span className="font-mono text-cyan-400 text-sm">{selected.cve_id}</span>}
            </div>
            <h3 className="font-bold text-white text-lg mb-4">{selected.name}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              {[
                ['CVSS Score', selected.cvss_score ?? '—'],
                ['Port', selected.port ?? '—'],
                ['Service', selected.service ?? '—'],
                ['Exploit', selected.exploit_available ? 'Yes' : 'No'],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-slate-500 mb-0.5">{l}</p>
                  <p className="text-slate-200 font-mono">{v}</p>
                </div>
              ))}
            </div>
            {selected.description && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-slate-300 text-sm leading-relaxed">{selected.description}</p>
              </div>
            )}
            {selected.solution && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Solution</p>
                <p className="text-slate-300 text-sm leading-relaxed">{selected.solution}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}