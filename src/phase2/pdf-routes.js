'use strict';

const { generatePdfFromHtml, sanitizeFilenamePart } = require('./pdf-service');

function registerPdfRoutes(app, { supabase, authStation }) {
  if (!app) throw new Error('Express app is required.');
  if (!supabase) throw new Error('Supabase client is required.');
  if (!authStation) throw new Error('authStation middleware is required.');

  app.get('/api/public/orders/:orderId/download-pdf', async (req, res) => {
    try {
      const order = await loadPaidPublicOrder(supabase, req.params.orderId);
      const pdf = await generatePdfFromHtml({
        html: order.keepsakes.rendered_html,
        fileStem: order.order_number || order.recipient_name || 'tribute-times-public-order',
        keepArtifacts: true,
      });

      await persistPdfPath(supabase, order, pdf.pdfFilePath);
      sendPdfResponse(res, `${sanitizeFilenamePart(order.order_number || order.recipient_name || 'tribute-times-keepsake')}.pdf`, pdf.pdfBuffer);
    } catch (error) {
      console.error('Public PDF download error:', error);
      res.status(error.statusCode || 400).json({ error: error.message || 'Unable to generate PDF.' });
    }
  });

  app.get('/api/station/keepsakes/:keepsakeId/pdf', authStation, async (req, res) => {
    try {
      const keepsake = await loadStationKeepsakeForPdf(supabase, req.station.id, req.params.keepsakeId);
      const pdf = await generatePdfFromHtml({
        html: keepsake.rendered_html,
        fileStem: keepsake.listener_name || keepsake.id || 'tribute-times-radio-keepsake',
        keepArtifacts: true,
      });

      await persistKeepsakePdfPath(supabase, keepsake.id, pdf.pdfFilePath);
      sendPdfResponse(res, `${sanitizeFilenamePart(keepsake.listener_name || keepsake.id || 'tribute-times-keepsake')}.pdf`, pdf.pdfBuffer);
    } catch (error) {
      console.error('Station keepsake PDF error:', error);
      res.status(error.statusCode || 400).json({ error: error.message || 'Unable to generate PDF.' });
    }
  });

  app.post('/api/station/pdf-from-html', authStation, async (req, res) => {
    try {
      const { html, fileName } = req.body || {};
      const pdf = await generatePdfFromHtml({
        html,
        fileStem: fileName || 'tribute-times-radio-fulfilment',
      });

      sendPdfResponse(res, `${sanitizeFilenamePart(fileName || 'tribute-times-radio-fulfilment')}.pdf`, pdf.pdfBuffer);
    } catch (error) {
      console.error('Station HTML-to-PDF error:', error);
      res.status(error.statusCode || 400).json({ error: error.message || 'Unable to generate PDF.' });
    }
  });
}

async function loadPaidPublicOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      recipient_name,
      payment_status,
      pdf_path,
      keepsake_id,
      keepsakes (
        id,
        rendered_html,
        pdf_path
      )
    `)
    .eq('id', orderId)
    .eq('source_portal', 'public')
    .single();

  if (error || !data) {
    const notFound = new Error('Public order not found.');
    notFound.statusCode = 404;
    throw notFound;
  }

  if (data.payment_status !== 'paid') {
    const forbidden = new Error('Clean PDF is available only after payment.');
    forbidden.statusCode = 403;
    throw forbidden;
  }

  if (!data.keepsakes?.rendered_html) {
    const missingHtml = new Error('No clean keepsake HTML is stored for this order yet.');
    missingHtml.statusCode = 409;
    throw missingHtml;
  }

  return data;
}

async function loadStationKeepsakeForPdf(supabase, stationId, keepsakeId) {
  const { data, error } = await supabase
    .from('keepsakes')
    .select('id, station_id, listener_name, rendered_html, pdf_path')
    .eq('id', keepsakeId)
    .eq('station_id', stationId)
    .single();

  if (error || !data) {
    const notFound = new Error('Keepsake not found for this station.');
    notFound.statusCode = 404;
    throw notFound;
  }

  if (!data.rendered_html) {
    const missingHtml = new Error('This keepsake does not yet have stored rendered HTML for PDF generation.');
    missingHtml.statusCode = 409;
    throw missingHtml;
  }

  return data;
}

async function persistPdfPath(supabase, order, pdfPath) {
  await Promise.allSettled([
    supabase.from('orders').update({ pdf_path: pdfPath }).eq('id', order.id),
    supabase.from('keepsakes').update({ pdf_path: pdfPath }).eq('id', order.keepsake_id),
  ]);
}

async function persistKeepsakePdfPath(supabase, keepsakeId, pdfPath) {
  await supabase.from('keepsakes').update({ pdf_path: pdfPath }).eq('id', keepsakeId);
}

function sendPdfResponse(res, fileName, pdfBuffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
}

module.exports = {
  registerPdfRoutes,
};
