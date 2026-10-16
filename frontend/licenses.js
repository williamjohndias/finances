// Reproduce license notices from integrity-checked installed packages.
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname,'../templates/static/vendor/THIRD_PARTY_NOTICES.txt');
const sdk = `Pluggy Connect SDK 2.14.2 — MIT, Pluggy Engineering\nSource: https://github.com/pluggyai/pluggy-connect\n\n`;
const mit = fs.readFileSync(path.join(__dirname,'node_modules/jwt-decode/LICENSE'),'utf8');
let notices = sdk + 'The MIT permission and warranty terms below also apply to Pluggy Connect SDK.\n\n' + mit;
for (const [name,file] of [['zoid','LICENSE.txt'],['belter','LICENSE'],['cross-domain-utils','LICENSE.txt'],
    ['cross-domain-safe-weakmap','LICENSE.txt'],['post-robot','LICENSE.txt'],['universal-serialize','LICENSE.txt'],['zalgo-promise','LICENSE.txt']]) {
    notices += '\n\n' + name + ':\n' + fs.readFileSync(path.join(__dirname,'node_modules',name,file),'utf8');
}
notices += '\n\nFull Apache-2.0 license:\n' + fs.readFileSync(path.join(__dirname,'APACHE-2.0.txt'),'utf8');
fs.writeFileSync(output,notices.split('\n').map(line => line.trimEnd()).join('\n'));
