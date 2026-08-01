import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  ShieldAlert, 
  Key, 
  Monitor, 
  Sun, 
  Moon, 
  Save, 
  RefreshCw, 
  ShieldCheck,
  Zap,
  Globe,
  Bell,
  Database,
  Eye,
  EyeOff,
  Activity,
  Terminal,
  Cpu,
  Lock,
  Clock,
  Mail,
  BrainCircuit,
  Camera,
  Check
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';
import { api } from '../api';

const AVATARS = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=Ghost",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Phantom",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Buster",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Shadow",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Recon",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Elite"
];

const SettingsPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, updateUserProfile } = useAuth();
  
  // Profile Data
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar_url || AVATARS[0]);
  
  // Security Data
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProfile = async () => {
    const tid = toast.loading('Synchronizing Operative Identity...');
    try {
      const res = await api.put('/api/user/profile', {
        full_name: fullName,
        avatar_url: selectedAvatar
      });
      if (res.success) {
        updateUserProfile(res.data);
        toast.success('Identity Verified & Updated.', { id: tid });
      }
    } catch (error) {
      toast.error('Identity Synchronisation Failure.', { id: tid });
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return toast.error('Both password fields are mandatory.');
    
    setIsChangingPassword(true);
    const tid = toast.loading('Establishing Secure Key Rotation...');
    try {
      const res = await api.post('/api/user/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      if (res.success) {
        toast.success('Access Key Rotated Successfully.', { id: tid });
        setCurrentPassword('');
        setNewPassword('');
      } else {
        toast.error(res.message || 'Key rotation failed.', { id: tid });
      }
    } catch (error) {
      toast.error('Strategic Access Failure. Check credentials.', { id: tid });
    } finally {
      setIsChangingPassword(false);
    }
  };



  const Section = ({ title, description, children, icon: Icon, action, actionLabel, actionLoading }) => (
    <div className="space-y-6">
      <div className="pb-1 border-b border-border/30 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {Icon && <Icon className="w-4 h-4 text-indigo-brand-500" />}
            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">{title}</h3>
          </div>
          <p className="text-xs text-foreground/80 font-medium tracking-tight mt-1">{description}</p>
        </div>
        {action && (
          <button 
            onClick={action}
            disabled={actionLoading}
            className="px-4 py-1.5 bg-indigo-brand-600/10 hover:bg-indigo-brand-600 text-indigo-brand-500 hover:text-white border border-indigo-brand-600/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-12 pb-20"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-accent rounded-2xl border border-border">
            <Settings className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono uppercase tracking-tight">Mission Control Settings</h1>
            <p className="text-xs text-foreground font-medium tracking-widest uppercase text-indigo-brand-500">Global Configuration & Operative Identity</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <div className="px-3 py-1.5 bg-status-safe/10 border border-status-safe/20 rounded-md text-[10px] font-bold text-status-safe uppercase tracking-widest">
              Secured Connection: AES-256
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile & Health Overlay */}
        <div className="space-y-6">
          <div className="glass-card p-8 border-border/50 flex flex-col items-center text-center space-y-6">
            <div className="relative group">
              <div className="w-24 h-24 bg-indigo-brand-600/10 border-2 border-indigo-brand-500/30 rounded-2xl flex items-center justify-center overflow-hidden shadow-inner ring-4 ring-background/50">
                <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-2 -right-2 p-2 bg-indigo-brand-600 rounded-lg text-white shadow-lg border-2 border-background">
                <Camera className="w-3 h-3" />
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="text-lg font-bold text-foreground leading-tight">{fullName || 'Authorized User'}</h4>
              <p className="text-[10px] font-black text-indigo-brand-500 uppercase tracking-[0.2em]">{user?.role || 'FIELD OPERATIVE'}</p>
              <p className="text-[10px] font-medium text-foreground font-mono">{user?.email}</p>
            </div>

            <div className="w-full grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
               {AVATARS.map((av, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setSelectedAvatar(av)}
                    className={cn(
                      "aspect-square rounded-lg border-2 transition-all p-1 hover:scale-105",
                      selectedAvatar === av ? "border-indigo-brand-500 bg-indigo-brand-500/10" : "border-transparent bg-muted/40 grayscale hover:grayscale-0"
                    )}
                  >
                    <img src={av} alt={`AV-${idx}`} className="w-full h-full object-contain" />
                  </button>
               ))}
            </div>
          </div>
        </div>

        {/* Configuration Matrix */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* Operative Settings */}
          <Section 
            title="Operative Identity" 
            description="Manage your tactical callsign and visual identifier within the platform."
            icon={User}
            action={handleSaveProfile}
            actionLabel="Sync Identity"
          >
            <div className="glass-card p-6 border-border/50 space-y-4">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">Operational Callsign</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter Full Name..."
                    className="w-full h-11 bg-background/50 border border-border rounded-xl px-4 text-xs font-bold focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all shadow-inner"
                  />
               </div>
            </div>
          </Section>

          {/* Platform Access Security */}
          <Section 
            title="Security Architecture" 
            description="Rotate your primary access keys to maintain operational security."
            icon={Key}
            action={handleChangePassword}
            actionLabel="Rotate Key"
            actionLoading={isChangingPassword}
          >
            <div className="glass-card p-6 border-border/50 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">Current Access Key</label>
                     <div className="relative group">
                       <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-brand-500 transition-colors" />
                       <input
                         type="password"
                         value={currentPassword}
                         onChange={(e) => setCurrentPassword(e.target.value)}
                         placeholder="••••••••"
                         className="w-full h-10 bg-background/50 border border-border rounded-xl pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all font-mono"
                       />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">New Access Key</label>
                     <div className="relative group">
                       <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-brand-500 transition-colors" />
                       <input
                         type="password"
                         value={newPassword}
                         onChange={(e) => setNewPassword(e.target.value)}
                         placeholder="••••••••"
                         className="w-full h-10 bg-background/50 border border-border rounded-xl pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all font-mono"
                       />
                     </div>
                  </div>
                </div>
            </div>
          </Section>

        </div>
      </div>

    </motion.div>
  );
};

export default SettingsPage;
