# G-Tracker API Documentation

G-Tracker is a FastAPI application for resort asset management. The API is served under `/api`.

## Interactive Documentation

When the application is running, FastAPI provides the generated documentation automatically:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

The OpenAPI document is the authoritative source for validation details and generated schemas.

## Base URL and Authentication

For a local server started with the default configuration:

```text
http://localhost:8000
```

All endpoints require a bearer token unless marked **Public**. Obtain a token with the login endpoint, then send it on subsequent requests:

```http
Authorization: Bearer <access_token>
```

Authentication failures return `401`. Disabled accounts return `403` from login. Invalid request data generally returns `422`.

## Roles

| Role | Permissions |
| --- | --- |
| `viewer` | Read data; confirm or update assets assigned to the current user |
| `editor` | Read and manage assets and incidents; confirm any asset |
| `admin` | Full access, including users, documents, and logo settings |

## Authentication

### `POST /api/auth/login`

**Public.** Authenticate a user.

Content type: `application/x-www-form-urlencoded`

| Field | Required | Description |
| --- | --- | --- |
| `username` | Yes | User's username |
| `password` | Yes | User's password |

Response `200`:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": {
    "user_id": "...",
    "username": "jdoe",
    "email": "jdoe@example.com",
    "full_name": "Jane Doe",
    "role": "editor",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00",
    "updated_at": "2026-01-01T00:00:00"
  }
}
```

Errors: `401` invalid credentials, `403` inactive account.

### `GET /api/auth/me`

**Authenticated.** Return the current user's `UserOut` object.

## Users

### `GET /api/users/`

**Admin.** Return all users as `UserOut[]`.

### `GET /api/users/picker`

**Authenticated.** Return active users for assignment controls:

```json
[
  { "user_id": "...", "username": "jdoe", "full_name": "Jane Doe", "role": "editor" }
]
```

### `POST /api/users/`

**Admin.** Create a user. Content type: `application/json`.

```json
{
  "username": "jdoe",
  "password": "secret-password",
  "email": "jdoe@example.com",
  "full_name": "Jane Doe",
  "role": "viewer"
}
```

`username` and `password` are required. `role` may be `admin`, `editor`, or `viewer`. Returns `201 UserOut`; duplicate usernames return `409`.

### `PUT /api/users/{user_id}`

**Admin or the user themselves.** Update any supplied user fields: `email`, `full_name`, `role`, `password`, and `is_active`. Returns `200 UserOut`.

Non-admin users cannot change their role. Other errors: `403` unauthorized update, `404` user not found.

### `DELETE /api/users/{user_id}`

**Admin.** Delete a user. Returns `204` with no body. An administrator cannot delete their own account (`400`).

## Assets

Asset list filters are optional query parameters supported by both list and CSV export endpoints:

`category`, `status`, `search`, `asset_number`, `name`, `location`, `serial_number`, `accountable_department`, `accountable_person`, `responsible_user_id`, `confirmed`

### `GET /api/assets/`

**Authenticated.** Return matching assets as `AssetOut[]`.

### `GET /api/assets/{asset_id}`

**Authenticated.** Return one `AssetOut`. Returns `404` if the asset does not exist.

### `POST /api/assets/`

**Editor or admin.** Create an asset. Content type: `application/json`.

Required fields: `name`, `category`.

Optional fields: `asset_number`, `status`, `location`, `serial_number`, `purchase_date`, `purchase_value`, `service_life_years`, `depreciation_method`, `depreciation_rate`, `repair_cost`, `accountable_department`, `accountable_person`, `responsible_user_id`, `notes`.

If `asset_number` is omitted, the server generates a value such as `AST-00001`. Returns `201 AssetOut`; duplicate asset numbers return `409`.

### `PUT /api/assets/{asset_id}`

**Authenticated.** Update supplied asset fields using the same fields as creation. Returns `200 AssetOut`.

Note: the current implementation requires authentication but does not restrict this endpoint to editors or administrators.

### `PATCH /api/assets/{asset_id}/confirm`

**Responsible user, editor, or admin.** Toggle the asset's `confirmed` state. No request body is required. Returns `200 AssetOut`; unauthorized users receive `403`.

### `PATCH /api/assets/{asset_id}/responsible-update`

**Responsible user, editor, or admin.** Update the limited fields available to the assigned responsible user:

```json
{
  "status": "in_use",
  "confirmed": true
}
```

Both fields are optional. Valid statuses are `available`, `in_use`, `maintenance`, `retired`, and `lost`. Returns `200 AssetOut`.

### `DELETE /api/assets/{asset_id}`

**Editor or admin.** Delete an asset. Returns `204` with no body.

### `GET /api/assets/export/csv`

**Authenticated.** Stream a CSV attachment using the same filters as `GET /api/assets/`.

## Categories

### `GET /api/categories/`

**Authenticated.** Return available categories as `CategoryOut[]`. Each category contains `category_id`, `name`, `icon`, and `color`.

## Dashboard

### `GET /api/dashboard/summary`

**Authenticated.** Return aggregate asset information:

```json
{
  "total_assets": 0,
  "total_value": 0.0,
  "total_book_value": 0.0,
  "by_status": {},
  "by_category": {},
  "by_department": [
    {
      "department": "Unassigned",
      "count": 0,
      "purchase_value": 0.0,
      "book_value": 0.0
    }
  ],
  "recent_assets": []
}
```

`recent_assets` contains up to five recently added compact asset records.

## Incidents

Incident list and CSV export support optional query parameters: `status`, `severity`, and `asset_id`.

Valid severities: `low`, `medium`, `high`, `critical`.

Valid statuses: `open`, `in_progress`, `resolved`, `closed`.

### `GET /api/incidents/`

**Authenticated.** Return matching `IncidentOut[]`, including comments.

### `GET /api/incidents/{incident_id}`

**Authenticated.** Return one `IncidentOut`, including comments.

### `POST /api/incidents/`

**Authenticated.** Create an incident. Content type: `application/json`.

```json
{
  "title": "Air conditioner leaking",
  "description": "Water is collecting below the unit.",
  "asset_id": "...",
  "severity": "high"
}
```

`title` and `description` are required. New incidents start with status `open`. Returns `201 IncidentOut`.

### `PUT /api/incidents/{incident_id}`

**Editor or admin.** Update supplied fields: `title`, `description`, `severity`, `status`, `assigned_to`, and `resolution`. Returns `200 IncidentOut`.

### `POST /api/incidents/{incident_id}/comments`

**Authenticated.** Add a comment:

```json
{ "body": "Technician assigned to inspect the unit." }
```

Returns `201 CommentOut`.

### `DELETE /api/incidents/{incident_id}`

**Editor or admin.** Delete an incident. Returns `204` with no body.

### `GET /api/incidents/export/csv`

**Authenticated.** Stream a CSV attachment containing incidents and their comments.

## Settings and Logo

### `GET /api/settings/`

**Authenticated.** Return application settings as a key/value object, for example:

```json
{ "logo_path": "/static/uploads/logo.png" }
```

### `POST /api/settings/logo`

**Admin.** Upload a logo using `multipart/form-data` with a required `file` field. Allowed extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`. Maximum size: 2 MB.

Response `200`:

```json
{ "logo_url": "/static/uploads/logo.png" }
```

Invalid extensions or oversized files return `400`.

### `DELETE /api/settings/logo`

**Admin.** Remove the configured logo. Returns `204` with no body.

## Policy Documents

### `GET /api/documents/`

**Authenticated.** Return `PolicyDocumentOut[]`, newest first.

### `POST /api/documents/`

**Admin.** Upload a PDF using `multipart/form-data`:

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Display name |
| `description` | No | Description |
| `file` | Yes | PDF file, maximum 20 MB |

Returns `201 PolicyDocumentOut`. Non-PDF files or files over 20 MB return `400`.

### `GET /api/documents/{doc_id}/download`

**Authenticated.** Download the stored PDF. Missing database records or files return `404`.

### `DELETE /api/documents/{doc_id}`

**Admin.** Delete the document and stored PDF. Returns `204` with no body.

## Common Response Codes

| Status | Meaning |
| --- | --- |
| `200` | Successful request |
| `201` | Resource created |
| `204` | Successful request with no response body |
| `400` | Invalid operation or file upload |
| `401` | Missing, invalid, or expired authentication |
| `403` | Authenticated user lacks permission |
| `404` | Resource not found |
| `409` | Duplicate resource value |
| `422` | Request validation failed |

## Request Examples

Login and use the returned token:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=your-password' | jq -r '.access_token')

curl http://localhost:8000/api/assets/ \
  -H "Authorization: Bearer $TOKEN"
```

Create an asset:

```bash
curl -X POST http://localhost:8000/api/assets/ \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Deluxe Room 101",
    "category": "rooms_facilities",
    "status": "available",
    "location": "Building A, Floor 1"
  }'
```
