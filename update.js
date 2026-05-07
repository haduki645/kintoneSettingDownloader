const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

// Insert jsonDir creation
code = code.replace(
  'await fs.mkdir(appDir, { recursive: true });',
  'await fs.mkdir(appDir, { recursive: true });\n      const jsonDir = path.join(appDir, "json");\n      await fs.mkdir(jsonDir, { recursive: true });'
);

// Replace path.join(appDir, "xxx.json") with path.join(jsonDir, "xxx.json")
code = code.replace(/path\.join\(appDir,\s*"([^"]+\.json)"\)/g, 'path.join(jsonDir, "$1")');

// Update readme.md content (handling the escaped backticks)
code = code.replace(/- \\`app\.json\\`:/, '- \\`json/app.json\\`:');
code = code.replace(/- \\`fields\.json\\`:/, '- \\`json/fields.json\\`:');
code = code.replace(/- \\`views\.json\\`:/, '- \\`json/views.json\\`:');
code = code.replace(/- \\`customize\.json\\`:/, '- \\`json/customize.json\\`:');
code = code.replace(/- \\`appAcl\.json\\`:/, '- \\`json/appAcl.json\\`:');
code = code.replace(/- \\`recordAcl\.json\\`:/, '- \\`json/recordAcl.json\\`:');
code = code.replace(/- \\`fieldAcl\.json\\`:/, '- \\`json/fieldAcl.json\\`:');
code = code.replace(/- \\`notificationsGeneral\.json\\`:/, '- \\`json/notificationsGeneral.json\\`:');
code = code.replace(/- \\`notificationsPerRecord\.json\\`:/, '- \\`json/notificationsPerRecord.json\\`:');
code = code.replace(/- \\`notificationsReminder\.json\\`:/, '- \\`json/notificationsReminder.json\\`:');
code = code.replace(/- \\`actions\.json\\`:/, '- \\`json/actions.json\\`:');
code = code.replace(/- \\`plugins\.json\\`:/, '- \\`json/plugins.json\\`:');

fs.writeFileSync('src/index.ts', code);
console.log("Updated src/index.ts");
