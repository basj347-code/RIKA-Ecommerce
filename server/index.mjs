import 'dotenv/config';
import mongoose from 'mongoose';
import {app} from './app.mjs';
import {User,Session,Cart,Wishlist,Order,Subscriber} from './models.mjs';
if(process.env.NODE_ENV==='production'&&(!process.env.MONGODB_URI||!process.env.APP_ORIGIN?.startsWith('https://')||!process.env.SMTP_HOST))throw new Error('Production requires MONGODB_URI, HTTPS APP_ORIGIN and SMTP_HOST.');
await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27018/rika?replicaSet=rikaLocal',{serverSelectionTimeoutMS:10000});
await Promise.all([User,Session,Cart,Wishlist,Order,Subscriber].map(m=>m.init()));
const server=app.listen(Number(process.env.PORT||4000),process.env.HOST||'127.0.0.1',()=>console.log(`RIKA API: http://localhost:${process.env.PORT||4000}`));
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>server.close(async()=>{await mongoose.disconnect();process.exit(0);}));
