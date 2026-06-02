import { Metadata } from 'next';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nestera.finance';
export const SITE_NAME = 'Nestera';
export const SITE_DESCRIPTION =
  'Decentralized savings and investment protocol on Stellar. Non-custodial, transparent, flexible savings with smart contracts.';

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface PageMetadataParams {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  locale?: string;
  alternateLanguages?: Record<string, string>;
  noindex?: boolean;
  canonical?: string;
}

/**
 * Generate comprehensive metadata for a page including OG tags, Twitter cards, and canonical URLs
 */
export function generatePageMetadata(params: PageMetadataParams): Metadata {
  const {
    title,
    description = SITE_DESCRIPTION,
    image = DEFAULT_OG_IMAGE,
    url = SITE_URL,
    type = 'website',
    locale = 'en',
    alternateLanguages = {},
    noindex = false,
    canonical,
  } = params;

  const fullUrl = url.startsWith('http') ? url : `${SITE_URL}${url}`;
  const canonicalUrl = canonical || fullUrl;

  return {
    title,
    description,
    robots: {
      index: !noindex,
      follow: !noindex,
      googleBot: {
        index: !noindex,
        follow: !noindex,
        'max-snippet': -1,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      type,
      title,
      description,
      url: fullUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        },
        {
          url: image,
          width: 800,
          height: 420,
          alt: title,
          type: 'image/png',
        },
      ],
      locale,
      alternateLocale: Object.keys(alternateLanguages),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator: '@nestera_finance',
      site: '@nestera_finance',
    },
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${SITE_URL}/en${url}`,
        es: `${SITE_URL}/es${url}`,
        ...alternateLanguages,
      },
    },
  };
}

/**
 * Generate structured data (JSON-LD) for SEO
 */
export function generateStructuredData(type: string, data: Record<string, any>) {
  return {
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': type,
      ...data,
    }),
  };
}

/**
 * Generate Organization structured data
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: SITE_DESCRIPTION,
    sameAs: [
      process.env.NEXT_PUBLIC_TWITTER_URL || '',
      process.env.NEXT_PUBLIC_DISCORD_URL || '',
      process.env.NEXT_PUBLIC_GITHUB_URL || '',
    ].filter(Boolean),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Support',
      url: `${SITE_URL}/support`,
    },
  };
}

/**
 * Generate WebSite structured data with search action
 */
export function getWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generate Product schema for financial product
 */
export function getFinancialProductSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: 'Nestera Savings Protocol',
    description: SITE_DESCRIPTION,
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: '0',
      description: 'Non-custodial decentralized savings',
    },
    areaServed: 'Worldwide',
    feesAndCommissionsSpecification:
      'Variable depending on transaction type and network conditions',
    hasCredential: {
      '@type': 'Credential',
      credentialCategory: 'Blockchain-based financial service',
    },
  };
}

/**
 * Generate BreadcrumbList structured data
 */
export function getBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Generate FAQSchema for FAQ pages
 */
export function getFAQSchema(
  faqs: Array<{
    question: string;
    answer: string;
  }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Article schema
 */
export function getArticleSchema(article: {
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.headline,
    description: article.description,
    image: article.image,
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    author: {
      '@type': 'Organization',
      name: article.author || SITE_NAME,
      url: SITE_URL,
    },
  };
}
