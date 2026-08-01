// src/components/Dashboard.jsx
import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { 
  Skull, 
  Activity, 
  Server, 
  Zap, 
  Target,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

function StatCard({ label, value, sub, color = 'text-white', icon }) {
  return (
    <div className="card flex items-start gap-4">
      {icon && (
        <div className="text-2xl mt-0.5">{icon}</div>
      )}
      <div>
        <p className={`text-3xl font-bold ${color}`}>{value ?? '—'}</p>
        <p className="text-slate-300 text-sm font-medium mt-0.5">{label}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SeverityBar({ breakdown }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-slate-600 text-sm">No vulnerability data</p>;
  const levels = [
    { k: 'critical', color: 'bg-red-500', label: 'Critical' },
    { k: 'high', color: 'bg-orange-500', label: 'High' },
    { k: 'medium', color: 'bg-yellow-500', label: 'Medium' },
    { k: 'low', color: 'bg-green-500', label: 'Low' },
    { k: 'informational', color: 'bg-slate-500', label: 'Info' },
  ];
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {levels.map(({ k, color }) => {
          const pct = ((breakdown[k] || 0) / total) * 100;
          return pct > 0 ? (
            <div key={k} className={`${color} transition-all`} style={{ width: `${pct}%` }} title={`${k}: ${breakdown[k]}`} />
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {levels.map(({ k, color, label }) => (
          breakdown[k] > 0 && (
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-slate-400">{label}: <strong className="text-slate-200">{breakdown[k]}</strong></span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [threats, setThreats] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [combatMode, setCombatMode] = useState(false);
  const [showAICopilot, setShowAICopilot] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [s, t, h, th, f] = await Promise.all([
        api.getDashboardSummary(),
        api.getTrendData(30),
        api.getRiskHeatmap(),
        api.getThreatIntelSummary(),
        api.getRiskForecast(),
      ]);
      // Normalize response data (handle case where it's wrapped in ApiResponse)
      setSummary(s.data || s);
      setTrend(t.data || t);
      setHeatmap(h.data || h);
      setThreats(th.data || th);
      setForecast(f.data || f);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleCombat = () => {
    setCombatMode(!combatMode);
    if (!combatMode) {
      toast('COMBAT MODE ENGAGED. Uplink Secured.', { 
        icon: '💀', 
        style: { background: '#020617', color: '#fff', border: '1px solid #ef4444' } 
      });
    } else {
      toast('Returning to Standby.', { icon: '🛡️' });
    }
  };

  async function handleFetchThreatIntel() {
    setLoading(true);
    setError(null);
    try {
      await api.fetchThreatIntel();
      await api.calculateRisk();
      toast.success('Global Thread Intelligence Synchronized', { icon: '🛰️' });
      await loadAll();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  async function handleTakeSnapshot() {
    try {
      const res = await api.takePostureSnapshot();
      toast.success(`Mission Snapshot Saved: Risk ${res.data.score.toFixed(1)}`, {
        icon: '📸',
        style: { background: '#0f172a', color: '#fff' }
      });
      await loadAll();
    } catch (e) {
      toast.error(`Snapshot Failed: ${e.message}`);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-slate-500 scan-pulse">
      Loading dashboard…
    </div>
  );

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-red-400 mb-3">⚠ Failed to load dashboard</p>
      <p className="text-slate-500 text-sm mb-4">{error}</p>
      <button onClick={loadAll} className="btn-ghost text-sm">Retry</button>
    </div>
  );

  const riskColor =
    (summary?.enterprise_risk_score ?? 0) >= 75 ? 'text-red-400' :
      (summary?.enterprise_risk_score ?? 0) >= 50 ? 'text-orange-400' :
        (summary?.enterprise_risk_score ?? 0) >= 25 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <div className={`space-y-6 transition-colors duration-1000 p-4 ${combatMode ? 'bg-[#020617] text-white min-h-screen' : ''}`}>
      {/* 🚀 FORCE-SYNC UPLINK BANNER */}
      <div className="bg-indigo-600/20 border border-indigo-500/50 rounded-xl p-3 flex items-center justify-between mb-2 animate-pulse">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-indigo-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Global Intelligence Uplink</p>
            <p className="text-xs font-bold text-white">AUTONOMOUS MISSION CONTROL ACTIVE - REAL-TIME FEEDS ATTACHED</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Connected @ Port 3001</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-bold ${combatMode ? 'text-red-500 uppercase tracking-tighter' : 'text-white'}`}>
            {combatMode ? 'Tactical Command Center' : 'Dashboard'}
          </h2>
          <p className="text-slate-400 text-sm">
            {combatMode ? 'Combat Mode Active - Secured Uplink Established' : 'Enterprise risk posture overview'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleCombat}
            className={`group px-4 py-2 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
              combatMode 
                ? "bg-red-500/20 border-red-500/50 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]" 
                : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-red-500 hover:text-white hover:border-red-500"
            }`}
          >
            <Skull className={`w-4 h-4 transition-transform ${!combatMode && "group-hover:scale-125"}`} />
            {combatMode ? "TERMINATE COMBAT MODE" : "ENGAGE COMBAT MODE"}
          </button>
          <button
            onClick={handleTakeSnapshot}
            className="group px-4 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            SAVE SNAPSHOT
          </button>
          <button onClick={loadAll} className="btn-ghost text-sm">↻ Refresh</button>
        </div>
      </div>

      {combatMode ? (
        /* ── COMBAT MODE UI ── */
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-12 gap-6 animate-in fade-in zoom-in duration-500"
        >
          {/* Tactical View */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-900 border border-red-500/30 rounded-xl">
                <p className="text-[10px] font-mono text-red-500 uppercase mb-1">Risk Index</p>
                <p className="text-3xl font-black text-white">{summary?.enterprise_risk_score?.toFixed(1) ?? '0.0'}</p>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">Host Presence</p>
                <p className="text-3xl font-black text-white">{summary?.total_assets ?? '0'}</p>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">Vector Count</p>
                <p className="text-3xl font-black text-white">{summary?.total_vulnerabilities ?? '0'}</p>
              </div>
              <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-xl">
                <p className="text-[10px] font-mono text-indigo-400 uppercase mb-1">Scan Velocity</p>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
                  <span className="text-xl font-bold italic">1.2x/sec</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Tactical Threat Spectrum</h3>
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-center">
                  <p className="text-[8px] text-red-500 font-bold uppercase mb-1">Critical</p>
                  <p className="text-xl font-black text-white">{summary?.severity_breakdown?.critical || 0}</p>
                </div>
                <div className="p-3 bg-orange-950/20 border border-orange-500/30 rounded-lg text-center">
                  <p className="text-[8px] text-orange-500 font-bold uppercase mb-1">High</p>
                  <p className="text-xl font-black text-white">{summary?.severity_breakdown?.high || 0}</p>
                </div>
                <div className="p-3 bg-yellow-950/20 border border-yellow-500/30 rounded-lg text-center">
                  <p className="text-[8px] text-yellow-500 font-bold uppercase mb-1">Medium</p>
                  <p className="text-xl font-black text-white">{summary?.severity_breakdown?.medium || 0}</p>
                </div>
                <div className="p-3 bg-green-950/20 border border-green-500/30 rounded-lg text-center">
                  <p className="text-[8px] text-green-500 font-bold uppercase mb-1">Low</p>
                  <p className="text-xl font-black text-white">{summary?.severity_breakdown?.low || 0}</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Forecast (7D Logic)</h3>
              <div className="h-32 w-full bg-slate-950/50 rounded-xl border border-slate-800/50 flex flex-col items-center justify-center p-4">
                <div className="flex gap-3 items-end h-full">
                  {(forecast?.forecast || forecast)?.slice(0, 10).map((p, i) => (
                    <div key={i} className="text-center group relative">
                      <div className="h-16 w-4 bg-slate-800 rounded-t-lg relative flex items-end justify-center overflow-hidden">
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${p.score}%` }}
                          className="w-full bg-red-500/50" 
                        ></motion.div>
                      </div>
                      <p className="text-[7px] font-bold text-slate-500 mt-1">{i+1}D</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Top Targets Exposure</h3>
              <div className="space-y-3">
                {summary?.top_risky_assets?.slice(0, 4).map((asset, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Server className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-mono text-white">{asset.ip}</span>
                    </div>
                    <span className="text-red-500 font-black">{asset.score?.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Intelligence Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-3 h-3" /> Signal Intelligence
              </h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {threats?.map((t, i) => (
                  <div key={i} className="p-3 border-l-2 border-red-500 bg-red-500/5 space-y-2 rounded-r-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-red-500 font-mono italic">{t.ip}</span>
                      <span className="text-[8px] bg-red-500/20 px-1 rounded text-red-400 uppercase">{t.country || 'INT'}</span>
                    </div>
                    
                    {/* Real Adversary Signals - Proof of Intel */}
                    <div className="flex flex-wrap gap-1">
                      {t.adversaries?.map((adv, idx) => (
                        <span key={idx} className="bg-red-600 text-[8px] text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">
                          {adv}
                        </span>
                      ))}
                      {t.otx_tags?.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="text-[8px] border border-white/10 text-slate-400 px-1 rounded">
                          #{tag.toLowerCase()}
                        </span>
                      ))}
                      {!t.adversaries?.length && !t.otx_tags?.length && (
                        <span className="text-[8px] text-slate-500 italic italic">Scanning Pulsar Signatures...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setShowAICopilot(true)}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transition-all uppercase text-[10px] flex items-center justify-center gap-2"
              >
                <Target className="w-3 h-3" /> Initiate AI Context Link
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ── STANDARD VIEW (USER PROVIDED DESIGN) ── */
        <div className="space-y-6">
          {/* ── KPI Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Enterprise Risk"
              value={`${summary?.enterprise_risk_score?.toFixed(1) ?? 0}/100`}
              color={riskColor}
              icon="🎯"
            />
            <StatCard
              label="Total Assets"
              value={summary?.total_assets ?? 0}
              sub={`${summary?.active_assets ?? 0} active`}
              color="text-cyan-400"
              icon="🖥"
            />
            <StatCard
              label="Vulnerabilities"
              value={summary?.total_vulnerabilities ?? 0}
              sub={`${summary?.exploitable_vulnerabilities ?? 0} exploitable`}
              color="text-orange-400"
              icon="🔓"
            />
            <StatCard
              label="Threat Intel"
              value={threats.length}
              sub="IPs with intelligence"
              color="text-purple-400"
              icon="🌐"
            />
          </div>

          {/* ── Vuln severity + Criticality ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                Vulnerability Severity
              </h3>
              <SeverityBar breakdown={summary?.severity_breakdown || {}} />
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                Asset Criticality
              </h3>
              <div className="flex flex-wrap gap-4">
                {[
                  { k: 'critical', color: 'text-red-400', bg: 'bg-red-900/30' },
                  { k: 'high', color: 'text-orange-400', bg: 'bg-orange-900/30' },
                  { k: 'medium', color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
                  { k: 'low', color: 'text-green-400', bg: 'bg-green-900/30' },
                ].map(({ k, color, bg }) => (
                  <div key={k} className={`flex-1 min-w-[80px] ${bg} rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-bold ${color}`}>
                      {summary?.criticality_breakdown?.[k] ?? 0}
                    </p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">{k}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Trend Chart ── */}
          {trend?.data?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                Risk Score Trend (30 days)
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d47" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e2d47', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8', fontSize: 12 }}
                    itemStyle={{ color: '#22d3ee' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="enterprise_risk_score"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                    name="Risk Score"
                  />
                  <Line
                    type="monotone"
                    dataKey="total_vulnerabilities"
                    stroke="#f97316"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 2"
                    name="Vulnerabilities"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Top Risky Assets ── */}
          {summary?.top_risky_assets?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                Top Risky Assets
              </h3>
              <div className="space-y-3">
                {summary.top_risky_assets.map((a) => {
                  const pct = Math.min(100, a.score);
                  const barColor =
                    pct >= 75 ? 'bg-red-500' :
                      pct >= 50 ? 'bg-orange-500' :
                        pct >= 25 ? 'bg-yellow-500' : 'bg-green-500';
                  return (
                    <div key={a.asset_id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-cyan-400">{a.ip}</span>
                          {a.hostname && <span className="text-slate-500 text-xs">{a.hostname}</span>}
                          <span className={`badge-${a.criticality}`}>{a.criticality}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-200">{pct.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 bg-[#1e2d47] rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Risk Heatmap Grid ── */}
          {heatmap?.heatmap?.length >= 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Risk Landscape Heatmap
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Likelihood (Threat Intel) vs Impact (Vulnerability Score)</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Low</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Critical</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-2">
                {/* Y-Axis Label */}
                <div className="col-span-1 flex flex-col justify-between py-4 pr-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase [writing-mode:vertical-lr] rotate-180 self-center">Impact</span>
                  {[5, 4, 3, 2, 1].map(n => (
                    <span key={n} className="text-[10px] font-bold text-slate-500 text-right">{n}</span>
                  ))}
                  <div className="h-4" />
                </div>

                {/* Grid */}
                <div className="col-span-5 grid grid-cols-5 gap-2">
                  {[4, 3, 2, 1, 0].map(row => (
                    [0, 1, 2, 3, 4].map(col => {
                      const assetsInCell = heatmap.heatmap.filter(a => {
                        const x = Math.min(4, Math.floor(a.likelihood * 5));
                        const y = Math.min(4, Math.floor(a.impact * 5));
                        return x === col && y === row;
                      });

                      const intensity = (row + col) / 8;
                      const cellColor = 
                        intensity > 0.8 ? 'bg-red-500/30 border-red-500/50' :
                        intensity > 0.5 ? 'bg-orange-500/20 border-orange-500/40' :
                        intensity > 0.3 ? 'bg-yellow-500/10 border-yellow-500/30' : 
                        'bg-emerald-500/5 border-emerald-500/20';

                      return (
                        <div 
                          key={`${row}-${col}`} 
                          className={`aspect-square rounded-lg border flex flex-wrap content-start p-1 gap-1 transition-all hover:bg-white/5 relative group ${cellColor}`}
                        >
                          {assetsInCell.map((a, i) => (
                            <div 
                              key={i}
                              className="w-2 h-2 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.5)] cursor-help"
                              title={`${a.ip} (${a.hostname || 'No Hostname'})\nLikelihood: ${a.likelihood}\nImpact: ${a.impact}`}
                            />
                          ))}
                          <div className="absolute inset-0 bg-slate-900/90 hidden group-hover:flex items-center justify-center rounded-lg z-10 p-2 text-center">
                            <span className="text-[9px] font-black uppercase text-slate-200">
                              {assetsInCell.length} Assets
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ))}
                  {/* X-Axis Labels */}
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n} className="flex justify-center">
                      <span className="text-[10px] font-bold text-slate-500 mt-1">{n}</span>
                    </div>
                  ))}
                </div>
                <div className="col-start-2 col-span-5 text-center mt-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Likelihood</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Threat Intel ── */}
          {threats.length >= 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Top Threat Intelligence
                </h3>
                <button
                  onClick={handleFetchThreatIntel}
                  className="text-xs font-mono font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded transition-colors"
                >
                  Fetch / Update Threat Intel
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[#1e2d47]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0a1628] text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left py-2.5 px-4">IP</th>
                      <th className="text-left py-2.5 px-4">Hostname</th>
                      <th className="text-left py-2.5 px-4">Score</th>
                      <th className="text-left py-2.5 px-4">Abuse Confidence</th>
                      <th className="text-left py-2.5 px-4">OTX Pulses</th>
                      <th className="text-left py-2.5 px-4">Country</th>
                      <th className="text-left py-2.5 px-4">TOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threats.map((t, i) => (
                      <tr key={i} className="border-t border-[#1e2d47] hover:bg-[#0d1b2e]">
                        <td className="py-2.5 px-4 font-mono text-cyan-400">{t.ip}</td>
                        <td className="py-2.5 px-4 text-slate-400">{t.hostname || '—'}</td>
                        <td className="py-2.5 px-4">
                          <span className={
                            t.composite_score >= 75 ? 'text-red-400 font-bold' :
                              t.composite_score >= 50 ? 'text-orange-400 font-bold' : 'text-yellow-400'
                          }>
                            {t.composite_score.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{t.abuse_confidence ?? '—'}%</td>
                        <td className="py-2.5 px-4 text-slate-300">{t.otx_pulses}</td>
                        <td className="py-2.5 px-4 text-slate-400">{t.country || '—'}</td>
                        <td className="py-2.5 px-4">{t.is_tor ? <span className="text-red-400">Yes</span> : <span className="text-slate-600">No</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Elements (Always shown) */}
      <AnimatePresence>
        {showAICopilot && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="w-96 fixed right-0 top-0 bottom-0 z-50 p-4 bg-slate-900/90 backdrop-blur-xl border-l border-slate-800 shadow-2xl"
          >
             <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
               <h3 className="text-sm font-black uppercase text-indigo-400">Tactical AI Copilot</h3>
               <button onClick={() => setShowAICopilot(false)} className="text-slate-500 hover:text-white">✕</button>
             </div>
             <div className="flex flex-col h-[calc(100%-80px)] justify-center items-center text-slate-500 italic text-sm">
                AI Pipeline connection established. Ready for context queries.
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showAICopilot && (
        <button
          onClick={() => setShowAICopilot(true)}
          className={`fixed bottom-8 right-8 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl z-40 transition-all ${
            combatMode ? "bg-red-600 text-white" : "bg-indigo-600 text-white"
          }`}
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
