// api/inventory.js
// Fetches US Stock and Reference inventory from Zoho CRM Cost_Catalog

import { getAccessToken } from './token.js';

const ORG_ID = process.env.ZOHO_ORG_ID || '2894850000000002002';
const BASE_URL = 'https://www.zohoapis.com/crm/v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const token = await getAccessToken();

    // Fetch US Stock items (master SKUs only)
    const usStockRes = await fetch(
      `${BASE_URL}/Cost_Catalog/search?criteria=(US_Stock:equals:true)AND(Master_SKU:equals:null)&fields=id,Name,Stock_Qty,Reserved_Qty,Available_Qty,Landed_Unit_Value,Vendor,Safety_Stock&per_page=200`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID
        }
      }
    );

    const usStockData = await usStockRes.json();

    // Fetch Reference (Non US Stock) items
    const refRes = await fetch(
      `${BASE_URL}/Cost_Catalog/search?criteria=(US_Stock:equals:false)AND(Master_SKU:equals:null)&fields=id,Name,Landed_Unit_Value,Vendor&per_page=200`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID
        }
      }
    );

    const refData = await refRes.json();

    res.status(200).json({
      us_stock: usStockData.data || [],
      reference: refData.data || [],
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
