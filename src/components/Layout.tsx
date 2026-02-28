import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Bookmark, Clock, Sparkles, Tag, Bell, TrendingUp, LogIn, Flame, Settings } from 'lucide-react';
import { UserButton, SignedIn, SignedOut } from '@clerk/clerk-react';

export default function Layout({ children, currentPageName }: { children: React.ReactNode; currentPageName: string }) {
  const location = useLocation();

  const navItems = [
    { name: 'Home',     icon: Home,       page: '/' },
    { name: 'Trending', icon: Flame,      page: '/trending' },
    { name: 'Finance',  icon: TrendingUp, page: '/finance' },
    { name: 'For You',  icon: Sparkles,   page: '/personalized' },
    { name: 'Keywords', icon: Tag,        page: '/keywords' },
    { name: 'Saved',    icon: Bookmark,   page: '/saved' },
    { name: 'History',  icon: Clock,      page: '/history' },
    { name: 'Settings', icon: Settings,   page: '/settings' },
  ];

  const isActive = (page: string) =>
    location.pathname === page || currentPageName === page;

  return (
    <div className="app-container flex flex-col md:flex-row">

      {/* ── Mobile top header (hidden on md+) ─────────────────────────── */}
      <header className="md:hidden flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white">
            <img src="/logo.png" alt="Shortform" className="w-full h-full object-cover" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Shortform</span>
        </Link>

        <SignedIn>
          <UserButton appearance={{ elements: { avatarBox: 'w-8 h-8 rounded-lg' } }} />
        </SignedIn>
        <SignedOut>
          <Link
            to="/sign-in"
            className="flex items-center gap-1.5 bg-white text-slate-900 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-stone-100 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </Link>
        </SignedOut>
      </header>

      {/* ── Desktop sidebar + Main content ────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Desktop sidebar (hidden on mobile) */}
        <aside className="hidden md:flex w-20 bg-slate-900 flex-col items-center py-6 gap-6 border-r border-slate-800 flex-shrink-0">
          {/* Logo */}
          <Link to="/">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-slate-700 mb-4">
              <img src="/logo.png" alt="Shortform" className="w-full h-full object-cover" />
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex flex-col gap-2 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.page} className="relative group/navitem">
                  <Link
                    to={item.page}
                    className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                      isActive(item.page)
                        ? 'text-slate-900'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {isActive(item.page) && (
                      <motion.div
                        layoutId="desktop-active-nav"
                        className="absolute inset-0 bg-white rounded-xl"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                      />
                    )}
                    <Icon className="w-5 h-5 relative z-10" />
                  </Link>
                  {/* Hover tooltip — appears to the right of the icon */}
                  <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-white bg-slate-700 rounded-lg opacity-0 group-hover/navitem:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50 shadow-lg">
                    {item.name}
                  </span>
                  {item.isPremium && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 pointer-events-none" />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Signed-in: avatar. Signed-out: prominent Sign In button with label */}
          <SignedIn>
            <UserButton appearance={{ elements: { avatarBox: 'w-10 h-10 rounded-xl' } }} />
          </SignedIn>
          <SignedOut>
            <Link
              to="/sign-in"
              className="flex flex-col items-center gap-1 w-14 py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-white hover:text-slate-900 hover:border-white transition-all"
              title="Sign In"
            >
              <LogIn className="w-5 h-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Sign In</span>
            </Link>
          </SignedOut>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
              style={{ touchAction: 'pan-y' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile bottom navigation (hidden on md+) ──────────────────── */}
      <nav className="md:hidden flex-shrink-0 bg-slate-900 border-t border-slate-800 px-1 py-2">
        <div className="flex justify-around items-center overflow-x-auto scrollbar-none gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.page);
            return (
              <Link
                key={item.page}
                to={item.page}
                className={`relative flex flex-col items-center gap-1 min-w-[52px] px-1.5 py-2 rounded-xl transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-300 active:bg-white/10'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="mobile-active-nav"
                    className="absolute inset-0 bg-white/15 rounded-xl"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className={`w-5 h-5 flex-shrink-0 relative z-10 ${active ? 'text-white' : ''}`} />
                <span className={`text-[10px] font-medium leading-tight text-center relative z-10 ${active ? 'text-white' : 'text-slate-500'}`}>
                  {item.name}
                </span>
                {item.isPremium && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
