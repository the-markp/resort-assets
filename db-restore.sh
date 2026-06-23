RESTORE_FILE="db.sql.gz"

# ── Step 4: Drop and recreate the database ────────────────────────────────────
docker exec -it gtracker_db \
    psql -U palma -d postgres -c "DROP DATABASE IF EXISTS palma_assets;"
docker exec -it gtracker_db \
    psql -U palma -d postgres -c "CREATE DATABASE palma_assets;"

# ── Step 5: Restore the dump ─────────────────────────────────────────────────
gunzip -c "$RESTORE_FILE" | \
    docker exec -i gtracker_db psql -U palma palma_assets

echo "Restore complete."

# ── Step 6: Verify row counts ─────────────────────────────────────────────────
docker exec -it gtracker_db \
    psql -U palma palma_assets -c \
    "SELECT 'assets' AS table, COUNT(*) FROM assets
     UNION ALL
     SELECT 'users', COUNT(*) FROM users
     UNION ALL
     SELECT 'categories', COUNT(*) FROM categories;"
