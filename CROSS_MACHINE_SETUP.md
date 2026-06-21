# Connecting an App Instance on a Separate Physical Machine to the Shared Database

This extends the original "run DB separately, scale app instances" setup to
work when the second (or third...) app instance runs on a **different physical
machine** on the same LAN, not just another container on the same host.

## What changes vs. same-host scaling

| | Same host (containers only) | Different physical machines |
|---|---|---|
| Networking | Docker's internal bridge network | Real LAN — needs IP routing, firewall rules |
| DB connection string | `db:5432` (Docker DNS resolves the service name) | `192.168.1.10:5432` (Machine A's actual LAN IP) |
| Postgres access control | Default `pg_hba.conf` (trusts Docker subnet) | Must explicitly allow your LAN subnet |
| Firewall | Not needed — traffic never leaves the host | Must open port 5432 on Machine A |

---

## Setup

### On Machine A (runs the database)

**1. Find this machine's LAN IP:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# e.g. inet 192.168.1.10/24 ...
```

**2. Edit `pg_hba.conf`** — replace `192.168.1.0/24` with your actual subnet (use the `/24` from the command above).

**3. Set the DB password and start:**
```bash
echo "DB_PASSWORD=your-strong-password" > .env
chmod 600 .env
docker compose -f docker-compose.db.yml up -d
```

**4. Open the firewall port for your LAN only** (never expose 5432 to the public internet):
```bash
# UFW (Ubuntu default firewall)
sudo ufw allow from 192.168.1.0/24 to any port 5432 proto tcp

# Or, if Machine B has one specific known IP:
sudo ufw allow from 192.168.1.20 to any port 5432 proto tcp
```

**5. Verify Postgres is listening on the LAN interface:**
```bash
sudo ss -tlnp | grep 5432
# Should show 0.0.0.0:5432, not 127.0.0.1:5432
```

---

### On Machine B (runs an app instance)

**1. Confirm it can reach Machine A's database over the network:**
```bash
# Install postgresql-client temporarily if needed, or use Docker:
docker run --rm postgres:16-alpine \
    pg_isready -h 192.168.1.10 -p 5432 -U palma
# Expect: 192.168.1.10:5432 - accepting connections
```

If this hangs or refuses, the firewall or `pg_hba.conf` step above isn't correct yet — fix that before continuing.

**2. Point the app at Machine A's IP instead of a Docker service name:**

```bash
# .env on Machine B
DATABASE_URL=postgresql+asyncpg://palma:your-strong-password@192.168.1.10:5432/palma_assets
SECRET_KEY=same-64-char-secret-as-every-other-instance
TOKEN_EXPIRE_MINUTES=480
```

**3. Run the app — no `db` service needed on this machine:**
```yaml
# docker-compose.yml on Machine B
version: "3.9"
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: .env
    ports:
      - "8000:8000"
    restart: unless-stopped
    # No depends_on db, no db service — it's remote
```

```bash
docker compose up -d --build
```

**4. Test from Machine B:**
```bash
curl http://localhost:8000/api/dashboard/summary
# Should return JSON (will 401 without auth token, but that confirms the app
# is up and able to talk to the DB — a connection failure would 500 instead)
```

---

## Security notes — read before exposing port 5432 on a LAN

1. **Never bind Postgres to `0.0.0.0` and expose it to the public internet.** This setup is for trusted LAN traffic only. If Machine A has any public IP/port forwarding, make sure 5432 is firewalled to LAN-only as shown above.
2. **Use a strong `DB_PASSWORD`.** It's now reachable from any device on your LAN that can reach Machine A — a weak password is a much bigger risk than when the DB was Docker-internal only.
3. **Consider a VPN or WireGuard tunnel** between Machine A and B instead of raw LAN exposure if the two machines aren't on a fully trusted private network (e.g. shared office WiFi with other tenants).
4. **`scram-sha-256`** (used in `pg_hba.conf` above) is Postgres's modern, secure password hashing method — don't downgrade it to `trust` or `md5` for LAN entries.

---

## Multi-machine connection pool sizing

Remember from the original setup: each app instance opens its own connection
pool (`pool_size=5, max_overflow=5` in `app/database.py`). With instances now
spread across multiple machines, the math is the same — just count total
instances across **all** machines combined:

```
total_max_connections = (pool_size + max_overflow) × number_of_app_instances
                       = 10 × N
```

Check Postgres's actual limit and raise it if needed:
```bash
docker exec gtracker_db psql -U palma -c "SHOW max_connections;"
# default is 100 — fine for up to ~10 app instances total across all machines
```
