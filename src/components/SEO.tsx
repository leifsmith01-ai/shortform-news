import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://shortform.news';

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  publishedTime?: string;
  section?: string;
}

export default function SEO({ title, description, canonical, ogImage, ogType = 'website', publishedTime, section }: SEOProps) {
  const fullTitle = `${title} | Shortform`;
  const canonicalUrl = `${BASE_URL}${canonical}`;
  const image = ogImage || `${BASE_URL}/logo.webp`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      {/* article:* — Google News Publisher Center signals */}
      {ogType === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {ogType === 'article' && section && (
        <meta property="article:section" content={section} />
      )}
      {ogType === 'article' && (
        <meta property="article:author" content="Shortform" />
      )}

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={canonicalUrl} />
      <meta property="twitter:title" content={fullTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />
    </Helmet>
  );
}
