const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('#nav');
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);menu.textContent=open?'CLOSE −':'MENU +';});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='MENU +';}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){menu.click();menu.focus();}});
const video=document.querySelector('#hero-video'),motion=document.querySelector('#motion');
function updateVideo(){motion.textContent=video.paused?'PLAY ▷':'PAUSE Ⅱ';motion.setAttribute('aria-label',video.paused?'Play background video':'Pause background video');}
if(matchMedia('(prefers-reduced-motion: reduce)').matches)video.pause();
video.addEventListener('play',updateVideo);video.addEventListener('pause',updateVideo);updateVideo();
motion.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>updateVideo());else video.pause();});
const progress=document.querySelector('#progress');addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.textContent=String(Math.round(max?scrollY/max*100:0)).padStart(3,'0');},{passive:true});
addEventListener('pointermove',e=>{document.querySelector('#mx').textContent=String(Math.round(e.clientX)).padStart(4,'0');document.querySelector('#my').textContent=String(Math.round(e.clientY)).padStart(4,'0');},{passive:true});
const lightbox=document.querySelector('#lightbox');document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{lightbox.querySelector('img').src=button.dataset.image;lightbox.querySelector('img').alt=button.querySelector('img').alt;lightbox.querySelector('p').textContent=button.dataset.caption;lightbox.showModal();}));
lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close();});
document.querySelector('#year').textContent=new Date().getFullYear();
