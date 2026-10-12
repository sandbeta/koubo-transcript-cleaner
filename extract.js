const fs = require('fs');
const h = fs.readFileSync(process.argv[2] || 'koubo-transcript-cleaner.html', 'utf8');
let bad = 0;
for (const id of ['core', 'ui', 'selftest']) {
  const open = '<script id="' + id + '">';
  const a = h.indexOf(open);
  if (a < 0) { console.log('MISSING ' + id); bad++; continue; }
  const b = h.indexOf('</script>', a);
  const src = h.slice(a + open.length, b);
  fs.writeFileSync('_c_' + id + '.js', src);
  console.log(id + ': ' + src.split('\n').length + ' 行 → _c_' + id + '.js');
}
process.exit(bad);
