const fs = require('fs');
const glob = require('glob');

const files = glob.sync('services/*.ts');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  if (content.includes('const isSupabaseMode = () => ((import.meta as any).env.VITE_DATA_MODE || \'mock\') === \'supabase\';')) {
    content = content.replace(
      'const isSupabaseMode = () => ((import.meta as any).env.VITE_DATA_MODE || \'mock\') === \'supabase\';',
      `const isSupabaseMode = () => {
  try { return (import.meta as any).env?.VITE_DATA_MODE === 'supabase'; } catch(e) { return false; }
};`
    );
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
});
