#!/usr/bin/env bash

set -u

BASE_URL="${1:-https://stage-1-production-11c5.up.railway.app}"
BASE_URL="${BASE_URL%/}"
API_BASE="$BASE_URL/api/profiles"
TEST_NAME="${TEST_NAME:-Ada}"

FAILURES=0
CREATED_ID=""
CREATED_GENDER=""
CREATED_COUNTRY_ID=""
CREATED_AGE_GROUP=""

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
      "$url" 2>&1)"
  else
    http_code="$(curl -sS -X "$method" \
      -o "$tmp_body" \
      -w '%{http_code}' \
      "$url" 2>&1)"
  fi

  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    cat "$tmp_body" 2>/dev/null || true
    rm -f "$tmp_body"
    record_failure "curl failed for $label"
    return 1
  fi

  printf 'HTTP %s\n' "$http_code"
  cat "$tmp_body"
  printf '\n'

  RESPONSE_CODE="$http_code"
  RESPONSE_BODY="$(cat "$tmp_body")"
  rm -f "$tmp_body"
  return 0
}

extract_json_field() {
  local field="$1"
  printf '%s' "$RESPONSE_BODY" | node -e "
    let input = '';
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      try {
        const data = JSON.parse(input);
        const value = '$field'.split('.').reduce((acc, key) => acc == null ? undefined : acc[key], data);
        if (value == null) process.exit(1);
        process.stdout.write(String(value));
      } catch {
        process.exit(1);
      }
    });
  " 2>/dev/null
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

run_request "List profiles" GET "$API_BASE"
assert_status 200 "List profiles"

run_request "Create profile" POST "$API_BASE" "{\"name\":\"$TEST_NAME\"}"
assert_status 201 "Create profile"

CREATED_ID="$(extract_json_field 'data.id' || true)"
CREATED_GENDER="$(extract_json_field 'data.gender' || true)"
CREATED_COUNTRY_ID="$(extract_json_field 'data.country_id' || true)"
CREATED_AGE_GROUP="$(extract_json_field 'data.age_group' || true)"

if [[ -z "$CREATED_ID" ]]; then
  record_failure "Create profile did not return data.id"
else
  printf 'Captured id=%s gender=%s country_id=%s age_group=%s\n' \
    "$CREATED_ID" "${CREATED_GENDER:-unknown}" "${CREATED_COUNTRY_ID:-unknown}" "${CREATED_AGE_GROUP:-unknown}"
fi

if [[ -n "$CREATED_ID" ]]; then
  run_request "Fetch created profile" GET "$API_BASE/$CREATED_ID"
  assert_status 200 "Fetch created profile"
fi

if [[ -n "$CREATED_GENDER" ]]; then
  run_request "Filter by gender" GET "$API_BASE?gender=$CREATED_GENDER"
  assert_status 200 "Filter by gender"
fi

if [[ -n "$CREATED_COUNTRY_ID" ]]; then
  run_request "Filter by country_id" GET "$API_BASE?country_id=$CREATED_COUNTRY_ID"
  assert_status 200 "Filter by country_id"
fi

if [[ -n "$CREATED_AGE_GROUP" ]]; then
  run_request "Filter by age_group" GET "$API_BASE?age_group=$CREATED_AGE_GROUP"
  assert_status 200 "Filter by age_group"
fi

if [[ -n "$CREATED_ID" ]]; then
  run_request "Delete created profile" DELETE "$API_BASE/$CREATED_ID"
  assert_status 204 "Delete created profile"

  run_request "Fetch deleted profile" GET "$API_BASE/$CREATED_ID"
  assert_status 404 "Fetch deleted profile"
fi

print_section "Summary"
if [[ $FAILURES -eq 0 ]]; then
  printf 'All production route checks completed successfully against %s\n' "$BASE_URL"
  exit 0
fi

printf 'Completed with %d failure(s) against %s\n' "$FAILURES" "$BASE_URL"
exit 1
