import fs from 'node:fs/promises';
const assets={hero:'photo-1483985988355-763728e1935b',shirt:'photo-1598554747436-c9293d6a588f',bag:'photo-1548036328-c9fa89d128fa',men:'photo-1596755094514-f87e34085b2c',sneaker:'photo-1549298916-b41d501d3772',knit:'photo-1434389677669-e08b4cac3105',dress:'photo-1595777457583-95e059d581b8',glasses:'photo-1511499767150-a48a237f0083',tee:'photo-1521572163474-6864f9cf17ab',trouser:'photo-1473966968600-fa801b869a1a',watch:'photo-1524805444758-089113d48a6d',jacket:'photo-1539109136881-3be0616acf4b',shoe:'photo-1525966222134-fcfa99b8ae77',editorial:'photo-1485230895905-ec40ba36b9bc',women:'photo-1539109136881-3be0616acf4b'};
await fs.mkdir('frontend-react/public/images',{recursive:true});
await Promise.all(Object.entries(assets).map(async([name,id])=>{const url=`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${name==='hero'?1800:900}&q=85`;const res=await fetch(url);if(!res.ok)throw new Error(`${name}: ${res.status}`);await fs.writeFile(`frontend-react/public/images/${name}.jpg`,Buffer.from(await res.arrayBuffer()));console.log(name);}));
// Direct image endpoints are recorded, not fabricated Unsplash photo page URLs.
const credits=Object.fromEntries(Object.entries(assets).map(([name,id])=>[name,{source:`https://images.unsplash.com/${id}`,license:'Unsplash License; check image page for attribution'}]));
credits.jacket={...credits.women,note:'Uses the same available outerwear photograph as women.jpg; illustrative sample photography.'};
await fs.writeFile('frontend-react/public/images/sources.json',JSON.stringify(credits,null,2)+'\n');
