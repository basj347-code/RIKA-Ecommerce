import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the real logout function from the React store without requiring
// a browser, React, or a running MongoDB server.
test('frontend sign out calls POST and clears account state after success',async()=>{
 const source=await readFile(new URL('../frontend-react/src/store.jsx',import.meta.url),'utf8');
 const line=source.split('\n').find(x=>x.startsWith(' async function logout()'));
 assert.ok(line,'expected logout implementation');
 const calls=[];
 const scope={current:0};
 let user='signed-in',cart='old cart',wishlist=['saved item'],toast='';
 const logout=new Function('api','scope','setUser','setCart','setWishlist','notify',`${line}\nreturn logout;`)(
  async (...args)=>{calls.push(args);return {ok:true}},
  scope,
  value=>{user=value},
  value=>{cart=value},
  value=>{wishlist=value},
  message=>{toast=message}
 );
 await logout();
 assert.deepEqual(calls,[['/auth/logout',undefined,'POST']]);
 assert.equal(scope.current,1);
 assert.equal(user,null);
 assert.deepEqual(cart,{items:[],version:0});
 assert.deepEqual(wishlist,[]);
 assert.match(toast,/signed out/i);
});

test('failed sign out does not falsely tell the user they are signed out',async()=>{
 const source=await readFile(new URL('../frontend-react/src/store.jsx',import.meta.url),'utf8');
 const line=source.split('\n').find(x=>x.startsWith(' async function logout()'));
 let updated=false;
 const logout=new Function('api','scope','setUser','setCart','setWishlist','notify',`${line}\nreturn logout;`)(
  async ()=>{throw Error('Server unavailable')},
  {current:0},
  ()=>{updated=true},()=>{updated=true},()=>{updated=true},()=>{updated=true}
 );
 await assert.rejects(logout(),/Server unavailable/);
 assert.equal(updated,false);
});
