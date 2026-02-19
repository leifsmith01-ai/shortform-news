import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from '@clerk/clerk-react'
import Layout from './components/Layout'
import Home from './pages/Home'
import Finance from './pages/Finance'
import SavedArticles from './pages/SavedArticles'
import History from './pages/History'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import Keywords from './pages/Keywords'
import Personalized from './pages/Personalized'
import { api } from './api'

// Placeholder components for routes referenced in Layout
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-screen bg-stone-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-stone-900 mb-4">{title}</h1>
      <p className="text-stone-500">This page is coming soon!</p>
    </div>
  </div>
)

// Initialises Supabase with the signed-in Clerk user ID
function UserInitialiser() {
  const { user } = useUser()

  useEffect(() => {
    if (user?.id) {
      api.setUser(user.id)
    } else {
      api.clearUser()
    }
  }, [user?.id])

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
  return (
    <BrowserRouter>
      <UserInitialiser />
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

        <Route path="/finance" element={
          <Layout currentPageName="/finance">
            <Finance />
          </Layout>
        } />

        <Route path="/personalized" element={
          <ProtectedRoute>
            <Layout currentPageName="/personalized">
              <Personalized />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/keywords" element={
          <Layout currentPageName="/keywords">
            <Keywords />
          </Layout>
        } />

        <Route path="/alerts" element={
          <Layout currentPageName="/alerts">
            <PlaceholderPage title="News Alerts" />
          </Layout>
        } />

        {/* Auth-required routes — saving and history need a user ID */}
        <Route path="/saved" element={
          <ProtectedRoute>
            <Layout currentPageName="/saved">
              <SavedArticles />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/history" element={
          <ProtectedRoute>
            <Layout currentPageName="/history">
              <History />
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
