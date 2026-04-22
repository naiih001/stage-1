ALTER TABLE "profiles"
ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
ALTER COLUMN "name" TYPE VARCHAR(255),
ALTER COLUMN "gender" TYPE VARCHAR(32),
ALTER COLUMN "genderProbability" TYPE DOUBLE PRECISION,
ALTER COLUMN "age" TYPE INTEGER,
ALTER COLUMN "ageGroup" TYPE VARCHAR(32),
ALTER COLUMN "countryId" TYPE VARCHAR(2),
ALTER COLUMN "countryProbability" TYPE DOUBLE PRECISION,
ALTER COLUMN "createdAt" TYPE TIMESTAMP(3);

ALTER TABLE "profiles"
RENAME COLUMN "genderProbability" TO "gender_probability";

ALTER TABLE "profiles"
RENAME COLUMN "ageGroup" TO "age_group";

ALTER TABLE "profiles"
RENAME COLUMN "countryId" TO "country_id";

ALTER TABLE "profiles"
RENAME COLUMN "countryProbability" TO "country_probability";

ALTER TABLE "profiles"
RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "profiles"
ADD COLUMN "country_name" VARCHAR(255);

UPDATE "profiles"
SET "country_name" = COALESCE(NULLIF("country_id", ''), 'Unknown')
WHERE "country_name" IS NULL;

ALTER TABLE "profiles"
DROP COLUMN IF EXISTS "sampleSize";

ALTER TABLE "profiles"
ALTER COLUMN "gender" SET NOT NULL,
ALTER COLUMN "gender_probability" SET NOT NULL,
ALTER COLUMN "age" SET NOT NULL,
ALTER COLUMN "age_group" SET NOT NULL,
ALTER COLUMN "country_id" SET NOT NULL,
ALTER COLUMN "country_name" SET NOT NULL,
ALTER COLUMN "country_probability" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "profiles_gender_idx" ON "profiles"("gender");
CREATE INDEX IF NOT EXISTS "profiles_age_group_idx" ON "profiles"("age_group");
CREATE INDEX IF NOT EXISTS "profiles_country_id_idx" ON "profiles"("country_id");
CREATE INDEX IF NOT EXISTS "profiles_age_idx" ON "profiles"("age");
CREATE INDEX IF NOT EXISTS "profiles_created_at_idx" ON "profiles"("created_at");
CREATE INDEX IF NOT EXISTS "profiles_gender_country_id_age_idx" ON "profiles"("gender", "country_id", "age");
