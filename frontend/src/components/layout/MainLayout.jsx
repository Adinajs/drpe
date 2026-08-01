import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const MainLayout = () => {
  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-indigo-brand-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">
        {/* Cyber background elements */}
        <div className="absolute inset-0 cyber-grid pointer-events-none opacity-[0.03] dark:opacity-[0.07]"></div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-brand-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pt-2 px-4 pb-4 relative">
          <div className="max-w-7xl mx-auto space-y-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
