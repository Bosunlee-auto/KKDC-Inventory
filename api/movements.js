// api/movements.js
// Fetches recent Inventory_Movements records

import { getAccessToken } from './token.js';

const ORG_ID = process.env.ZOHO_ORG_ID || '2894850000000002002';
const BASE_URL = 'https://www.zohoapis.com/crm/v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const token = await getAccessToken();

    const movRes = await fetch(
      `${BASE_URL}/Inventory_Movements?fields=id,Name,Movement_Type,Movement_Date,Quantity,SKU,Sales_Order,Note&per_page=50&sort_by=Created_Time&sort_order=desc`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID
        }
      }
    );

    const movData = await movRes.json();

    res.status(200).json({
      movements: (movData.data || []).map(m => ({
        id: m.id,
        name: m.Name,
        type: m.Movement_Type,
        date: m.Movement_Date,
        qty: m.Quantity,
        sku: m.SKU?.name || '—',
        so: m.Sales_Order?.name || '—',
        note: m.Note || ''
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
