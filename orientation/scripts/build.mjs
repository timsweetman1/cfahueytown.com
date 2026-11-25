import {cp, mkdir, readdir} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('public/orientation-ui',{recursive:true});
for (const item of await readdir('.', {withFileTypes:true})) {
  if ((item.isFile() && /\.(html|css|js|png|jpg|jpeg|svg|ico|webmanifest|txt|xml)$/i.test(item.name))
      || ['assets','css','roles'].includes(item.name)) {
    await cp(item.name,'public/'+item.name,{recursive:true});
  }
}
await cp('orientation/ui/index.html','public/orientation-ui/index.html');
await cp('orientation/ui/globals.css','public/orientation-ui/course.css');
await build({entryPoints:['orientation/ui/main.tsx'], outfile:'public/orientation-ui/app.js', bundle:true,
  minify:true, jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'}});
