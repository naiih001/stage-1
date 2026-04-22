import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lookupCountryCode } from './country-reference';

export type SortBy = 'age' | 'created_at' | 'gender_probability';
export type SortOrder = 'asc' | 'desc';

export interface ProfileQueryOptions {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: string;
  max_age?: string;
  min_gender_probability?: string;
  min_country_probability?: string;
  sort_by?: string;
  order?: string;
  page?: string;
  limit?: string;
}

export interface SearchQueryOptions {
  q?: string;
  page?: string;
  limit?: string;
}

export interface NormalizedProfileQuery {
  gender?: 'male' | 'female';
  age_group?: 'child' | 'teenager' | 'adult' | 'senior';
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
  sort_by: SortBy;
  order: SortOrder;
  page: number;
  limit: number;
}

const VALID_GENDERS = new Set(['male', 'female']);
const VALID_AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const VALID_SORT_FIELDS = new Set(['age', 'created_at', 'gender_probability']);
const VALID_SORT_ORDERS = new Set(['asc', 'desc']);

function isMissing(value: string | undefined): boolean {
  return value !== undefined && value.trim() === '';
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (isMissing(value)) {
    throw new BadRequestException('Missing or empty parameter');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  return parsed;
}

function parseFloatInRange(
  value: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (isMissing(value)) {
    throw new BadRequestException('Missing or empty parameter');
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  return parsed;
}

export function normalizeProfileQuery(
  query: ProfileQueryOptions,
): NormalizedProfileQuery {
  if (
    isMissing(query.gender) ||
    isMissing(query.age_group) ||
    isMissing(query.country_id)
  ) {
    throw new BadRequestException('Missing or empty parameter');
  }

  const gender = query.gender?.toLowerCase();
  if (gender && !VALID_GENDERS.has(gender)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  const ageGroup = query.age_group?.toLowerCase();
  if (ageGroup && !VALID_AGE_GROUPS.has(ageGroup)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  const countryId = query.country_id?.toUpperCase();
  if (countryId && !/^[A-Z]{2}$/.test(countryId)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  const minAge = parseInteger(query.min_age);
  const maxAge = parseInteger(query.max_age);
  const page = parseInteger(query.page) ?? 1;
  const limit = parseInteger(query.limit) ?? 10;

  if (page < 1 || limit < 1 || limit > 50) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  const sortBy = query.sort_by ?? 'created_at';
  if (!VALID_SORT_FIELDS.has(sortBy)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  const order = (query.order ?? 'desc').toLowerCase();
  if (!VALID_SORT_ORDERS.has(order)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }

  return {
    gender: gender as NormalizedProfileQuery['gender'],
    age_group: ageGroup as NormalizedProfileQuery['age_group'],
    country_id: countryId,
    min_age: minAge,
    max_age: maxAge,
    min_gender_probability: parseFloatInRange(
      query.min_gender_probability,
      0,
      1,
    ),
    min_country_probability: parseFloatInRange(
      query.min_country_probability,
      0,
      1,
    ),
    sort_by: sortBy as SortBy,
    order: order as SortOrder,
    page,
    limit,
  };
}

export function parseNaturalLanguageQuery(
  query: SearchQueryOptions,
): NormalizedProfileQuery {
  if (query.q === undefined || query.q.trim() === '') {
    throw new BadRequestException('Missing or empty parameter');
  }

  const text = query.q.toLowerCase().replace(/\s+/g, ' ').trim();
  const derived: ProfileQueryOptions = {
    page: query.page,
    limit: query.limit,
  };

  const mentionsMale = /\b(male|males|man|men)\b/.test(text);
  const mentionsFemale = /\b(female|females|woman|women)\b/.test(text);

  if (mentionsMale !== mentionsFemale) {
    derived.gender = mentionsMale ? 'male' : 'female';
  }

  if (/\byoung\b/.test(text)) {
    derived.min_age = '16';
    derived.max_age = '24';
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
    derived.min_age = aboveMatch[1];
  }

  const belowMatch = text.match(
    /\b(?:below|under|younger than|at most)\s+(\d{1,3})\b/,
  );
  if (belowMatch) {
    derived.max_age = belowMatch[1];
  }

  const fromMatch = text.match(/\bfrom\s+([a-z\s]+)\b/);
  if (fromMatch) {
    const countryPhrase = fromMatch[1].trim();
    const directCode = /^[a-z]{2}$/i.test(countryPhrase)
      ? countryPhrase.toUpperCase()
      : null;
    const countryId = directCode ?? lookupCountryCode(countryPhrase);
    if (!countryId) {
      throw new BadRequestException('Unable to interpret query');
    }
    derived.country_id = countryId;
  }

  if (!Object.keys(derived).some((key) => !['page', 'limit'].includes(key))) {
    throw new BadRequestException('Unable to interpret query');
  }

  try {
    return normalizeProfileQuery(derived);
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof UnprocessableEntityException
    ) {
      throw new BadRequestException('Unable to interpret query');
    }
    throw error;
  }
}

export function buildWhereClause(
  query: NormalizedProfileQuery,
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
  query: NormalizedProfileQuery,
): Prisma.ProfileOrderByWithRelationInput {
  switch (query.sort_by) {
    case 'age':
      return { age: query.order };
    case 'gender_probability':
      return { genderProbability: query.order };
    case 'created_at':
    default:
      return { createdAt: query.order };
  }
}
