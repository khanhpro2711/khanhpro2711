#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3010}"
ADMIN_API_KEY="${ADMIN_API_KEY:-test-admin-key}"
ZALO_WEBHOOK_SECRET="${ZALO_WEBHOOK_SECRET:-test-zalo-secret}"
DATA_DIR="$(mktemp -d)"
LOG_FILE="${DATA_DIR}/server.log"
STORE_FILE="${DATA_DIR}/cashback-store.json"
export PORT ADMIN_API_KEY ZALO_WEBHOOK_SECRET DATA_DIR SHOPEE_AFFILIATE_ID="test-affiliate"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

assert_json_expr() {
  local json="$1"
  local expr="$2"
  node -e "const j=JSON.parse(process.argv[1]); if(!(${expr})) { console.error('Assertion failed', j); process.exit(1); }" "$json"
}

post_zalo() {
  local text="$1"
  curl -fsS -X POST "http://127.0.0.1:${PORT}/webhooks/zalo" \
    -H 'Content-Type: application/json' \
    -H "X-Bot-Api-Secret-Token: ${ZALO_WEBHOOK_SECRET}" \
    -d "{\"message\":{\"text\":\"${text}\",\"from\":{\"id\":\"u1\",\"name\":\"Tester\"},\"chat\":{\"id\":\"g1\",\"type\":\"group\",\"title\":\"Group Test\"}}}"
}

node src/server.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..30}; do
  if curl -fs "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 0.2
done

HEALTH="$(curl -fsS "http://127.0.0.1:${PORT}/health")"
assert_json_expr "$HEALTH" "j.ok === true"

UNAUTHORIZED_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/admin/summary")"
if [[ "$UNAUTHORIZED_STATUS" != "401" ]]; then
  echo "Expected admin summary without API key to return 401, got ${UNAUTHORIZED_STATUS}" >&2
  exit 1
fi

post_zalo "https://shopee.vn/product-test" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.ok) process.exit(1);})"

if ! grep -q "af_id=test-affiliate" "$LOG_FILE"; then
  echo "Expected dry-run Zalo reply to include Shopee affiliate id" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi
if ! grep -q "sub_id=" "$LOG_FILE"; then
  echo "Expected dry-run Zalo reply to include tracking sub_id" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi
if ! grep -q "Cashback: 70%" "$LOG_FILE"; then
  echo "Expected dry-run Zalo reply to show cashback rate after platform share" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

SUMMARY="$(curl -fsS "http://127.0.0.1:${PORT}/api/admin/summary" -H "x-admin-api-key: ${ADMIN_API_KEY}")"
assert_json_expr "$SUMMARY" "j.users===1 && j.groups===1 && j.links===1"

TRACKING_ID="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1])); if(!s.links[0]?.trackingId) process.exit(1); console.log(s.links[0].trackingId);" "$STORE_FILE")"

IMPORT_PAYLOAD="$(node -e "console.log(JSON.stringify({orders:[{trackingId:process.argv[1],shopeeOrderId:'ORDER-1',orderAmount:250000,commissionAmount:100000,status:'approved',orderedAt:'2026-06-14T08:00:00.000Z'}]}))" "$TRACKING_ID")"
IMPORT_RESULT="$(curl -fsS -X POST "http://127.0.0.1:${PORT}/api/admin/orders/import" \
  -H 'Content-Type: application/json' \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -d "$IMPORT_PAYLOAD")"
assert_json_expr "$IMPORT_RESULT" "j.imported===1"

post_zalo "/cashback" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.ok) process.exit(1);})"
post_zalo "/stk bank VCB 0123456789 NGUYEN VAN A" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.ok) process.exit(1);})"
post_zalo "/rut 50000" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.ok) process.exit(1);})"

FINAL_STATE="$(cat "$STORE_FILE")"
assert_json_expr "$FINAL_STATE" "j.orders.length===1 && j.orders[0].cashbackAmount===70000 && j.users[0].payoutAccounts.length===1 && j.users[0].payoutAccounts[0].method==='bank' && j.withdrawals.length===1 && j.withdrawals[0].amount===50000 && j.withdrawals[0].method==='bank' && j.withdrawals[0].accountInfo.includes('VCB')"

FINAL_SUMMARY="$(curl -fsS "http://127.0.0.1:${PORT}/api/admin/summary" -H "x-admin-api-key: ${ADMIN_API_KEY}")"
assert_json_expr "$FINAL_SUMMARY" "j.orders.length===1 && j.withdrawals.length===1"

echo "Smoke test passed"
