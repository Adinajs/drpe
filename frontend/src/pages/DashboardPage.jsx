import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Server, 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  Search, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  PieChart as PieChartIcon,
  Skull,
  Target,
  Printer,
  Camera
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import { useDashboardData } from '../hooks/useDashboardData';
import { useSearch } from '../context/SearchContext';
import StatCard from '../components/dashboard/StatCard';
import TrendChart from '../components/dashboard/TrendChart';
import RiskHeatmap from '../components/dashboard/RiskHeatmap';
import AIInsightsPanel from '../components/ai/AIInsightsPanel';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { summary, trend, heatmap, threats, forecast, loading, error, refresh } = useDashboardData();
  const { searchTerm } = useSearch();
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [initialAIPrompt, setInitialAIPrompt] = useState(null);
  const [showFlash, setShowFlash] = useState(false);
  const [nextScanTime, setNextScanTime] = useState('--:--:--');

  const filteredScans = (summary?.recent_scans || []).filter(s => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return s.name?.toLowerCase().includes(t) || s.target?.toLowerCase().includes(t);
  });

  const filteredAssets = (summary?.top_risky_assets || []).filter(a => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return a.ip?.toLowerCase().includes(t) || a.hostname?.toLowerCase().includes(t);
  });

  // --- Dynamic Trend Logic ---
  const calculateDelta = (metric, liveValue) => {
    if (!trend || trend.length === 0) return { value: "+0", dir: "neutral" };
    
    const previous = trend[0][metric] || 0;
    const latest = liveValue !== undefined && liveValue !== null ? Number(liveValue) : (trend[trend.length - 1][metric] || 0);
    const diff = latest - previous;
    
    if (diff === 0) return { value: "0", dir: "neutral" };
    const symbol = diff > 0 ? "+" : "";
    
    if (metric === "enterprise_risk_score") {
      const pct = previous ? (diff / previous) * 100 : diff;
      return { value: `${symbol}${pct.toFixed(1)}%`, dir: diff > 0 ? "up" : "down" };
    }
    return { value: `${symbol}${Math.round(diff)}`, dir: diff > 0 ? "up" : "down" };
  };

  const riskDelta = calculateDelta("enterprise_risk_score", summary?.enterprise_risk_score);
  const assetsDelta = calculateDelta("total_assets", summary?.total_assets);
  const vulnsDelta = calculateDelta("total_vulnerabilities", summary?.total_vulnerabilities);
  const criticalDelta = calculateDelta("critical_vulns", summary?.severity_breakdown?.Critical || summary?.severity_breakdown?.critical);

  const handleTakeSnapshot = async () => {
    try {
      const res = await api.takePostureSnapshot();
      toast.success(`Snapshot Saved: Risk ${res.data.score.toFixed(1)}`, {
        icon: '📸',
        style: { background: '#0f172a', color: '#fff', border: '1px solid #6366f1' }
      });
      refresh();
    } catch (e) {
      toast.error(`Snapshot Failed: ${e.message}`);
    }
  };

  useEffect(() => {
    const handleRefresh = () => refresh();
    const handleSnapshot = () => handleTakeSnapshot();
    
    window.addEventListener('drpe:refresh-dashboard', handleRefresh);
    window.addEventListener('drpe:take-snapshot', handleSnapshot);
    
    return () => {
      window.removeEventListener('drpe:refresh-dashboard', handleRefresh);
      window.removeEventListener('drpe:take-snapshot', handleSnapshot);
    };
  }, [refresh]);

  useEffect(() => {
    const triggerFlash = () => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 600);
    };
    window.addEventListener('drpe:take-snapshot', triggerFlash);
    return () => window.removeEventListener('drpe:take-snapshot', triggerFlash);
  }, []);

  useEffect(() => {
    // Persistent timer logic
    const savedTime = localStorage.getItem('drpe_next_scan_time');
    if (savedTime) setNextScanTime(savedTime);

    const timer = setInterval(() => {
      setNextScanTime(prev => {
        let current = prev;
        if (current === '--:--:--') current = '08:00:00';
        
        const [h, m, s] = current.split(':').map(Number);
        let total = h * 3600 + m * 60 + s - 1;
        if (total < 0) total = 8 * 3600;
        
        const newH = Math.floor(total / 3600).toString().padStart(2, '0');
        const newM = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
        const newS = (total % 60).toString().padStart(2, '0');
        const result = `${newH}:${newM}:${newS}`;
        
        localStorage.setItem('drpe_next_scan_time', result);
        return result;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen transition-colors duration-1000 bg-transparent">
      <AnimatePresence>
        {showFlash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, times: [0, 0.2, 1] }}
            className="fixed inset-0 bg-white z-[9999] pointer-events-none"
          />
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-4">
        {/* Mission Deployment Status */}
        <div className="p-4 bg-indigo-brand-500/10 border border-indigo-brand-500/20 rounded-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top duration-700">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-brand-500/20 rounded-lg text-indigo-brand-500">
               <Zap className="w-5 h-5 animate-pulse" />
             </div>
             <div>
               <p className="text-xs font-black text-foreground uppercase tracking-widest">Autonomous Reconnaissance Active</p>
               <p className="text-[10px] text-muted-foreground uppercase font-medium">Mission Cycle: 08:00 Hours | Tactical Agents Operational</p>
             </div>
           </div>
           <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  const tid = toast.loading("Broadcasting Global Intelligence Pulse...");
                  try {
                    await api.triggerMissionScan();
                    toast.success("Mission Synchronized. Live Sweep Initiated.", { id: tid });
                    refresh();
                  } catch (err) {
                    toast.error("Bridge Connection Fault", { id: tid });
                  }
                }}
               className="px-4 py-2 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-black text-[10px] uppercase tracking-widest rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2"
             >
               <Zap className="w-3.5 h-3.5" />
               Initiate Global Sweep
             </button>
             <div className="text-right hidden md:block border-l border-indigo-brand-500/20 pl-4">
               <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Next Scan Window</p>
               <p className="text-sm font-bold font-mono text-indigo-brand-500 truncate">{nextScanTime}</p>
             </div>
           </div>
        </div>

        {/* Connection Failure Banner */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/20 rounded-lg text-destructive">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Connection Error</p>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">{error}</p>
              </div>
            </div>
            <button 
              onClick={refresh}
              className="px-3 py-1.5 bg-background border border-border hover:bg-accent rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <motion.div 
          layout
          className="flex-1 space-y-6 pb-12 animate-in fade-in duration-500"
        >
          {/* KPI Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {loading ? (
              [...Array(4)].map((_, i) => (
                  <div key={i} className="glass-card h-32 animate-pulse bg-muted/10 border-border/20" />
              ))
            ) : (
              <>
                <StatCard
                  title="Enterprise Risk"
                  value={summary?.enterprise_risk_score ?? '0.0'}
                  trend={riskDelta.dir}
                  trendValue={riskDelta.value}
                  icon={Shield}
                  color="indigo"
                  delay={0.1}
                />
                <StatCard
                  title="Total Assets"
                  value={summary?.total_assets ?? '0'}
                  trend={assetsDelta.dir}
                  trendValue={assetsDelta.value}
                  icon={Server}
                  color="indigo"
                  delay={0.2}
                />
                <StatCard
                  title="Critical Vulns"
                  value={summary?.severity_breakdown?.Critical || summary?.severity_breakdown?.critical || '0'}
                  trend={criticalDelta.dir}
                  trendValue={criticalDelta.value}
                  icon={AlertTriangle}
                  color="critical"
                  delay={0.3}
                />
                <StatCard
                  title="Total Vulnerabilities"
                  value={summary?.total_vulnerabilities ?? '0'}
                  trend={vulnsDelta.dir}
                  trendValue={vulnsDelta.value}
                  icon={Skull}
                  color="high"
                  delay={0.4}
                />
              </>
            )}
          </div>

          {/* Row 2: Trend & Heatmap (Professional 50/50 Split) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="min-h-[400px]">
              {loading ? (
                <div className="glass-card h-full animate-pulse bg-muted/5 border-border/10" />
              ) : (
                <TrendChart 
                  data={trend || []} 
                  title="Security Posture Trend" 
                />
              )}
            </div>

            <div className="min-h-[400px]">
              {loading ? (
                <div className="glass-card h-full animate-pulse bg-muted/5 border-border/10" />
              ) : (
                <RiskHeatmap 
                  data={heatmap?.heatmap || []} 
                />
              )}
            </div>
          </div>

          {/* Row 3: Target Exposure & Live Scanning (Balanced 1/1 Split) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-status-critical" />
                  High Risk Assets
                </h3>
              </div>
              <div className="divide-y divide-border overflow-y-auto max-h-[350px]">
                {filteredAssets.map((asset, i) => (
                  <div key={i} className="p-4 flex items-center justify-between group hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center border border-border group-hover:border-indigo-brand-500/30 transition-all shadow-sm">
                        <Server className="w-5 h-5 text-muted-foreground group-hover:text-indigo-brand-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {asset.ip}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-status-safe" />
                          {asset.hostname || 'Generic Tactical Node'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-lg font-black",
                        asset.level === 'Critical' ? "text-status-critical" : "text-status-high"
                      )}>
                        {asset.score}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">
                        {asset.level}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card overflow-hidden flex flex-col group border-indigo-brand-500/20">
              <div className="p-6 border-b border-border flex items-center justify-between bg-indigo-brand-500/5">
                <h3 className="text-sm font-bold text-indigo-brand-400 uppercase tracking-widest flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Recent Scans
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-brand-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                  <span className="text-[10px] font-black text-indigo-brand-500 uppercase tracking-widest">Active</span>
                </div>
              </div>
              <div className="divide-y divide-border overflow-y-auto max-h-[350px]">
                {filteredScans.slice(0, 5).map((scan, i) => (
                  <div key={scan.id || i} className="p-4 group/scan hover:bg-indigo-brand-500/5 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-foreground truncate max-w-[150px] group-hover/scan:text-indigo-brand-400 transition-colors" title={scan.name}>
                        {scan.name}
                      </p>
                      <span className={cn(
                        "text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md border",
                        ['running', 'pending'].includes(scan.status) ? "bg-indigo-brand-500/10 text-indigo-brand-500 border-indigo-brand-500/20 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.2)]" :
                        "bg-status-safe/10 text-status-safe border-status-safe/20"
                      )}>
                        {['running', 'pending'].includes(scan.status) ? 'In Progress' : 'Done'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      <span className="flex items-center gap-1.5 text-foreground/70"><Server className="w-3 h-3 text-indigo-brand-500/70" /> {scan.target}</span>
                      <span>{scan.started_at ? new Date(scan.started_at).toLocaleTimeString() : 'Recently'}</span>
                    </div>
                  </div>
                ))}
                {(!filteredScans || filteredScans.length === 0) && (
                  <div className="p-8 h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
                    <Activity className="w-8 h-8 opacity-20" />
                    <span className="text-xs uppercase font-black tracking-widest">No recent scans found</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* AI Copilot Sidebar Overlay */}
      <AnimatePresence>
        {showAICopilot && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="w-96 fixed right-0 top-0 bottom-0 z-50 p-4 bg-background/80 backdrop-blur-xl border-l border-border shadow-[-20px_0_40px_rgba(0,0,0,0.4)]"
          >
            <AIInsightsPanel 
               onClose={() => { setShowAICopilot(false); setInitialAIPrompt(null); }} 
               contextData={{ summary, threats, vulnerabilities: summary?.recent_vulnerabilities || [] }}
               initialPrompt={initialAIPrompt}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button when closed */}
      {!showAICopilot && (
        <button
          onClick={() => setShowAICopilot(true)}
          className="fixed bottom-8 right-8 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all z-40 active:scale-95 group bg-indigo-brand-600 shadow-indigo-brand-500/40"
        >
          <MessageSquare className="w-7 h-7 group-hover:scale-110 transition-transform text-white" />
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-4 border-background animate-pulse bg-status-safe"></div>
        </button>
      )}
    </div>
  );
};

export default DashboardPage;
