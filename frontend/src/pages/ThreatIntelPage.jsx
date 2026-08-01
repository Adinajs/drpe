import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  ShieldAlert, 
  Map as MapIcon, 
  Globe, 
  Search, 
  Activity, 
  Zap, 
  AlertTriangle,
  RefreshCw,
  Skull,
  Radar,
  Flag,
  Crosshair,
  BadgeAlert,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';

// Simplified World Map Coordinates for Visualization
const REGIONS = {
  'US': { x: 200, y: 150, name: 'North America' },
  'BR': { x: 300, y: 300, name: 'South America' },
  'GB': { x: 450, y: 120, name: 'Europe' },
  'FR': { x: 460, y: 135, name: 'Europe' },
  'DE': { x: 480, y: 125, name: 'Europe' },
  'RU': { x: 600, y: 100, name: 'Russia/North Asia' },
  'CN': { x: 700, y: 180, name: 'East Asia' },
  'IN': { x: 650, y: 220, name: 'South Asia' },
  'AU': { x: 780, y: 350, name: 'Oceania' },
  'ZA': { x: 500, y: 350, name: 'Africa' },
  'EG': { x: 520, y: 200, name: 'Middle East' },
  'NA': { x: 150, y: 100, name: 'North America' }
};

const TacticalMap = ({ threats, diagnostics }) => {
  return (
    <div className="relative w-full h-full bg-indigo-brand-900/40 rounded-xl overflow-hidden border border-indigo-brand-500/20 shadow-inner">
      <div className="absolute inset-0 cyber-grid opacity-[0.1]"></div>
      
      {/* Abstract Tactical Grid instead of fake continents */}
      <svg viewBox="0 0 1000 500" className="w-full h-full opacity-10 pointer-events-none">
        <defs>
          <pattern id="tactical-dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="currentColor" className="text-indigo-brand-500" />
          </pattern>
        </defs>
        <rect width="1000" height="500" fill="url(#tactical-dots)" />
        <line x1="0" y1="250" x2="1000" y2="250" stroke="currentColor" strokeWidth="0.5" className="text-indigo-brand-500/30" />
        <line x1="500" y1="0" x2="500" y2="500" stroke="currentColor" strokeWidth="0.5" className="text-indigo-brand-500/30" />
      </svg>

      <AnimatePresence>
        {threats.map((threat, idx) => {
          const region = REGIONS[threat.country] || { x: 500, y: 250 };
          const jitterX = (parseInt(threat.ip.split('.').pop()) % 60) - 30;
          const jitterY = (parseInt(threat.ip.split('.')[2]) % 60) - 30;
          
          return (
            <motion.div
              key={`${threat.ip}-${idx}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute group z-20"
              style={{ left: `${(region.x + jitterX) / 10}%`, top: `${(region.y + jitterY) / 5}%` }}
            >
              <div className="relative flex items-center justify-center">
                <div className={cn(
                  "w-3 h-3 rounded-full border-2 border-white/50 z-10",
                  threat.composite_score > 70 ? "bg-status-critical" : "bg-status-high"
                )} />
                <div className={cn(
                  "absolute w-8 h-8 rounded-full animate-ping opacity-30",
                  threat.composite_score > 70 ? "bg-status-critical" : "bg-status-high"
                )} />
                
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 pointer-events-none opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-30">
                  <div className="glass-card p-3 border-indigo-brand-500 shadow-status-critical/20 bg-indigo-brand-900/90 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black text-white uppercase">{threat.country || 'Unknown'} Origin</span>
                      <span className="text-[10px] font-mono font-bold text-status-critical">{threat.composite_score}</span>
                    </div>
                    <p className="text-[11px] font-mono font-bold text-indigo-brand-400 mb-1">{threat.ip}</p>
                    <p className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter line-clamp-1">{threat.isp}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="absolute bottom-4 left-4 p-2 bg-black/60 border border-indigo-brand-500/20 rounded font-mono pointer-events-none">
        <p className="text-[8px] font-black text-indigo-brand-400 uppercase tracking-widest flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full", diagnostics?.uplink_status === 'ONLINE' ? 'bg-green-500' : 'bg-status-high')} />
          Uplink: {diagnostics?.uplink_status || 'CONNECTING...'}
        </p>
      </div>
    </div>
  );
};

const GlobalAdvisoryFeed = ({ advisories, iscStatus }) => {
  return (
    <div className="glass-card flex flex-col border-status-critical/10 h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3 h-3 text-status-critical" />
          Global Tactical Advisories
        </h3>
        {iscStatus && (
           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background border border-border">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                 iscStatus.status === 'green' ? "bg-green-500" : "bg-status-high"
              )} />
              <span className="text-[8px] font-black uppercase text-muted-foreground">{iscStatus.status || 'OFFLINE'}</span>
           </div>
        )}
      </div>
      <div className="p-2 space-y-2 overflow-y-auto">
        {advisories.map((adv, idx) => (
          <div key={idx} className="p-3 bg-muted/30 border border-white/5 rounded-lg hover:border-status-critical/30 transition-all group">
            <div className="flex items-center justify-between mb-1">
              <span className={cn(
                "text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                adv.severity === 'Critical' ? "bg-status-critical/20 text-status-critical" : "bg-indigo-brand-500/20 text-indigo-brand-500"
              )}>
                {adv.severity} Signal
              </span>
              <span className="text-[7px] font-mono text-muted-foreground">{adv.source}</span>
            </div>
            <p className="text-[10px] font-bold text-foreground group-hover:text-status-critical transition-colors leading-tight">{adv.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ThreatIntelPage = () => {
  const [intel, setIntel] = useState(() => {
    try {
      const cached = localStorage.getItem('drpe_threat_intel');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [advisories, setAdvisories] = useState(() => {
    try {
      const cached = localStorage.getItem('drpe_threat_advisories');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [iscStatus, setIscStatus] = useState(() => {
    try {
      const cached = localStorage.getItem('drpe_threat_iscStatus');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });
  const [diagnostics, setDiagnostics] = useState(() => {
    try {
      const cached = localStorage.getItem('drpe_threat_diagnostics');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return { uplink_status: 'ONLINE' };
  });

  const [loading, setLoading] = useState(() => {
    // Skip loading screen if we already have cached intelligence data
    try {
      const cached = localStorage.getItem('drpe_threat_intel');
      if (cached && JSON.parse(cached).length > 0) {
        return false;
      }
    } catch (e) {}
    return true;
  });

  const fetchIntel = async (isInitial = true) => {
    const hasData = intel.length > 0 && advisories.length > 0;
    if (isInitial && !hasData) setLoading(true);

    try {
      const [intelData, advData, diagData] = await Promise.all([
        api.getThreatIntelSummary(),
        api.getGlobalAdvisories(),
        api.getIntelDiagnostics()
      ]);
      setIntel(intelData || []);
      setAdvisories(advData?.data?.headlines || []);
      setIscStatus(advData?.data?.status);
      setDiagnostics(diagData?.data);

      // Cache data locally for instant SWR loading on next navigation
      localStorage.setItem('drpe_threat_intel', JSON.stringify(intelData || []));
      localStorage.setItem('drpe_threat_advisories', JSON.stringify(advData?.data?.headlines || []));
      localStorage.setItem('drpe_threat_iscStatus', JSON.stringify(advData?.data?.status || null));
      localStorage.setItem('drpe_threat_diagnostics', JSON.stringify(diagData?.data || null));
    } catch (error) {
      toast.error('Tactical Intelligence Feed Offline: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualFetch = async () => {
    const tid = toast.loading('Querying OTX & AbuseIPDB Global Databases...');
    try {
      await api.fetchThreatIntel();
      toast.success('Global Signal Scan Complete.', { id: tid });
      fetchIntel(false);
    } catch (error) {
      toast.error('Tactical Query Failed: ' + error.message, { id: tid });
    }
  };

  useEffect(() => {
    fetchIntel(true);
  }, []);

  const stats = React.useMemo(() => {
    if (!intel || intel.length === 0) return {
      advValue: "0 Signals", advSub: "Monitoring global feeds",
      exposureValue: "Low (0/100)", exposureSub: "No high risk assets",
      pulseValue: "Stable", pulseSub: "No malicious infrastructure leaked",
      exposedCount: 0, avgScore: 0
    };

    const uniqueAdversaries = [...new Set(intel.flatMap(item => item.adversaries || []))];
    const advValue = uniqueAdversaries.length > 0 ? `${uniqueAdversaries.length} Detected` : "0 Signals";
    const advSub = uniqueAdversaries.length > 0 ? uniqueAdversaries.slice(0, 2).join(', ') : "Monitoring global feeds";

    const exposedCount = intel.filter(item => item.composite_score > 30).length;
    const exposureLevel = exposedCount > 5 ? "Critical" : (exposedCount > 2 ? "Elevated" : "Low");
    const exposureValue = `${exposureLevel} (${Math.round((exposedCount / intel.length) * 100)}/100)`;
    
    const avgScore = intel.reduce((acc, curr) => acc + (curr.composite_score || 0), 0) / intel.length;
    const pulseValue = avgScore > 40 ? "High Activity" : (avgScore > 15 ? "Medium" : "Stable");

    return {
      advValue, advSub, exposureValue, exposureSub: `${exposedCount} Assets At Risk`,
      pulseValue, pulseSub: avgScore > 15 ? "Detected external signals" : "Clean Signal",
      exposedCount, avgScore
    };
  }, [intel]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-status-critical/10 rounded-2xl border border-status-critical/20 shadow-status-critical/5">
            <Radar className="w-6 h-6 text-status-critical animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tighter uppercase font-mono italic">Threat Matrix Alpha</h1>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em] -mt-1 flex items-center gap-1.5">
               Global Reputation & Adversary Signals
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end border-r border-border pr-4">
             <span className="text-[8px] font-black text-muted-foreground uppercase">Threat Uplink</span>
             <span className={cn("text-[9px] font-black uppercase",
                diagnostics?.uplink_status === 'ONLINE' ? "text-green-500" : "text-status-high"
             )}>{diagnostics?.uplink_status || 'CONNECTING...'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchIntel()} className="p-2.5 bg-accent border border-border rounded-lg text-muted-foreground"><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></button>
            <button onClick={handleManualFetch} className="flex items-center gap-2 px-4 py-2 bg-status-critical text-white font-bold text-xs uppercase rounded-lg shadow-lg shadow-status-critical/10"><Zap className="w-4 h-4" /> Synchronize</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[450px]">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2 glass-card relative overflow-hidden border-status-critical/10 flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between bg-black/5">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-brand-500" /> Geographic Attack Vectors</h3>
          </div>
          <div className="flex-1 relative">
             {loading ? <div className="w-full h-full flex items-center justify-center opacity-30"><RefreshCw className="w-8 h-8 animate-spin" /></div> : <TacticalMap threats={intel} diagnostics={diagnostics} />}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-6">
           <GlobalAdvisoryFeed advisories={advisories} iscStatus={iscStatus} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 glass-card flex flex-col max-h-[400px]">
           <div className="p-4 border-b border-border font-black text-[10px] text-muted-foreground uppercase tracking-widest">Target Signal Integrity</div>
           <div className="flex-1 overflow-y-auto divide-y divide-border">
              {(intel || [])
                .sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0))
                .map((item, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-status-critical/10 flex items-center justify-center font-bold text-status-critical border border-status-critical/20">{item.country || '??'}</div>
                      <div>
                         <p className="text-sm font-bold text-foreground">{item.ip}</p>
                         <p className="text-[10px] text-muted-foreground uppercase">{item.isp || 'Automated Provider'}</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] font-black text-status-critical">SCORE: {item.composite_score}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Pulses: {item.otx_pulses}</div>
                   </div>
                </div>
              ))}
           </div>
         </div>

         <div className="flex flex-col gap-4">
            {[
              { label: 'APT GROUPS', value: stats.advValue, icon: Crosshair, color: 'text-status-critical' },
              { label: 'IP EXPOSURE', value: stats.exposureValue, icon: BadgeAlert, color: 'text-status-high' },
              { label: 'MALNET PULSE', value: stats.pulseValue, icon: Skull, color: 'text-status-critical' },
            ].map((item, i) => (
              <div key={i} className="glass-card p-4 flex items-center gap-4 border-white/5">
                 <div className={cn("p-2 rounded-lg bg-background border border-border", item.color)}><item.icon className="w-5 h-5" /></div>
                 <div>
                    <h5 className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">{item.label}</h5>
                    <p className={cn("text-lg font-extrabold uppercase", item.color)}>{item.value}</p>
                 </div>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default ThreatIntelPage;
