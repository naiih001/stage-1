# Intelligence Query Engine

Stage 2 backend upgrade for Insighta Labs. This repository keeps the original NestJS + Prisma foundation, but the API is now shaped around queryability: strict filters, combined conditions, sorting, pagination, and a rule-based natural-language search endpoint.

## What Changed

The Stage 1 service was centered on profile creation. Stage 2 shifts the backend toward read-heavy querying.

- Exact `profiles` table contract implemented in Prisma.
- Indexed filter fields for query performance.
- `GET /api/profiles` now supports combined filters, sorting, and pagination.
- `GET /api/profiles/search` interprets plain-English demographic queries without AI.
- Seed workflow is idempotent and ready for the official 2026 dataset.
- Error responses follow the required shape: `{ "status": "error", "message": "..." }`.

## Design Summary

### 1. Schema-first query engine

I changed the table model before changing the handlers.

Why:
- The grading spec is strict about the stored fields.
- Query features are easier to implement correctly when the database shape already matches the API shape.
- Keeping snake_case at the API boundary and Prisma field mapping internally avoids leaking database naming into TypeScript logic.

The `profiles` table now stores:

- `id` as UUID v7
- `name` as unique string
- `gender`
- `gender_probability`
- `age`
- `age_group`
- `country_id`
- `country_name`
- `country_probability`
- `created_at`

### 2. Querying through validated primitives

`GET /api/profiles` does not try to be clever. It validates each parameter, turns it into a normalized internal query object, then builds Prisma `where` and `orderBy` clauses from that object.

Why:
- It keeps filtering, sorting, and pagination composable.
- It makes validation deterministic.
- It prevents accidental broad queries caused by bad input.

### 3. Rule-based natural-language parsing

`GET /api/profiles/search` uses explicit token and pattern matching only.

Why:
- The brief forbids AI or LLM-based parsing.
- Rule-based parsing is auditable, predictable, and easy to test.
- The expected query examples are narrow enough that a deterministic parser is the right tool.

### 4. Database indexes chosen for actual access paths

Indexes were added for `gender`, `age_group`, `country_id`, `age`, `created_at`, plus a compound index on `gender + country_id + age`.

Why:
- Those fields are the main filter and sort dimensions in the spec.
- The compound index helps common segmentation cases like “male users from NG above 25”.
- At 2026 rows, the dataset is small, but this still avoids designing the query layer around full scans.

## Project Structure

- [src/profiles/profiles.service.ts](/home/ryth/projects/stage-1/src/profiles/profiles.service.ts)
  Main CRUD/query orchestration.
- [src/profiles/query-engine.ts](/home/ryth/projects/stage-1/src/profiles/query-engine.ts)
  Filter validation, pagination rules, sort normalization, natural-language parsing.
- [src/profiles/country-reference.ts](/home/ryth/projects/stage-1/src/profiles/country-reference.ts)
  Country lookup helpers used by create/search flows.
- [prisma/schema.prisma](/home/ryth/projects/stage-1/prisma/schema.prisma)
  Exact data model.
- [prisma/seed.js](/home/ryth/projects/stage-1/prisma/seed.js)
  Idempotent seed loader for the official 2026 file.
- [docs/stage-2-design.md](/home/ryth/projects/stage-1/docs/stage-2-design.md)
  More detailed implementation rationale.

## API Base URL

Local:

```text
http://127.0.0.1:3000/api
```

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/profile_db?schema=public
PORT=3000
HOST=0.0.0.0
```

## Run Locally

1. Install dependencies.

```bash
npm install
```

2. Start PostgreSQL.

```bash
docker compose up -d postgres
```

3. Create `.env`.

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/profile_db?schema=public
PORT=3000
HOST=0.0.0.0
```

4. Generate Prisma client and apply migrations.

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Place the official 2026 dataset at:

```text
prisma/seeds/profiles-2026.json
```

Expected format:

```json
[
  {
    "name": "Ada Nwosu",
    "gender": "female",
    "gender_probability": 0.99,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_name": "Nigeria",
    "country_probability": 0.84
  }
]
```

6. Seed the database.

```bash
npm run prisma:seed
```

7. Start the API.

```bash
npm run start:dev
```

## Seed Design

The seed script uses `upsert` on `name`.

Why:
- Re-running the seed must not create duplicates.
- `name` is already a required unique field.
- This makes the seed deterministic and safe to repeat in CI or on redeploy.

If your official dataset already contains IDs or timestamps, the script accepts them. If not, it generates UUID v7 IDs and computes any missing age group or country name safely.

## Endpoints

### `POST /api/profiles`

Creates or returns an existing profile by name. This keeps the Stage 1 enrichment behavior available.

Response:

```json
{
  "status": "success",
  "data": {
    "id": "01964d85-6c50-7d11-a6e9-2081ea0f1234",
    "name": "Ada Nwosu",
    "gender": "female",
    "gender_probability": 0.99,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_name": "Nigeria",
    "country_probability": 0.84,
    "created_at": "2026-04-20T10:30:00.000Z"
  }
}
```

### `GET /api/profiles`

Supported filters:

- `gender`
- `age_group`
- `country_id`
- `min_age`
- `max_age`
- `min_gender_probability`
- `min_country_probability`

Sorting:

- `sort_by=age|created_at|gender_probability`
- `order=asc|desc`

Pagination:

- `page` default `1`
- `limit` default `10`, max `50`

Example:

```text
/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

Response:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "01964d85-6c50-7d11-a6e9-2081ea0f1234",
      "name": "Tunde Afolabi",
      "gender": "male",
      "gender_probability": 0.95,
      "age": 33,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.88,
      "created_at": "2026-04-20T10:30:00.000Z"
    }
  ]
}
```

### `GET /api/profiles/search`

Rule-based natural-language search. Supported examples include:

- `young males`
- `females above 30`
- `people from angola`
- `adult males from kenya`
- `male and female teenagers above 17`

Example:

```text
/api/profiles/search?q=young males from nigeria&page=1&limit=10
```

Behavior:

- `young` maps to `min_age=16` and `max_age=24`
- both `male` and `female` in the same query mean gender is not constrained
- country names are mapped to ISO country codes
- queries that cannot be interpreted return:

```json
{
  "status": "error",
  "message": "Unable to interpret query"
}
```

### `GET /api/profiles/:id`

Returns a single profile.

### `DELETE /api/profiles/:id`

Deletes a single profile and returns `204 No Content`.

## Validation Rules

Invalid list query parameters return:

```json
{
  "status": "error",
  "message": "Invalid query parameters"
}
```

Missing or empty query parameters return:

```json
{
  "status": "error",
  "message": "Missing or empty parameter"
}
```

Other guaranteed errors:

- `404` for missing profile IDs
- `500` for internal server failures
- `502` for upstream enrichment failures on profile creation

## CORS and Time Handling

- CORS is enabled with `Access-Control-Allow-Origin: *`
- timestamps are returned as UTC ISO 8601 strings

## Verification

Commands used during the upgrade:

```bash
npm run prisma:generate
npm test -- --runInBand
npx tsc -p tsconfig.build.json --noEmit
npm run build
```

## Known Input Dependency

The repo is ready for the required 2026 seed, but the official linked file was not present in this workspace during implementation. The seeding mechanism is complete; you only need to place the provided dataset at `prisma/seeds/profiles-2026.json` and run `npm run prisma:seed`.
