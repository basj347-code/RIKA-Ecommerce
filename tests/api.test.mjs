import {test} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const origin='http://localhost:5173';
const testUri=process.env.RIKA_TEST_MONGODB_URI||`mongodb://127.0.0.1:27018/rika_test_${process.pid}?replicaSet=rikaLocal`;
const db=new URL(testUri).pathname.slice(1);
if(!/^rika_test_[a-zA-Z0-9_]+$/.test(db))throw Error('Tests require a disposable database named rika_test_*; the application database is never used.');
process.env.APP_ORIGIN=origin;
process.env.NODE_ENV='test';
delete process.env.SMTP_HOST;
const initialDir=process.cwd();
const mailDir=await mkdtemp(path.join(os.tmpdir(),'rika-api-test-'));
process.chdir(mailDir); // local development reset mail never touches the user's data
const {app}=await import('../server/app.mjs');
const {products}=await import('../server/catalog.mjs');
const {User,Session,Cart,Wishlist,Order,Subscriber}=await import('../server/models.mjs');

const password='A-very-long-password-1234';
const address={name:'Sample Buyer',phone:'9876543210',line1:'101 Example Street',line2:'',city:'Chennai',state:'Tamil Nadu',pincode:'600001'};
const product=products.find(p=>p.id==='linen-shirt');
const item={productId:product.id,size:'M',color:product.colors[0].name,quantity:1};
let server,base;
async function call(route,{method='GET',cookie,body}={}){
 const r=await fetch(`${base}/api${route}`,{method,headers:{Origin:origin,'X-Rika-Request':'1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await r.json();
 return {status:r.status,body:value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function signup(email,username){const r=await call('/auth/signup',{method:'POST',body:{name:'Test Buyer',email,username,password}});assert.equal(r.status,201,JSON.stringify(r.body));assert.ok(r.cookie);return r;}
const post=(route,body,cookie)=>call(route,{method:'POST',body,cookie});
const put=(route,body,cookie)=>call(route,{method:'PUT',body,cookie});

test('RIKA API — isolated MongoDB integration flows',async t=>{
 try{
  await mongoose.connect(testUri,{serverSelectionTimeoutMS:5000});
  await Promise.all([User,Session,Cart,Wishlist,Order,Subscriber].map(m=>m.init()));
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;

  let a,b,order;
  await t.test('normalization, unique email/username, no password leaks',async()=>{
   a=await signup('  A.TEST@EXAMPLE.COM  ',' First_USER ');
   assert.equal(a.body.user.email,'a.test@example.com');assert.equal(a.body.user.username,'first_user');
   assert.equal(a.body.user.passwordHash,undefined);
   assert.equal((await post('/auth/signup',{name:'Duplicate',email:'a.test@example.com',username:'different',password})).status,409);
   assert.equal((await post('/auth/signup',{name:'Duplicate',email:'unique@example.com',username:'FIRST_user',password})).status,409);
   b=await signup('b.test@example.com','second_user');
   assert.notEqual(a.body.user.id,b.body.user.id);
  });
  await t.test('private profile, cart and wishlist ownership; invalid variants and quantities',async()=>{
   const edit={name:'Buyer A',username:'first_user',phone:'',website:'',company:'Private A',address};
   assert.equal((await call('/account',{method:'PATCH',cookie:a.cookie,body:edit})).status,200);
   const meB=await call('/auth/me',{cookie:b.cookie});
   assert.equal(meB.status,200);assert.equal(meB.body.user.name,'Test Buyer');assert.equal(meB.body.user.address,null);
   assert.equal(meB.body.user.company,'');
   assert.equal((await post('/cart/items',{...item,size:'NOPE'},a.cookie)).status,400);
   assert.equal((await post('/cart/items',{...item,quantity:11},a.cookie)).status,400);
   assert.equal((await post('/cart/items',item,a.cookie)).status,200);
   assert.equal((await post(`/wishlist/${product.id}`,{saved:true},a.cookie)).status,200);
   const ca=await call('/cart',{cookie:a.cookie});const cb=await call('/cart',{cookie:b.cookie});
   assert.equal(ca.body.items.length,1);assert.equal(cb.body.items.length,0);
   assert.deepEqual((await call('/wishlist',{cookie:a.cookie})).body.ids,[product.id]);
   assert.deepEqual((await call('/wishlist',{cookie:b.cookie})).body.ids,[]);
   assert.equal((await put('/cart',{items:[],version:ca.body.version-1},a.cookie)).status,409);
   assert.equal((await put('/cart',{items:[{...item,quantity:2},{...item,quantity:1}],version:ca.body.version},a.cookie)).status,400);
  });
  await t.test('server price, demo pay now, idempotency and cart clearing',async()=>{
   const cart=(await call('/cart',{cookie:a.cookie})).body;
   const key=crypto.randomUUID();
   const response=await post('/orders',{coupon:'RIKA10',key,cartVersion:cart.version,clientTotal:1},a.cookie);
   assert.equal(response.status,201,JSON.stringify(response.body));
   order=response.body.order;
   assert.equal(order.subtotal,product.price);
   assert.equal(order.discount,Math.round(product.price*.1));
   assert.equal(order.shipping,149);
   assert.equal(order.total,product.price-Math.round(product.price*.1)+149);
   assert.match(order.payment,/Not charged/);
   assert.equal(order.address,null,'instant checkout must not require an address');
   assert.deepEqual((await call('/cart',{cookie:a.cookie})).body.items,[]);
   const again=await post('/orders',{coupon:'RIKA10',key,cartVersion:cart.version},a.cookie);
   assert.equal(again.status,201);assert.equal(again.body.order._id,order._id);
   assert.equal((await Order.countDocuments({userId:a.body.user.id})),1);
   assert.equal((await call('/orders',{cookie:b.cookie})).body.orders.length,0);
   assert.equal((await call(`/orders/${order.number}`,{cookie:b.cookie})).status,404);
   assert.equal((await call(`/orders/${order.number}`,{cookie:a.cookie})).status,200);
   // Older clients with a supplied address are still accepted and saved only on that account.
   assert.equal((await post('/cart/items',item,b.cookie)).status,200);
   const legacyCart=(await call('/cart',{cookie:b.cookie})).body;
   const legacy=await post('/orders',{address,key:crypto.randomUUID(),cartVersion:legacyCart.version},b.cookie);
   assert.equal(legacy.status,201,JSON.stringify(legacy.body));
   assert.equal(legacy.body.order.address.city,'Chennai');
   assert.equal((await call('/orders',{cookie:a.cookie})).body.orders.length,1);
   assert.equal((await post('/orders',{coupon:'',key:crypto.randomUUID(),cartVersion:cart.version},a.cookie)).status,400);
  });
  await t.test('concurrent first cart creation and repeated adds',async()=>{
   const c=await signup('c.test@example.com','third_user');
   const results=await Promise.all([post('/cart/items',item,c.cookie),post('/cart/items',item,c.cookie)]);
   assert.deepEqual(results.map(r=>r.status),[200,200]);
   const cart=(await call('/cart',{cookie:c.cookie})).body;
   assert.equal(cart.items.length,1);assert.equal(cart.items[0].quantity,2);
   assert.equal(cart.version,2);
  });
  await t.test('logout uses POST, clears the session cookie and invalidates the session',async()=>{
   const person=await signup('logout.test@example.com','logout_user');
   assert.equal((await call('/auth/me',{cookie:person.cookie})).status,200);
   const incorrectMethod=await call('/auth/logout',{cookie:person.cookie});
   assert.equal(incorrectMethod.status,404,'GET must not log a user out');
   const response=await call('/auth/logout',{method:'POST',cookie:person.cookie});
   assert.equal(response.status,200,JSON.stringify(response.body));
   assert.deepEqual(response.body,{ok:true});
   assert.equal((await call('/auth/me',{cookie:person.cookie})).status,401,'old session token must stop working');
   assert.equal(await Session.countDocuments({userId:person.body.user.id}),0);
  });
  await t.test('expired, single-use password reset; old sessions revoked',async()=>{
   assert.equal((await post('/auth/forgot-password',{email:'nobody@example.com'})).status,200);
   assert.equal((await post('/auth/forgot-password',{email:'a.test@example.com'})).status,200);
   async function latestToken(){const dir=path.join(mailDir,'.local/mail');const files=(await readdir(dir)).sort();const mail=JSON.parse(await readFile(path.join(dir,files.at(-1)),'utf8'));return mail.text.match(/token=([a-f0-9]{64})/)?.[1];}
   const expired=await latestToken();assert.ok(expired);
   await User.updateOne({email:'a.test@example.com'},{$set:{resetExpires:new Date(Date.now()-1000)}});
   assert.equal((await post('/auth/reset-password',{token:expired,password:'Another-long-password-123'})).status,400);
   // Delay to avoid filesystem timestamp ties when selecting latest development email.
   await new Promise(resolve=>setTimeout(resolve,15));
   await post('/auth/forgot-password',{email:'a.test@example.com'});
   const token=await latestToken();assert.ok(token);assert.notEqual(token,expired);
   assert.equal((await post('/auth/reset-password',{token,password:'Another-long-password-123'})).status,200);
   assert.equal((await post('/auth/reset-password',{token,password:'Another-long-password-123'})).status,400);
   assert.equal((await call('/auth/me',{cookie:a.cookie})).status,401);
   assert.equal((await post('/auth/signin',{email:'a.test@example.com',password})).status,401);
   assert.equal((await post('/auth/signin',{email:'a.test@example.com',password:'Another-long-password-123'})).status,200);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(mongoose.connection.readyState===1){await mongoose.connection.dropDatabase();await mongoose.disconnect();}
  process.chdir(initialDir);await rm(mailDir,{recursive:true,force:true});
 }
});
