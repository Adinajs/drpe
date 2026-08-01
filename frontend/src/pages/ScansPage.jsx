import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from '../components/tables/DataTable';
import { 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Play, 
  AlertTriangle,
  Loader2,
  Terminal,
  ShieldCheck,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';

const ScansPage = () => {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const fetchScans = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    try {
      const data = await api.listScans({ limit: 100 });
      setScans(data);
    } catch (error) {
      toast.error('Scan Intelligence Service Offline: ' + error.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();
    
    // Auto-poll every 10 seconds for active scans
    const timer = setInterval(() => {
      fetchScans(false);
    }, 10000);
    
    return () => clearInterval(timer);
  }, []);

  const activeScansCount = scans.filter(s => s.status === 'running').length;

  const columns = [
    {
      accessorKey: 'status',
      header: 'Deployment Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const variants = {
          running: 'text-indigo-brand-500 bg-indigo-brand-500/10 border-indigo-brand-500/20 shadow-indigo-brand-500/5',
          completed: 'text-status-safe bg-status-safe/10 border-status-safe/20 shadow-status-safe/5',
          failed: 'text-status-critical bg-status-critical/10 border-status-critical/20 shadow-status-critical/5',
        };
        const icons = {
          running: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
          completed: <CheckCircle2 className="w-3.5 h-3.5" />,
          failed: <XCircle className="w-3.5 h-3.5" />,
        };
        
        return (
          <div className={cn(
            "px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 w-fit",
            variants[status] || 'bg-muted text-muted-foreground'
          )}>
            {icons[status] || <Clock className="w-3.5 h-3.5" />}
            {status}
          </div>
        );
      },
    },
    {
      accessorKey: 'scan_name',
      header: 'Scan Name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground">
            {row.original.scan_name}
          </span>
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            ID: {row.original.id.split('-')[0]}...
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'target_range',
      header: 'Target IP',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-muted rounded border border-border">
              <Terminal className="w-3 h-3 text-muted-foreground" />
           </div>
           <span className="font-mono font-bold text-foreground text-xs uppercase tracking-widest">
              {row.original.target_range}
           </span>
        </div>
      ),
    },
    {
       accessorKey: 'progress',
       header: 'Task Progress',
       cell: ({ row }) => {
          const isRunning = row.original.status === 'running';
          const progress = isRunning ? (row.original.gvm_live_status?.progress || 10) : 100;
          return (
             <div className="flex flex-col gap-1.5 w-full max-w-[120px]">
                <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-black text-muted-foreground uppercase">{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden border border-border">
                   <div 
                      className={cn(
                         "h-full rounded-full transition-all duration-500",
                         isRunning ? "bg-indigo-brand-500 animate-pulse" : "bg-status-safe"
                      )}
                      style={{ width: `${progress}%` }}
                   />
                </div>
             </div>
          );
       }
    },
    {
      accessorKey: 'started_at',
      header: 'Start Time',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-foreground">
            {row.original.started_at ? format(new Date(row.original.started_at), 'MMM dd, HH:mm') : 'N/A'}
          </span>
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            {row.original.started_at ? format(new Date(row.original.started_at), 'yyyy') : 'Pending'}
          </span>
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button 
          onClick={() => {
            toast.success('Accessing Logs...');
            setTimeout(() => toast('LOG: Scan component initiating.', { icon: '📟' }), 1000);
          }}
          className="p-1.5 bg-accent hover:bg-accent/80 border border-border rounded-lg text-muted-foreground hover:text-indigo-brand-500 transition-all opacity-0 group-hover:opacity-100"
          title="View Scan Log"
        >
          <Terminal className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const handleDiscover = async () => {
    try {
      toast.loading('Initializing full network sweep...', { id: 'scan-init' });
      await api.discoverAssets();
      toast.success('Scan initiated. It may take some time to complete.', { id: 'scan-init' });
      fetchScans(false);
    } catch (error) {
      toast.error('Failed to start scan: ' + error.message, { id: 'scan-init' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-brand-500/10 rounded-2xl border border-indigo-brand-500/20">
            <Activity className="w-6 h-6 text-indigo-brand-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground underline underline-offset-4 decoration-indigo-brand-500/30 font-mono tracking-tight uppercase">Scans Overview</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-[0.2em] mt-0.5">Manage and track automated operations</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pr-2">
          <div className="flex flex-col items-end gap-1">
            <button 
              onClick={handleDiscover}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-brand-500 hover:bg-indigo-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-brand-500/20"
            >
              <Play className="w-3.5 h-3.5" />
              Run Network Scan
            </button>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.1em]">Automated Cycle: Every 8 hours</p>
          </div>
          <div className="h-10 w-px bg-border/50 hidden md:block"></div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-brand-500/10 border border-indigo-brand-500/20 rounded-full text-[10px] font-bold text-indigo-brand-500 uppercase tracking-widest">
              <RefreshCw className={cn("w-3 h-3", activeScansCount > 0 && "animate-spin")} />
              {activeScansCount} Active Task{activeScansCount !== 1 && 's'}
            </div>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.1em]">Polling_Interval: 10s</p>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <DataTable 
          columns={columns} 
          data={scans} 
          searchPlaceholder="Search active/historic scans..." 
        />
      </motion.div>
    </div>
  );
};

export default ScansPage;
