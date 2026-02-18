import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Bookmark, Clock, Sparkles, Tag, Bell, TrendingUp, LogIn } from 'lucide-react';
import { UserButton, SignedIn, SignedOut } from '@clerk/clerk-react';

export default function Layout({ children, currentPageName }: { children: React.ReactNode; currentPageName: string }) {
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

        {/* Signed-in: avatar + profile menu. Signed-out: sign-in button */}
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-10 h-10 rounded-xl',
              },
            }}
          />
        </SignedIn>
        <SignedOut>
          <Link
            to="/sign-in"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Sign In"
          >
            <LogIn className="w-5 h-5" />
          </Link>
        </SignedOut>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
