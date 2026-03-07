import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, Bookmark, Clock, Sparkles, Tag, TrendingUp,
  LogIn, Flame, Settings, Info, Shield, MoreHorizontal, X,
} from 'lucide-react';
import { UserButton, SignedIn, SignedOut } from '@clerk/clerk-react';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Shortform',
  url: 'https://shortform.news',
  logo: 'https://shortform.news/logo.webp',
  description: 'AI-powered short-form news summaries from trusted sources worldwide.',
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Shortform',
  url: 'https://shortform.news',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://shortform.news/keywords?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

// Primary tabs shown directly in the bottom nav bar (max 4 + "More")
const primaryNavItems = [
  { name: 'Home', icon: Home, page: '/' },
  { name: 'Trending', icon: Flame, page: '/trending' },
  { name: 'For You', icon: Sparkles, page: '/personalized' },
  { name: 'Keywords', icon: Tag, page: '/keywords' },
];

// Secondary items accessible via the "More" bottom sheet
const secondaryNavItems = [
  { name: 'Finance', icon: TrendingUp, page: '/finance' },
  { name: 'Saved', icon: Bookmark, page: '/saved' },
  { name: 'History', icon: Clock, page: '/history' },
  { name: 'Settings', icon: Settings, page: '/settings' },
  { name: 'About', icon: Info, page: '/about' },
  { name: 'Privacy', icon: Shield, page: '/privacy-policy' },
];

// All items combined for the desktop sidebar
const allNavItems = [...primaryNavItems, ...secondaryNavItems];

export default function Layout({ children, currentPageName }: { children: React.ReactNode; currentPageName: string }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (page: string) =>
    location.pathname === page || currentPageName === page;

  // Highlight "More" when the current page is a secondary nav item
  const isMoreActive = secondaryNavItems.some(item => isActive(item.page));

  return (
    <div className="app-container flex flex-col md:flex-row">
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(websiteSchema)}</script>
      </Helmet>

      {/* ── Mobile top header (hidden on md+) ─────────────────────────── */}
      <header className="md:hidden flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between fixed top-0 inset-x-0 z-50">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden">
            <img src="/logo.webp" alt="Shortform" fetchPriority="high" className="w-full h-full object-contain" />
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
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#f5f0e8] mb-4">
              <img src="/logo.webp" alt="Shortform" fetchPriority="high" className="w-full h-full object-cover scale-[1.75]" />
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex flex-col gap-2 flex-1">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.page} className="relative group/navitem">
                  <Link
                    to={item.page}
                    className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isActive(item.page)
                      ? 'text-slate-900'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    {isActive(item.page) && (
                      <span className="absolute inset-0 bg-white rounded-xl" />
                    )}
                    <Icon className="w-5 h-5 relative z-10" />
                  </Link>
                  {/* Hover tooltip — appears to the right of the icon */}
                  <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-white bg-slate-700 rounded-lg opacity-0 group-hover/navitem:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50 shadow-lg">
                    {item.name}
                  </span>
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
              <span className="text-xs font-semibold uppercase tracking-wide">Sign In</span>
            </Link>
          </SignedOut>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 h-full pt-[60px] md:pt-0 pb-[calc(56px+max(8px,env(safe-area-inset-bottom)))] md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation — 5 tabs (hidden on md+) ─────────── */}
      <nav
        className="md:hidden flex-shrink-0 bg-slate-900 border-t border-slate-800 fixed bottom-0 inset-x-0 z-50"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-stretch">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.page);
            return (
              <Link
                key={item.page}
                to={item.page}
                className={`relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] px-1 pt-2 pb-1 transition-colors ${
                  active ? 'text-white' : 'text-slate-500 active:bg-white/10'
                }`}
              >
                {/* Top accent line for active tab */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
                )}
                {/* Background highlight for active tab */}
                {active && (
                  <span className="absolute inset-x-1 inset-y-0 bg-white/20 rounded-xl" />
                )}
                <Icon className={`w-5 h-5 flex-shrink-0 relative z-10 ${active ? 'text-white' : ''}`} />
                <span className={`text-xs font-medium leading-tight text-center relative z-10 ${active ? 'text-white' : 'text-slate-500'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] px-1 pt-2 pb-1 transition-colors ${
              isMoreActive ? 'text-white' : 'text-slate-500 active:bg-white/10'
            }`}
          >
            {isMoreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
            {isMoreActive && (
              <span className="absolute inset-x-1 inset-y-0 bg-white/20 rounded-xl" />
            )}
            <MoreHorizontal className={`w-5 h-5 relative z-10 ${isMoreActive ? 'text-white' : ''}`} />
            <span className={`text-xs font-medium leading-tight text-center relative z-10 ${isMoreActive ? 'text-white' : 'text-slate-500'}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── More menu bottom sheet ─────────────────────────────────────── */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 inset-x-0 bg-slate-900 rounded-t-3xl border-t border-slate-800"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-base font-semibold text-white">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white active:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Secondary nav grid */}
            <div className="px-4 pb-2 grid grid-cols-3 gap-3">
              {secondaryNavItems.map(({ name, icon: Icon, page }) => {
                const active = isActive(page);
                return (
                  <Link
                    key={page}
                    to={page}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-colors ${
                      active
                        ? 'bg-white text-slate-900'
                        : 'bg-slate-800 text-slate-300 active:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium text-center">{name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
