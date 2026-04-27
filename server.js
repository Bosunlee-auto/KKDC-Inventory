const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 300000) return cachedToken;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Missing env vars: CLIENT_ID=${!!clientId} SECRET=${!!clientSecret} REFRESH=${!!refreshToken}`);
  }
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=refresh_token`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

const ORG_ID = process.env.ZOHO_ORG_ID || '2894850000000002002';
const BASE = 'https://www.zohoapis.com/crm/v3';

function zohoHeaders(token) {
  return { Authorization: `Zoho-oauthtoken ${token}`, orgId: ORG_ID, 'Content-Type': 'application/json' };
}

// ── Debug ─────────────────────────────────────────────────
app.get('/api/debug', (req, res) => {
  const c = process.env.ZOHO_CLIENT_ID || '';
  const s = process.env.ZOHO_CLIENT_SECRET || '';
  const r = process.env.ZOHO_REFRESH_TOKEN || '';
  res.json({
    CLIENT_ID: c ? c.substring(0,10)+'...['+c.length+' chars]' : 'MISSING',
    CLIENT_SECRET: s ? s.substring(0,5)+'...['+s.length+' chars]' : 'MISSING',
    REFRESH_TOKEN: r ? r.substring(0,10)+'...['+r.length+' chars]' : 'MISSING',
    ORG_ID: process.env.ZOHO_ORG_ID || 'MISSING'
  });
});

// ── GET /api/inventory ────────────────────────────────────
// US_Stock 필드 삭제됨 → Stock_Qty로만 재고 여부 판단
app.get('/api/inventory', async (req, res) => {
  try {
    const token = await getAccessToken();
    const allRes = await fetch(
      `${BASE}/Cost_Catalog/search?criteria=(Master_SKU:equals:null)&fields=id,Name,Stock_Qty,Reserved_Qty,Available_Qty,Landed_Unit_Value,Vendor&per_page=200`,
      { headers: zohoHeaders(token) }
    );
    const allData = await allRes.json();
    const all = allData.data || [];

    // 재고 여부는 Stock_Qty로만 판단
    const inStock = all.filter(r => r.Stock_Qty > 0).sort((a,b) => b.Stock_Qty - a.Stock_Qty);
    const outStock = all.filter(r => !r.Stock_Qty || r.Stock_Qty <= 0);

    res.json({
      us_stock: inStock,      // Stock_Qty > 0 → 재고 있음
      reference: outStock,    // Stock_Qty = 0 or null → 재고 없음
      all: all,
      timestamp: new Date().toISOString()
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/orders ───────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { id } = req.query;
    if (id) {
      const soRes = await fetch(`${BASE}/Sales_Orders/${id}`, { headers: zohoHeaders(token) });
      const soData = await soRes.json();
      const so = soData.data?.[0];
      if (!so) return res.status(404).json({ error: 'SO not found' });
      const drivers = (so.Manual_Entry || [])
        .filter(e => e.Type === 'Drivers' && e.Ship_From !== 'Vendor')
        .map(e => ({ id: e.id, skuId: e.Driver_SKU?.id || null, skuName: e.Driver_SKU?.name || null, qty: e.Qty || 0, shipFrom: e.Ship_From }));
      return res.json({ id: so.id, so: so.Subject, status: so.Status, drivers });
    }
    const soRes = await fetch(
      `${BASE}/Sales_Orders/search?criteria=(Status:not_equal:Shipped)AND(Status:not_equal:Order+Cancelled)&fields=id,Subject,Status&per_page=200`,
      { headers: zohoHeaders(token) }
    );
    const soData = await soRes.json();
    res.json({ orders: (soData.data || []).map(s => ({ id: s.id, so: s.Subject, status: s.Status })) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/receive ─────────────────────────────────────
app.post('/api/receive', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { skuId, skuName, totalQty, soId, soName, soQty, newUnitCost, vendor, currentStock } = req.body;
    if (!skuId || !totalQty) return res.status(400).json({ error: 'skuId and totalQty required' });
    const today = new Date().toISOString().split('T')[0];
    const surplus = soId && soQty > 0 ? totalQty - soQty : totalQty;
    const passThrough = soId && soQty > 0 ? soQty : 0;

    if (surplus > 0) {
      const newStock = (currentStock || 0) + surplus;
      const updateBody = { Stock_Qty: newStock };
      if (newUnitCost) updateBody.Landed_Unit_Value = parseFloat(newUnitCost);
      await fetch(`${BASE}/Cost_Catalog/${skuId}`, {
        method: 'PUT', headers: zohoHeaders(token),
        body: JSON.stringify({ data: [updateBody] })
      });
      await fetch(`${BASE}/Inventory_Movements`, {
        method: 'POST', headers: zohoHeaders(token),
        body: JSON.stringify({ data: [{ Name: `IN-STOCK-${skuName}-${today}`, SKU: { id: skuId }, Movement_Type: 'IN', Movement_Date: today, Quantity: surplus, Note: `Stock receipt — KKDC owned${vendor?' | '+vendor:''}${soId?' | SO:'+soName:''} | ${currentStock}→${newStock}` }] })
      });
    }

    if (passThrough > 0 && soId) {
      await fetch(`${BASE}/Inventory_Movements`, {
        method: 'POST', headers: zohoHeaders(token),
        body: JSON.stringify({ data: [{ Name: `IN-PASS-${skuName}-${soName}-${today}`, SKU: { id: skuId }, Movement_Type: 'IN', Movement_Date: today, Quantity: passThrough, Sales_Order: { id: soId }, Note: `Pass-through | Customer owned | SO:${soName} | ${passThrough} units` }] })
      });
    }

    res.json({ success: true, surplusQty: surplus, passThroughQty: passThrough, newStock: (currentStock||0)+surplus });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/movements ────────────────────────────────────
app.get('/api/movements', async (req, res) => {
  try {
    const token = await getAccessToken();
    const movRes = await fetch(
      `${BASE}/Inventory_Movements?fields=id,Name,Movement_Type,Movement_Date,Quantity,SKU,Sales_Order,Note&per_page=50&sort_by=Created_Time&sort_order=desc`,
      { headers: zohoHeaders(token) }
    );
    const movData = await movRes.json();
    res.json({ movements: (movData.data||[]).map(m => ({ id: m.id, name: m.Name, type: m.Movement_Type, date: m.Movement_Date, qty: m.Quantity, sku: m.SKU?.name||'—', so: m.Sales_Order?.name||'—', note: m.Note||'' })) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`KKDC Inventory Portal running on port ${PORT}`);
  console.log(`CLIENT_ID: ${!!process.env.ZOHO_CLIENT_ID}, SECRET: ${!!process.env.ZOHO_CLIENT_SECRET}, REFRESH: ${!!process.env.ZOHO_REFRESH_TOKEN}`);
});
