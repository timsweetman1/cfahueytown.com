import fs from 'node:fs';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const assets={};
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else {const type=types[path.extname(p)];if(!type)throw Error('Unsupported asset '+p);let data=fs.readFileSync(p);if(/\.(html|js|css)$/.test(p)){let text=data.toString();text=text.replace(/(["'`(])\/(?!\/|benefits\/)/g,'$1/benefits/');data=Buffer.from(text)}assets['/'+path.relative('web',p)]={type,data:data.toString('base64')};}}}
walk('web');fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/app.js','const ASSETS='+JSON.stringify(assets)+';\n'+['ui','business','runtime'].map(n=>fs.readFileSync('server/'+n+'.js','utf8')).join('\n'));
for(const name of ['auth','storage'])fs.copyFileSync('server/'+name+'.js','dist/'+name+'.js');
// Publish only the existing public restaurant site, never Team Care source/assets.
fs.rmSync('../public',{recursive:true,force:true});fs.mkdirSync('../public');
for(const entry of fs.readdirSync('..',{withFileTypes:true})){
 if(entry.name.startsWith('.')||['team-care','api','node_modules','public','package.json','package-lock.json','vercel.json'].includes(entry.name))continue;
 if(entry.isDirectory()||/\.(html|css|js|png|jpg|jpeg|svg|ico|webp|txt|xml|pdf)$/i.test(entry.name))fs.cpSync('../'+entry.name,'../public/'+entry.name,{recursive:true});
}
console.log('Built Vercel Node handler with '+Object.keys(assets).length+' protected assets.');
