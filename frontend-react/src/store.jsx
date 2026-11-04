import {createContext,useContext,useEffect,useRef,useState} from 'react'
import {Check,X} from 'lucide-react'

export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
export const keyOf=i=>`${i.productId}:${i.size}:${i.color}`
export async function api(url,body,method){
 const r=await fetch(`/api${url}`,{credentials:'same-origin',headers:{'Content-Type':'application/json','X-Rika-Request':'1'},method:method||(body?'POST':'GET'),body:body?JSON.stringify(body):undefined})
 const d=await r.json().catch(()=>({error:'The store is temporarily unavailable.'}))
 if(!r.ok)throw Object.assign(new Error(d.error||'Something went wrong.'),{status:r.status})
 return d
}
const Store=createContext(null)
export const useStore=()=>useContext(Store)

export function Provider({children}){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false)
 const [products,setProducts]=useState([]),[catalogError,setCatalogError]=useState('')
 const [cart,setCart]=useState({items:[],version:0}),[wishlist,setWishlist]=useState([])
 const [personalOwner,setPersonalOwner]=useState(null),[personalError,setPersonalError]=useState(''),[personalAttempt,setPersonalAttempt]=useState(0)
 const [toast,setToast]=useState(''),[drawer,setDrawer]=useState(false),[quick,setQuick]=useState(null)
 const scope=useRef(0),timer=useRef(null)
 const personalReady=!user||personalOwner===user.id
 function notify(message){setToast(message);clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(''),4500)}
 function authFailure(error,ticket){if(error.status===401&&scope.current===ticket){setUser(null);notify('Your session expired. Please sign in again.');return true}return false}
 async function loadProducts(){setCatalogError('');try{const d=await api('/products');setProducts(d.products)}catch(e){setCatalogError(e.message)}}
 useEffect(()=>{loadProducts();api('/auth/me').then(d=>setUser(d.user)).catch(()=>setUser(null)).finally(()=>setReady(true));return()=>clearTimeout(timer.current)},[])
 useEffect(()=>{
  const ticket=++scope.current
  setCart({items:[],version:0});setWishlist([]);setPersonalOwner(null);setPersonalError('');setDrawer(false)
  if(user)Promise.all([api('/cart'),api('/wishlist')]).then(([c,w])=>{
   if(scope.current!==ticket)return
   setCart(current=>c.version>=current.version?c:current);setWishlist(w.ids);setPersonalOwner(user.id)
  }).catch(e=>{if(scope.current!==ticket)return;if(!authFailure(e,ticket))setPersonalError(e.message)})
  return()=>{scope.current++}
 },[user?.id,personalAttempt])
 function retryPersonal(){setPersonalAttempt(n=>n+1)}
 function handleAuthError(error){return authFailure(error,scope.current)}
 async function refreshCart(){const ticket=scope.current;try{const c=await api('/cart');if(ticket===scope.current)setCart(current=>c.version>=current.version?c:current)}catch(e){authFailure(e,ticket);throw e}}
 async function add(item){const ticket=scope.current;try{const c=await api('/cart/items',item);if(ticket===scope.current){setCart(current=>c.version>=current.version?c:current);setQuick(null);setDrawer(true);notify('A good choice. Added to your bag.')}}catch(e){authFailure(e,ticket);throw e}}
 async function updateCart(items){const ticket=scope.current;try{
  const c=await api('/cart',{items:items.map(i=>({productId:i.productId,size:i.size,color:i.color,quantity:i.quantity})),version:cart.version},'PUT')
  if(ticket===scope.current)setCart(current=>c.version>=current.version?c:current)
 }catch(e){if(ticket===scope.current){if(!authFailure(e,ticket)){try{await refreshCart()}catch{}notify(e.message)}}}}
 async function save(id){if(!user){notify('Sign in to keep your favourites in one place.');return}const ticket=scope.current;try{const d=await api(`/wishlist/${id}`,{saved:!wishlist.includes(id)});if(ticket===scope.current)setWishlist(d.ids)}catch(e){if(!authFailure(e,ticket))notify(e.message)}}
 async function logout(){await api('/auth/logout',undefined,'POST');scope.current++;setUser(null);setCart({items:[],version:0});setWishlist([]);notify('You’re signed out. See you soon.')}
 return <Store.Provider value={{user,setUser,ready,personalReady,personalError,retryPersonal,handleAuthError,products,catalogError,loadProducts,cart,refreshCart,wishlist,notify,drawer,setDrawer,quick,setQuick,add,updateCart,save,logout}}>{children}{toast&&<div className="toast" role="status"><Check size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}</Store.Provider>
}
