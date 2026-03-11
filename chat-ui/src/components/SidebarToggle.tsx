'use client';

import { useState, useEffect } from 'react';

interface SidebarToggleProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export default function SidebarToggle({ children, sidebar }: SidebarToggleProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`flex-shrink-0 transition-all duration-200 ${
          collapsed ? 'w-0 overflow-hidden' : 'w-64'
        }`}
      >
        {sidebar}
      </div>

      {/* Toggle button */}
      <button
        onClick={toggle}
        className="flex h-full w-5 flex-shrink-0 items-center justify-center border-r border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title={collapsed ? 'Show history' : 'Hide history'}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
          />
        </svg>
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
