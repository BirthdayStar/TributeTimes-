'use strict';

const { SOURCE_PORTALS, WATERMARK_STATUS } = require('./constants');

const PORTAL_RULES = Object.freeze({
  [SOURCE_PORTALS.public]: Object.freeze({
    requiresPostalAddress: false,
    allowsPrint: false,
    allowsDjDownload: false,
    allowsWatermarkPreview: true,
    createsFulfilmentQueueItem: false,
    defaultWatermarkStatus: WATERMARK_STATUS.samplePreview,
  }),
  [SOURCE_PORTALS.radio]: Object.freeze({
    requiresPostalAddress: true,
    allowsPrint: false,
    allowsDjDownload: false,
    allowsWatermarkPreview: false,
    createsFulfilmentQueueItem: true,
    defaultWatermarkStatus: WATERMARK_STATUS.none,
  }),
  [SOURCE_PORTALS.florist]: Object.freeze({
    requiresPostalAddress: false,
    allowsPrint: true,
    allowsDjDownload: false,
    allowsWatermarkPreview: false,
    createsFulfilmentQueueItem: false,
    defaultWatermarkStatus: WATERMARK_STATUS.none,
  }),
});

function getPortalRule(portal) {
  return PORTAL_RULES[portal] || PORTAL_RULES[SOURCE_PORTALS.public];
}

function requiresPostalAddress(portal) {
  return getPortalRule(portal).requiresPostalAddress;
}

function getDefaultWatermarkStatus(portal, isPaid) {
  if (portal === SOURCE_PORTALS.public && isPaid) {
    return WATERMARK_STATUS.cleanPaid;
  }
  return getPortalRule(portal).defaultWatermarkStatus;
}

module.exports = {
  PORTAL_RULES,
  getPortalRule,
  requiresPostalAddress,
  getDefaultWatermarkStatus,
};
