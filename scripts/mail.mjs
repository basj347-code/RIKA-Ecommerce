import fs from 'node:fs/promises';
const files=await fs.readdir('.local/mail').catch(()=>[]);
if(!files.length)console.log('No local emails yet. Request a password reset first.');
else {const latest=files.sort().at(-1);console.log(await fs.readFile(`.local/mail/${latest}`,'utf8'));}
