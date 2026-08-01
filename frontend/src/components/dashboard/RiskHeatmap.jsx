import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target } from 'lucide-react';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border p-4 rounded-xl shadow-2xl text-sm min-w-[180px]">
        <p className="font-extrabold text-foreground mb-1 text-base">{data.ip}</p>
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest border-b border-border pb-2 mb-2">{data.hostname}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-900 font-bold dark:text-slate-100">Impact Effect:</span>
            <span className="font-mono font-black text-indigo-brand-600">{(data.impact || 0).toFixed(3)}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-900 font-bold dark:text-slate-100">Likelihood:</span>
            <span className="font-mono font-black text-indigo-brand-600">{(data.likelihood || 0).toFixed(3)}</span>
          </div>
          <div className="mt-3 pt-2 border-t border-border/50">
            <div className="inline-block px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border shadow-sm" style={{
              color: getStatusColor(data.risk_level),
              borderColor: getStatusColor(data.risk_level),
              backgroundColor: `${getStatusColor(data.risk_level)}15`
            }}>
              {data.risk_level}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const getStatusColor = (level) => {
  const norm = (level || '').toLowerCase();
  if (norm === 'critical') return '#ef4444'; // red
  if (norm === 'high') return '#f97316';     // orange
  if (norm === 'medium') return '#eab308';   // yellow
  return '#22c55e';                          // green
};

const RiskHeatmap = ({ data = [] }) => {
  return (
    <div className="glass-card p-6 h-[400px] flex flex-col relative group overflow-hidden">
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-brand-500/10 rounded-lg">
            <Target className="w-5 h-5 text-indigo-brand-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">Risk Heatmap</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Likelihood vs Impact</p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative z-10 -ml-4">
        {data.length === 0 ? (
           <div className="absolute inset-0 flex items-center justify-center">
             <p className="text-xs text-muted-foreground uppercase tracking-widest">No Asset Coordinates Available</p>
           </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.3} vertical={true} horizontal={true} />
              
              <XAxis 
                type="number" 
                dataKey="impact" 
                name="Impact" 
                domain={[0, 1]} 
                tick={{ fontSize: 10, fill: '#0f172a', fontWeight: 'bold' }}
                tickFormatter={(val) => val.toFixed(1)}
                axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                tickLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              />
              
              <YAxis 
                type="number" 
                dataKey="likelihood" 
                name="Likelihood" 
                domain={[0, 1]} 
                tick={{ fontSize: 10, fill: '#0f172a', fontWeight: 'bold' }}
                tickFormatter={(val) => val.toFixed(1)}
                axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                tickLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              />
              
              <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#6366f1' }} content={<CustomTooltip />} />
              
              <Scatter data={data} shape="circle">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getStatusColor(entry.risk_level)} className="animate-in zoom-in duration-500" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Axis Labels Overlay */}
      <div className="absolute bottom-2 right-6 text-[10px] uppercase font-bold text-muted-foreground pointer-events-none">Impact Effect ➔</div>
      <div className="absolute top-24 left-2 -rotate-90 text-[10px] uppercase font-bold text-muted-foreground pointer-events-none">Likelihood ➔</div>
    </div>
  );
};

export default React.memo(RiskHeatmap);
