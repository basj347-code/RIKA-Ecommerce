import 'dotenv/config';
import {spawn} from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {initDB} from './init-db.mjs';
const children=[];
function run(command,args,options={}){const c=spawn(command,args,{stdio:'inherit',windowsHide:true,...options});children.push(c);c.on('error',e=>{console.error(e.message);shutdown(1);});return c;}
function listening(){return new Promise(resolve=>{const s=net.connect(27018,'127.0.0.1');s.on('connect',()=>{s.destroy();resolve(true);});s.on('error',()=>resolve(false));});}
function shutdown(code=0){for(const c of children)c.kill();process.exit(code);}
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>shutdown());
if(!process.env.MONGODB_URI||process.env.MONGODB_URI.includes(':27018/')){
 if(!await listening()) {const base='C:/Program Files/MongoDB/Server';const versions=fs.existsSync(base)?fs.readdirSync(base).sort().reverse():[];const mongod=process.env.MONGOD_PATH||versions.map(v=>path.join(base,v,'bin/mongod.exe')).find(p=>fs.existsSync(p))||'mongod';fs.mkdirSync('.local/db',{recursive:true});run(mongod,['--dbpath',path.resolve('.local/db'),'--port','27018','--bind_ip','127.0.0.1','--replSet','rikaLocal','--logpath',path.resolve('.local/mongo.log'),'--logappend']);for(let i=0;i<30&&!await listening();i++)await new Promise(r=>setTimeout(r,500));}
 await initDB();
}
run(process.execPath,['--watch','--env-file-if-exists=.env','server/index.mjs']);
run(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{cwd:path.resolve('frontend-react')});
console.log('\nRIKA storefront → http://localhost:5173\nMongoDB Compass → mongodb://localhost:27018/rika?replicaSet=rikaLocal\n');
