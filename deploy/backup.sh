#!/usr/bin/env bash
# Nightly, as postgres (/etc/cron.d/your-backup-bucket): dump, copy to Cloudflare R2, keep a week locally.
# R2 keeps 30 days through the bucket's lifecycle rule. Credentials: ~postgres/.config/rclone/rclone.conf, remote "r2".
set -euo pipefail
umask 077
cd /
dir=/srv/masskara/backups
name="masskara-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump -Fc masskara > "$dir/$name.part"
pg_restore -l "$dir/$name.part" > /dev/null   # refuse to ship a dump that does not read back
mv "$dir/$name.part" "$dir/$name"

rclone copyto "$dir/$name" "r2:your-backup-bucket/$name"
rclone check "$dir" "r2:your-backup-bucket/" --one-way --include "$name" -q

find "$dir" -name 'masskara-*.dump' -mtime +7 -delete
echo "backup ok: $name"
