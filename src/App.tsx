import { createContext, useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { SignedIn, SignedOut, RedirectToSignIn, useUser, useSession } from '@clerk/clerk-react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Layout from './components/Layout'
import Home from './pages/Home'
import { api } from './api'
import { setSupabaseToken } from './lib/supabaseClient'

// Pages wait for this before querying Supabase so RLS (auth.jwt() ->> 'sub') works.
export const ApiReadyContext = createContext(false)

const Finance = lazy(() => import('./pages/Finance'))
const SavedArticles = lazy(() => import('./pages/SavedArticles'))
const History = lazy(() => import('./pages/History'))
const SignInPage = lazy(() => import('./pages/SignInPage'))
const SignUpPage = lazy(() => import('./pages/SignUpPage'))
const Keywords = lazy(() => import('./pages/Keywords'))
const Personalized = lazy(() => import('./pages/Personalized'))
const Trending = lazy(() => import('./pages/Trending'))
const Settings = lazy(() => import('./pages/Settings'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const About = lazy(() => import('./pages/About'))
const Article = lazy(() => import('./pages/Article'))

// Placeholder components for routes referenced in Layout
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-screen bg-stone-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-stone-900 mb-4">{title}</h1>
      <p className="text-stone-500">This page is coming soon!</p>
    </div>
  </div>
)

// Initialises Supabase with the signed-in Clerk user ID and JWT.
// The two operations are merged into one effect so that api.setUser() is only
// called AFTER the JWT is injected into the Supabase client — this prevents
// the race condition where pages query Supabase before RLS can authenticate them.
function UserInitialiser({ setApiReady }: { setApiReady: (ready: boolean) => void }) {
  const { user } = useUser()
  const { session } = useSession()

  useEffect(() => {
    if (!session || !user?.id) {
      api.clearUser()
      setApiReady(false)
      return
    }

    let cancelled = false

    async function init() {
      if (cancelled) return
      const token = await session!.getToken({ template: 'supabase' })
      if (token && !cancelled) {
        setSupabaseToken(token)
        if (!cancelled) {
          api.setUser(user!.id)
          setApiReady(true)
        }
      } else if (!cancelled) {
        // getToken() returns null when the Clerk JWT Template named "supabase" does
        // not exist in the Clerk Dashboard, or when it is misconfigured.
        // Supabase operations will be blocked for this user until this is resolved.
        console.error(
          '[UserInitialiser] Clerk getToken({ template: "supabase" }) returned null. ' +
          'Supabase API calls will not work for this user.\n' +
          'Fix: Clerk Dashboard → JWT Templates → create a template named exactly "supabase" ' +
          'with {"sub": "{{user.id}}"} in the claims (RS256). ' +
          'Then add the Clerk JWKS endpoint to Supabase: Authentication → JWT Settings.'
        )
      }
    }

    init()

    // Refresh every 50 s — Clerk tokens expire after ~60 s.
    const interval = setInterval(async () => {
      if (cancelled) return
      const token = await session!.getToken({ template: 'supabase' })
      if (token && !cancelled) {
        setSupabaseToken(token)
      } else if (!cancelled) {
        console.error(
          '[UserInitialiser] Token refresh failed: Clerk getToken({ template: "supabase" }) returned null.'
        )
      }
    }, 50_000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [user?.id, session]) // setApiReady is a stable setState setter — no need in deps

  return null
}

// Wrapper that redirects unauthenticated users to sign-in (used only for auth-required pages)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  )
}

export default function App() {
  const [apiReady, setApiReady] = useState(false)

  return (
    <ThemeProvider>
    <ApiReadyContext.Provider value={apiReady}>
    <BrowserRouter>
      <UserInitialiser setApiReady={setApiReady} />
      <Suspense fallback={null}>
      <Routes>
        {/* Auth routes */}
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        {/* Public app routes — accessible without signing in */}
        <Route path="/" element={
          <Layout currentPageName="/">
            <Home />
          </Layout>
        } />

        <Route path="/trending" element={
          <Layout currentPageName="/trending">
            <Trending />
          </Layout>
        } />

        <Route path="/finance" element={
          <Layout currentPageName="/finance">
            <Finance />
          </Layout>
        } />

        <Route path="/personalized" element={
          <Layout currentPageName="/personalized">
            <Personalized />
          </Layout>
        } />

        <Route path="/keywords" element={
          <Layout currentPageName="/keywords">
            <Keywords />
          </Layout>
        } />

        <Route path="/settings" element={
          <Layout currentPageName="/settings">
            <Settings />
          </Layout>
        } />

        <Route path="/privacy-policy" element={
          <Layout currentPageName="/privacy-policy">
            <PrivacyPolicy />
          </Layout>
        } />

        <Route path="/about" element={
          <Layout currentPageName="/about">
            <About />
          </Layout>
        } />

        <Route path="/alerts" element={
          <Layout currentPageName="/alerts">
            <PlaceholderPage title="News Alerts" />
          </Layout>
        } />

        <Route path="/saved" element={
          <Layout currentPageName="/saved">
            <SavedArticles />
          </Layout>
        } />

        <Route path="/history" element={
          <Layout currentPageName="/history">
            <History />
          </Layout>
        } />

        <Route path="/article/:slug" element={
          <Layout currentPageName="/article">
            <Article />
          </Layout>
        } />
      </Routes>
      </Suspense>
      <Analytics />
      <SpeedInsights />
    </BrowserRouter>
    </ApiReadyContext.Provider>
    </ThemeProvider>
  )
}
