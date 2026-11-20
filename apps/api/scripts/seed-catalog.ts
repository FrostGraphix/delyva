import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CryptoSecretHasher } from '../src/modules/identity/infrastructure/crypto-secret.hasher.js';

/**
 * Dev seed for geo + catalog: 4 Lagos delivery zones (rough approximations of Victoria Island,
 * Ikoyi, Lekki and Yaba), 8 vendors with Nigerian menus (prices in integer kobo), and one demo
 * vendor-owner user. Idempotent: fixed ids, `ON CONFLICT DO NOTHING`. Never run in production.
 */

type Hours = [day: number, opens: string, closes: string][];
const daily = (opens: string, closes: string): Hours =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, opens, closes]);

/** Zone ids (stable for tests and fixtures). */
export const ZONES = {
  vi: '10000000-0000-4000-8000-000000000001',
  ikoyi: '10000000-0000-4000-8000-000000000002',
  lekki: '10000000-0000-4000-8000-000000000003',
  yaba: '10000000-0000-4000-8000-000000000004',
} as const;

const ZONE_RINGS: { id: string; name: string; box: [number, number, number, number] }[] = [
  // [minLat, minLng, maxLat, maxLng]
  { id: ZONES.vi, name: 'Victoria Island', box: [6.415, 3.395, 6.44, 3.445] },
  { id: ZONES.ikoyi, name: 'Ikoyi', box: [6.44, 3.42, 6.465, 3.455] },
  { id: ZONES.lekki, name: 'Lekki', box: [6.42, 3.455, 6.46, 3.56] },
  { id: ZONES.yaba, name: 'Yaba', box: [6.495, 3.365, 6.525, 3.395] },
];

const boxWkt = ([a, b, c, d]: [number, number, number, number]): string =>
  `POLYGON((${b} ${a}, ${d} ${a}, ${d} ${c}, ${b} ${c}, ${b} ${a}))`;

interface SeedItem {
  name: string;
  kobo: number;
  description?: string;
  modifiers?: { name: string; min: number; max: number; options: [string, number][] };
}
interface SeedVendor {
  n: number;
  name: string;
  category: string;
  status: string;
  zone: string;
  at: [number, number];
  prep: number;
  hours: Hours;
  menu: Record<string, SeedItem[]>;
}

const protein = {
  name: 'Protein',
  min: 0,
  max: 2,
  options: [
    ['Beef', 50_000],
    ['Chicken', 120_000],
    ['Fried fish', 100_000],
  ] as [string, number][],
};

const VENDORS: SeedVendor[] = [
  {
    n: 1,
    name: 'Mama Put Amala Spot',
    category: 'restaurant',
    status: 'live',
    zone: ZONES.yaba,
    at: [6.509, 3.378],
    prep: 15,
    hours: daily('08:00', '21:00'),
    menu: {
      Swallow: [
        { name: 'Amala with ewedu and gbegiri', kobo: 250_000, modifiers: protein },
        { name: 'Pounded yam with egusi', kobo: 300_000, modifiers: protein },
        { name: 'Eba with okra soup', kobo: 200_000, modifiers: protein },
      ],
      Extras: [
        { name: 'Assorted meat (ponmo, shaki, abodi)', kobo: 150_000 },
        { name: 'Bottled water 75cl', kobo: 30_000 },
      ],
    },
  },
  {
    n: 2,
    name: 'Suya Republic',
    category: 'restaurant',
    status: 'live',
    zone: ZONES.vi,
    at: [6.428, 3.421],
    prep: 12,
    hours: daily('17:00', '02:00'),
    menu: {
      Suya: [
        {
          name: 'Beef suya (per stick)',
          kobo: 150_000,
          description: 'Yaji-spiced beef with onions and tomatoes',
          modifiers: {
            name: 'Spice level',
            min: 1,
            max: 1,
            options: [
              ['Mild', 0],
              ['Hot', 0],
              ['Extra yaji', 20_000],
            ],
          },
        },
        { name: 'Chicken suya', kobo: 250_000 },
        { name: 'Kilishi (100g)', kobo: 350_000 },
      ],
      Drinks: [{ name: 'Zobo 50cl', kobo: 80_000 }],
    },
  },
  {
    n: 3,
    name: 'Jollof Junction',
    category: 'restaurant',
    status: 'live',
    zone: ZONES.lekki,
    at: [6.441, 3.474],
    prep: 20,
    hours: daily('09:00', '22:00'),
    menu: {
      'Rice dishes': [
        { name: 'Party jollof rice', kobo: 350_000, modifiers: protein },
        { name: 'Fried rice', kobo: 350_000, modifiers: protein },
        { name: 'Ofada rice with ayamase', kobo: 450_000 },
      ],
      Sides: [
        { name: 'Dodo (fried plantain)', kobo: 100_000 },
        { name: 'Moi moi', kobo: 120_000 },
      ],
    },
  },
  {
    n: 4,
    name: 'Shawarma Hub Ikoyi',
    category: 'restaurant',
    status: 'live',
    zone: ZONES.ikoyi,
    at: [6.452, 3.434],
    prep: 10,
    hours: daily('11:00', '23:30'),
    menu: {
      Shawarma: [
        {
          name: 'Chicken shawarma',
          kobo: 400_000,
          modifiers: {
            name: 'Extras',
            min: 0,
            max: 3,
            options: [
              ['Extra sausage', 50_000],
              ['Extra cheese', 70_000],
              ['No pepper', 0],
            ],
          },
        },
        { name: 'Beef shawarma', kobo: 450_000 },
      ],
      Drinks: [{ name: 'Chapman', kobo: 150_000 }],
    },
  },
  {
    n: 5,
    name: 'FreshMart Lekki',
    category: 'grocery',
    status: 'live',
    zone: ZONES.lekki,
    at: [6.447, 3.49],
    prep: 15,
    hours: daily('07:00', '22:00'),
    menu: {
      Staples: [
        { name: 'Mama Gold rice 5kg', kobo: 1_250_000 },
        { name: 'Garri (Ijebu) 2kg', kobo: 300_000 },
        { name: 'Honeywell semovita 1kg', kobo: 220_000 },
      ],
      'Fresh produce': [
        { name: 'Tomatoes (basket, small)', kobo: 450_000 },
        { name: 'Ripe plantain (bunch of 5)', kobo: 250_000 },
      ],
    },
  },
  {
    n: 6,
    name: 'CarePoint Pharmacy VI',
    category: 'pharmacy',
    status: 'live',
    zone: ZONES.vi,
    at: [6.43, 3.41],
    prep: 5,
    hours: daily('00:00', '24:00'),
    menu: {
      'Over the counter': [
        { name: 'Paracetamol 500mg (pack of 12)', kobo: 50_000 },
        { name: 'ORS sachets (pack of 4)', kobo: 80_000 },
        { name: 'Vitamin C 1000mg (10 tablets)', kobo: 150_000 },
      ],
    },
  },
  {
    n: 7,
    name: 'Golden Crust Bakery',
    category: 'bakery',
    status: 'live',
    zone: ZONES.yaba,
    at: [6.515, 3.385],
    prep: 10,
    hours: daily('06:30', '20:00'),
    menu: {
      Bread: [
        { name: 'Agege bread (large)', kobo: 150_000 },
        { name: 'Coconut bread', kobo: 180_000 },
      ],
      Snacks: [
        { name: 'Meat pie', kobo: 80_000 },
        { name: 'Puff-puff (6 pieces)', kobo: 50_000 },
        { name: 'Chin chin 250g', kobo: 120_000 },
      ],
    },
  },
  {
    n: 8,
    name: 'Buka Express Ikoyi',
    category: 'restaurant',
    status: 'in_review',
    zone: ZONES.ikoyi,
    at: [6.455, 3.44],
    prep: 15,
    hours: daily('08:00', '20:00'),
    menu: { 'Rice dishes': [{ name: 'White rice and stew', kobo: 250_000, modifiers: protein }] },
  },
];

/** Demo vendor owner (owns every seeded vendor). Sign in with this phone via the dev OTP sender. */
export const DEMO_OWNER = {
  id: '30000000-0000-4000-8000-000000000001',
  phone: '+2348000000001',
};

const hex = (n: number, width = 12): string => n.toString(16).padStart(width, '0');
/** Deterministic seed id: `<prefix>…<vendor><serial>`. */
const sid = (prefix: string, vendor: number, serial = 0): string =>
  `${prefix}-0000-4000-8000-${hex(vendor * 1000 + serial)}`;

/** Stable id of seeded vendor `n` (1-8). */
export const seedVendorId = (n: number): string => sid('20000000', n);
/** Stable id of the branch of seeded vendor `n`. */
export const seedBranchId = (n: number): string => sid('21000000', n);

async function seedZones(client: pg.ClientBase): Promise<void> {
  for (const z of ZONE_RINGS) {
    await client.query(
      `INSERT INTO delivery_zones (id, city, name, boundary)
       VALUES ($1, 'Lagos', $2, ST_GeomFromText($3, 4326)) ON CONFLICT (id) DO NOTHING`,
      [z.id, z.name, boxWkt(z.box)],
    );
  }
}

async function seedVendor(client: pg.ClientBase, v: SeedVendor): Promise<void> {
  const vendorId = seedVendorId(v.n);
  const branchId = seedBranchId(v.n);
  const menuId = sid('22000000', v.n);
  await client.query(
    `INSERT INTO vendors (id, name, category, status) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
    [vendorId, v.name, v.category, v.status],
  );
  await client.query(
    `INSERT INTO vendor_members (vendor_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
    [vendorId, DEMO_OWNER.id],
  );
  await client.query(
    `INSERT INTO branches (id, vendor_id, name, location, zone_id, prep_minutes)
     VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6,$7) ON CONFLICT (id) DO NOTHING`,
    [branchId, vendorId, `${v.name} (main)`, v.at[1], v.at[0], v.zone, v.prep],
  );
  for (const [i, [day, opens, closes]] of v.hours.entries()) {
    await client.query(
      `INSERT INTO branch_opening_hours (id, branch_id, day_of_week, opens_at, closes_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [sid('23000000', v.n, i), branchId, day, opens, closes],
    );
  }
  await client.query(
    `INSERT INTO menus (id, vendor_id, name) VALUES ($1,$2,'Main menu') ON CONFLICT (id) DO NOTHING`,
    [menuId, vendorId],
  );
  await seedMenu(client, v, vendorId, menuId);
}

async function seedMenu(
  client: pg.ClientBase,
  v: SeedVendor,
  vendorId: string,
  menuId: string,
): Promise<void> {
  let serial = 0;
  for (const [position, [category, items]] of Object.entries(v.menu).entries()) {
    const categoryId = sid('24000000', v.n, position);
    await client.query(
      `INSERT INTO menu_categories (id, menu_id, vendor_id, name, position) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [categoryId, menuId, vendorId, category, position],
    );
    for (const [itemPos, item] of items.entries()) {
      const itemId = sid('25000000', v.n, ++serial);
      await client.query(
        `INSERT INTO menu_items (id, vendor_id, category_id, name, description, price_minor, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [itemId, vendorId, categoryId, item.name, item.description ?? null, item.kobo, itemPos],
      );
      if (!item.modifiers) continue;
      const groupId = sid('26000000', v.n, serial);
      const m = item.modifiers;
      await client.query(
        `INSERT INTO modifier_groups (id, vendor_id, item_id, name, min_select, max_select)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [groupId, vendorId, itemId, m.name, m.min, m.max],
      );
      for (const [optPos, [name, delta]] of m.options.entries()) {
        await client.query(
          `INSERT INTO modifier_options (id, vendor_id, group_id, name, price_delta_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [sid('27000000', v.n, serial * 10 + optPos), vendorId, groupId, name, delta, optPos],
        );
      }
    }
  }
}

/** Seeds zones, the demo owner and 8 vendors inside one transaction. */
export async function seedCatalog(databaseUrl: string, hashPepper: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await seedZones(client);
    const phoneHash = new CryptoSecretHasher(hashPepper).hash(`phone:${DEMO_OWNER.phone}`);
    await client.query(
      `INSERT INTO users (id, phone, phone_hash, roles)
       VALUES ($1,$2,$3,ARRAY['customer','vendor_owner']) ON CONFLICT DO NOTHING`,
      [DEMO_OWNER.id, DEMO_OWNER.phone, phoneHash],
    );
    for (const v of VENDORS) await seedVendor(client, v);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  const pepper = process.env.HASH_PEPPER;
  if (!url || !pepper) throw new Error('DATABASE_URL and HASH_PEPPER are required');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
  await seedCatalog(url, pepper);
  process.stdout.write(`seeded ${VENDORS.length} vendors in ${ZONE_RINGS.length} Lagos zones\n`);
}
