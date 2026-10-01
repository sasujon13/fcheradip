export type CheradipProductSite = {
  id: 'ai' | 'tutor' | 'agent' | 'ailt' | 'ecommerce';
  name: string;
  description: string;
  icon: string;
  url: string;
  localRoute: string;
  status?: string;
};

/**
 * Canonical product directory used by the main listing and subdomain routing.
 * Keep product URLs here instead of scattering them across components.
 */
export const CHERADIP_PRODUCT_SITES: readonly CheradipProductSite[] = [
  {
    id: 'ai',
    name: 'Cheradip AI',
    description: 'Explore every Cheradip AI service from one place.',
    icon: '✨',
    url: 'https://ai.cheradip.com',
    localRoute: '/ai',
  },
  {
    id: 'tutor',
    name: 'AI টিউটর',
    description: 'Subject, chapter and topic-aware learning assistance for students.',
    icon: '🎓',
    url: 'https://tutor.cheradip.com',
    localRoute: '/tutor',
  },
  {
    id: 'ailt',
    name: 'AI Language Tutor',
    description: 'Offline-first language learning, pronunciation, practice and AI explanations.',
    icon: '🌐',
    url: 'https://ailt.cheradip.com',
    localRoute: '/ailt',
  },
  {
    id: 'agent',
    name: 'Cheradip AI Agent',
    description: 'AI coding agent, chat, composer and multi-file development tools.',
    icon: '🤖',
    url: 'https://agent.cheradip.com',
    localRoute: '/agent',
  },
  {
    id: 'ecommerce',
    name: 'eCommerce',
    description: 'Cheradip product marketplace. Full commerce development is the next approved phase.',
    icon: '🛒',
    url: 'https://ecommerce.cheradip.com',
    localRoute: '/ecommerce',
    status: 'Coming next',
  },
] as const;

const PRODUCT_ROUTE_BY_HOST: Readonly<Record<string, string>> = {
  'ai.cheradip.com': '/ai',
  'tutor.cheradip.com': '/tutor',
  'agent.cheradip.com': '/agent',
  'ailt.cheradip.com': '/ailt',
  'ecommerce.cheradip.com': '/ecommerce',
};

export function productRouteForHostname(hostname: string): string | undefined {
  return PRODUCT_ROUTE_BY_HOST[hostname.trim().toLowerCase()];
}

export function productHrefForHostname(product: CheradipProductSite, hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
    ? product.localRoute
    : product.url;
}
