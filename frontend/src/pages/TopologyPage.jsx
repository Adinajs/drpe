import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { api } from '../api';
import { Shield, Server, Activity, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { cn } from '../utils/cn';
import { useTheme } from '../context/ThemeContext';

const TopologyPage = () => {
  const { theme } = useTheme();
  const [data, setData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    const fetchTopology = async () => {
      try {
        setIsLoading(true);
        const response = await api.getNetworkTopology();
        if (response.success) {
          setData(response.data);
        }
      } catch (error) {
        toast.error('Tactical Topology Feed Offline');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopology();
  }, []);

  const getRiskColor = (risk) => {
    if (risk === 'critical') return '#ef4444'; // Red-500
    if (risk === 'high') return '#f97316';     // Orange-500
    if (risk === 'medium') return '#eab308';   // Yellow-500
    if (risk === 'low') return '#22c55e';      // Green-500
    return '#64748b';                          // Slate-500
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    // Center on node
    fgRef.current.centerAt(node.x, node.y, 1000);
    fgRef.current.zoom(3, 1000);
  };

  return (
    <div className={cn("relative h-[calc(100vh-4rem)] flex flex-col overflow-hidden transition-colors duration-500", theme === 'dark' ? "bg-[#020617]" : "bg-slate-50")}>
      {/* Header Info */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/80 backdrop-blur-md border border-indigo-500/30 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
          <h1 className="text-lg font-bold text-white tracking-tight">Tactical Network Topology</h1>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            Live Asset Graph
          </span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1.5 bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span className="text-[10px] text-slate-300 font-medium">Critical</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
            <span className="text-[10px] text-slate-300 font-medium">High</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_#eab308]" />
            <span className="text-[10px] text-slate-300 font-medium">Medium</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
            <span className="text-[10px] text-slate-300 font-medium">Low</span>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2">
        <button 
          onClick={() => fgRef.current.zoomToFit(1000)}
          className="p-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition-colors shadow-lg"
          title="Zoom to Fit"
        >
          <Maximize className="w-5 h-5" />
        </button>
      </div>

      {/* Graph Area */}
      <div className="flex-1 w-full relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-indigo-400 font-mono text-sm animate-pulse tracking-tighter">MAPPING ASSET NODES...</p>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={data}
            nodeLabel={(node) => `Node Ident: ${node.id} (${node.name})`}
            nodeColor={(node) => getRiskColor(node.risk_level)}
            nodeVal={(node) => Math.max(5, node.val / 10)}
            linkLabel={(link) => `Path Velocity: 1.0`}
            linkColor={() => theme === 'dark' ? '#334155' : '#cbd5e1'}
            backgroundColor={theme === 'dark' ? '#020617' : '#f8fafc'}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.name;
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Inter, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

              // Draw Node Core
              const r = Math.max(2, (node.val / 20) + 1);
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle = getRiskColor(node.risk_level);
              ctx.fill();

              // Draw Pulse Effect for all Identified Risks
              if (['critical', 'high', 'medium', 'low'].includes(node.risk_level)) {
                const time = Date.now() / 1000;
                const alpha = 0.2 * (1 + Math.sin(time * 3));
                const colorMap = {
                  critical: '239, 68, 68',
                  high: '249, 115, 22',
                  medium: '234, 179, 8',
                  low: '34, 197, 94'
                };
                
                ctx.beginPath();
                ctx.arc(node.x, node.y, r * 1.6, 0, 2 * Math.PI, false);
                ctx.strokeStyle = `rgba(${colorMap[node.risk_level]}, ${alpha})`;
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();
              }

              // Draw Label if zoomed in enough
              if (globalScale > 2) {
                ctx.fillStyle = theme === 'dark' ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)';
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y + r + 2, bckgDimensions[0], bckgDimensions[1]);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
                ctx.fillText(label, node.x, node.y + r + 2 + bckgDimensions[1] / 2);
              }
            }}
          />
        )}
      </div>

      {/* Info Panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-0 right-0 h-full w-96 bg-slate-900/90 backdrop-blur-xl border-l border-indigo-500/20 p-6 shadow-2xl z-20 flex flex-col gap-6"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">{selectedNode.name}</h2>
                <code className="text-sm text-indigo-400 font-mono italic">{selectedNode.id}</code>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400"
              >
                <Maximize className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">Risk Score</p>
                <p className={cn(
                   "text-2xl font-bold",
                   selectedNode.val > 70 ? "text-red-500" : selectedNode.val > 40 ? "text-orange-500" : "text-green-500"
                )}>
                  {selectedNode.val.toFixed(1)}
                </p>
              </div>
              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-bold text-white">Active</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto pr-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold mb-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Node Profile</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500 font-mono tracking-tighter">Operating System</span>
                  <span className="text-white text-right">{selectedNode.os || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500 font-mono tracking-tighter">Criticality</span>
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20 text-xs">
                    {selectedNode.criticality || 'Medium'}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 text-slate-300 font-semibold mb-3">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span>Open Vectors ({selectedNode.ports?.length || 0})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedNode.ports?.map(p => (
                    <span key={p.port} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
                      {p.port}/{p.service}
                    </span>
                  )) || <span className="text-xs text-slate-500 italic">No open vectors identified</span>}
                </div>
              </div>
            </div>

            <button className="mt-auto w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)] active:scale-95">
              Initiate Vector Scan
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TopologyPage;
