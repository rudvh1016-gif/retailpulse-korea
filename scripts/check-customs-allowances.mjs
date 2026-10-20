#!/usr/bin/env node
/**
 * Default: local preparation checks only. --live is a one-shot read, not a
 * scheduler; it still refuses each URL without an explicit accessReview.
 * Writes nothing. Never changes verifiedAt, source data, DB, notices or releases.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateManifest, validatePreviewDataset, allowanceSemanticHash, checkSource } from '../lib/customs-allowance-check.mjs';

export async function main(args = process.argv.slice(2)) {
  const options = { live: false, manifest: new URL('../config/customs-allowance-sources.json', import.meta.url),
    data: new URL('../data/airport-focus-preview/arrival-allowances.json', import.meta.url), sources: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check') continue;
    if (arg === '--live') { options.live = true; continue; }
    if (['--manifest', '--data', '--source'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const value = args[++i];
      if (arg === '--source') options.sources.push(value);
      else options[arg.slice(2)] = value;
      continue;
    }
    throw new Error('USAGE: --check [--manifest path] [--data path] [--live --source ID]');
  }
  const manifest = validateManifest(JSON.parse(await readFile(options.manifest, 'utf8')));
  const dataset = JSON.parse(await readFile(options.data, 'utf8'));
  const errors = validatePreviewDataset(dataset, manifest);
  const summary = { mode: options.live ? 'ONE_SHOT_READ_ONLY' : 'OFFLINE_PREPARATION_CHECK',
    automaticCollectionEnabled: false, publicationEnabled: false, databaseWrites: 0, providerRequests: 0,
    legalInterpretationVerified: false, countryCount: dataset.countries?.length ?? 0,
    sourceCount: manifest.sources.length, errors,
    datasetSemanticHashes: errors.length ? [] : dataset.countries.map(country => ({ id: country.id, hash: allowanceSemanticHash(country) })),
    note: 'Technical preparation only. A source-byte change is not a confirmed regulation change. No verifiedAt values are updated.',
  };
  if (errors.length) { console.log(JSON.stringify(summary, null, 2)); return 1; }
  if (options.live) {
    // Require a deliberate bounded selection, rather than silently fetching all.
    if (!options.sources.length || new Set(options.sources).size !== options.sources.length
      || options.sources.length > manifest.policy.maxRequests
      || options.sources.some(id => !manifest.sources.some(source => source.id === id))) throw new Error('EXPLICIT_VALID_SOURCE_SELECTION_REQUIRED');
    const budget = { requests: 0 };
    summary.observations = [];
    for (const id of options.sources) {
      const source = manifest.sources.find(item => item.id === id);
      const country = dataset.countries.find(item => item.id === source.jurisdiction);
      // Only compact last-good identity/clock, never the unreviewed source body.
      const lastGood = { semanticHash: allowanceSemanticHash(country), verifiedAt: country.verifiedAt ?? null };
      summary.observations.push(await checkSource(source, manifest, { budget, lastGood }));
    }
    summary.providerRequests = budget.requests;
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary.observations?.some(item => ['COLLECTION_FAILED', 'COLLECTION_BLOCKED'].includes(item.state)) ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch (error) {
    // No arbitrary exception/provider text, request URLs or credentials in logs.
    const known = /^(INVALID_|SOURCE_|EXPLICIT_|USAGE:)/.test(error?.message ?? '');
    console.error(JSON.stringify({ mode: 'READ_ONLY_CHECK_FAILED', automaticCollectionEnabled: false,
      publicationEnabled: false, reason: known ? error.message : 'LOCAL_INPUT_OR_CHECK_ERROR' }));
    process.exitCode = 1;
  }
}
