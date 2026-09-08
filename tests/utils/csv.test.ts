import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/lib/csv';

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    expect(parseCsv('id,name\n1,Strategy')).toEqual([{ id: '1', name: 'Strategy' }]);
  });

  it('supports quoted commas, quotes, and CRLF line endings', () => {
    const csv = 'id,text\r\n1,"Hello, ""CSV"""\r\n';
    expect(parseCsv(csv)).toEqual([{ id: '1', text: 'Hello, "CSV"' }]);
  });

  it('strips UTF-8 BOM from the first header', () => {
    expect(parseCsv('\uFEFFid,name\n1,A')).toEqual([{ id: '1', name: 'A' }]);
  });

  it('rejects malformed CSV', () => {
    expect(() => parseCsv('id,name\n1,"broken')).toThrow('unclosed');
    expect(() => parseCsv('id,name')).toThrow('header row');
    expect(() => parseCsv('id,\n1,2')).toThrow('empty column');
  });
});
