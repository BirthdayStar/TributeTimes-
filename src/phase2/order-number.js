'use strict';

function pad(value, size) {
  return String(value).padStart(size, '0');
}

function getOrderDateParts(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1, 2);
  const day = pad(date.getDate(), 2);
  return {
    year,
    month,
    day,
    compact: `${year}${month}${day}`,
  };
}

function formatOrderNumber(sequence, date = new Date()) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('Order sequence must be a positive integer.');
  }

  const parts = getOrderDateParts(date);
  return `TT-${parts.compact}-${pad(sequence, 4)}`;
}

async function getNextOrderNumber(supabase, date = new Date()) {
  if (!supabase) {
    throw new Error('Supabase client is required to generate order numbers.');
  }

  const parts = getOrderDateParts(date);
  const prefix = `TT-${parts.compact}-`;

  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .ilike('order_number', `${prefix}%`)
    .order('order_number', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Unable to read order sequence: ${error.message}`);
  }

  const latestOrderNumber = data && data[0] ? data[0].order_number : null;
  if (!latestOrderNumber) {
    return formatOrderNumber(1, date);
  }

  const latestSequence = Number(latestOrderNumber.slice(-4));
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;
  return formatOrderNumber(nextSequence, date);
}

module.exports = {
  formatOrderNumber,
  getNextOrderNumber,
};
