# KKDC Inventory Portal

NJ Warehouse Inventory Management — Powered by Zoho CRM

## Architecture

```
Browser → Vercel (Frontend + API Routes) → Zoho CRM API
```

## Setup

### 1. Get Zoho Refresh Token

1. Go to https://api-console.zoho.com
2. Click **Self Client**
3. Click **Client Secret** tab → copy **Client ID** and **Client Secret**
4. Click **Generate Code** tab
   - Scope: `ZohoCRM.modules.ALL,WorkDrive.files.ALL`
   - Duration: 10 minutes
   - Click **CREATE** → copy the Authorization Code
5. Exchange for Refresh Token (run in terminal):

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "code=YOUR_AUTH_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "grant_type=authorization_code"
```

Copy the `refresh_token` from the response.

### 2. Deploy to Vercel

1. Push this folder to GitHub
2. Go to https://vercel.com → New Project → Import from GitHub
3. Add Environment Variables:
   - `ZOHO_CLIENT_ID` = your Client ID
   - `ZOHO_CLIENT_SECRET` = your Client Secret
   - `ZOHO_REFRESH_TOKEN` = your Refresh Token
   - `ZOHO_ORG_ID` = 2894850000000002002
4. Deploy

### 3. Access

Bookmark your Vercel URL (e.g. https://kkdc-inventory.vercel.app)

## Features

- **US Stock** — KKDC owned inventory with live Stock_Qty, Reserved_Qty, Available_Qty
- **Reference Catalog** — Customer-owned pass-through items (price reference only)
- **Split Receipt** — Receive stock with SO linking; surplus auto-becomes KKDC stock
- **Inventory Movements** — Full IN/OUT log
- **Low / Out of Stock** — Alert view for replenishment

## Ontology

```
Driver received:
  Qty for confirmed SO → Pass-through (customer owned) → IN (Pass-Through) movement
  Surplus qty          → KKDC Stock → Stock_Qty increases → IN (Stock) movement

Driver shipped (SO → Shipped):
  Auto-triggers onDriverReleased1 in Zoho CRM
  → Stock_Qty decreases → OUT movement created
```
