import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, Mail, Lock, Loader2, AlertCircle, ArrowRight, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success('Welcome back!');
        navigate('/');
      } else {
        toast.error(result.message || 'Verification Failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred during authentication');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden transition-colors duration-300">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-6 right-6 z-50 p-3 rounded-xl bg-card/50 border border-border hover:border-indigo-brand-500/50 transition-all shadow-lg backdrop-blur-sm group"
        aria-label="Toggle theme"
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-indigo-brand-400 group-hover:rotate-45 transition-transform" />
        ) : (
          <Moon className="w-5 h-5 text-indigo-brand-600 group-hover:-rotate-12 transition-transform" />
        )}
      </button>

      {/* Cyber Background Background */}
      <div className="absolute inset-0 cyber-grid opacity-[0.05]"></div>
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-brand-600/10 blur-[100px] rounded-full"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/10 blur-[100px] rounded-full"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-card p-8 border-white/10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-brand-500/20 mb-4 group cursor-pointer hover:scale-105 transition-transform">
              <ShieldAlert className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
              Sign In
            </h1>
            <p className="text-muted-foreground text-sm font-medium tracking-wide">
              Welcome back to the DRPE network
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-brand-500 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full h-12 bg-card/40 border border-border rounded-xl pl-10 pr-4 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Password
                </label>
                <Link to="#" className="text-[10px] font-bold text-indigo-brand-500 hover:text-indigo-brand-400 uppercase tracking-widest transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-brand-500 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-12 bg-card/40 border border-border rounded-xl pl-10 pr-12 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-bold text-sm tracking-[0.1em] rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-brand-600/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  SIGN IN
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground font-medium">
              Don't have an account?{' '}
              <Link to="/signup" className="text-indigo-brand-500 hover:text-indigo-brand-400 font-bold transition-colors">
                Sign Up
              </Link>
            </p>
            
            <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
              Secure login portal
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-center text-muted-foreground/40 text-[10px] font-bold uppercase tracking-[0.3em]">
          DRPE X-CYBER DEFENSE SYSTEM © 2026
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
