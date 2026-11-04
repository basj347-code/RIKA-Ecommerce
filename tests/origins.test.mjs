import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOriginPolicy} from '../server/origins.mjs';

test('development accepts the configured address and both local Vite addresses',()=>{
 const p=createOriginPolicy({appOrigin:'http://localhost:5173/'});
 for(const url of ['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173']) assert.equal(p.permits(url),true,url);
 assert.equal(p.canonical,'http://localhost:5173');
});
test('rejects unrelated sites, alternate ports, and malformed origins',()=>{
 const p=createOriginPolicy();
 for(const url of ['https://attacker.example','http://localhost:9999','null','http://localhost:5173.evil.example','http://localhost:5173/path']) assert.equal(p.permits(url),false,url);
});
test('production allows only explicit origins and never automatically trusts dev origins',()=>{
 const p=createOriginPolicy({appOrigin:'https://rika.example',production:true,additionalOrigins:'https://shop.rika.example'});
 assert.equal(p.permits('https://rika.example'),true);
 assert.equal(p.permits('https://shop.rika.example'),true);
 assert.equal(p.permits('http://localhost:5173'),false);
});
test('invalid origin settings are rejected',()=>{
 assert.throws(()=>createOriginPolicy({appOrigin:'localhost:5173'}));
 assert.throws(()=>createOriginPolicy({additionalOrigins:'file:///tmp'}));
});
