import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import {z} from 'zod';
import {User,Session,Cart,Wishlist,Order,Subscriber} from './models.mjs';
import {products} from './catalog.mjs';
import {createOriginPolicy} from './origins.mjs';

export const app=express();
const production=process.env.NODE_ENV==='production';
const originPolicy=createOriginPolicy({appOrigin:process.env.APP_ORIGIN||'http://localhost:5173',production,additionalOrigins:process.env.APP_ALLOWED_ORIGINS||''});
const origin=originPolicy.canonical;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const cookie={httpOnly:true,sameSite:'lax',secure:production,path:'/',maxAge:7*864e5};
const email=z.string().trim().toLowerCase().email().max(254);
const password=z.string().min(10,'Use at least 10 characters').max(72,'Use at most 72 characters').refine(v=>Buffer.byteLength(v)<=72,'Password must be at most 72 bytes');
const username=z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/,'Use 3–24 letters, numbers or underscores');
const address=z.object({name:z.string().trim().min(2).max(80),line1:z.string().trim().min(5).max(160),line2:z.string().trim().max(160).default(''),city:z.string().trim().min(2).max(80),state:z.string().trim().min(2).max(80),pincode:z.string().regex(/^[1-9][0-9]{5}$/,'Enter a valid 6-digit PIN code'),phone:z.string().regex(/^[6-9][0-9]{9}$/,'Enter a valid 10-digit mobile number')});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const publicUser=u=>({id:String(u._id),name:u.name,email:u.email,username:u.username||'',phone:u.phone,website:u.website,company:u.company,address:u.address||null});
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],fontSrc:["'self'"],connectSrc:["'self'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
app.use(express.json({limit:'30kb'}),cookieParser());
app.use('/api',(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const requestOrigin=req.get('Origin');
  if(!originPolicy.permits(requestOrigin)){
   if(!production) console.warn(`Rejected API request origin: ${requestOrigin||'(none)'}. Allowed: ${[...originPolicy.allowed].join(', ')}`);
   return res.status(403).json({error:production?'This request is not allowed.':'This browser address is not allowed. Open http://localhost:5173, then try again.'});
  }
  if(req.get('X-Rika-Request')!=='1')return res.status(403).json({error:'Missing request verification. Refresh the RIKA page and try again.'});
 }
 next();
});
const authLimit=rateLimit({windowMs:15*60e3,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many attempts. Please try again in 15 minutes.'}});
const resetLimit=rateLimit({windowMs:15*60e3,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Please wait a little before requesting another reset.'}});
app.use('/api',rateLimit({windowMs:60e3,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Please slow down and try again.'}}));
async function auth(req,res,next){const raw=req.cookies.rika_session;if(!raw)throw fail(401,'Please sign in to continue.');const session=await Session.findOne({hash:sha(raw),expires:{$gt:new Date()}});if(!session)throw fail(401,'Your session has expired. Please sign in again.');const user=await User.findById(session.userId);if(!user)throw fail(401,'Please sign in again.');req.user=user;req.session=session;next();}
async function login(res,user){const raw=crypto.randomBytes(32).toString('hex');await Session.create({hash:sha(raw),userId:user._id,expires:new Date(Date.now()+7*864e5)});res.cookie('rika_session',raw,cookie);}
const findProduct=id=>products.find(p=>p.id===id);
function checkLine(item){const p=findProduct(item.productId);if(!p||!p.sizes.includes(item.size)||!p.colors.some(c=>c.name===item.color))throw fail(400,'Please select an available size and colour.');if(item.quantity>Math.min(10,p.stock))throw fail(400,'You can add up to 10 of each item.');return p;}
const itemSchema=z.object({productId:z.string(),size:z.string(),color:z.string(),quantity:z.number().int().min(1).max(10)});
const lineKey=i=>`${i.productId}:${i.size}:${i.color}`;
const hydrate=cart=>({items:(cart?.items||[]).map(i=>({...i.toObject?.()||i,product:findProduct(i.productId)})),version:cart?.version||0});
app.get('/api/health',(req,res)=>res.json({ok:mongoose.connection.readyState===1,database:'MongoDB'}));
app.get('/api/products',(req,res)=>res.json({products}));
app.get('/api/auth/me',async(req,res,next)=>{if(!req.cookies.rika_session)return res.json({user:null});await auth(req,res,()=>res.json({user:publicUser(req.user)}));});
app.post('/api/auth/signup',authLimit,async(req,res)=>{const d=z.object({name:z.string().trim().min(2).max(80),username,email,password}).parse(req.body);const hash=await bcrypt.hash(d.password,12);const user=await User.create({...d,password:undefined,passwordHash:hash});await login(res,user);res.status(201).json({user:publicUser(user)});});
const dummyHash=bcrypt.hashSync('not-a-real-user-password',12);
app.post('/api/auth/signin',authLimit,async(req,res)=>{const d=z.object({email,password:z.string().max(200)}).parse(req.body);const u=await User.findOne({email:d.email}).select('+passwordHash');const valid=await bcrypt.compare(d.password,u?.passwordHash||dummyHash);if(!u||!valid)throw fail(401,'Email or password is incorrect.');if(req.cookies.rika_session)await Session.deleteOne({hash:sha(req.cookies.rika_session)});await login(res,u);res.json({user:publicUser(u)});});
app.post('/api/auth/logout',async(req,res)=>{if(req.cookies.rika_session)await Session.deleteOne({hash:sha(req.cookies.rika_session)});res.clearCookie('rika_session',cookie).json({ok:true});});
app.post('/api/auth/forgot-password',resetLimit,async(req,res)=>{const d=z.object({email}).parse(req.body);const u=await User.findOne({email:d.email});if(u){const token=crypto.randomBytes(32).toString('hex');u.resetHash=sha(token);u.resetExpires=new Date(Date.now()+30*60e3);await u.save();const url=`${origin}/reset-password?token=${token}`;
 const localHint=!production?'\n\nFor local development, open this link on the same computer running npm run dev (not on your phone).':'';
 const mail={
  from:process.env.MAIL_FROM||'RIKA <hello@rika.local>',to:u.email,
  subject:'Your RIKA password reset',
  text:`Reset your RIKA password using this link within 30 minutes:\n\n${url}\n\nIf you didn't request this, you can ignore this email.${localHint}`,
  html:`<div style="font-family:Arial,sans-serif;color:#252923;max-width:560px;margin:auto;padding:24px"><h1 style="font-size:30px;letter-spacing:.12em">RIKA</h1><h2>Reset your password</h2><p>This link is valid for 30 minutes and can be used only once.</p><p><a href="${url}" style="background:#46543b;color:white;padding:14px 22px;display:inline-block;text-decoration:none">Reset password</a></p><p>If the button does not open, copy the full address into the browser:</p><p style="overflow-wrap:anywhere"><a href="${url}">${url}</a></p>${!production?'<p style="font-size:13px;color:#646b60">Local development: open this link on the same computer running the RIKA website, not on a phone.</p>':''}<p>If you did not request a reset, ignore this email.</p></div>`
 };let mailFailure=false;
 if(process.env.SMTP_HOST){
  const smtpHost=process.env.SMTP_HOST.trim();
  // Google displays app passwords in four groups; the actual SMTP password has no spaces.
  const smtpPassword=smtpHost.toLowerCase()==='smtp.gmail.com'?(process.env.SMTP_PASS||'').replace(/\s+/g,''):process.env.SMTP_PASS;
  try{
   await nodemailer.createTransport({host:smtpHost,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:smtpPassword}:undefined}).sendMail(mail);
  }catch(e){
   mailFailure=true;
   console.error('Password reset email delivery failed:',e.code||'SMTP error',e.responseCode||'');
  }
 }
 if(!production&&(!process.env.SMTP_HOST||mailFailure)){
  await fs.mkdir('.local/mail',{recursive:true});
  await fs.writeFile(path.join('.local/mail',`${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`),JSON.stringify(mail,null,2));
 }
 if(!production&&mailFailure)return res.status(502).json({error:'Gmail could not send the reset email. Check SMTP settings in .env, or run npm run mail to get the locally saved reset link.'});}res.json({message:'If an account exists for this email, a reset link is on its way.'});});
app.post('/api/auth/reset-password',resetLimit,async(req,res)=>{const d=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password}).parse(req.body);const passwordHash=await bcrypt.hash(d.password,12);let changed=false;await mongoose.connection.transaction(async session=>{const u=await User.findOneAndUpdate({resetHash:sha(d.token),resetExpires:{$gt:new Date()}},{$set:{passwordHash},$unset:{resetHash:1,resetExpires:1}},{session,new:true});if(!u)throw fail(400,'This reset link has expired or has already been used.');await Session.deleteMany({userId:u._id}).session(session);changed=true;});res.clearCookie('rika_session',cookie).json({ok:changed});});
app.patch('/api/account',auth,async(req,res)=>{const d=z.object({name:z.string().trim().min(2).max(80),username,phone:z.string().max(20),website:z.union([z.literal(''),z.url().refine(v=>/^https?:\/\//.test(v),'Use an http or https website')]),company:z.string().trim().max(120),address:address.nullable().optional()}).parse(req.body);Object.assign(req.user,d);await req.user.save();res.json({user:publicUser(req.user)});});
app.get('/api/cart',auth,async(req,res)=>res.json(hydrate(await Cart.findOne({userId:req.user._id}))));
app.post('/api/cart/items',auth,async(req,res)=>{const d=itemSchema.parse(req.body);checkLine(d);
 
 try{await Cart.updateOne({userId:req.user._id},{$setOnInsert:{userId:req.user._id,items:[],version:0}},{upsert:true});}
 catch(e){if(e.code!==11000)throw e;}
 let result;
 await mongoose.connection.transaction(async session=>{
  const c=await Cart.findOne({userId:req.user._id}).session(session);
  const existing=c.items.find(i=>lineKey(i)===lineKey(d));
  if(existing){const quantity=existing.quantity+d.quantity;checkLine({...d,quantity});existing.quantity=quantity;}
  else c.items.push({...d});
  c.version+=1;await c.save({session});result=hydrate(c);
 });
 res.json(result);
});
app.put('/api/cart',auth,async(req,res)=>{const d=z.object({items:z.array(itemSchema).max(60),version:z.number().int().nonnegative()}).parse(req.body);d.items.forEach(checkLine);if(new Set(d.items.map(lineKey)).size!==d.items.length)throw fail(400,'Duplicate cart items.');const c=await Cart.findOneAndUpdate({userId:req.user._id,version:d.version},{$set:{items:d.items},$inc:{version:1}},{new:true});if(!c)throw fail(409,'Your bag changed in another window. Please try again.');res.json(hydrate(c));});
app.get('/api/wishlist',auth,async(req,res)=>res.json({ids:(await Wishlist.findOne({userId:req.user._id}))?.productIds||[]}));
app.post('/api/wishlist/:id',auth,async(req,res)=>{if(!findProduct(req.params.id))throw fail(404,'Item not found.');const d=z.object({saved:z.boolean()}).parse(req.body);const filter={userId:req.user._id},update=d.saved?{$addToSet:{productIds:req.params.id}}:{$pull:{productIds:req.params.id}};
 let w;try{w=await Wishlist.findOneAndUpdate(filter,update,{upsert:true,new:true});}
 catch(e){if(e.code!==11000)throw e;w=await Wishlist.findOneAndUpdate(filter,update,{new:true});}
 res.json({ids:w.productIds});});
app.post('/api/orders',auth,async(req,res)=>{const d=z.object({address:address.optional(),coupon:z.string().max(20).default(''),key:z.string().uuid(),cartVersion:z.number().int().nonnegative()}).parse(req.body);let order;try{await mongoose.connection.transaction(async session=>{order=await Order.findOne({userId:req.user._id,key:d.key}).session(session);if(order)return;const cart=await Cart.findOne({userId:req.user._id}).session(session);if(!cart?.items.length)throw fail(400,'Your bag is empty.');if(cart.version!==d.cartVersion)throw fail(409,'Your bag changed. Review it before placing your order.');const items=cart.items.map(i=>{const p=checkLine(i);return{productId:p.id,name:p.name,image:p.image,size:i.size,color:i.color,quantity:i.quantity,price:p.price};});const subtotal=items.reduce((sum,i)=>sum+i.price*i.quantity,0);const coupon=d.coupon.trim().toUpperCase();if(coupon&&coupon!=='RIKA10')throw fail(400,'This promo code is not valid.');const discount=coupon==='RIKA10'?Math.round(subtotal*.1):0;const shipping=subtotal>=3990?0:149;[order]=await Order.create([{userId:req.user._id,key:d.key,number:`RK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,items,subtotal,discount,shipping,total:subtotal-discount+shipping,coupon,address:d.address||null}],{session});cart.items=[];cart.version+=1;await cart.save({session});if(d.address)await User.updateOne({_id:req.user._id},{$set:{address:d.address,phone:d.address.phone}},{session});});}catch(e){if(e.code===11000)order=await Order.findOne({userId:req.user._id,key:d.key});if(!order)throw e;}res.status(201).json({order});});
app.get('/api/orders',auth,async(req,res)=>res.json({orders:await Order.find({userId:req.user._id}).sort({createdAt:-1}).limit(100)}));
app.get('/api/orders/:id',auth,async(req,res)=>{const order=await Order.findOne({number:req.params.id,userId:req.user._id});if(!order)throw fail(404,'Order not found.');res.json({order});});
app.post('/api/newsletter',resetLimit,async(req,res)=>{const d=z.object({email}).parse(req.body);await Subscriber.updateOne({email:d.email},{$setOnInsert:{email:d.email}},{upsert:true});res.json({message:'You’re on the list. Welcome to the RIKA circle.'});});
app.use('/api',(req,res)=>res.status(404).json({error:'Not found.'}));
app.use(express.static(path.resolve('frontend-react/dist')));
app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('frontend-react/dist/index.html')));
app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:err.issues[0]?.message||'Please check your details.'});if(err.code===11000)return res.status(409).json({error:`That ${err.keyPattern?.username?'username':'email'} is already in use.`});if(err.name==='VersionError')return res.status(409).json({error:'Your bag changed. Please try again.'});if(!err.status)console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Something went wrong. Please try again.'});});
