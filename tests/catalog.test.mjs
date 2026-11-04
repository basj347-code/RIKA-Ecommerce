import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {products} from '../server/catalog.mjs';

const publicDir=new URL('../frontend-react/public/',import.meta.url);
test('catalog has 28 distinct shoppable pieces including 6 unique dresses',()=>{
 assert.equal(products.length,28);
 assert.equal(products.filter(p=>p.type==='Dresses').length,6);
 assert.equal(new Set(products.map(p=>p.image)).size, products.length, 'Every product must have its own image path');
 assert.equal(new Set(products.map(p=>p.id)).size,products.length);
 for(const item of products){
  assert.ok(item.id&&item.name&&item.description&&item.collection);
  assert.ok(Number.isInteger(item.price)&&item.price>0);
  assert.ok(Array.isArray(item.colors)&&item.colors.length&&item.colors.every(c=>c.name&&c.hex));
  assert.ok(item.sizes.length&&Number.isInteger(item.stock)&&item.stock>0);
 }
});
test('every catalog image and brand asset ships with the storefront',async()=>{
 const signatures=new Map();
 for(const image of products.map(p=>p.image)){
  assert.match(image,/^\/images\/[a-z-]+\.jpg$/);
  const url=new URL(`../frontend-react/public${image}`,import.meta.url);
  await access(url);
  const signature=createHash('sha256').update(await readFile(url)).digest('hex');
  assert.ok(!signatures.has(signature), `${image} repeats the exact photo used by ${signatures.get(signature)}`);
  signatures.set(signature,image);
 }
 for(const name of ['rika-logo.svg','favicon.svg','images/hero.jpg']){
  await access(new URL(`../frontend-react/public/${name}`,import.meta.url));
 }
 const logo=await readFile(new URL('../frontend-react/public/rika-logo.svg',import.meta.url),'utf8');
 assert.match(logo,/<svg/);assert.match(logo,/RIKA/);
});
