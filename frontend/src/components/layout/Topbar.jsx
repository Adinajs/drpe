import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Bell, 
  Search, 
  Sun, 
  Moon, 
  User, 
  ShieldCheck,
  X,
  Activity,
  Camera,
  RefreshCw,
  Target,
  ShieldAlert
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSearch } from '../../context/SearchContext';
import { cn } from '../../utils/cn';
import { toast } from 'react-hot-toast';

const Topbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { searchTerm, setSearchTerm } = useSearch();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/activity-logs`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('drpe_session_token') || import.meta.env.VITE_API_TOKEN}`
          }
        });
        const data = await response.json();
        if (data.success) {
          setNotifications(data.data);
          // Only set unread if it's a new batch and panel is closed
          if (!showNotifications) setUnreadCount(prev => prev > 0 ? prev : 2);
        }
      } catch (err) {
        console.error("Failed to fetch activity logs", err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [showNotifications]);

  const getTimeAgo = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  // Get readable page name from path
  const getPageTitle = () => {
    const path = location.pathname.split('/')[1] || 'Dashboard';
    return path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
  };

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">
          {getPageTitle()}
        </h1>
        <div className="h-4 w-px bg-border hidden md:block"></div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground uppercase font-medium tracking-widest px-2 py-1 bg-muted rounded-md border border-border">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-brand-500" />
          Secure Session
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search Bar - only show on data-heavy pages (Assets, Scans, Vulns, Intel) */}
        {['/assets', '/scans', '/vulnerabilities', '/intelligence'].includes(location.pathname) && (
          <div className="relative hidden lg:block mr-2 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-brand-500 transition-colors" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search assets, CVEs..."
              className="h-9 w-64 bg-background border border-border rounded-lg pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all font-medium"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-all border border-transparent hover:border-border"
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="relative">
            <button 
              onClick={() => { setShowNotifications(!showNotifications); setUnreadCount(0); }}
              className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-all relative border border-transparent hover:border-border"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-status-critical rounded-full border-2 border-background shadow-[0_0_0_2px_theme(colors.card)] scale-100 animate-pulse"></span>
              )}
            </button>
            
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('drpe:take-snapshot'))}
              className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-all border border-transparent hover:border-border"
              title="Save Posture Snapshot"
            >
              <Camera className="w-5 h-4" />
            </button>

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('drpe:refresh-dashboard'))}
              className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-all border border-transparent hover:border-border"
              title="Refresh Dashboard"
            >
              <RefreshCw className="w-5 h-4" />
            </button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-80 bg-card/95 backdrop-blur-xl border border-border shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-indigo-brand-500/10 rounded-lg">
                      <Activity className="w-4 h-4 text-indigo-brand-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-foreground uppercase tracking-widest">Platform Activity Log</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Mission System Events</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowNotifications(false)} 
                    className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                      <div className="w-10 h-10 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">System Quiet</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="p-4 border-b border-border/50 hover:bg-indigo-brand-500/5 transition-all cursor-pointer group relative">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "mt-0.5 p-1.5 rounded-lg border",
                            n.type === 'alert' ? 'bg-status-critical/10 border-status-critical/20' : 
                            n.type === 'success' ? 'bg-status-safe/10 border-status-safe/20' : 
                            'bg-indigo-brand-500/10 border-indigo-brand-500/20'
                          )}>
                             {n.title.toLowerCase().includes('asset') ? <Target className="w-3 h-3 text-indigo-brand-500" /> :
                              n.title.toLowerCase().includes('vulnerability') ? <ShieldAlert className="w-3 h-3 text-status-critical" /> :
                              <Activity className="w-3 h-3 text-indigo-brand-500" />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className={cn(
                              "text-xs font-bold leading-tight group-hover:text-foreground transition-colors",
                              n.type === 'alert' ? 'text-status-critical' : 
                              n.type === 'success' ? 'text-status-safe' : 
                              'text-foreground/90'
                            )}>
                              {n.title}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-bold font-mono tracking-tighter">
                                {getTimeAgo(n.time)}
                              </span>
                              <div className="h-1 w-1 bg-border rounded-full"></div>
                              <span className="text-[10px] text-indigo-brand-500/70 font-black uppercase tracking-widest">
                                {n.type || 'INFO'}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Status Indicator Bar */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                          n.type === 'alert' ? 'bg-status-critical' : 'bg-indigo-brand-500'
                        )}></div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-muted/40 text-center border-t border-border">
                  <span className="text-[10px] text-indigo-brand-500 font-black uppercase tracking-widest hover:text-indigo-brand-400 transition-colors cursor-pointer flex items-center justify-center gap-2">
                    <Activity className="w-3 h-3" />
                    Synchronized with Mission Control
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-px h-6 bg-border mx-2"></div>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-1 group cursor-pointer" onClick={() => (window.location.href = '/settings')}>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-indigo-brand-500 transition-colors">
              {user?.full_name || 'Authorized User'}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              {user?.role || 'Superuser'}
            </p>
          </div>
          <div className="h-9 w-9 bg-indigo-brand-600/20 border border-indigo-brand-500/30 rounded-lg flex items-center justify-center group-hover:bg-indigo-brand-600/40 transition-all overflow-hidden">
            {user?.avatar_url ? (
               <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
               <User className="w-5 h-5 text-indigo-brand-500" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
