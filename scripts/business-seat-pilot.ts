import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {buildBusinessSeatPilot} from '../lib/business-seat-pilot';

// Local reviewed JSON only. Deliberately no URL input, fetch or provider credentials.
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || /^https?:/i.test(inputPath) || /^https?:/i.test(outputPath)) throw new Error('usage: tsx scripts/business-seat-pilot.ts input.json output.json');
if (statSync(inputPath).size > 2_000_000) throw new Error('pilot_input_bytes_bound');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const result = buildBusinessSeatPilot(input.flights, input.layouts, input.assignments, input.asOf);
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary));
