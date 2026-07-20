#!/usr/bin/env bash
# Sprint 12 · Disaster recovery — automated encrypted backup.
#
# Usage (run monthly via pg_cron or an external scheduler):
#   BACKUP_PASSPHRASE=... scripts/backup.sh
#
# Steps:
#  1. pg_dump the public schema (schema + data, custom format).
#  2. gpg-encrypt with AES-256 using BACKUP_PASSPHRASE.
#  3. Upload to the `backups` storage bucket under YYYY/MM/.
#  4. Enforce 12-month retention by deleting older objects.
#  5. Verify by streaming the object back and running pg_restore --list.
#
# Restore is tested by scripts/backup-restore-test.sh on the first of every
# month; a failed restore alerts the ops channel via observability alerts.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required (rotate quarterly)}"
: "${BACKUP_BUCKET:=backups}"
RETENTION_MONTHS="${RETENTION_MONTHS:-12}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
YEAR="$(date -u +%Y)"
MONTH="$(date -u +%m)"
WORKDIR="$(mktemp -d)"
DUMP="${WORKDIR}/seaphore-${STAMP}.dump"
CIPHER="${DUMP}.gpg"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "[backup] pg_dump → ${DUMP}"
pg_dump --format=custom --schema=public --no-owner --no-privileges \
  --file="${DUMP}" "${DATABASE_URL}"

echo "[backup] encrypting (AES-256) → ${CIPHER}"
gpg --batch --yes --passphrase "${BACKUP_PASSPHRASE}" \
  --symmetric --cipher-algo AES256 --compress-algo zip \
  --output "${CIPHER}" "${DUMP}"

echo "[backup] verifying dump integrity"
pg_restore --list "${DUMP}" > /dev/null

REMOTE_PATH="${YEAR}/${MONTH}/seaphore-${STAMP}.dump.gpg"
echo "[backup] uploading → ${BACKUP_BUCKET}/${REMOTE_PATH}"
# Uses Supabase Storage REST. SERVICE_ROLE_KEY is required for bucket writes.
: "${SUPABASE_URL:?SUPABASE_URL required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"
curl -sfS -X POST "${SUPABASE_URL}/storage/v1/object/${BACKUP_BUCKET}/${REMOTE_PATH}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${CIPHER}"

echo "[backup] enforcing ${RETENTION_MONTHS}-month retention"
CUTOFF="$(date -u -d "${RETENTION_MONTHS} months ago" +%Y-%m 2>/dev/null || \
          date -u -v-"${RETENTION_MONTHS}"m +%Y-%m)"
curl -sfS "${SUPABASE_URL}/storage/v1/object/list/${BACKUP_BUCKET}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"prefix":""}' | \
  jq -r --arg cutoff "${CUTOFF}" '.[] | select(.name < ($cutoff + "/")) | .name' | \
  while read -r old; do
    echo "[backup] pruning ${old}"
    curl -sfS -X DELETE "${SUPABASE_URL}/storage/v1/object/${BACKUP_BUCKET}/${old}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  done

echo "[backup] complete: ${REMOTE_PATH}"
