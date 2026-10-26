import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, reportToCsv } from '../src/export.mjs';
import { sampleData } from '../src/sample-data.mjs';
import { calculateReport } from '../src/report.mjs';

test('CSV escapes delimiters, quotes and spreadsheet formulas', () => {
  assert.equal(csvCell('Сыр; "Гауда"'), '"Сыр; ""Гауда"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('  @SUM(1)'), '"\'  @SUM(1)"');
  assert.equal(csvCell(-20), '"-20"');
});

test('CSV contains the full report, Unicode BOM and ingredient-only scope', () => {
  const csv = reportToCsv(sampleData, calculateReport(sampleData));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Это не чистая прибыль.'));
  assert.ok(csv.includes('397860'));
  assert.ok(csv.includes('Шашлык из свинины'));
  assert.ok(csv.includes('\r\n'));
});
