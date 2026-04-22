/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { uuidv7 } = require('uuidv7');

const DEFAULT_SEED_FILE = path.join(__dirname, 'seeds', 'profiles-2026.json');
const providedSeedFile = process.env.SEED_FILE || process.argv[2];
const seedFilePath = providedSeedFile
  ? path.resolve(process.cwd(), providedSeedFile)
  : DEFAULT_SEED_FILE;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

function toAgeGroup(age) {
  if (age <= 12) return 'child';
  if (age <= 19) return 'teenager';
  if (age <= 59) return 'adult';
  return 'senior';
}

function normalizeCountryName(countryId, explicitName) {
  if (typeof explicitName === 'string' && explicitName.trim()) {
    return explicitName.trim();
  }

  return COUNTRY_NAMES.of(countryId.toUpperCase()) ?? countryId.toUpperCase();
}

function normalizeRecord(record) {
  const name = String(record.name ?? '').trim();
  const gender = String(record.gender ?? '').trim().toLowerCase();
  const countryId = String(record.country_id ?? record.countryId ?? '')
    .trim()
    .toUpperCase();
  const age = Number(record.age);
  const genderProbability = Number(
    record.gender_probability ?? record.genderProbability,
  );
  const countryProbability = Number(
    record.country_probability ?? record.countryProbability,
  );
  const ageGroup = String(record.age_group ?? record.ageGroup ?? '').trim();

  if (!name || !['male', 'female'].includes(gender) || !countryId) {
    throw new Error(`Invalid profile row for "${name || 'unknown'}"`);
  }

  if (
    !Number.isInteger(age) ||
    Number.isNaN(genderProbability) ||
    Number.isNaN(countryProbability)
  ) {
    throw new Error(`Invalid numeric fields for "${name}"`);
  }

  return {
    id: String(record.id ?? uuidv7()),
    name,
    gender,
    genderProbability,
    age,
    ageGroup: ageGroup || toAgeGroup(age),
    countryId,
    countryName: normalizeCountryName(
      countryId,
      record.country_name ?? record.countryName,
    ),
    countryProbability,
    createdAt: record.created_at ?? record.createdAt ?? new Date().toISOString(),
  };
}

async function main() {
  if (!fs.existsSync(seedFilePath)) {
    throw new Error(
      `Seed file not found at ${seedFilePath}. Set SEED_FILE or pass a file path before running prisma:seed.`,
    );
  }

  const raw = fs.readFileSync(seedFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.profiles)
      ? parsed.profiles
      : [];
  const records = rows.map(normalizeRecord);

  if (records.length === 0) {
    throw new Error('Seed file is empty or not an array');
  }

  let count = 0;
  const BATCH_SIZE = 20;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((profile) =>
        prisma.profile.upsert({
          where: { name: profile.name },
          update: {
            gender: profile.gender,
            genderProbability: profile.genderProbability,
            age: profile.age,
            ageGroup: profile.ageGroup,
            countryId: profile.countryId,
            countryName: profile.countryName,
            countryProbability: profile.countryProbability,
          },
          create: profile,
        }),
      ),
    );
    count += batch.length;
    console.log(`Seeded ${count}/${records.length} profiles...`);
  }

  console.log(`Successfully seeded ${records.length} profiles`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
