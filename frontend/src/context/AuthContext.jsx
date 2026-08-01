import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored session on mount
    const storedUser = localStorage.getItem('drpe_user');
    const token = localStorage.getItem('drpe_token');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('drpe_user');
        localStorage.removeItem('drpe_token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const result = await api.login({ email, password });
      
      if (result.success) {
        const { access_token, user: userData } = result.data;
        setUser(userData);
        localStorage.setItem('drpe_user', JSON.stringify(userData));
        localStorage.setItem('drpe_token', access_token);
        return { success: true };
      }
      return { success: false, message: result.message || 'Login failed' };
    } catch (e) {
      return { success: false, message: e.message || 'Mission Communication Failure' };
    }
  };

  const signup = async (name, email, password) => {
    try {
      const result = await api.signup({ full_name: name, email, password });
      
      if (result.success) {
        const { access_token, user: userData } = result.data;
        setUser(userData);
        localStorage.setItem('drpe_user', JSON.stringify(userData));
        localStorage.setItem('drpe_token', access_token);
        return { success: true };
      }
      return { success: false, message: result.message || 'Signup failed' };
    } catch (e) {
      return { success: false, message: e.message || 'Mission Communication Failure' };
    }
  };

  const updateUserProfile = (updatedData) => {
    const newUser = { ...user, ...updatedData };
    setUser(newUser);
    localStorage.setItem('drpe_user', JSON.stringify(newUser));
  };

  const logout = () => {
    api.logout();
    setUser(null);
    localStorage.removeItem('drpe_user');
    localStorage.removeItem('drpe_token');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      signup, 
      logout, 
      updateUserProfile,
      loading, 
      isAuthenticated: !!user 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
