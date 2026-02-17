import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Bookmark, Clock, LogOut, Sparkles, Tag, Bell, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Layout({ children, currentPageName }: { children: React.ReactNode; currentPageName: string }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear any stored auth tokens
    localStorage.removeItem('authToken');
    sessionStorage.clear();
    
    toast.success('Logged out successfully');
    
    // Redirect to login or home
    navigate('/');
  };

  const navItems = [
    { name: 'Home', icon: Home, page: '/' },
    { name: 'Finance', icon: TrendingUp, page: '/finance' },
    { name: 'For You', icon: Sparkles, page: '/personalized' },
    { name: 'Keywords', icon: Tag, page: '/keywords' },
    { name: 'Alerts', icon: Bell, page: '/alerts' },
    { name: 'Saved', icon: Bookmark, page: '/saved' },
    { name: 'History', icon: Clock, page: '/history' },
  ];

  return (
    <div className="flex h-screen">
      {/* Sidebar Navigation */}
      <aside className="w-20 bg-slate-900 flex flex-col items-center py-6 gap-6 border-r border-slate-800">
        {/* Logo */}
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-700 flex items-center justify-center mb-4">
          <span className="text-lg font-bold text-slate-900" style={{ fontFamily: 'monospace' }}>SF</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPageName === item.page || window.location.pathname === item.page;
            return (
              <Link
                key={item.page}
                to={item.page}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={item.name}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="w-12 h-12 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
