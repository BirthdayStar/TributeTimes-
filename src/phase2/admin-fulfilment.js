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

function registerAdminFulfilmentRoutes(app, { supabase, sendEmail }) {
  if (!app) throw new Error('Express app is required.');
  if (!supabase) throw new Error('Supabase client is required.');

  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const { data: admin, error } = await supabase
        .from('admins')
        .select('id, display_name, email, password_hash, active, last_login')
        .ilike('email', email)
        .single();

      if (error || !admin || !admin.active) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      await supabase
        .from('admins')
        .update({ last_login: new Date().toISOString() })
        .eq('id', admin.id);

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
      const orders = await loadFulfilmentOrders(supabase);
      return res.json({
        summary: buildOrderSummary(orders),
        orders: orders.sort(compareFulfilmentOrders).map(buildAdminOrderResponse),
      });
    } catch (error) {
      console.error('Admin queue load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load fulfilment queue.' });
    }
  });

  app.get('/api/admin/attribution', authAdmin, async (req, res) => {
    try {
      const data = await loadAttributionAdminData(supabase);
      return res.json(data);
    } catch (error) {
      console.error('Admin attribution load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load attribution data.' });
    }
  });

  app.post('/api/admin/consultants', authAdmin, async (req, res) => {
    try {
      const consultant = await createConsultant(supabase, req.body || {});
      return res.json({ consultant });
    } catch (error) {
      console.error('Admin consultant create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create consultant.' });
    }
  });

  app.post('/api/admin/promo-codes', authAdmin, async (req, res) => {
    try {
      const promoCode = await createPromoCode(supabase, req.body || {});
      return res.json({ promoCode });
    } catch (error) {
      console.error('Admin promo create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create promo code.' });
    }
  });

  app.post('/api/admin/postcode-territories', authAdmin, async (req, res) => {
    try {
      const territory = await createPostcodeTerritory(supabase, req.body || {});
      return res.json({ territory });
    } catch (error) {
      console.error('Admin territory create error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create postcode territory.' });
    }
  });

  app.post('/api/admin/stations', authAdmin, async (req, res) => {
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

      const { data: station, error } = await supabase
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

      return res.json({ station });
    } catch (error) {
      console.error('Admin create station error:', error);
      return res.status(500).json({ error: 'Unable to add station manager.' });
    }
  });

  app.post('/api/admin/florists', authAdmin, async (req, res) => {
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

      const { data: florist, error } = await supabase
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

      return res.json({ florist });
    } catch (error) {
      console.error('Admin create florist error:', error);
      return res.status(500).json({ error: 'Unable to add florist partner.' });
    }
  });

  app.get('/api/admin/famous-birthdays', authAdmin, async (req, res) => {
    try {
      const rows = await loadFamousBirthdaysForAdmin(supabase, req.query || {});
      return res.json({ birthdays: rows.map(buildAdminBirthdayResponse) });
    } catch (error) {
      console.error('Admin famous birthdays load error:', error);
      return res.status(400).json({ error: error.message || 'Unable to load famous birthdays.' });
    }
  });

  app.patch('/api/admin/famous-birthdays/:birthdayId', authAdmin, async (req, res) => {
    try {
      const birthday = await updateFamousBirthdayCuration(supabase, req.params.birthdayId, req.body || {});
      return res.json({ birthday: buildAdminBirthdayResponse(birthday) });
    } catch (error) {
      console.error('Admin famous birthday update error:', error);
      return res.status(400).json({ error: error.message || 'Unable to update famous birthday.' });
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
