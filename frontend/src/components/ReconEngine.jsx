// src/components/ReconEngine.jsx
import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { cn } from '../utils/cn';
import { 
  Shield, 
  Search, 
  Activity, 
  Globe, 
  Cpu, 
  ChevronRight, 
  Zap, 
  RefreshCw, 
  Play,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Server,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const NMAP_PRESETS = [
  { label: 'Quick Scan', flags: '-sV -T4 --open' },
  { label: 'OS Detect', flags: '-sV -O -T4 --open' },
  { label: 'Stealth', flags: '-sS -T2 --open' },
  { label: 'Full Ports', flags: '-sV -p- -T4 --open' },
  { label: 'Ping Only', flags: '-sn' },
];

function CritBadge({ level }) {
  const variants = {
    critical: 'bg-status-critical/10 text-status-critical border-status-critical/20',
    high: 'bg-status-high/10 text-status-high border-status-high/20',
    medium: 'bg-status-medium/10 text-status-medium border-status-medium/20',
    low: 'bg-status-safe/10 text-status-safe border-status-safe/20',
  };
  
  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border",
      variants[level?.toLowerCase()] || 'bg-muted text-muted-foreground border-border'
    )}>
      {level}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-1.5 h-1.5 rounded-full animate-pulse",
        status === 'active' ? "bg-status-safe shadow-[0_0_8px_rgba(22,163,74,0.5)]" : "bg-muted-foreground opacity-30"
      )} />
      <span className={cn(
        "text-[10px] font-black uppercase tracking-widest",
        status === 'active' ? "text-status-safe" : "text-muted-foreground"
      )}>
        {status}
      </span>
    </div>
  );
}

function AssetRow({ asset, onSelect }) {
  const ports = Array.isArray(asset.open_ports) ? asset.open_ports : [];
  
  const renderPort = (p) => {
    if (typeof p === 'object' && p !== null) {
      return `${p.port || p.number || '?'}/${p.protocol || '?'}`;
    }
    return p;
  };

  return (
    <tr
      className="border-b border-border/50 hover:bg-indigo-brand-500/5 cursor-pointer transition-colors group"
      onClick={() => onSelect(asset)}
    >
      <td className="py-4 px-4">
        <span className="font-mono font-bold text-indigo-brand-500 text-sm group-hover:text-indigo-brand-400 transition-colors">
          {asset.ip_address}
        </span>
      </td>
      <td className="py-4 px-4 text-foreground font-medium text-sm max-w-[160px] truncate">
        {asset.hostname || <span className="text-muted-foreground/40 italic">—</span>}
      </td>
      <td className="py-4 px-4 text-muted-foreground text-[11px] font-bold uppercase tracking-tight max-w-[180px] truncate">
        {asset.os_detected || <span className="text-muted-foreground/40 italic text-[10px]">Unknown Platform</span>}
      </td>
      <td className="py-4 px-4">
        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
          {ports.slice(0, 4).map((p, i) => (
            <span
              key={i}
              className="text-[10px] font-mono bg-muted border border-border text-muted-foreground px-1.5 py-0.5 rounded font-bold"
              title={typeof p === 'object' && p !== null ? `${p.service || ''} ${p.product || ''} ${p.version || ''}`.trim() : ''}
            >
              {renderPort(p)}
            </span>
          ))}
          {ports.length > 4 && (
            <span className="text-[10px] font-black text-indigo-brand-500">+{ports.length - 4}</span>
          )}
          {ports.length === 0 && <span className="text-muted-foreground/30 text-[10px] font-bold italic uppercase tracking-widest">None Active</span>}
        </div>
      </td>
      <td className="py-4 px-4"><CritBadge level={asset.criticality} /></td>
      <td className="py-4 px-4"><StatusBadge status={asset.status} /></td>
      <td className="py-4 px-4 text-muted-foreground text-[10px] font-bold whitespace-nowrap">
        {asset.last_seen ? new Date(asset.last_seen).toLocaleDateString() : '—'}
      </td>
    </tr>
  );
}

function AssetDetailPanel({ asset, onClose, onStartScan }) {
  if (!asset) return null;
  const ports = Array.isArray(asset.open_ports) ? asset.open_ports : [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 relative shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-brand-500/10 border border-indigo-brand-500/20 flex items-center justify-center">
            <Server className="w-6 h-6 text-indigo-brand-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground tracking-tight">{asset.ip_address}</h3>
            <p className="text-muted-foreground text-xs font-black uppercase tracking-widest mt-0.5">{asset.hostname || 'UNDEFINED_NODE'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            ['IP_ADDR', asset.ip_address],
            ['ID_TAG', asset.mac_address || '—'],
            ['PLATFORM', asset.os_detected || 'Unknown'],
            ['PRIORITY', asset.criticality || 'Medium'],
          ].map(([label, val]) => (
            <div key={label} className="p-3 bg-accent/50 rounded-xl border border-border">
              <p className="text-[9px] font-black text-muted-foreground mb-1 tracking-widest">{label}</p>
              <p className="text-xs text-foreground font-mono font-bold truncate">{val}</p>
            </div>
          ))}
        </div>

        {ports.length > 0 && (
          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-2 text-xs font-black text-muted-foreground uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5" />
              Exposed Surface Area ({ports.length} Targets)
            </div>
            
            <div className="rounded-xl overflow-hidden border border-border bg-background/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest border-b border-border">
                    <th className="text-left py-3 px-4">Port</th>
                    <th className="text-left py-3 px-4">Protocol</th>
                    <th className="text-left py-3 px-4">Service</th>
                    <th className="text-left py-3 px-4">Version Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {ports.map((p, idx) => (
                    <tr key={idx} className="hover:bg-indigo-brand-500/5 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-brand-500">
                        {typeof p === 'object' && p !== null ? (p.port || p.number || '?') : p}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground font-black uppercase tracking-tighter">
                        {typeof p === 'object' && p !== null ? (p.protocol || 'TCP') : 'TCP'}
                      </td>
                      <td className="py-3 px-4 text-foreground font-bold">{typeof p === 'object' && p !== null ? (p.service || '—') : '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground text-[10px] font-bold">
                        {typeof p === 'object' && p !== null ? ([p.product, p.version].filter(Boolean).join(' ') || '—') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-8">
          {asset.tags?.length > 0 && asset.tags.map((t) => (
            <span key={t} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-muted border border-border text-muted-foreground rounded-md">
              {t}
            </span>
          ))}
        </div>

        <div className="pt-6 border-t border-border flex gap-4">
          <button
            onClick={() => onStartScan(asset.ip_address)}
            className="flex-1 h-12 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-black text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-brand-600/20 active:scale-[0.98] group"
          >
            <Shield className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            Deploy Intelligence Scan
          </button>
          <button 
            onClick={onClose}
            className="px-6 h-12 bg-accent hover:bg-accent/80 border border-border text-foreground font-black text-xs uppercase tracking-widest rounded-xl transition-all"
          >
            Terminal Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReconEngine() {
  const [target, setTarget] = useState('');
  const [flags, setFlags] = useState('-sV -O -T4 --open');
  const [scanning, setScanning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [filterCrit, setFilterCrit] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [vulnScanning, setVulnScanning] = useState(false);
  const logEndRef = useRef(null);
  const pollRef = useRef(null);
  const [health, setHealth] = useState({ nmap: {}, kali_ssh: {} });

  useEffect(() => { 
    loadAssets();
    checkHealth();
  }, []);

  async function checkHealth() {
    try {
      const res = await api.getScannerHealth();
      setHealth(res);
    } catch (e) {
      console.error("Health check failed", e);
    }
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const data = await api.getAssets({ limit: 10000 });
      setAssets(data);
    } catch (e) {
      toast.error('Inventory Sync Failure: ' + e.message);
    } finally {
      setLoadingAssets(false);
    }
  }

  function addLog(type, msg) {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs((prev) => [...prev, { ts, type, msg }]);
  }

  async function handleScan() {
    const t = target.trim();
    if (!t) { 
      toast.error('Target Specification Required');
      return; 
    }

    setScanning(true);
    setResult(null);
    setError(null);
    setLogs([]);

    addLog('info', `Initializing Nmap Intelligence Scan on ${t}`);
    addLog('info', `Applied Heuristics: ${flags || '(defaults)'}`);
    
    let msgIdx = 0;
    const ticker = setInterval(() => {
      const msgs = [
        'Probing network interfaces…',
        'Scanning active ports…',
        'Aggregating service versions…',
        'Analyzing remote node responses…',
      ];
      addLog('scan', msgs[msgIdx % msgs.length]);
      msgIdx++;
    }, 4000);

    try {
      addLog('info', 'Executing deep inspection protocol (60-120s)…');
      const res = await api.discoverAssets(t, flags || undefined);
      clearInterval(ticker);

      addLog('ok', `Intelligence Sync Complete: ${res.data?.new ?? 0} new nodes detected.`);
      setResult(res);
      toast.success(`Success: Found ${res.data?.new ?? 0} new nodes`);
      await loadAssets();
    } catch (e) {
      clearInterval(ticker);
      addLog('err', `Critical Interrupt: ${e.message}`);
      setError(e.message);
      toast.error('Mission Failed: ' + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleStartVulnScan(ip) {
    if (vulnScanning) return;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    setVulnScanning(true);
    setSelectedAsset(null);
    const tid = toast.loading(`Initiating GVM Strike against ${ip}...`);

    try {
      const res = await api.startScan(ip);
      const scanId = res?.data?.scan_id || res?.scan_id;
      
      if (!scanId) throw new Error('No scan hash returned');

      toast.success('GVM Internal Link Established', { id: tid });
      addLog('info', `Deploying vulnerability assessment for ${ip}...`);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await api.checkScanStatus(scanId);
          const dbStatus = (statusRes?.status || '').toLowerCase();
          const progress = String(statusRes?.gvm_live_status?.progress || '0');

          addLog('info', `Scan Progress: ${progress}% [Status: ${dbStatus}]`);

          if (dbStatus === 'completed' || progress === '100') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            addLog('info', 'GVM Intelligence complete — Fetching findings…');
            await api.fetchScanResults(scanId);
            addLog('ok', '✅ Critical Findings Downloaded. View in Vulnerabilities tab.');
            toast.success('Findings Decoded successfully');
            setVulnScanning(false);
          } else if (dbStatus === 'failed') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            addLog('err', 'GVM Subsystem Fault during inspection.');
            setVulnScanning(false);
          }
        } catch (e) {
          addLog('err', `Poll Interrupt: ${e.message}`);
        }
      }, 30000);
    } catch (e) {
      toast.error('Strike Failed: ' + e.message, { id: tid });
      addLog('err', `Handshake Fault: ${e.message}`);
      setVulnScanning(false);
    }
  }

  const filtered = assets.filter((a) => {
    if (filterCrit && a.criticality !== filterCrit) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      return a.ip_address.includes(q) || (a.hostname || '').toLowerCase().includes(q);
    }
    return true;
  });

  function renderHealth() {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-background/50 border border-border rounded-full shadow-sm ml-4">
        <div className="flex items-center gap-1.5 pr-2 border-r border-border">
          <div className={cn("w-1.5 h-1.5 rounded-full", health.nmap?.found ? "bg-status-safe shadow-[0_0_5px_rgba(22,163,74,0.5)]" : "bg-status-critical shadow-[0_0_5px_rgba(220,38,38,0.5)]")} />
          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">NMAP</span>
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <div className={cn("w-1.5 h-1.5 rounded-full", health.kali_ssh?.status === 'reachable' ? "bg-status-safe shadow-[0_0_5px_rgba(22,163,74,0.5)]" : "bg-status-critical shadow-[0_0_5px_rgba(220,38,38,0.5)]")} />
          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">KALI_LINK</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-brand-500/10 rounded-2xl border border-indigo-brand-500/20">
            <Search className="w-6 h-6 text-indigo-brand-500" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center">
              <h2 className="text-xl font-bold text-foreground tracking-tight uppercase italic font-mono">Intelligence Discovery</h2>
              {renderHealth()}
            </div>
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.3em] mt-0.5">Automated Node Reconnaissance Subsystem</p>
          </div>
        </div>
        <button 
           onClick={loadAssets} 
           className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 border border-border text-muted-foreground hover:text-foreground rounded-lg transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", loadingAssets && "animate-spin")} />
          Sync Inventory
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-8">
           <div className="flex items-center gap-2 mb-6">
              <Zap className="w-5 h-5 text-indigo-brand-500" />
              <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Target Reconnaissance</h3>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Network Range (CIDR / IP)</label>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. 192.168.1.0/24"
                  disabled={scanning}
                  className="w-full h-12 bg-background border border-border focus:border-indigo-brand-500 outline-none text-foreground font-mono text-sm px-4 rounded-xl transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Heuristics Flags</label>
                <input
                  type="text"
                  value={flags}
                  onChange={(e) => setFlags(e.target.value)}
                  disabled={scanning}
                  className="w-full h-12 bg-background border border-border focus:border-indigo-brand-500 outline-none text-foreground font-mono text-sm px-4 rounded-xl transition-all"
                />
              </div>
           </div>

           <div className="flex flex-wrap gap-2 mb-8">
              {NMAP_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setFlags(p.flags)}
                  disabled={scanning}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    flags === p.flags
                      ? 'bg-indigo-brand-500/10 border-indigo-brand-500/40 text-indigo-brand-500 shadow-lg'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  {p.label}
                </button>
              ))}
           </div>

           <button
             onClick={handleScan}
             disabled={scanning}
             className="w-full md:w-auto h-12 px-8 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-indigo-brand-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
           >
             {scanning ? (
               <><Loader2 className="w-4 h-4 animate-spin" />Scanning Network Assets...</>
             ) : (
               <><Play className="w-4 h-4" />Initiate Discovery Protocol</>
             )}
           </button>
        </div>

        <div className="glass-card flex flex-col h-full min-h-[400px]">
           <div className="p-4 border-b border-border bg-accent/30 flex items-center justify-between">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Terminal Logs
              </span>
              <div className="flex gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-destructive/50"></div>
                 <div className="w-2 h-2 rounded-full bg-status-medium/50"></div>
                 <div className="w-2 h-2 rounded-full bg-status-safe/50"></div>
              </div>
           </div>
           <div className="flex-1 p-6 font-mono text-[11px] overflow-y-auto space-y-2 bg-background/50">
             {logs.length === 0 ? (
               <div className="text-muted-foreground/30 italic">Awaiting reconnaissance start...</div>
             ) : (
               logs.map((l, i) => (
                 <div key={i} className="flex gap-3 slide-in">
                    <span className="text-muted-foreground/40 shrink-0">{l.ts}</span>
                    <span className={cn(
                      l.type === 'info' ? 'text-indigo-brand-400' :
                      l.type === 'scan' ? 'text-indigo-brand-500' :
                      l.type === 'ok' ? 'text-status-safe' : 'text-status-critical'
                    )}>
                      {l.type === 'ok' ? '✓ ' : l.type === 'err' ? '✗ ' : '» '}
                      {l.msg}
                    </span>
                 </div>
               ))
             )}
             <div ref={logEndRef} />
           </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-4">
           <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Inventory Management ({filtered.length} Targets)</h3>
           <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="ID Lookup..."
                  className="h-9 w-44 bg-background border border-border rounded-lg pl-9 pr-3 text-[10px] focus:outline-none focus:ring-2 focus:ring-indigo-brand-500/20 transition-all font-bold uppercase tracking-widest"
                />
              </div>
              <select
                value={filterCrit}
                onChange={(e) => setFilterCrit(e.target.value)}
                className="h-9 bg-background border border-border rounded-lg px-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest focus:outline-none"
              >
                <option value="">Priority: ANY</option>
                <option value="critical">Critical Only</option>
                <option value="high">High Stress</option>
                <option value="medium">Medium Node</option>
                <option value="low">Standard</option>
              </select>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-accent/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest border-b border-border">
                <th className="py-4 px-4 whitespace-nowrap">IP_ADDR</th>
                <th className="py-4 px-4 whitespace-nowrap">HOSTNAME</th>
                <th className="py-4 px-4 whitespace-nowrap">PLATFORM</th>
                <th className="py-4 px-4 whitespace-nowrap">SURFACE_AREA</th>
                <th className="py-4 px-4 whitespace-nowrap">PRIORITY</th>
                <th className="py-4 px-4 whitespace-nowrap">LINK_STATUS</th>
                <th className="py-4 px-4 whitespace-nowrap">DISCOVERED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.map((a) => (
                <AssetRow key={a.id} asset={a} onSelect={setSelectedAsset} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-muted-foreground/30 font-black uppercase tracking-widest italic">Inventory Empty</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedAsset && (
          <AssetDetailPanel
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
            onStartScan={handleStartVulnScan}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default ReconEngine;