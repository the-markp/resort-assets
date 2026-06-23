# PALMA — Resort Asset Management System

A containerized asset management web application for resort hotels, built with **Python/FastAPI**, **Amazon DynamoDB**, and served as a single Docker container.

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Python 3.12 · FastAPI · Uvicorn     |
| Database  | Amazon DynamoDB (or DynamoDB Local) |
| Frontend  | Vanilla HTML/CSS/JS (served by API) |
| Container | Docker · Docker Compose             |

---

## Asset Categories

- 🏨 Rooms & Facilities
- 🪑 Furniture & Equipment
- 🚗 Vehicles & Transport
- 💻 IT & Electronics
- 🔧 Maintenance Tools
- 📦 Inventory & Consumables

---

## Quick Start (Local Development)

### Prerequisites
- Docker & Docker Compose v2+

### 1. Clone and configure
```bash
git clone <repo-url>
cd resort-assets
cp .env.example .env
```

### 2. Start with DynamoDB Local
```bash
docker compose up --build
```

The app will:
- Start DynamoDB Local on port `8001`
- Auto-create DynamoDB tables on first boot
- Seed 13 sample assets across all categories
- Serve the UI at **http://localhost:8000**

### 3. (Optional) DynamoDB Admin UI
```bash
docker compose --profile dev up
# Open http://localhost:8002
```

---

## Running Without Docker (Development)

```bash
# Install dependencies
pip install -r requirements.txt

# Start DynamoDB Local separately (requires Java)
# Or use the Docker service only:
docker compose up dynamodb-local -d

# Set env vars
export DYNAMODB_ENDPOINT=http://localhost:8001
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local

# Run the app
python -m uvicorn app.main:app --reload --port 8000
```

---

## Production Deployment (Real AWS DynamoDB)

### Option A — Docker Compose override
```bash
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Option B — Plain Docker run
```bash
docker build -t palma-assets .

docker run -d \
  -p 8000:8000 \
  -e AWS_REGION=ap-southeast-1 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  palma-assets
```

### IAM Permissions required
The AWS identity needs these DynamoDB actions on your tables:
```
dynamodb:CreateTable
dynamodb:PutItem
dynamodb:GetItem
dynamodb:UpdateItem
dynamodb:DeleteItem
dynamodb:Scan
dynamodb:Query
dynamodb:DescribeTable
```

---

## API Reference

| Method | Endpoint                   | Description           |
|--------|----------------------------|-----------------------|
| GET    | `/api/assets`              | List/search assets    |
| POST   | `/api/assets`              | Create asset          |
| GET    | `/api/assets/{id}`         | Get asset             |
| PUT    | `/api/assets/{id}`         | Update asset          |
| DELETE | `/api/assets/{id}`         | Delete asset          |
| GET    | `/api/categories`          | List categories       |
| GET    | `/api/dashboard/summary`   | Dashboard stats       |

Interactive API docs: **http://localhost:8000/docs**

### Query parameters for `GET /api/assets`
| Param      | Description                  |
|------------|------------------------------|
| `category` | Filter by category key       |
| `status`   | Filter by status             |
| `search`   | Full-text search (name, serial, location, notes) |

---

## Project Structure

```
resort-assets/
├── app/
│   ├── main.py          # FastAPI app entry point
│   ├── database.py      # DynamoDB connection & table init
│   ├── models.py        # Pydantic schemas
│   └── routers/
│       ├── assets.py    # Asset CRUD endpoints
│       ├── categories.py
│       └── dashboard.py
├── frontend/
│   ├── templates/
│   │   └── index.html
│   └── static/
│       ├── css/style.css
│       └── js/app.js
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── requirements.txt
└── .env.example
```
## Deployment
1. Install Caddy and verify
2. Pull latest code
3. Generate .env file
4. docker compose -f docker-compose.db.yml up -d
5. Restore database from backup, if needed
6. docker compose -f docker-compose.app.yml up -d
7. Edit Caddyfile

## Backup and Restore

1. Automate daily backup
  chmod a+rx db-backup.sh
  sudo crontab -e 0 2 * * * /home/<user>/resort-assets/db-backup.sh

2. Restore procedure
  chmod a+rx db-restore.sh
  <rename backup file to "db.sql.gz">
  sudo docker stop resort-assets-app-1
  sudo ./db-restore.sh
  sudo docker compose -f docker-compose.app.yml up -d

