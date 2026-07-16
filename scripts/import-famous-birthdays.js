'use strict';

require('dotenv').config();

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { inferMainPublicCountry, normalizeCountry } = require('../src/phase2/famous-birthdays');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/births';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const days = buildImportDays(options);

  for (const { month, day } of days) {
    await importDay(month, day, options);
  }

  console.log(`Imported famous birthday data for ${days.length} day(s).`);
}

function parseArgs(args) {
  const options = {
    sample: args.includes('--sample'),
    all: args.includes('--all'),
    limitPerDay: Number(readArg(args, '--limit') || 25),
    month: Number(readArg(args, '--month') || 0),
    day: Number(readArg(args, '--day') || 0),
  };

  if (!options.sample && !options.all && (!options.month || !options.day)) {
    options.sample = true;
  }

  return options;
}

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function buildImportDays(options) {
  if (options.month && options.day) {
    return [{ month: options.month, day: options.day }];
  }
  if (options.sample) {
    return [
      { month: 1, day: 1 },
      { month: 4, day: 25 },
      { month: 7, day: 4 },
    ];
  }

  const days = [];
  for (let month = 1; month <= 12; month += 1) {
    const daysInMonth = new Date(Date.UTC(2023, month, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push({ month, day });
    }
  }
  return days;
}

async function importDay(month, day, options) {
  const run = await createImportRun(month, day);

  try {
    const births = await fetchWikipediaBirths(month, day);
    const rows = births.slice(0, options.limitPerDay).map(entry => mapWikipediaBirth(entry, month, day, run.id));
    let inserted = 0;
    let updated = 0;
    let rejected = 0;

    for (const row of rows) {
      try {
        const result = await upsertBirthday(row);
        if (result === 'updated') updated += 1;
        else inserted += 1;
      } catch (error) {
        rejected += 1;
        console.error(`Rejected ${row.full_name}: ${error.message}`);
      }
    }

    await finishImportRun(run.id, {
      status: 'completed',
      rowsSeen: births.length,
      rowsInserted: inserted,
      rowsUpdated: updated,
      rowsRejected: rejected,
      notes: `Imported ${inserted} inserted, ${updated} updated.`,
    });

    console.log(`${month}/${day}: ${inserted} inserted, ${updated} updated, ${rejected} rejected.`);
  } catch (error) {
    await finishImportRun(run.id, {
      status: 'failed',
      rowsSeen: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsRejected: 0,
      notes: error.message,
    });
    throw error;
  }
}

async function fetchWikipediaBirths(month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const response = await fetch(`${WIKIPEDIA_API}/${mm}/${dd}`, {
    headers: {
      'User-Agent': 'TributeTimesPhase2/1.0 (famous birthdays import)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia returned ${response.status} for ${month}/${day}`);
  }

  const data = await response.json();
  return Array.isArray(data.births) ? data.births : [];
}

function mapWikipediaBirth(entry, month, day, importRunId) {
  const page = Array.isArray(entry.pages) ? entry.pages[0] : null;
  const title = page?.normalizedtitle || page?.title || '';
  const extract = page?.extract || entry.text || '';
  const name = title || extract.split(',')[0] || `Unknown ${month}/${day}`;
  const sourceUrl = page?.content_urls?.desktop?.page || page?.content_urls?.mobile?.page || '';
  const country = safeInferCountry(`${title} ${extract}`);

  return {
    import_run_id: importRunId,
    full_name: cleanText(name),
    birth_day: day,
    birth_month: month,
    birth_year: Number(entry.year) || null,
    main_public_country: country,
    occupation: cleanText(extract.split('.').slice(0, 1).join('.')).slice(0, 240) || null,
    short_bio: cleanText(extract).slice(0, 500) || null,
    raw_extract: cleanText(extract) || null,
    source_name: 'Wikipedia',
    source_url: sourceUrl,
    wikipedia_title: title,
    curation_status: 'pending',
    display_priority: 100,
    active: true,
    admin_notes: 'Imported from Wikipedia. Confirm country uses main public association before approving.',
  };
}

function safeInferCountry(text) {
  try {
    return normalizeCountry(inferMainPublicCountry(text));
  } catch {
    return 'United States';
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function createImportRun(month, day) {
  const { data, error } = await supabase
    .from('famous_birthdays_import_runs')
    .insert({
      requested_day: day,
      requested_month: month,
      status: 'running',
      notes: 'Wikipedia import started.',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to create import run: ${error.message}`);
  }
  return data;
}

async function finishImportRun(id, result) {
  const { error } = await supabase
    .from('famous_birthdays_import_runs')
    .update({
      status: result.status,
      rows_seen: result.rowsSeen,
      rows_inserted: result.rowsInserted,
      rows_updated: result.rowsUpdated,
      rows_rejected: result.rowsRejected,
      notes: result.notes,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Unable to finish import run: ${error.message}`);
  }
}

async function upsertBirthday(row) {
  const { data: existing, error: existingError } = await supabase
    .from('famous_birthdays')
    .select('id, curation_status')
    .ilike('full_name', row.full_name)
    .eq('birth_day', row.birth_day)
    .eq('birth_month', row.birth_month)
    .eq('source_name', row.source_name)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const patch = { ...row };
    if (existing.curation_status !== 'pending') {
      delete patch.curation_status;
      delete patch.main_public_country;
      delete patch.short_bio;
      delete patch.display_priority;
      delete patch.active;
    }
    const { error } = await supabase
      .from('famous_birthdays')
      .update(patch)
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const { error } = await supabase.from('famous_birthdays').insert(row);
  if (error) throw new Error(error.message);
  return 'inserted';
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
