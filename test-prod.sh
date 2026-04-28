#!/usr/bin/env bash

set -u
set -o pipefail

BASE_URL="${1:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
API_BASE="$BASE_URL/api/profiles"
TEST_NAME_SIMPLE="Ada"
TEST_NAME_UNIQUE="${TEST_NAME_SIMPLE}_$(date +%s)"

FAILURES=0
RESPONSE_CODE=""
RESPONSE_BODY=""
CREATED_ID=""
CREATED_GENDER=""
CREATED_COUNTRY_ID=""
CREATED_COUNTRY_NAME=""
CREATED_AGE=""
CREATED_AGE_GROUP=""
FIRST_CREATED_ID=""

print_section() {
  local title="$1"
  printf '\n==> %s\n' "$title"
}

record_failure() {
  local message="$1"
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: %s\n' "$message"
}

run_request() {
  local label="$1"
  local method="$2"
  local url="$3"
  local body="${4:-}"
  local tmp_body
  tmp_body="$(mktemp)"

  print_section "$label"
  printf '%s %s\n' "$method" "$url"

  local http_code
  if [[ -n "$body" ]]; then
    http_code="$(curl -sS -X "$method" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      -o "$tmp_body" \
      -w '%{http_code}' \
      "$url")"
  else
    http_code="$(curl -sS -X "$method" \
      -o "$tmp_body" \
      -w '%{http_code}' \
      "$url")"
  fi

  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    cat "$tmp_body" 2>/dev/null || true
    rm -f "$tmp_body"
    record_failure "curl failed for $label"
    return 1
  fi

  RESPONSE_CODE="$http_code"
  RESPONSE_BODY="$(cat "$tmp_body")"

  printf 'HTTP %s\n' "$RESPONSE_CODE"
  if [[ -n "$RESPONSE_BODY" ]]; then
    printf '%s\n' "$RESPONSE_BODY"
  else
    printf '<empty body>\n'
  fi

  rm -f "$tmp_body"
  sleep 2
  return 0
}

extract_json_field() {
  local field="$1"
  printf '%s' "$RESPONSE_BODY" | env FIELD_PATH="$field" node -e '
    const field = process.env.FIELD_PATH;
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(input);
        const value = field.split(".").reduce((acc, key) => acc == null ? undefined : acc[key], data);
        if (value == null) process.exit(1);
        process.stdout.write(String(value));
      } catch {
        process.exit(1);
      }
    });
  ' 2>/dev/null
}

assert_status() {
  local expected="$1"
  local label="$2"
  if [[ "$RESPONSE_CODE" != "$expected" ]]; then
    record_failure "$label expected HTTP $expected, got $RESPONSE_CODE"
    return 1
  fi
  printf 'PASS: expected HTTP %s\n' "$expected"
  return 0
}

assert_json_field_equals() {
  local field="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(extract_json_field "$field" || true)"
  if [[ "$actual" != "$expected" ]]; then
    record_failure "$label expected $field=$expected, got ${actual:-<missing>}"
    return 1
  fi
  printf 'PASS: %s=%s\n' "$field" "$expected"
  return 0
}

assert_json_field_present() {
  local field="$1"
  local label="$2"
  local actual
  actual="$(extract_json_field "$field" || true)"
  if [[ -z "$actual" ]]; then
    record_failure "$label missing $field"
    return 1
  fi
  printf 'PASS: %s present\n' "$field"
  return 0
}

assert_response_contains_id() {
  local expected_id="$1"
  local label="$2"
  printf '%s' "$RESPONSE_BODY" | env EXPECTED_ID="$expected_id" node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input);
        const rows = Array.isArray(payload.data) ? payload.data : [];
        const found = rows.some((row) => row && String(row.id) === process.env.EXPECTED_ID);
        process.exit(found ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' 2>/dev/null

  if [[ $? -ne 0 ]]; then
    record_failure "$label did not include id=$expected_id"
    return 1
  fi

  printf 'PASS: response includes id=%s\n' "$expected_id"
  return 0
}

run_request "List profiles default query" GET "$API_BASE"
assert_status 200 "List profiles default query"
assert_json_field_equals "status" "success" "List profiles default query"
assert_json_field_equals "page" "1" "List profiles default query"
assert_json_field_equals "limit" "10" "List profiles default query"
assert_json_field_present "total" "List profiles default query"

INITIAL_TOTAL="$(extract_json_field 'total' || echo 0)"
printf 'Initial total count: %s\n' "$INITIAL_TOTAL"

run_request "Create profile" POST "$API_BASE" "{\"name\":\"$TEST_NAME_UNIQUE\"}"
if [[ "$RESPONSE_CODE" == "201" ]]; then
  assert_json_field_equals "status" "success" "Create profile"
  assert_json_field_present "data.id" "Create profile"
  assert_json_field_equals "data.name" "$TEST_NAME_UNIQUE" "Create profile"

  run_request "Verify count incremented" GET "$API_BASE"
  assert_json_field_equals "total" "$((INITIAL_TOTAL + 1))" "Verify count incremented"

  CREATED_ID="$(extract_json_field 'data.id' || true)"
  CREATED_GENDER="$(extract_json_field 'data.gender' || true)"
  CREATED_COUNTRY_ID="$(extract_json_field 'data.country_id' || true)"
  CREATED_COUNTRY_NAME="$(extract_json_field 'data.country_name' || true)"
  CREATED_AGE="$(extract_json_field 'data.age' || true)"
  CREATED_AGE_GROUP="$(extract_json_field 'data.age_group' || true)"
  FIRST_CREATED_ID="$CREATED_ID"

  printf 'Captured id=%s gender=%s country_id=%s country_name=%s age=%s age_group=%s\n' \
    "${CREATED_ID:-unknown}" "${CREATED_GENDER:-unknown}" "${CREATED_COUNTRY_ID:-unknown}" \
    "${CREATED_COUNTRY_NAME:-unknown}" "${CREATED_AGE:-unknown}" "${CREATED_AGE_GROUP:-unknown}"

  run_request "Create same profile again" POST "$API_BASE" "{\"name\":\"$TEST_NAME_UNIQUE\"}"
  assert_status 201 "Create same profile again"
  assert_json_field_equals "status" "success" "Create same profile again"
  assert_json_field_equals "message" "Profile already exists" "Create same profile again"
  assert_json_field_equals "data.id" "$FIRST_CREATED_ID" "Create same profile again"
else
  record_failure "Create profile failed with $RESPONSE_CODE, skipping dependent tests"
fi

if [[ -n "$CREATED_ID" ]]; then
  run_request "Fetch created profile" GET "$API_BASE/$CREATED_ID"
  assert_status 200 "Fetch created profile"
  assert_json_field_equals "status" "success" "Fetch created profile"
  assert_json_field_equals "data.id" "$CREATED_ID" "Fetch created profile"
fi

if [[ -n "$CREATED_GENDER" && -n "$CREATED_COUNTRY_ID" && -n "$CREATED_AGE_GROUP" && -n "$CREATED_AGE" ]]; then
  run_request "Combined filters" GET "$API_BASE?gender=$CREATED_GENDER&age_group=$CREATED_AGE_GROUP&country_id=$CREATED_COUNTRY_ID&min_age=$CREATED_AGE&max_age=$CREATED_AGE"
  assert_status 200 "Combined filters"
  assert_json_field_equals "status" "success" "Combined filters"
  assert_response_contains_id "$CREATED_ID" "Combined filters"
fi

run_request "Pagination and sorting" GET "$API_BASE?sort_by=age&order=desc&page=1&limit=1"
assert_status 200 "Pagination and sorting"
assert_json_field_equals "status" "success" "Pagination and sorting"
assert_json_field_equals "page" "1" "Pagination and sorting"
assert_json_field_equals "limit" "1" "Pagination and sorting"

run_request "Sort by gender probability" GET "$API_BASE?sort_by=gender_probability&order=asc"
assert_status 200 "Sort by gender probability"
assert_json_field_equals "status" "success" "Sort by gender probability"

if [[ -n "$CREATED_GENDER" && -n "$CREATED_COUNTRY_ID" ]]; then
  run_request "Natural-language search" GET "$API_BASE/search?q=${CREATED_GENDER}s%20from%20$CREATED_COUNTRY_ID&page=1&limit=10"
  assert_status 200 "Natural-language search"
  assert_json_field_equals "status" "success" "Natural-language search"
  assert_response_contains_id "$CREATED_ID" "Natural-language search"
fi

run_request "NLP search: young" GET "$API_BASE/search?q=young%20people"
assert_status 200 "NLP search: young"

run_request "NLP search: age above" GET "$API_BASE/search?q=people%20older%20than%2040"
assert_status 200 "NLP search: age above"

run_request "NLP search: age under" GET "$API_BASE/search?q=people%20under%2020"
assert_status 200 "NLP search: age under"

run_request "Invalid filter validation" GET "$API_BASE?gender=robot"
assert_status 422 "Invalid filter validation"
assert_json_field_equals "status" "error" "Invalid filter validation"
assert_json_field_equals "message" "Invalid query parameters" "Invalid filter validation"

run_request "Limit boundary validation (too high)" GET "$API_BASE?limit=51"
assert_status 422 "Limit boundary validation (too high)"
assert_json_field_equals "message" "Invalid query parameters" "Limit boundary validation (too high)"

run_request "Page boundary validation (too low)" GET "$API_BASE?page=0"
assert_status 422 "Page boundary validation (too low)"
assert_json_field_equals "message" "Invalid query parameters" "Page boundary validation (too low)"

run_request "Missing search query validation" GET "$API_BASE/search"
assert_status 422 "Missing search query validation"
assert_json_field_equals "message" "Invalid query parameters" "Missing search query validation"

run_request "Uninterpretable search validation" GET "$API_BASE/search?q=show%20me%20something%20useful"
assert_status 400 "Uninterpretable search validation"
assert_json_field_equals "status" "error" "Uninterpretable search validation"
assert_json_field_equals "message" "Unable to interpret query" "Uninterpretable search validation"

if [[ -n "$CREATED_ID" ]]; then
  run_request "Delete created profile" DELETE "$API_BASE/$CREATED_ID"
  assert_status 204 "Delete created profile"

  run_request "Fetch deleted profile" GET "$API_BASE/$CREATED_ID"
  assert_status 404 "Fetch deleted profile"
  assert_json_field_equals "status" "error" "Fetch deleted profile"
  assert_json_field_equals "message" "Profile not found" "Fetch deleted profile"

  run_request "Verify count decremented" GET "$API_BASE"
  assert_json_field_equals "total" "$INITIAL_TOTAL" "Verify count decremented"
fi

print_section "Summary"
if [[ $FAILURES -eq 0 ]]; then
  printf 'All Stage 2 production checks completed successfully against %s\n' "$BASE_URL"
  exit 0
fi

printf 'Completed with %d failure(s) against %s\n' "$FAILURES" "$BASE_URL"
exit 1
