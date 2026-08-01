import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import DataTable from '../components/tables/DataTable';
import { 
  Server, 
  Search, 
  Activity, 
  Globe, 
  Cpu, 
  HardDrive,
  ShieldAlert,
  Play,
  Loader2,
  RefreshCw,
  Plus,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';
import { useSearch } from '../context/SearchContext';
import ReconEngine from '../components/ReconEngine';

const AssetsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inventory');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanningId, setScanningId] = useState(null);
  const { searchTerm } = useSearch();

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await api.getAssets();
      setAssets(data);
    } catch (error) {
      toast.error('Asset Inventory Unavailable: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [activeTab]);

  const filteredAssets = useMemo(() => {
    if (!searchTerm) return assets;
    const s = searchTerm.toLowerCase();
    return assets.filter(a => 
      a.ip_address?.toLowerCase().includes(s) ||
      a.hostname?.toLowerCase().includes(s) ||
      a.os_detected?.toLowerCase().includes(s)
    );
  }, [assets, searchTerm]);

  const handleStartScan = async (assetIp) => {
    setScanningId(assetIp);
    const toastId = toast.loading(`Initializing X-Threat Scan for ${assetIp}...`);
    
    try {
      await api.startScan(assetIp, `Manual Scan: ${new Date().toLocaleString()}`);
      toast.success(`Scan initiated successfully for ${assetIp}`, { id: toastId });
      // Refresh assets to show status change if any
      fetchAssets();
    } catch (error) {
      toast.error(`Scan Deployment Failed: ${error.message}`, { id: toastId });
    } finally {
      setScanningId(null);
    }
  };

  const columns = [
    {
      accessorKey: 'status',
      header: 'Connectivity',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            row.original.status === 'active' ? "bg-status-safe shadow-[0_0_8px_rgba(22,163,74,0.5)]" : "bg-muted-foreground opacity-30"
          )} />
          <span className={cn(
            "text-[10px] font-black uppercase tracking-widest",
            row.original.status === 'active' ? "text-status-safe" : "text-muted-foreground"
          )}>
            {row.original.status}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'ip_address',
      header: 'Node Address',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-foreground tracking-tight">
            {row.original.ip_address}
          </span>
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">
            {row.original.mac_address || '00:00:00:00:00:00'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'hostname',
      header: 'Intelligence / OS',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent rounded-lg border border-border">
            {row.original.os_detected?.toLowerCase().includes('linux') ? (
              <Cpu className="w-4 h-4 text-status-high" />
            ) : row.original.os_detected?.toLowerCase().includes('windows') ? (
              <Activity className="w-4 h-4 text-indigo-brand-500" />
            ) : (
              <Globe className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground truncate max-w-[150px]">
              {row.original.hostname || 'UNDEFINED_NODE'}
            </span>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              {row.original.os_detected || 'Unknown Platform'}
            </span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'criticality',
      header: 'Mission Status',
      cell: ({ row }) => {
        const crit = row.original.criticality;
        const variants = {
          Critical: 'text-status-critical border-status-critical/30 bg-status-critical/10',
          High: 'text-status-high border-status-high/30 bg-status-high/10',
          Medium: 'text-status-medium border-status-medium/30 bg-status-medium/10',
          Low: 'text-status-safe border-status-safe/30 bg-status-safe/10',
        };
        return (
          <span className={cn(
            "px-2 px-1.5 rounded text-[10px] font-black uppercase tracking-widest border",
            variants[crit] || 'text-muted-foreground border-border'
          )}>
            {crit}
          </span>
        );
      },
    },
    {
      accessorKey: 'open_ports',
      header: 'Surface Area',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
          {row.original.open_ports?.length > 0 ? (
            row.original.open_ports.slice(0, 3).map((port, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono font-bold text-muted-foreground">
                {typeof port === 'object' ? (port.port || port.number || JSON.stringify(port)) : port}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground italic">None active</span>
          )}
          {row.original.open_ports?.length > 3 && (
            <span className="text-[10px] font-bold text-indigo-brand-500">+{row.original.open_ports.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Deployment',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); handleStartScan(row.original.ip_address); }}
            disabled={scanningId === row.original.ip_address}
            className="h-8 px-3 flex items-center gap-2 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-bold text-[10px] uppercase tracking-widest rounded transition-all disabled:opacity-50 group active:scale-95"
          >
            {scanningId === row.original.ip_address ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3 group-hover:scale-125 transition-transform" />
            )}
            Executive Scan
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); navigate(`/reports?ip=${row.original.ip_address}`); }}
            className="h-8 px-3 flex items-center gap-2 bg-accent hover:bg-accent/80 text-foreground font-bold text-[10px] uppercase tracking-widest rounded border border-border transition-all active:scale-95"
          >
            Report
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-brand-500/10 rounded-2xl border border-indigo-brand-500/20">
            <Server className="w-6 h-6 text-indigo-brand-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tighter uppercase font-mono italic">Asset Intelligence</h1>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em] -mt-1 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-indigo-brand-400" />
              Mission Critical Node Inventory
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-accent/30 p-1.5 rounded-xl border border-border/50">
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'inventory' 
                ? "bg-indigo-brand-500 text-white shadow-lg shadow-indigo-brand-500/20" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active Inventory
          </button>
          <button
            onClick={() => setActiveTab('recon')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'recon' 
                ? "bg-status-high text-white shadow-lg shadow-status-high/20" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tactical Recon
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchAssets}
            className="p-2.5 bg-accent hover:bg-accent/80 border border-border rounded-lg text-muted-foreground transition-all"
            title="Reload Inventory"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button 
            onClick={() => navigate('/reports?print=true')}
            className="p-2.5 bg-accent hover:bg-accent/80 border border-border rounded-lg text-muted-foreground transition-all"
            title="Print Inventory Report"
          >
            <Printer className="w-4 h-4" />
          </button>

        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'inventory' ? (
          <motion.div
            key="inventory"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <DataTable 
              columns={columns} 
              data={filteredAssets} 
              searchPlaceholder="Filter assets by IP, Hostname or OS..." 
            />
          </motion.div>
        ) : (
          <motion.div
            key="recon"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ReconEngine />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetsPage;
