/** Bookable services and design-bundle defaults (overridden by Firestore when live). */
export const SERVICES = {
  gel: {
    key: 'gel',
    label: 'Gel manicure',
    price: 400,
    duration: '1–2 hours',
  },
  extensions: {
    key: 'extensions',
    label: 'Soft gel extensions',
    price: 550,
    duration: '1½–3 hours',
  },
  removal: {
    key: 'removal',
    label: 'Removal',
    price: 200,
    duration: 'Up to 1 hour',
  },
};

export const DEFAULT_BUNDLES = [
  {
    key: 'a',
    label: 'Bundle A',
    description: '1 color + 1 design or accessory',
    price: 0,
    quoteOnly: true,
    order: 1,
    featured: false,
  },
  {
    key: 'b',
    label: 'Bundle B',
    description: '2 colors + 1 design or accessory',
    price: 0,
    quoteOnly: true,
    order: 2,
    featured: false,
  },
  {
    key: 'c',
    label: 'Bundle C',
    description: '1 color + 2 designs or accessories',
    price: 0,
    quoteOnly: true,
    order: 3,
    featured: false,
  },
  {
    key: 'd',
    label: 'Bundle D',
    description: '2 colors + 2 designs or accessories',
    price: 0,
    quoteOnly: true,
    order: 4,
    featured: false,
  },
  {
    key: 'glam',
    label: 'All-Out Glam',
    description: 'Client’s call — higher color count, designs, and complexity',
    price: 0,
    quoteOnly: true,
    order: 5,
    featured: true,
  },
];

export const STUDIO_EMAIL = 'acd.dimaano@gmail.com';

let liveServices = null;
let liveBundles = null;

export function setLivePricing({ services, bundles } = {}) {
  if (services?.length) {
    liveServices = Object.fromEntries(
      services.filter((s) => s.key).map((s) => [
        s.key,
        {
          key: s.key,
          label: s.label,
          price: Number(s.price) || 0,
          duration: s.duration || SERVICES[s.key]?.duration || '',
        },
      ])
    );
  }
  if (bundles?.length) {
    liveBundles = bundles
      .filter((b) => b.active !== false)
      .map((b) => ({
        key: b.key,
        label: b.label,
        description: b.description || '',
        price: Number(b.price) || 0,
        quoteOnly: b.quoteOnly === true,
        featured: Boolean(b.featured),
        order: Number(b.order) || 0,
      }))
      .sort((a, b) => a.order - b.order);
  }
}

export function getService(key) {
  return liveServices?.[key] || SERVICES[key] || null;
}

export function getAllServices() {
  return liveServices || SERVICES;
}

export function getBundles() {
  return liveBundles?.length ? liveBundles : DEFAULT_BUNDLES;
}

export function formatBundlePrice(bundle) {
  const price = Number(bundle?.price) || 0;
  if (bundle?.quoteOnly === true || price <= 0) return 'Quote';
  return `₱${price.toLocaleString('en-PH')}`;
}

export function formatServicePrice(service) {
  const price = Number(service?.price) || 0;
  return `₱${price.toLocaleString('en-PH')}`;
}
