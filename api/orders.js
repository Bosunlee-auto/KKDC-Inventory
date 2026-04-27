// api/orders.js
// Fetches open Sales Orders and their Manual_Entry driver lines

import { getAccessToken } from './token.js';

const ORG_ID = process.env.ZOHO_ORG_ID || '2894850000000002002';
const BASE_URL = 'https://www.zohoapis.com/crm/v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { id } = req.query;

  try {
    const token = await getAccessToken();

    if (id) {
      // Fetch single SO with Manual_Entry
      const soRes = await fetch(
        `${BASE_URL}/Sales_Orders/${id}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            orgId: ORG_ID
          }
        }
      );
      const soData = await soRes.json();
      const so = soData.data?.[0];

      if (!so) {
        return res.status(404).json({ error: 'SO not found' });
      }

      // Extract driver lines from Manual_Entry
      const drivers = (so.Manual_Entry || [])
        .filter(e => e.Type === 'Drivers' && e.Ship_From !== 'Vendor')
        .map(e => ({
          id: e.id,
          skuId: e.Driver_SKU?.id || null,
          skuName: e.Driver_SKU?.name || null,
          qty: e.Qty || 0,
          shipFrom: e.Ship_From,
          unitCost: e.Unit_Cost
        }));

      return res.status(200).json({
        id: so.id,
        so: so.Subject,
        status: so.Status,
        drivers
      });
    }

    // Fetch all open SOs
    const soRes = await fetch(
      `${BASE_URL}/Sales_Orders/search?criteria=(Status:not_equal:Shipped)AND(Status:not_equal:Order+Cancelled)&fields=id,Subject,Status&per_page=200`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: ORG_ID
        }
      }
    );

    const soData = await soRes.json();

    res.status(200).json({
      orders: (soData.data || []).map(so => ({
        id: so.id,
        so: so.Subject,
        status: so.Status
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
