import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Finance from './pages/Finance'
import SavedArticles from './pages/SavedArticles'
import History from './pages/History'

// Placeholder components for routes referenced in Layout
// Remove or implement these as needed
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-screen bg-stone-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-stone-900 mb-4">{title}</h1>
      <p className="text-stone-500">This page is coming soon!</p>
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <Layout currentPageName="/">
            <Home />
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
        
        <Route path="/finance" element={
          <Layout currentPageName="/finance">
            <Finance />
          </Layout>
        } />
        
        <Route path="/personalized" element={
          <Layout currentPageName="/personalized">
            <PlaceholderPage title="Personalized Feed" />
          </Layout>
        } />
        
        <Route path="/keywords" element={
          <Layout currentPageName="/keywords">
            <PlaceholderPage title="Keyword Tracking" />
          </Layout>
        } />
        
        <Route path="/alerts" element={
          <Layout currentPageName="/alerts">
            <PlaceholderPage title="News Alerts" />
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
  )
}
