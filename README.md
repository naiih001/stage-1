# Profile Intelligence Service

NestJS backend service for HNG Stage 1. It accepts a person's name, enriches it with demographic estimates from external APIs, stores the result in PostgreSQL, and exposes endpoints to create, fetch, filter, and delete profiles.

## Stack

- NestJS
- Prisma ORM
- PostgreSQL
- Docker and Docker Compose
- External enrichment APIs:
  - `https://api.genderize.io`
  - `https://api.agify.io`
  - `https://api.nationalize.io`

## Features

- Creates a profile from a single `name` input
- Uses idempotent create behavior for duplicate names
- Stores enriched profile data in PostgreSQL
- Supports filtering by `gender`, `country_id`, and `age_group`
- Returns UUID v7 profile IDs
- Runs with Docker for local or hosted deployment

## Base URL

Local development:

```text
http://127.0.0.1:3000
```

All API routes are prefixed with:

```text
/api
```

Example:

```text
http://127.0.0.1:3000/api/profiles
```

## Environment Variables

The app reads these values at runtime:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/profile_db?schema=public
PORT=3000
HOST=127.0.0.1
```

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

Using Docker Compose:

```bash
docker compose up -d postgres
```

### 3. Set environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/profile_db?schema=public
PORT=3000
HOST=127.0.0.1
```

### 4. Generate Prisma client and apply migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Start the server

```bash
npm run start:dev
```

## Run With Docker

Start the full application stack:

```bash
docker compose up --build
```

The API will be available at:

```text
http://127.0.0.1:3000/api
```

## Available Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm run test
npm run test:e2e
npm run test:cov
npm run lint
```

## API Endpoints

### `POST /api/profiles`

Create or return an existing profile for a given name.

Request:

```json
{
  "name": "Ada"
}
```

Successful response:

```json
{
  "status": "success",
  "data": {
    "id": "01963c90-0c23-7f3d-bdf8-3d9f9a2cc999",
    "name": "ada",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 12345,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.42,
    "created_at": "2026-04-15T14:11:53.000Z"
  }
}
```

If the profile already exists, the service returns the saved record instead of creating a duplicate:

```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": {
    "id": "01963c90-0c23-7f3d-bdf8-3d9f9a2cc999",
    "name": "ada",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 12345,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.42,
    "created_at": "2026-04-15T14:11:53.000Z"
  }
}
```

### `GET /api/profiles/:id`

Fetch a single stored profile by ID.

Response:

```json
{
  "status": "success",
  "data": {
    "id": "01963c90-0c23-7f3d-bdf8-3d9f9a2cc999",
    "name": "ada",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 12345,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.42,
    "created_at": "2026-04-15T14:11:53.000Z"
  }
}
```

### `GET /api/profiles`

List profiles, optionally filtered by query parameters.

Supported filters:

- `gender`
- `country_id`
- `age_group`

Example:

```text
GET /api/profiles?gender=female&country_id=NG&age_group=adult
```

Response:

```json
{
  "status": "success",
  "count": 1,
  "data": [
    {
      "id": "01963c90-0c23-7f3d-bdf8-3d9f9a2cc999",
      "name": "ada",
      "gender": "female",
      "age": 31,
      "ageGroup": "adult",
      "countryId": "NG"
    }
  ]
}
```

### `DELETE /api/profiles/:id`

Delete a profile by ID.

Response:

```text
204 No Content
```

## Validation and Behavior Notes

- `name` is required and must be a non-empty string
- Names are trimmed and stored in lowercase
- Age groups are derived as:
  - `child`: `0-12`
  - `teenager`: `13-19`
  - `adult`: `20-59`
  - `senior`: `60+`
- The selected country is the highest-probability result from Nationalize
- If an upstream enrichment API fails or returns invalid data, the service returns `502`

## Database Model

Stored profile fields:

- `id`
- `name`
- `gender`
- `genderProbability`
- `sampleSize`
- `age`
- `ageGroup`
- `countryId`
- `countryProbability`
- `createdAt`

## Health Check

The root route is available at:

```text
GET /
```

It currently returns:

```text
Hello World!
```
