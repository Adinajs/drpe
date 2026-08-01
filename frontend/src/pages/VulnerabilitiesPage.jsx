import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import DataTable from '../components/tables/DataTable';
import { 
  ShieldAlert, 
  ExternalLink, 
  ShieldCheck, 
  Zap, 
  PieChart,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  Activity,
  X,
  BrainCircuit,
  Terminal,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';
import { useSearch } from '../context/SearchContext';

const VulnerabilitiesPage = () => {
  const [vulns, setVulns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('All');
  const { searchTerm } = useSearch();

  const [stats, setStats] = useState({ Critical: 0, High: 0, Medium: 0, Low: 0 });

  const fetchVulns = async (selectedSeverity = severityFilter) => {
    setLoading(true);
    try {
      // 1. Fetch Global Stats for Cards
      const summary = await api.getDashboardSummary();
      const breakdown = summary.data?.severity_breakdown || summary.severity_breakdown || {};
      setStats({
        Critical: breakdown.Critical || breakdown.critical || 0,
        High:     breakdown.High || breakdown.high || 0,
        Medium:   breakdown.Medium || breakdown.medium || 0,
        Low:      breakdown.Low || breakdown.low || 0,
      });

      // 2. Fetch Filtered Subset for Table
      const params = { limit: 500 };
      if (selectedSeverity !== 'All') {
        params.severity = selectedSeverity.toLowerCase();
      }
      const data = await api.getVulnerabilities(params);
      setVulns(data);
    } catch (error) {
      toast.error('Failed to load vulnerabilities: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVulns();
  }, [severityFilter]);

  const filteredData = useMemo(() => {
    let result = vulns;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(v => 
        (v.cve_id?.toLowerCase().includes(s)) || 
        (v.name?.toLowerCase().includes(s)) ||
        (v.description?.toLowerCase().includes(s))
      );
    }
    return result;
  }, [vulns, searchTerm]);

  const columns = [
    {
      accessorKey: 'cve_id',
      header: 'CVE ID',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 group">
          <span className="font-mono font-bold text-indigo-brand-500 group-hover:text-indigo-brand-400 transition-colors">
            {row.original.cve_id || 'N/A'}
          </span>
          {row.original.cve_id && (
            <a 
              href={`https://nvd.nist.gov/vuln/detail/${row.original.cve_id}`} 
              target="_blank" 
              rel="noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </a>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Vulnerability Name',
      cell: ({ row }) => (
        <div className="max-w-xs xl:max-w-md truncate font-medium text-foreground tracking-tight" title={row.original.name}>
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: 'asset_ip',
      header: 'Target Asset',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-indigo-brand-500 font-mono">
            {row.original.asset_ip || '0.0.0.0'}
          </span>
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            {row.original.asset_hostname || 'UNDEFINED_NODE'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const severity = row.original.severity || 'Low';
        const sevKey = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
        
        const variants = {
          Critical: 'bg-status-critical/10 text-status-critical border-status-critical/20 shadow-status-critical/5',
          High: 'bg-status-high/10 text-status-high border-status-high/20 shadow-status-high/5',
          Medium: 'bg-status-medium/10 text-status-medium border-status-medium/20 shadow-status-medium/5',
          Low: 'bg-status-safe/10 text-status-safe border-status-safe/20 shadow-status-safe/5',
        };
        
        return (
          <span className={cn(
            "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border",
            variants[sevKey] || 'bg-muted text-muted-foreground'
          )}>
            {severity}
          </span>
        );
      },
    },
    {
      accessorKey: 'cvss_score',
      header: 'CVSS',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-mono font-bold text-xs border border-border">
            {row.original.cvss_score?.toFixed(1) || '0.0'}
          </div>
          <div className="flex-1 h-1.5 w-16 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                row.original.cvss_score >= 9 ? "bg-status-critical" :
                row.original.cvss_score >= 7 ? "bg-status-high" :
                row.original.cvss_score >= 4 ? "bg-status-medium" : "bg-status-safe"
              )}
              style={{ width: `${(row.original.cvss_score || 0) * 10}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'port',
      header: 'Port/Service',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">
            {typeof row.original.port === 'object' ? (row.original.port.port || row.original.port.number || JSON.stringify(row.original.port)) : (row.original.port || 'Any')}
          </span>
          <span className="text-[10px] font-black text-muted-foreground uppercase uppercase">
            {row.original.service || 'Unknown'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'exploit_available',
      header: 'Exploit',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          {row.original.exploit_available ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-status-critical/10 border border-status-critical/20 rounded shadow-sm">
              <Zap className="w-3 h-3 text-status-critical animate-pulse" />
              <span className="text-[10px] font-black text-status-critical uppercase">POC Available</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-status-safe/10 border border-status-safe/20 rounded shadow-sm opacity-50">
               <ShieldCheck className="w-3 h-3 text-status-safe" />
               <span className="text-[10px] font-black text-status-safe uppercase">Secure</span>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Critical', value: stats.Critical, color: 'text-status-critical', icon: AlertTriangle },
          { label: 'High', value: stats.High, color: 'text-status-high', icon: ShieldAlert },
          { label: 'Medium', value: stats.Medium, color: 'text-status-medium', icon: PieChart },
          { label: 'Low', value: stats.Low, color: 'text-status-safe', icon: ShieldCheck },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-4 border-border/50 flex flex-col items-center text-center group cursor-pointer hover:border-border transition-all"
            onClick={() => setSeverityFilter(stat.label)}
          >
            <div className={cn("p-2 rounded-lg bg-background border border-border mb-3 group-hover:scale-110 transition-transform", stat.color)}>
              <stat.icon className="w-4 h-4" />
            </div>
            <span className="text-2xl font-bold text-foreground">
              {stat.value}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
              {stat.label} Findings
            </span>
          </motion.div>
        ))}
      </div>

      {/* Main Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
             <button 
                onClick={fetchVulns}
                disabled={loading}
                className="p-2.5 bg-accent hover:bg-accent/80 border border-border rounded-lg text-muted-foreground transition-all"
                title="Refresh Vulnerabilities"
             >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
             </button>
             <div className="flex items-center bg-accent rounded-lg border border-border p-1">
               {['All', 'Critical', 'High', 'Medium', 'Low'].map(sev => (
                 <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                      severityFilter === sev 
                        ? "bg-indigo-brand-600 text-white shadow-lg" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                 >
                   {sev}
                 </button>
               ))}
             </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-indigo-brand-500/10 border border-indigo-brand-500/20 rounded-lg text-[10px] font-bold text-indigo-brand-500 uppercase tracking-widest flex items-center gap-2 animate-pulse">
              <Activity className="w-3.5 h-3.5" />
              Live Feed
            </div>
          </div>
        </div>

        <DataTable 
          columns={columns} 
          data={filteredData} 
          searchPlaceholder="Filter CVEs by ID, name or exploit status..." 
        />
      </motion.div>

    </div>
  );
};

export default VulnerabilitiesPage;
