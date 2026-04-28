import { Prisma } from '@prisma/client';
import { lookupCountryCode } from './country-reference';
import { ProfileQueryDto } from './dto/profile-query.dto';

export function parseNaturalLanguageQuery(
  q: string,
): Partial<ProfileQueryDto> {
  const text = q.toLowerCase().replace(/\s+/g, ' ').trim();
  const derived: Partial<ProfileQueryDto> = {};

  const mentionsMale = /\b(male|males|man|men)\b/.test(text);
  const mentionsFemale = /\b(female|females|woman|women)\b/.test(text);

  if (mentionsMale !== mentionsFemale) {
    derived.gender = mentionsMale ? 'male' : 'female';
  }

  if (/\byoung\b/.test(text)) {
    derived.min_age = 16;
    derived.max_age = 24;
  }

  if (/\b(?:child|children)\b/.test(text)) derived.age_group = 'child';
  if (/\b(?:teen|teens|teenager|teenagers)\b/.test(text))
    derived.age_group = 'teenager';
  if (/\b(?:adult|adults)\b/.test(text)) derived.age_group = 'adult';
  if (/\b(?:senior|seniors|elderly)\b/.test(text)) derived.age_group = 'senior';

  const aboveMatch = text.match(
    /\b(?:above|over|older than|at least)\s+(\d{1,3})\b/,
  );
  if (aboveMatch) {
    derived.min_age = parseInt(aboveMatch[1], 10);
  }

  const belowMatch = text.match(
    /\b(?:below|under|younger than|at most)\s+(\d{1,3})\b/,
  );
  if (belowMatch) {
    derived.max_age = parseInt(belowMatch[1], 10);
  }

  const fromMatch = text.match(/\bfrom\s+([a-z\s]+)\b/);
  if (fromMatch) {
    const countryPhrase = fromMatch[1].trim();
    const directCode = /^[a-z]{2}$/i.test(countryPhrase)
      ? countryPhrase.toUpperCase()
      : null;
    const countryId = directCode ?? lookupCountryCode(countryPhrase);
    if (countryId) {
      derived.country_id = countryId;
    }
  }

  return derived;
}

export function buildWhereClause(
  query: ProfileQueryDto,
): Prisma.ProfileWhereInput {
  const where: Prisma.ProfileWhereInput = {};

  if (query.gender) where.gender = query.gender;
  if (query.age_group) where.ageGroup = query.age_group;
  if (query.country_id) where.countryId = query.country_id;

  if (query.min_age !== undefined || query.max_age !== undefined) {
    where.age = {};
    if (query.min_age !== undefined) where.age.gte = query.min_age;
    if (query.max_age !== undefined) where.age.lte = query.max_age;
  }

  if (query.min_gender_probability !== undefined) {
    where.genderProbability = { gte: query.min_gender_probability };
  }

  if (query.min_country_probability !== undefined) {
    where.countryProbability = { gte: query.min_country_probability };
  }

  return where;
}

export function buildOrderBy(
  query: ProfileQueryDto,
): Prisma.ProfileOrderByWithRelationInput {
  const order = query.order ?? 'desc';
  switch (query.sort_by) {
    case 'age':
      return { age: order };
    case 'gender_probability':
      return { genderProbability: order };
    case 'created_at':
    default:
      return { createdAt: order };
  }
}
