// api/receive.js
// Handles stock receipt:
//   - Updates Cost_Catalog Stock_Qty
//   - Creates Inventory_Movements IN records
//   - Supports split receipt (SO-linked + surplus)

import { getAccessToken } from './token.js';

const ORG_ID = process.env.ZOHO_ORG_ID || '2894850000000002002';
const BASE_URL = 'https://www.zohoapis.com/crm/v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    skuId,
    skuName,
    totalQty,
    soId,
    soName,
    soQty,
    newUnitCost,
    vendor,
    currentStock
  } = req.body;

  if (!skuId || !totalQty || totalQty <= 0) {
    return res.status(400).json({ error: 'skuId and totalQty are required' });
  }

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().split('T')[0];
    const results = [];

    const surplusQty = soId && soQty > 0 ? totalQty - soQty : totalQty;
    const passThroughQty = soId && soQty > 0 ? soQty : 0;

    // 1. Update Stock_Qty in Cost_Catalog (only surplus goes to stock)
    if (surplusQty > 0) {
      const newStock = (currentStock || 0) + surplusQty;
      const updateBody = { Stock_Qty: newStock };
      if (newUnitCost) updateBody.Landed_Unit_Value = parseFloat(newUnitCost);

      const updateRes = await fetch(`${BASE_URL}/Cost_Catalog/${skuId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: [updateBody] })
      });

      const updateData = await updateRes.json();
      results.push({ action: 'stock_update', result: updateData.data?.[0]?.code });

      // 2. Create Inventory_Movements IN (Stock)
      const movStockRes = await fetch(`${BASE_URL}/Inventory_Movements`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: [{
            Name: `IN-STOCK-${skuName}-${today}`,
            SKU: { id: skuId },
            Movement_Type: 'IN',
            Movement_Date: today,
            Quantity: surplusQty,
            Note: `Stock receipt — KKDC owned surplus${vendor ? ' | ' + vendor : ''}${soId ? ' | SO:' + soName : ''} | Stock: ${currentStock} → ${newStock}`
          }]
        })
      });

      const movStockData = await movStockRes.json();
      results.push({ action: 'movement_in_stock', result: movStockData.data?.[0]?.code });
    }

    // 3. Create Inventory_Movements IN (Pass-Through) for SO-linked qty
    if (passThroughQty > 0 && soId) {
      const movPassRes = await fetch(`${BASE_URL}/Inventory_Movements`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: [{
            Name: `IN-PASS-${skuName}-${soName}-${today}`,
            SKU: { id: skuId },
            Movement_Type: 'IN',
            Movement_Date: today,
            Quantity: passThroughQty,
            Sales_Order: { id: soId },
            Note: `Pass-through receipt — Customer owned | SO:${soName} | ${passThroughQty} units`
          }]
        })
      });

      const movPassData = await movPassRes.json();
      results.push({ action: 'movement_in_passthrough', result: movPassData.data?.[0]?.code });
    }

    res.status(200).json({
      success: true,
      surplusQty,
      passThroughQty,
      newStock: (currentStock || 0) + surplusQty,
      results
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
