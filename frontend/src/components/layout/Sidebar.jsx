import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Activity, 
  Search, 
  Database, 
  FileText, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  Target,
  Network
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Database, label: 'Assets', path: '/assets' },
  { icon: Activity, label: 'Scans', path: '/scans' },
  { icon: ShieldAlert, label: 'Vulnerabilities', path: '/vulnerabilities' },
  { icon: Target, label: 'Threat Intel', path: '/intelligence' },
  { icon: Network, label: 'Topology', path: '/topology' },
  { icon: FileText, label: 'Reports', path: '/reports' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { logout } = useAuth();

  return (
    <aside 
      className={cn(
        "relative flex flex-col bg-card border-r border-border shadow-2xl transition-all duration-300 ease-in-out z-20",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo Section */}
      <div className="flex items-center h-14 px-4 border-b border-indigo-brand-500/30">
        <div className="p-1.5 bg-indigo-brand-500 rounded-lg shadow-lg shadow-indigo-brand-500/20 shrink-0">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        {!isCollapsed && (
          <span className="ml-3 font-bold text-xl tracking-tight text-foreground">
            DRPE
          </span>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center px-3 py-2 rounded-lg transition-all duration-200 group relative",
              isActive 
                ? "bg-indigo-brand-500/20 text-indigo-brand-600 dark:text-white shadow-sm border border-indigo-brand-500/30 font-semibold"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-110", isActive && "text-indigo-brand-600 dark:text-white")} />
                {!isCollapsed && (
                  <span className="ml-3 font-medium text-xs tracking-wide">{item.label}</span>
                )}
                {isActive && (
                  <motion.div 
                    layoutId="active-nav"
                    className="absolute left-0 w-1 h-6 bg-indigo-brand-500 rounded-r-full shadow-[0_0_8px_rgba(91,33,182,0.8)]"
                  />
                )}
                {isCollapsed && (
                  <div className="absolute left-16 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-border shadow-md">
                    {item.label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout & Collapse */}
      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={logout}
          className={cn(
            "flex items-center w-full px-4 py-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-all duration-200 group relative",
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="ml-3 font-medium">Logout</span>}
        </button>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-full h-10 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors border border-transparent"
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
