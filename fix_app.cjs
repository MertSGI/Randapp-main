const fs = require('fs');

let c = fs.readFileSync('App.tsx', 'utf8');
if (!c.includes('path="/admin-preview"')) {
  c = c.replace(
      '<Route path="/admin/site-preview"',
      '<Route path="/admin-preview" element={<Navigate to="/admin/site-preview" replace />} />\n      <Route path="/admin/site-preview"'
  );
  fs.writeFileSync('App.tsx', c);
}
