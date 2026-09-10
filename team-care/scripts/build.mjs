import fs from 'node:fs';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const assets={};
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else {const type=types[path.extname(p)];if(!type)throw Error('Unsupported public file '+p);assets['/'+path.relative('web',p).replaceAll('\\','/')]={type,data:fs.readFileSync(p).toString('base64')};}}}
walk('web');
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js','const ASSETS='+JSON.stringify(assets)+';\n'+fs.readFileSync('worker/ai.js','utf8')+'\n'+fs.readFileSync('worker/requests.js','utf8')+'\n'+fs.readFileSync('worker/handler.js','utf8'));
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built protected Worker with '+Object.keys(assets).length+' embedded assets; no public static bypass.');

if(fs.existsSync('drizzle'))fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
