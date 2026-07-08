const fs = require('fs');
let gs = fs.readFileSync('services/geminiService.ts', 'utf8');
gs = gs.replace(/return new GoogleGenAI\(\{ apiKey: key \}\);/g, "return null;");
fs.writeFileSync('services/geminiService.ts', gs);
