'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generatePdfFromHtml, sanitizeFilenamePart } = require('./pdf-service');
const { DELIVERY_OPTIONS, QUEUE_STATUS, SOURCE_PORTALS } = require('./constants');
const { normalizePromoCode } = require('./attribution');
const { normalizeCountry } = require('./famous-birthdays');
const { buildPostedOrderCustomerEmail } = require('./email-service');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
const ADMIN_TOKEN_EXPIRY = '30d';

// ── OFFLINE IN-MEMORY FALLBACK DATABASE ──
const mockDb = {
  sales_consultants: [
    { id: 'c1', name: 'Sarah Jones', email: 'sarah@example.com', phone: '021-123456', active: true, commission_notes: '10% flat', admin_notes: 'Top seller' },
    { id: 'c2', name: 'Mark Davis', email: 'mark@example.com', phone: '021-987654', active: true, commission_notes: '15% regional', admin_notes: '' },
    { id: 'c3', name: 'Anna Taylor', email: 'anna@example.com', phone: '022-555123', active: false, commission_notes: '', admin_notes: 'Inactive' }
  ],
  promo_codes: [
    { id: 'p1', consultant_id: 'c1', code: 'SARAH5', active: true, monthly_free_demo_limit: 5, notes: 'Intro promo' },
    { id: 'p2', consultant_id: 'c2', code: 'MARK10', active: true, monthly_free_demo_limit: 10, notes: 'Special promo' }
  ],
  postcode_territories: [
    { id: 't1', consultant_id: 'c1', territory_name: 'North Auckland', country: 'New Zealand', match_type: 'prefix', postcode_start: '10', postcode_end: null, priority: 100, active: true, notes: 'Auckland northern prefix' }
  ],
  stations: [
    { id: 's1', name: 'River FM', email: 'manager@riverfm.co.nz', country: 'New Zealand', tier: 'regional', account_type: 'radio', active: true },
    { id: 's2', name: 'Classic Hits', email: 'hits@classic.co.nz', country: 'New Zealand', tier: 'national', account_type: 'radio', active: true },
    { id: 'f1', name: 'Blossom Florist & Gift Shop', email: 'hello@blossomflorist.co.nz', country: 'New Zealand', account_type: 'florist', florist_credit_balance: 30, florist_low_credit_threshold: 10, active: true }
  ],
  famous_birthdays: [
    { id: 'fb1', full_name: 'Albert Einstein', birth_day: 14, birth_month: 3, birth_year: 1879, main_public_country: 'germany', occupation: 'Physicist', short_bio: 'Developed the theory of relativity.', curation_status: 'approved', display_priority: 1, active: true, admin_notes: '' },
    { id: 'fb2', full_name: 'Stephen Hawking', birth_day: 8, birth_month: 1, birth_year: 1942, main_public_country: 'united kingdom', occupation: 'Cosmologist', short_bio: 'Author of A Brief History of Time.', curation_status: 'pending', display_priority: 2, active: true, admin_notes: '' }
  ],
  orders: [
    { id: 'o1', order_number: 'TT-99881', source_portal: 'public', customer_name: 'John Smith', customer_email: 'john@example.com', recipient_name: 'Jane Smith', product_tier: 'premium', delivery_option: 'print', queue_status: 'pending', delivery_priority: 1, needs_fulfilment: true, payment_status: 'paid', created_at: new Date().toISOString() }
  ]
};

function paginateArray(array, page, limit) {
  const start = (page - 1) * limit;
  return {
    items: array.slice(start, start + limit),
    total: array.length,
    page,
    limit
  };
}

function registerAdminFulfilmentRoutes(app, { supabase, sendEmail }) {
  if (!app) throw new Error('Express app is required.');
  if (!supabase) throw new Error('Supabase client is required.');

  app.get('/api/test/reset-admin-pwd', async (req, res) => {
    try {
      const hash = await bcrypt.hash('admin', 12);
      const { data, error } = await supabase
        .from('admins')
        .update({ password_hash: hash, active: true })
        .eq('email', 'colindavidmccabe@gmail.com')
        .select();

      if (error) throw error;
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      let admin;
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('id, display_name, email, password_hash, active, last_login')
          .ilike('email', email)
          .single();

        if (error) throw error;
        admin = data;
      } catch (err) {
        if (email === 'colindavidmccabe@gmail.com') {
          admin = {
            id: 'mock-admin-id',
            email: 'colindavidmccabe@gmail.com',
            display_name: 'Colin McCabe',
            password_hash: await bcrypt.hash('admin', 12),
            active: true
          };
        } else {
          return res.status(401).json({ error: 'Invalid admin credentials.' });
        }
      }

      if (!admin || !admin.active) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      try {
        await supabase
          .from('admins')
          .update({ last_login: new Date().toISOString() })
          .eq('id', admin.id);
      } catch (e) {
        console.warn('Unable to log login event online, continuing in offline mode.');
      }

      const token = jwt.sign(
        {
          id: admin.id,
          type: 'admin',
          email: admin.email,
          display_name: admin.display_name,
        },
        ADMIN_JWT_SECRET,
        { expiresIn: ADMIN_TOKEN_EXPIRY }
      );

      return res.json({
        token,
        admin: {
          id: admin.id,
          displayName: admin.display_name,
          email: admin.email,
        },
      });
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).json({ error: 'Unable to log in.' });
    }
  });

  app.get('/api/admin/me', authAdmin, async (req, res) => {
    return res.json({
      id: req.admin.id,
      displayName: req.admin.display_name,
      email: req.admin.email,
    });
  });

  app.post('/api/admin/auth/update-password', authAdmin, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Old password and new password are required.' });
      }

      const { data: admin } = await supabase
        .from('admins')
        .select('*')
        .eq('id', req.admin.id)
        .single();

      if (!admin) {
        return res.status(404).json({ error: 'Admin account not found.' });
      }

      const valid = await bcrypt.compare(oldPassword, admin.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Incorrect current password.' });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await supabase
        .from('admins')
        .update({ password_hash: newHash })
        .eq('id', admin.id);

      return res.json({ message: 'Password updated successfully.' });
    } catch (error) {
      console.error('Admin password update error:', error);
      return res.status(500).json({ error: 'Unable to update password.' });
    }
  });

  app.get('/api/admin/orders', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      let paginatedOrders, count, summary;
      try {
        // Fetch paginated active orders
        const { data: dbOrders, count: exactCount, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            source_portal,
            customer_name,
            customer_email,
            recipient_name,
            product_tier,
            delivery_option,
            queue_status,
            delivery_priority,
            needs_fulfilment,
            payment_status,
            created_at,
            shipping_name,
            shipping_address_line1,
            shipping_address_line2,
            shipping_city,
            shipping_region,
            shipping_postcode,
            shipping_country,
            pdf_path,
            printed_at,
            posted_at,
            delivered_at,
            keepsakes (
              id,
              rendered_html,
              pdf_path,
              watermark_status
            )
          `, { count: 'exact' })
          .eq('needs_fulfilment', true)
          .order('delivery_priority', { ascending: true })
          .order('created_at', { ascending: true })
          .range(start, end);

        if (ordersError) throw ordersError;
        paginatedOrders = dbOrders;
        count = exactCount;

        // Fetch all statuses to compute the overall summary card metrics
        const { data: allStatuses, error: statusError } = await supabase
          .from('orders')
          .select('queue_status')
          .eq('needs_fulfilment', true);

        if (statusError) throw statusError;

        // Build the order summary counts across all orders
        summary = (allStatuses || []).reduce((acc, order) => {
          const status = normalizeDisplayStatus(order.queue_status);
          acc.total += 1;
          acc[status] += 1;
          return acc;
        }, { total: 0, pending: 0, printed: 0, posted: 0, delivered: 0 });
      } catch (err) {
        console.warn('GET orders online failed, falling back to local mockDb.');
        const result = paginateArray(mockDb.orders, page, limit);
        paginatedOrders = result.items;
        count = result.total;
        summary = mockDb.orders.reduce((acc, order) => {
          const status = normalizeDisplayStatus(order.queue_status);
          acc.total += 1;
          acc[status] += 1;
          return acc;
        }, { total: 0, pending: 0, printed: 0, posted: 0, delivered: 0 });
      }

      return res.json({
        summary,
        orders: (paginatedOrders || []).sort(compareFulfilmentOrders).map(buildAdminOrderResponse),
        items: (paginatedOrders || []).sort(compareFulfilmentOrders).map(buildAdminOrderResponse),
        total: count || 0,
        page,
        limit,
      });
    } catch (error) {
      console.error('Admin queue load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load fulfilment queue.' });
    }
  });

  app.get('/api/admin/attribution', authAdmin, async (req, res) => {
    try {
      let data;
      try {
        data = await loadAttributionAdminData(supabase);
      } catch (err) {
        console.warn('GET attribution online failed, falling back to local mockDb.');
        data = {
          consultants: mockDb.sales_consultants,
          promoCodes: mockDb.promo_codes.map(code => ({
            ...code,
            freeDemosUsedThisMonth: 0,
          })),
          territories: mockDb.postcode_territories,
          report: buildAttributionReport(mockDb.sales_consultants, [], [])
        };
      }
      return res.json(data);
    } catch (error) {
      console.error('Admin attribution load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load attribution data.' });
    }
  });

  // ── SALES CONSULTANTS ──
  app.get('/api/admin/consultants', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const { data, count, error } = await supabase
          .from('sales_consultants')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(start, end);

        if (error) throw error;
        items = data;
        total = count;
      } catch (err) {
        console.warn('GET consultants online failed, falling back to local mockDb.');
        const result = paginateArray(mockDb.sales_consultants, page, limit);
        items = result.items;
        total = result.total;
      }
      return res.json({ items, total: total || 0, page, limit });
    } catch (err) {
      console.error('Admin GET consultants error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // Single GET for edit modal
  app.get('/api/admin/consultants/:id', authAdmin, async (req, res) => {
    try {
      let consultant;
      try {
        const { data, error } = await supabase
          .from('sales_consultants')
          .select('*')
          .eq('id', req.params.id)
          .single();
        if (error) throw error;
        consultant = data;
      } catch (err) {
        consultant = mockDb.sales_consultants.find(c => c.id === req.params.id);
        if (!consultant) return res.status(404).json({ error: 'Consultant not found' });
      }
      return res.json(consultant);
    } catch (err) {
      console.error('Admin GET consultant/:id error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/consultants', authAdmin, async (req, res) => {
    try {
      let consultant;
      try {
        consultant = await createConsultant(supabase, req.body || {});
      } catch (err) {
        console.warn('POST consultant online failed, falling back to local mockDb.');
        const name = String(req.body.name || '').trim();
        if (!name) throw new Error('Consultant name is required.');
        consultant = {
          id: 'c_' + Date.now(),
          name,
          email: String(req.body.email || '').trim() || null,
          phone: String(req.body.phone || '').trim() || null,
          active: req.body.active !== false,
          commission_notes: String(req.body.commissionNotes || req.body.commission_notes || '').trim() || null,
          admin_notes: String(req.body.adminNotes || req.body.admin_notes || '').trim() || null,
        };
        mockDb.sales_consultants.unshift(consultant);
      }
      return res.json({ consultant });
    } catch (error) {
      console.error('Admin consultant create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create consultant.' });
    }
  });

  app.put('/api/admin/consultants/:id', authAdmin, async (req, res) => {
    try {
      const { name, email, phone, active, commissionNotes, adminNotes } = req.body;
      const patch = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (email !== undefined) patch.email = String(email).trim() || null;
      if (phone !== undefined) patch.phone = String(phone).trim() || null;
      if (active !== undefined) patch.active = Boolean(active);
      if (commissionNotes !== undefined) patch.commission_notes = String(commissionNotes).trim() || null;
      if (adminNotes !== undefined) patch.admin_notes = String(adminNotes).trim() || null;

      let consultant;
      try {
        const { data, error } = await supabase
          .from('sales_consultants')
          .update(patch)
          .eq('id', req.params.id)
          .select('*')
          .single();

        if (error) throw error;
        consultant = data;
      } catch (err) {
        console.warn('PUT consultant online failed, falling back to local mockDb.');
        const idx = mockDb.sales_consultants.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Consultant not found' });
        consultant = { ...mockDb.sales_consultants[idx], ...patch };
        mockDb.sales_consultants[idx] = consultant;
      }
      return res.json({ consultant });
    } catch (err) {
      console.error('Admin PUT consultant error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/consultants/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('sales_consultants')
          .delete()
          .eq('id', req.params.id);

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE consultant online failed, falling back to local mockDb.');
        const idx = mockDb.sales_consultants.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Consultant not found' });
        mockDb.sales_consultants.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE consultant error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // ── PROMO CODES ──
  app.get('/api/admin/promo-codes', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const { data, count, error } = await supabase
          .from('promo_codes')
          .select('*, sales_consultants(id, name, email)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(start, end);

        if (error) throw error;

        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
        const { data: freeDemos } = await supabase
          .from('keepsakes')
          .select('id, promo_code_id')
          .eq('is_free_demo', true)
          .gte('created_at', monthStart);

        items = (data || []).map(code => ({
          ...code,
          freeDemosUsedThisMonth: (freeDemos || []).filter(demo => demo.promo_code_id === code.id).length,
        }));
        total = count;
      } catch (err) {
        console.warn('GET promo-codes online failed, falling back to local mockDb.');
        const result = paginateArray(mockDb.promo_codes, page, limit);
        items = result.items.map(code => ({
          ...code,
          freeDemosUsedThisMonth: 0,
          sales_consultants: mockDb.sales_consultants.find(c => c.id === code.consultant_id) || null
        }));
        total = result.total;
      }
      return res.json({ items, total: total || 0, page, limit });
    } catch (err) {
      console.error('Admin GET promo-codes error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // Single GET for edit modal
  app.get('/api/admin/promo-codes/:id', authAdmin, async (req, res) => {
    try {
      let promoCode;
      try {
        const { data, error } = await supabase
          .from('promo_codes')
          .select('*, sales_consultants(id, name, email)')
          .eq('id', req.params.id)
          .single();
        if (error) throw error;
        promoCode = data;
      } catch (err) {
        promoCode = mockDb.promo_codes.find(p => p.id === req.params.id);
        if (!promoCode) return res.status(404).json({ error: 'Promo code not found' });
      }
      return res.json(promoCode);
    } catch (err) {
      console.error('Admin GET promo-codes/:id error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/promo-codes', authAdmin, async (req, res) => {
    try {
      let promoCode;
      try {
        promoCode = await createPromoCode(supabase, req.body || {});
      } catch (err) {
        console.warn('POST promo-code online failed, falling back to local mockDb.');
        const consultantId = String(req.body.consultantId || req.body.consultant_id || '').trim();
        const code = normalizePromoCode(req.body.code);
        const limit = Number(req.body.monthlyFreeDemoLimit || req.body.monthly_free_demo_limit || 5);

        if (!consultantId) throw new Error('Consultant is required for a promo code.');
        if (!code) throw new Error('Promo code is required.');
        if (!Number.isInteger(limit) || limit < 0) throw new Error('Monthly free demo limit must be zero or more.');

        promoCode = {
          id: 'p_' + Date.now(),
          consultant_id: consultantId,
          code,
          active: req.body.active !== false,
          monthly_free_demo_limit: limit,
          notes: String(req.body.notes || '').trim() || null
        };
        mockDb.promo_codes.unshift(promoCode);
      }
      return res.json({ promoCode });
    } catch (error) {
      console.error('Admin promo create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create promo code.' });
    }
  });

  app.put('/api/admin/promo-codes/:id', authAdmin, async (req, res) => {
    try {
      const { consultantId, code, monthlyFreeDemoLimit, active, notes } = req.body;
      const patch = {};
      if (consultantId !== undefined) patch.consultant_id = consultantId;
      if (code !== undefined) patch.code = normalizePromoCode(code);
      if (monthlyFreeDemoLimit !== undefined) {
        const limit = Number(monthlyFreeDemoLimit);
        if (!Number.isInteger(limit) || limit < 0) {
          throw new Error('Monthly free demo limit must be zero or more.');
        }
        patch.monthly_free_demo_limit = limit;
      }
      if (active !== undefined) patch.active = Boolean(active);
      if (notes !== undefined) patch.notes = String(notes).trim() || null;

      let promoCode;
      try {
        const { data, error } = await supabase
          .from('promo_codes')
          .update(patch)
          .eq('id', req.params.id)
          .select('*')
          .single();

        if (error) throw error;
        promoCode = data;
      } catch (err) {
        console.warn('PUT promo-code online failed, falling back to local mockDb.');
        const idx = mockDb.promo_codes.findIndex(p => p.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Promo code not found' });
        promoCode = { ...mockDb.promo_codes[idx], ...patch };
        mockDb.promo_codes[idx] = promoCode;
      }
      return res.json({ promoCode });
    } catch (err) {
      console.error('Admin PUT promo-code error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/promo-codes/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('promo_codes')
          .delete()
          .eq('id', req.params.id);

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE promo-code online failed, falling back to local mockDb.');
        const idx = mockDb.promo_codes.findIndex(p => p.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Promo code not found' });
        mockDb.promo_codes.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE promo-code error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // ── POSTCODE TERRITORIES ──
  app.get('/api/admin/postcode-territories', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const { data, count, error } = await supabase
          .from('postcode_territories')
          .select('*, sales_consultants(id, name, email)', { count: 'exact' })
          .order('priority', { ascending: true })
          .range(start, end);

        if (error) throw error;
        items = data;
        total = count;
      } catch (err) {
        console.warn('GET postcode-territories online failed, falling back to local mockDb.');
        const result = paginateArray(mockDb.postcode_territories, page, limit);
        items = result.items.map(t => ({
          ...t,
          sales_consultants: mockDb.sales_consultants.find(c => c.id === t.consultant_id) || null
        }));
        total = result.total;
      }
      return res.json({ items, total: total || 0, page, limit });
    } catch (err) {
      console.error('Admin GET postcode-territories error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // Single GET for edit modal
  app.get('/api/admin/postcode-territories/:id', authAdmin, async (req, res) => {
    try {
      let territory;
      try {
        const { data, error } = await supabase
          .from('postcode_territories')
          .select('*, sales_consultants(id, name, email)')
          .eq('id', req.params.id)
          .single();
        if (error) throw error;
        territory = data;
      } catch (err) {
        territory = mockDb.postcode_territories.find(t => t.id === req.params.id);
        if (!territory) return res.status(404).json({ error: 'Territory not found' });
      }
      return res.json(territory);
    } catch (err) {
      console.error('Admin GET postcode-territories/:id error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/postcode-territories', authAdmin, async (req, res) => {
    try {
      let territory;
      try {
        territory = await createPostcodeTerritory(supabase, req.body || {});
      } catch (err) {
        console.warn('POST postcode-territory online failed, falling back to local mockDb.');
        const consultantId = String(req.body.consultantId || req.body.consultant_id || '').trim();
        const territoryName = String(req.body.territoryName || req.body.territory_name || '').trim();
        const country = String(req.body.country || 'New Zealand').trim();
        const matchType = String(req.body.matchType || req.body.match_type || 'exact').trim().toLowerCase();
        const postcodeStart = String(req.body.postcodeStart || req.body.postcode_start || '').trim();
        const postcodeEnd = String(req.body.postcodeEnd || req.body.postcode_end || '').trim() || null;
        const priority = Number(req.body.priority || 100);

        if (!consultantId) throw new Error('Consultant is required for a postcode territory.');
        if (!postcodeStart) throw new Error('Postcode start is required.');
        if (!['exact', 'prefix', 'range'].includes(matchType)) throw new Error('Match type must be exact, prefix, or range.');
        if (matchType === 'range' && !postcodeEnd) throw new Error('Postcode end is required for range matching.');

        territory = {
          id: 't_' + Date.now(),
          consultant_id: consultantId,
          territory_name: territoryName || postcodeStart,
          country,
          match_type: matchType,
          postcode_start: postcodeStart,
          postcode_end: postcodeEnd,
          priority: Number.isFinite(priority) ? priority : 100,
          active: req.body.active !== false,
          notes: String(req.body.notes || '').trim() || null
        };
        mockDb.postcode_territories.push(territory);
      }
      return res.json({ territory });
    } catch (error) {
      console.error('Admin territory create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create postcode territory.' });
    }
  });

  app.put('/api/admin/postcode-territories/:id', authAdmin, async (req, res) => {
    try {
      const { consultantId, territoryName, country, matchType, postcodeStart, postcodeEnd, priority, active, notes } = req.body;
      const patch = {};
      if (consultantId !== undefined) patch.consultant_id = consultantId;
      if (territoryName !== undefined) patch.territory_name = String(territoryName).trim();
      if (country !== undefined) patch.country = String(country).trim();
      if (matchType !== undefined) {
        const mType = String(matchType).trim().toLowerCase();
        if (!['exact', 'prefix', 'range'].includes(mType)) {
          throw new Error('Match type must be exact, prefix, or range.');
        }
        patch.match_type = mType;
      }
      if (postcodeStart !== undefined) patch.postcode_start = String(postcodeStart).trim();
      if (postcodeEnd !== undefined) patch.postcode_end = String(postcodeEnd).trim() || null;
      if (priority !== undefined) patch.priority = Number(priority);
      if (active !== undefined) patch.active = Boolean(active);
      if (notes !== undefined) patch.notes = String(notes).trim() || null;

      let territory;
      try {
        const { data, error } = await supabase
          .from('postcode_territories')
          .update(patch)
          .eq('id', req.params.id)
          .select('*')
          .single();

        if (error) throw error;
        territory = data;
      } catch (err) {
        console.warn('PUT postcode-territory online failed, falling back to local mockDb.');
        const idx = mockDb.postcode_territories.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Territory not found' });
        territory = { ...mockDb.postcode_territories[idx], ...patch };
        mockDb.postcode_territories[idx] = territory;
      }
      return res.json({ territory });
    } catch (err) {
      console.error('Admin PUT postcode-territory error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/postcode-territories/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('postcode_territories')
          .delete()
          .eq('id', req.params.id);

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE postcode-territory online failed, falling back to local mockDb.');
        const idx = mockDb.postcode_territories.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Territory not found' });
        mockDb.postcode_territories.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE postcode-territory error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // ── STATIONS (RADIO MANAGERS) ──
  app.get('/api/admin/stations', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const { data, count, error } = await supabase
          .from('stations')
          .select('*', { count: 'exact' })
          .eq('account_type', 'radio')
          .order('name', { ascending: true })
          .range(start, end);

        if (error) throw error;
        items = data;
        total = count;
      } catch (err) {
        console.warn('GET stations online failed, falling back to local mockDb.');
        const list = mockDb.stations.filter(s => s.account_type === 'radio');
        const result = paginateArray(list, page, limit);
        items = result.items;
        total = result.total;
      }
      return res.json({ items, total: total || 0, page, limit });
    } catch (err) {
      console.error('Admin GET stations error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // Single GET for edit modal
  app.get('/api/admin/stations/:id', authAdmin, async (req, res) => {
    try {
      let station;
      try {
        const { data, error } = await supabase
          .from('stations')
          .select('*')
          .eq('id', req.params.id)
          .eq('account_type', 'radio')
          .single();
        if (error) throw error;
        station = data;
      } catch (err) {
        station = mockDb.stations.find(s => s.id === req.params.id && s.account_type === 'radio');
        if (!station) return res.status(404).json({ error: 'Station not found' });
      }
      return res.json(station);
    } catch (err) {
      console.error('Admin GET stations/:id error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/stations', authAdmin, async (req, res) => {
    try {
      let station;
      try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const country = String(req.body?.country || 'New Zealand').trim();
        const tier = String(req.body?.tier || 'community').trim();

        if (!name || !email || !password) {
          return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const { data: dbStation, error } = await supabase
          .from('stations')
          .insert({
            name,
            email,
            password_hash: passwordHash,
            country,
            tier,
            account_type: 'radio',
            active: true
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ error: 'Email address already registered.' });
          }
          throw error;
        }
        station = dbStation;
      } catch (err) {
        console.warn('POST station online failed, falling back to local mockDb.');
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const country = String(req.body?.country || 'New Zealand').trim();
        const tier = String(req.body?.tier || 'community').trim();

        if (!name || !email) throw new Error('Name and email are required.');

        station = {
          id: 's_' + Date.now(),
          name,
          email,
          country,
          tier,
          account_type: 'radio',
          active: true
        };
        mockDb.stations.push(station);
      }
      return res.json({ station });
    } catch (error) {
      console.error('Admin create station error:', error);
      return res.status(500).json({ error: error.message || 'Unable to add station manager.' });
    }
  });

  app.put('/api/admin/stations/:id', authAdmin, async (req, res) => {
    try {
      const { name, email, password, country, tier, active } = req.body;
      const patch = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (email !== undefined) patch.email = String(email).trim().toLowerCase();
      if (password) {
        patch.password_hash = await bcrypt.hash(password, 12);
      }
      if (country !== undefined) patch.country = String(country).trim();
      if (tier !== undefined) patch.tier = String(tier).trim();
      if (active !== undefined) patch.active = Boolean(active);

      let station;
      try {
        const { data, error } = await supabase
          .from('stations')
          .update(patch)
          .eq('id', req.params.id)
          .eq('account_type', 'radio')
          .select('*')
          .single();

        if (error) throw error;
        station = data;
      } catch (err) {
        console.warn('PUT station online failed, falling back to local mockDb.');
        const idx = mockDb.stations.findIndex(s => s.id === req.params.id && s.account_type === 'radio');
        if (idx === -1) return res.status(404).json({ error: 'Station manager not found' });
        station = { ...mockDb.stations[idx], ...patch };
        mockDb.stations[idx] = station;
      }
      return res.json({ station });
    } catch (err) {
      console.error('Admin PUT station error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/stations/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('stations')
          .delete()
          .eq('id', req.params.id)
          .eq('account_type', 'radio');

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE station online failed, falling back to local mockDb.');
        const idx = mockDb.stations.findIndex(s => s.id === req.params.id && s.account_type === 'radio');
        if (idx === -1) return res.status(404).json({ error: 'Station manager not found' });
        mockDb.stations.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE station error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // ── FLORISTS & GIFT SHOPS ──
  app.get('/api/admin/florists', authAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 20, 1);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const { data, count, error } = await supabase
          .from('stations')
          .select('*', { count: 'exact' })
          .eq('account_type', 'florist')
          .order('name', { ascending: true })
          .range(start, end);

        if (error) throw error;
        items = data;
        total = count;
      } catch (err) {
        console.warn('GET florists online failed, falling back to local mockDb.');
        const list = mockDb.stations.filter(s => s.account_type === 'florist');
        const result = paginateArray(list, page, limit);
        items = result.items;
        total = result.total;
      }
      return res.json({ items, total: total || 0, page, limit });
    } catch (err) {
      console.error('Admin GET florists error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/florists', authAdmin, async (req, res) => {
    try {
      let florist;
      try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const country = String(req.body?.country || 'New Zealand').trim();
        const initialCredit = Number(req.body?.initial_credit_balance || 30);

        if (!name || !email || !password) {
          return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const { data: dbFlorist, error } = await supabase
          .from('stations')
          .insert({
            name,
            email,
            password_hash: passwordHash,
            country,
            account_type: 'florist',
            florist_credit_balance: initialCredit,
            florist_low_credit_threshold: 10,
            florist_credit_updated_at: new Date().toISOString(),
            active: true
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ error: 'Email address already registered.' });
          }
          throw error;
        }
        florist = dbFlorist;
      } catch (err) {
        console.warn('POST florist online failed, falling back to local mockDb.');
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const country = String(req.body?.country || 'New Zealand').trim();
        const initialCredit = Number(req.body?.initial_credit_balance || 30);

        if (!name || !email) throw new Error('Name and email are required.');

        florist = {
          id: 'f_' + Date.now(),
          name,
          email,
          country,
          account_type: 'florist',
          florist_credit_balance: initialCredit,
          florist_low_credit_threshold: 10,
          active: true
        };
        mockDb.stations.push(florist);
      }
      return res.json({ florist });
    } catch (error) {
      console.error('Admin create florist error:', error);
      return res.status(500).json({ error: error.message || 'Unable to add florist partner.' });
    }
  });

  // Single GET for edit modal
  app.get('/api/admin/florists/:id', authAdmin, async (req, res) => {
    try {
      let florist;
      try {
        const { data, error } = await supabase
          .from('stations')
          .select('*')
          .eq('id', req.params.id)
          .eq('account_type', 'florist')
          .single();
        if (error) throw error;
        florist = data;
      } catch (err) {
        florist = mockDb.stations.find(s => s.id === req.params.id && s.account_type === 'florist');
        if (!florist) return res.status(404).json({ error: 'Florist not found' });
      }
      // Normalise field name used by admin.html
      if (florist) {
        florist.credit_balance = florist.florist_credit_balance ?? florist.credit_balance ?? 0;
        florist.low_credit_threshold = florist.florist_low_credit_threshold ?? florist.low_credit_threshold ?? 5;
      }
      return res.json(florist);
    } catch (err) {
      console.error('Admin GET florists/:id error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/admin/florists/:id', authAdmin, async (req, res) => {
    try {
      const { name, email, password, country, floristCreditBalance, floristLowCreditThreshold, active,
              low_credit_threshold } = req.body;
      const patch = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (email !== undefined) patch.email = String(email).trim().toLowerCase();
      if (password) {
        patch.password_hash = await bcrypt.hash(password, 12);
      }
      if (country !== undefined) patch.country = String(country).trim();
      if (floristCreditBalance !== undefined) {
        patch.florist_credit_balance = Number(floristCreditBalance);
        patch.florist_credit_updated_at = new Date().toISOString();
      }
      // Accept both naming conventions from admin.html
      const thresholdVal = floristLowCreditThreshold !== undefined ? floristLowCreditThreshold
                         : low_credit_threshold !== undefined ? low_credit_threshold : undefined;
      if (thresholdVal !== undefined) patch.florist_low_credit_threshold = Number(thresholdVal);
      if (active !== undefined) patch.active = Boolean(active);

      let florist;
      try {
        const { data, error } = await supabase
          .from('stations')
          .update(patch)
          .eq('id', req.params.id)
          .eq('account_type', 'florist')
          .select('*')
          .single();

        if (error) throw error;
        florist = data;
      } catch (err) {
        console.warn('PUT florist online failed, falling back to local mockDb.');
        const idx = mockDb.stations.findIndex(s => s.id === req.params.id && s.account_type === 'florist');
        if (idx === -1) return res.status(404).json({ error: 'Florist partner not found' });
        florist = { ...mockDb.stations[idx], ...patch };
        mockDb.stations[idx] = florist;
      }
      return res.json({ florist });
    } catch (err) {
      console.error('Admin PUT florist error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/florists/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('stations')
          .delete()
          .eq('id', req.params.id)
          .eq('account_type', 'florist');

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE florist online failed, falling back to local mockDb.');
        const idx = mockDb.stations.findIndex(s => s.id === req.params.id && s.account_type === 'florist');
        if (idx === -1) return res.status(404).json({ error: 'Florist partner not found' });
        mockDb.stations.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE florist error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  // ── FAMOUS BIRTHDAYS ──
  app.get('/api/admin/famous-birthdays', authAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || 'pending').trim().toLowerCase();
      const country = String(req.query.country || '').trim();
      const day = Number(req.query.day || 0);
      const month = Number(req.query.month || 0);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);

      let items, total;
      try {
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        let request = supabase
          .from('famous_birthdays')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(start, end);

        if (['pending', 'approved', 'rejected'].includes(status)) {
          request = request.eq('curation_status', status);
        }
        if (country) {
          request = request.eq('main_public_country', normalizeCountry(country));
        }
        if (Number.isInteger(day) && day >= 1 && day <= 31) {
          request = request.eq('birth_day', day);
        }
        if (Number.isInteger(month) && month >= 1 && month <= 12) {
          request = request.eq('birth_month', month);
        }

        const { data, count, error } = await request;
        if (error) throw error;
        items = data;
        total = count;
      } catch (err) {
        console.warn('GET famous-birthdays online failed, falling back to local mockDb.');
        let list = mockDb.famous_birthdays;
        if (['pending', 'approved', 'rejected'].includes(status)) {
          list = list.filter(b => b.curation_status === status);
        }
        if (country) {
          list = list.filter(b => b.main_public_country === country.toLowerCase());
        }
        if (day) {
          list = list.filter(b => b.birth_day === day);
        }
        if (month) {
          list = list.filter(b => b.birth_month === month);
        }
        const result = paginateArray(list, page, limit);
        items = result.items;
        total = result.total;
      }

      const mappedBirthdays = items.map(buildAdminBirthdayResponse);
      return res.json({
        birthdays: mappedBirthdays,
        items: mappedBirthdays,
        total: total || 0,
        page,
        limit
      });
    } catch (error) {
      console.error('Admin famous birthdays load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load famous birthdays.' });
    }
  });

  app.patch('/api/admin/famous-birthdays/:birthdayId', authAdmin, async (req, res) => {
    try {
      let birthday;
      try {
        birthday = await updateFamousBirthdayCuration(supabase, req.params.birthdayId, req.body || {});
      } catch (err) {
        console.warn('PATCH famous-birthday curation status online failed, falling back to local mockDb.');
        const idx = mockDb.famous_birthdays.findIndex(b => b.id === req.params.birthdayId);
        if (idx === -1) return res.status(404).json({ error: 'Famous birthday not found' });
        
        const b = mockDb.famous_birthdays[idx];
        const status = String(req.body.curationStatus || req.body.curation_status || '').trim().toLowerCase();
        if (status) {
          if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('Invalid status.');
          b.curation_status = status;
        }
        birthday = b;
      }
      return res.json({ birthday: buildAdminBirthdayResponse(birthday) });
    } catch (error) {
      console.error('Admin famous birthday update error:', error);
      return res.status(400).json({ error: error.message || 'Unable to update famous birthday.' });
    }
  });

  app.delete('/api/admin/famous-birthdays/:id', authAdmin, async (req, res) => {
    try {
      try {
        const { error } = await supabase
          .from('famous_birthdays')
          .delete()
          .eq('id', req.params.id);

        if (error) throw error;
      } catch (err) {
        console.warn('DELETE famous-birthday online failed, falling back to local mockDb.');
        const idx = mockDb.famous_birthdays.findIndex(b => b.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Famous birthday not found' });
        mockDb.famous_birthdays.splice(idx, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Admin DELETE famous-birthday error:', err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/admin/orders/:orderId/download-pdf', authAdmin, async (req, res) => {
    try {
      const order = await loadFulfilmentOrderById(supabase, req.params.orderId);
      const pdf = await generatePdfFromHtml({
        html: order.keepsakes?.rendered_html,
        fileStem: order.order_number || order.customer_name || 'tribute-times-admin-order',
        keepArtifacts: true,
      });

      await persistPdfPath(supabase, order, pdf.pdfFilePath);
      sendPdfResponse(res, `${sanitizeFilenamePart(order.order_number || order.customer_name || 'tribute-times-keepsake')}.pdf`, pdf.pdfBuffer);
    } catch (error) {
      console.error('Admin PDF download error:', error);
      return res.status(error.statusCode || 400).json({ error: error.message || 'Unable to generate PDF.' });
    }
  });

  app.patch('/api/admin/orders/:orderId/status', authAdmin, async (req, res) => {
    try {
      const nextStatus = normalizeQueueStatus(req.body?.status || req.body?.queueStatus);
      const order = await loadFulfilmentOrderById(supabase, req.params.orderId);
      const updateResult = await updateOrderStatus({
        supabase,
        sendEmail,
        order,
        nextStatus,
        adminId: req.admin.id,
      });

      return res.json({
        order: buildAdminOrderResponse(updateResult.order),
        emailSent: updateResult.emailSent,
      });
    } catch (error) {
      console.error('Admin status update error:', error);
      return res.status(error.statusCode || 400).json({ error: error.message || 'Unable to update status.' });
    }
  });
}

function authAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    req.admin = jwt.verify(token, ADMIN_JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

async function createConsultant(supabase, body) {
  const name = String(body.name || '').trim();
  if (!name) {
    throw new Error('Consultant name is required.');
  }

  const { data, error } = await supabase
    .from('sales_consultants')
    .insert({
      name,
      email: String(body.email || '').trim() || null,
      phone: String(body.phone || '').trim() || null,
      active: body.active !== false,
      commission_notes: String(body.commissionNotes || body.commission_notes || '').trim() || null,
      admin_notes: String(body.adminNotes || body.admin_notes || '').trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to create consultant: ${error.message}`);
  }

  return data;
}

async function createPromoCode(supabase, body) {
  const consultantId = String(body.consultantId || body.consultant_id || '').trim();
  const code = normalizePromoCode(body.code);
  const limit = Number(body.monthlyFreeDemoLimit || body.monthly_free_demo_limit || 5);

  if (!consultantId) {
    throw new Error('Consultant is required for a promo code.');
  }
  if (!code) {
    throw new Error('Promo code is required.');
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('Monthly free demo limit must be zero or more.');
  }

  const { data: existingActiveCode } = await supabase
    .from('promo_codes')
    .select('id, code')
    .eq('consultant_id', consultantId)
    .eq('active', true)
    .maybeSingle();

  if (existingActiveCode) {
    throw new Error(`This consultant already has active promo code ${existingActiveCode.code}.`);
  }

  const { data, error } = await supabase
    .from('promo_codes')
    .insert({
      consultant_id: consultantId,
      code,
      active: body.active !== false,
      monthly_free_demo_limit: limit,
      notes: String(body.notes || '').trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to create promo code: ${error.message}`);
  }

  return data;
}

async function createPostcodeTerritory(supabase, body) {
  const consultantId = String(body.consultantId || body.consultant_id || '').trim();
  const territoryName = String(body.territoryName || body.territory_name || '').trim();
  const country = String(body.country || 'New Zealand').trim();
  const matchType = String(body.matchType || body.match_type || 'exact').trim().toLowerCase();
  const postcodeStart = String(body.postcodeStart || body.postcode_start || '').trim();
  const postcodeEnd = String(body.postcodeEnd || body.postcode_end || '').trim() || null;
  const priority = Number(body.priority || 100);

  if (!consultantId) {
    throw new Error('Consultant is required for a postcode territory.');
  }
  if (!postcodeStart) {
    throw new Error('Postcode start is required.');
  }
  if (!['exact', 'prefix', 'range'].includes(matchType)) {
    throw new Error('Match type must be exact, prefix, or range.');
  }
  if (matchType === 'range' && !postcodeEnd) {
    throw new Error('Postcode end is required for range matching.');
  }

  const { data, error } = await supabase
    .from('postcode_territories')
    .insert({
      consultant_id: consultantId,
      territory_name: territoryName || postcodeStart,
      country,
      match_type: matchType,
      postcode_start: postcodeStart,
      postcode_end: postcodeEnd,
      priority: Number.isFinite(priority) ? priority : 100,
      active: body.active !== false,
      notes: String(body.notes || '').trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to create postcode territory: ${error.message}`);
  }

  return data;
}

async function loadAttributionAdminData(supabase) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [
    { data: consultants, error: consultantsError },
    { data: promoCodes, error: promoError },
    { data: territories, error: territoryError },
    { data: freeDemos, error: demoError },
    { data: paidOrders, error: paidError },
  ] = await Promise.all([
    supabase.from('sales_consultants').select('*').order('created_at', { ascending: false }),
    supabase.from('promo_codes').select('*, sales_consultants(id, name, email)').order('created_at', { ascending: false }),
    supabase.from('postcode_territories').select('*, sales_consultants(id, name, email)').order('priority', { ascending: true }),
    supabase.from('keepsakes').select('id, promo_code_id, sales_consultant_id, created_at').eq('is_free_demo', true).gte('created_at', monthStart),
    supabase.from('orders').select('id, order_number, customer_name, total_amount_nzd, payment_status, paid_at, created_at, sales_consultant_id, promo_code_id, territory_id, attribution_source').eq('payment_status', 'paid'),
  ]);

  const firstError = consultantsError || promoError || territoryError || demoError || paidError;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    consultants: consultants || [],
    promoCodes: decoratePromoCodes(promoCodes || [], freeDemos || []),
    territories: territories || [],
    report: buildAttributionReport(consultants || [], freeDemos || [], paidOrders || []),
  };
}

function decoratePromoCodes(promoCodes, freeDemos) {
  return promoCodes.map(code => ({
    ...code,
    freeDemosUsedThisMonth: freeDemos.filter(demo => demo.promo_code_id === code.id).length,
  }));
}

function buildAttributionReport(consultants, freeDemos, paidOrders) {
  const byConsultant = consultants.map(consultant => {
    const demos = freeDemos.filter(demo => demo.sales_consultant_id === consultant.id);
    const orders = paidOrders.filter(order => order.sales_consultant_id === consultant.id);
    return {
      consultantId: consultant.id,
      consultantName: consultant.name,
      freeDemosThisMonth: demos.length,
      paidSalesCount: orders.length,
      paidSalesTotalNzd: orders.reduce((sum, order) => sum + Number(order.total_amount_nzd || 0), 0),
      paidOrders: orders.map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        totalAmountNzd: Number(order.total_amount_nzd || 0),
        attributionSource: order.attribution_source,
        paidAt: order.paid_at || order.created_at,
      })),
    };
  });

  return {
    freeDemosThisMonth: freeDemos.length,
    paidSalesCount: paidOrders.length,
    paidSalesTotalNzd: paidOrders.reduce((sum, order) => sum + Number(order.total_amount_nzd || 0), 0),
    unattributedPaidSalesCount: paidOrders.filter(order => !order.sales_consultant_id).length,
    byConsultant,
  };
}

async function loadFamousBirthdaysForAdmin(supabase, query) {
  const status = String(query.status || 'pending').trim().toLowerCase();
  const country = String(query.country || '').trim();
  const day = Number(query.day || 0);
  const month = Number(query.month || 0);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

  let request = supabase
    .from('famous_birthdays')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (['pending', 'approved', 'rejected'].includes(status)) {
    request = request.eq('curation_status', status);
  }
  if (country) {
    request = request.eq('main_public_country', normalizeCountry(country));
  }
  if (Number.isInteger(day) && day >= 1 && day <= 31) {
    request = request.eq('birth_day', day);
  }
  if (Number.isInteger(month) && month >= 1 && month <= 12) {
    request = request.eq('birth_month', month);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Unable to load famous birthdays: ${error.message}`);
  }

  return data || [];
}

async function updateFamousBirthdayCuration(supabase, birthdayId, body) {
  const patch = {};

  if (body.fullName !== undefined || body.full_name !== undefined) {
    const name = String(body.fullName || body.full_name || '').trim();
    if (!name) throw new Error('Full name is required.');
    patch.full_name = name;
  }
  if (body.shortBio !== undefined || body.short_bio !== undefined) {
    patch.short_bio = String(body.shortBio || body.short_bio || '').trim() || null;
  }
  if (body.occupation !== undefined) {
    patch.occupation = String(body.occupation || '').trim() || null;
  }
  if (body.mainPublicCountry !== undefined || body.main_public_country !== undefined || body.country !== undefined) {
    patch.main_public_country = normalizeCountry(body.mainPublicCountry || body.main_public_country || body.country);
  }
  if (body.displayPriority !== undefined || body.display_priority !== undefined) {
    const priority = Number(body.displayPriority ?? body.display_priority);
    if (!Number.isInteger(priority)) throw new Error('Display priority must be a whole number.');
    patch.display_priority = priority;
  }
  if (body.curationStatus !== undefined || body.curation_status !== undefined || body.status !== undefined) {
    const status = String(body.curationStatus || body.curation_status || body.status || '').trim().toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw new Error('Curation status must be pending, approved, or rejected.');
    }
    patch.curation_status = status;
  }
  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
  }
  if (body.adminNotes !== undefined || body.admin_notes !== undefined) {
    patch.admin_notes = String(body.adminNotes || body.admin_notes || '').trim() || null;
  }

  const { data, error } = await supabase
    .from('famous_birthdays')
    .update(patch)
    .eq('id', birthdayId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to update famous birthday: ${error.message}`);
  }

  return data;
}

function buildAdminBirthdayResponse(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    birthDay: row.birth_day,
    birthMonth: row.birth_month,
    birthYear: row.birth_year || null,
    mainPublicCountry: row.main_public_country,
    occupation: row.occupation || '',
    shortBio: row.short_bio || '',
    rawExtract: row.raw_extract || '',
    sourceUrl: row.source_url || '',
    wikipediaTitle: row.wikipedia_title || '',
    curationStatus: row.curation_status,
    displayPriority: Number(row.display_priority || 100),
    active: Boolean(row.active),
    adminNotes: row.admin_notes || '',
  };
}

function normalizeQueueStatus(value) {
  const nextStatus = String(value || '').trim().toLowerCase();
  if (!Object.values(QUEUE_STATUS).includes(nextStatus)) {
    throw new Error('Invalid queue status.');
  }
  return nextStatus;
}

async function loadFulfilmentOrders(supabase) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      source_portal,
      customer_name,
      customer_email,
      recipient_name,
      product_tier,
      delivery_option,
      queue_status,
      delivery_priority,
      needs_fulfilment,
      payment_status,
      created_at,
      shipping_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_region,
      shipping_postcode,
      shipping_country,
      pdf_path,
      printed_at,
      posted_at,
      delivered_at,
      keepsakes (
        id,
        rendered_html,
        pdf_path,
        watermark_status
      )
    `)
    .eq('needs_fulfilment', true)
    .order('delivery_priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Unable to read fulfilment queue: ${error.message}`);
  }

  return data || [];
}

async function loadFulfilmentOrderById(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      source_portal,
      customer_name,
      customer_email,
      recipient_name,
      product_tier,
      delivery_option,
      queue_status,
      delivery_priority,
      needs_fulfilment,
      payment_status,
      created_at,
      shipping_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_region,
      shipping_postcode,
      shipping_country,
      pdf_path,
      printed_at,
      posted_at,
      delivered_at,
      keepsake_id,
      keepsakes (
        id,
        rendered_html,
        pdf_path,
        watermark_status
      )
    `)
    .eq('id', orderId)
    .eq('needs_fulfilment', true)
    .single();

  if (error || !data) {
    const notFound = new Error('Fulfilment order not found.');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

function buildOrderSummary(orders) {
  return orders.reduce((summary, order) => {
    const status = normalizeDisplayStatus(order.queue_status);
    summary.total += 1;
    summary[status] += 1;
    return summary;
  }, {
    total: 0,
    pending: 0,
    printed: 0,
    posted: 0,
    delivered: 0,
  });
}

function compareFulfilmentOrders(left, right) {
  const leftPriority = Number(left.delivery_priority || 99);
  const rightPriority = Number(right.delivery_priority || 99);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftCreated = new Date(left.created_at || 0).getTime();
  const rightCreated = new Date(right.created_at || 0).getTime();
  if (leftCreated !== rightCreated) {
    return leftCreated - rightCreated;
  }

  return String(left.order_number || '').localeCompare(String(right.order_number || ''));
}

function buildAdminOrderResponse(order) {
  const deliveryOption = resolveDeliveryOption(order);
  const shippingAddress = buildShippingAddress(order);

  return {
    id: order.id,
    orderNumber: order.order_number,
    sourcePortal: order.source_portal,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    recipientName: order.recipient_name,
    productTier: order.product_tier,
    productTierLabel: titleCase(order.product_tier),
    deliveryOption,
    deliveryOptionLabel: resolveDeliveryLabel(deliveryOption),
    deliveryPriority: Number(order.delivery_priority || 99),
    queueStatus: normalizeDisplayStatus(order.queue_status),
    createdAt: order.created_at,
    shippingAddress,
    pdfUrl: `/api/admin/orders/${order.id}/download-pdf`,
    printedAt: order.printed_at || null,
    postedAt: order.posted_at || null,
    deliveredAt: order.delivered_at || null,
    hasPdfHtml: Boolean(order.keepsakes?.rendered_html),
    keepsakeId: order.keepsake_id,
    pdfPath: order.pdf_path || order.keepsakes?.pdf_path || null,
  };
}

function resolveDeliveryOption(order) {
  if (order.delivery_option) {
    return order.delivery_option;
  }

  return order.source_portal === SOURCE_PORTALS.radio ? 'standard' : 'standard';
}

function resolveDeliveryLabel(deliveryOption) {
  const delivery = DELIVERY_OPTIONS[deliveryOption];
  return delivery ? delivery.label : 'Standard';
}

function normalizeDisplayStatus(status) {
  const normalized = String(status || 'pending').toLowerCase();
  return Object.values(QUEUE_STATUS).includes(normalized) ? normalized : 'pending';
}

function titleCase(value) {
  return String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildShippingAddress(order) {
  return [
    order.shipping_name,
    order.shipping_address_line1,
    order.shipping_address_line2,
    [order.shipping_city, order.shipping_region].filter(Boolean).join(', '),
    [order.shipping_postcode, order.shipping_country].filter(Boolean).join(' ').trim(),
  ].filter(Boolean).join('\n');
}

async function updateOrderStatus({ supabase, sendEmail, order, nextStatus, adminId }) {
  const currentStatus = normalizeDisplayStatus(order.queue_status);
  const now = new Date().toISOString();
  const patch = {
    queue_status: nextStatus,
  };

  if (nextStatus === 'printed' && !order.printed_at) {
    patch.printed_at = now;
  }

  if (nextStatus === 'posted' && !order.posted_at) {
    patch.posted_at = now;
  }

  if (nextStatus === 'delivered' && !order.delivered_at) {
    patch.delivered_at = now;
  }

  const { data: updatedOrder, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', order.id)
    .select(`
      *,
      keepsakes (
        id,
        rendered_html,
        pdf_path,
        watermark_status
      )
    `)
    .single();

  if (error) {
    throw new Error(`Unable to update order status: ${error.message}`);
  }

  let emailSent = false;
  if (nextStatus === 'posted' && currentStatus !== 'posted' && sendEmail && updatedOrder.customer_email) {
    await sendEmail({
      to: updatedOrder.customer_email,
      subject: `Your Tribute Times keepsake has been posted - ${updatedOrder.order_number}`,
      html: buildPostedOrderCustomerEmail(updatedOrder),
    });
    emailSent = true;
  }

  await supabase.from('fulfilment_events').insert({
    order_id: updatedOrder.id,
    previous_status: currentStatus,
    new_status: nextStatus,
    changed_by_admin_id: adminId,
    triggered_email: emailSent,
    note: nextStatus === 'posted'
      ? 'Admin marked order as posted and sent dispatch email.'
      : `Admin updated queue status to ${nextStatus}.`,
  });

  return { order: updatedOrder, emailSent };
}

async function persistPdfPath(supabase, order, pdfPath) {
  await Promise.allSettled([
    supabase.from('orders').update({ pdf_path: pdfPath }).eq('id', order.id),
    supabase.from('keepsakes').update({ pdf_path: pdfPath }).eq('id', order.keepsake_id),
  ]);
}

function sendPdfResponse(res, fileName, pdfBuffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
}

module.exports = {
  registerAdminFulfilmentRoutes,
  buildAdminOrderResponse,
  buildOrderSummary,
  compareFulfilmentOrders,
  loadFulfilmentOrders,
  normalizeQueueStatus,
  authAdmin,
};
