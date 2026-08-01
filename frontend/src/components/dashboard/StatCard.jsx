import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';

const StatCard = ({ title, value, trend, trendValue, icon: Icon, color = 'indigo', delay = 0 }) => {
  const isPositive = trend === 'up';
  const isNegative = trend === 'down';

  const colorVariants = {
    indigo: 'text-indigo-brand-500 bg-indigo-brand-500/10 border-indigo-brand-500/20 shadow-indigo-brand-500/5',
    critical: 'text-status-critical bg-status-critical/10 border-status-critical/20 shadow-status-critical/5',
    safe: 'text-status-safe bg-status-safe/10 border-status-safe/20 shadow-status-safe/5',
    high: 'text-status-high bg-status-high/10 border-status-high/20 shadow-status-high/5',
    // Fallback for legacy calls
    blue: 'text-indigo-brand-500 bg-indigo-brand-500/10 border-indigo-brand-500/20 shadow-indigo-brand-500/5',
    red: 'text-status-critical bg-status-critical/10 border-status-critical/20 shadow-status-critical/5',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-card p-4 flex flex-col justify-between group overflow-hidden"
    >
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-foreground transition-colors">
            {title}
          </p>
          <h3 className="text-2xl font-bold text-foreground">
            {value}
          </h3>
        </div>
        <div className={cn(
          "p-2.5 rounded-xl border transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
          colorVariants[color] || colorVariants.indigo
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 relative z-10">
        <div className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
          isPositive ? "bg-status-safe/10 text-status-safe" : 
          isNegative ? "bg-status-critical/10 text-status-critical" : 
          "bg-muted text-muted-foreground"
        )}>
          {isPositive && <TrendingUp className="w-3 h-3" />}
          {isNegative && <TrendingDown className="w-3 h-3" />}
          {!trend && <Minus className="w-3 h-3" />}
          {trendValue}
        </div>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
          Since last scan
        </span>
      </div>
      
      {/* Dynamic background glow */}
      <div className={cn(
        "absolute -bottom-12 -right-12 w-24 h-24 blur-[60px] opacity-[0.12] transition-opacity group-hover:opacity-25 rounded-full",
        (color === 'indigo' || color === 'blue') ? "bg-indigo-brand-500" :
        (color === 'critical' || color === 'red') ? "bg-status-critical" :
        color === 'safe' ? "bg-status-safe" :
        "bg-status-high"
      )}></div>
    </motion.div>
  );
};

export default StatCard;
