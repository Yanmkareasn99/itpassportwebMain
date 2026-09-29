import fs from 'node:fs';

let badge;

try {
  const results = JSON.parse(
    fs.readFileSync('test-results.json', 'utf8')
  );

  const passed = results.numPassedTests ?? 0;
  const failed = results.numFailedTests ?? 0;
  const total = results.numTotalTests ?? passed + failed;

  badge = {
    schemaVersion: 1,
    label: 'TESTS',
    message:
      failed === 0
        ? `${passed} PASSING`
        : `${passed}/${total} PASSING`,
    color: failed === 0 ? 'brightgreen' : 'red',
  };
} catch {
  badge = {
    schemaVersion: 1,
    label: 'TESTS',
    message: 'ERROR',
    color: 'red',
  };
}

fs.writeFileSync(
  'test-badge.json',
  JSON.stringify(badge, null, 2)
);

console.log(badge);