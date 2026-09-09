let token = localStorage.getItem("chatogram_token") || "";
let me = null, partner = null, room = null, socket = null;

const $ = id => document.getElementById(id);
function toast(msg){
  const x=$("toast"); x.textContent=msg; x.style.display="block";
  clearTimeout(window._toast); window._toast=setTimeout(()=>x.style.display="none",2800);
}
function api(url, opts={}){
  opts.headers=Object.assign({"Content-Type":"application/json"},opts.headers||{});
  if(token) opts.headers.Authorization="Bearer "+token;
  return fetch(url,opts).then(async r=>{const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||"خطایی رخ داد"); return d;});
}
function show(page){
  ["authPage","homePage","chatPage"].forEach(x=>$(x).classList.add("hidden"));
  $(page).classList.remove("hidden");
}
function avatar(img, photo, fallback="👤"){
  if(photo){img.src=photo; img.style.objectFit="cover";}
  else {img.removeAttribute("src"); img.style.background="linear-gradient(135deg,#6b54f5,#282f4a)"; img.alt=fallback;}
}
function renderMe(){
  $("myName").textContent=me.name+"  @"+me.username;
  $("myMeta").textContent=(me.city||"")+" • "+(me.gender==="male"?"مرد":"زن");
  avatar($("myPhoto"),me.photo,"👤");
}
function connectSocket(){
  if(socket) socket.disconnect();
  socket=io();
  socket.on("connect",()=>socket.emit("login",{token}));
  socket.on("profile",u=>{me=u;renderMe();});
  socket.on("online_users",list=>{
    $("onlineCount").textContent=list.length;
    const box=$("onlineList"); box.innerHTML="";
    list.filter(u=>u.id!==me?.id).slice(0,30).forEach(u=>{
      const row=document.createElement("div"); row.className="onlineUser";
      const im=document.createElement("img"); im.className="avatar"; avatar(im,u.photo,"👤");
      const text=document.createElement("div"); text.innerHTML="<b>"+escapeHtml(u.name)+"</b><small>"+escapeHtml(u.city)+" • "+(u.gender==="male"?"مرد":"زن")+"</small>";
      row.append(im,text); box.append(row);
    });
    if(!box.children.length) box.innerHTML='<div class="onlineUser"><span>😴</span><div><b>هنوز کسی آنلاین نیست</b><small>کمی بعد دوباره امتحان کن</small></div></div>';
  });
  socket.on("searching",()=>{
    show("chatPage"); $("searching").classList.remove("hidden"); $("messages").innerHTML=""; $("messageForm").classList.add("hidden");
  });
  socket.on("matched",data=>{
    room=data.room; partner=data.partner;
    $("searching").classList.add("hidden"); $("messageForm").classList.remove("hidden");
    $("partnerName").textContent=partner.name;
    $("partnerMeta").textContent=partner.city+" • "+(partner.gender==="male"?"مرد":"زن");
    avatar($("partnerPhoto"),partner.photo,"👤");
    $("messages").innerHTML='<div class="msg">👋 گفت‌وگو شروع شد! سلام کن.</div>';
  });
  socket.on("message",m=>{
    const div=document.createElement("div"); div.className="msg";
    div.innerHTML=escapeHtml(m.text)+'<time>'+escapeHtml(m.time)+'</time>';
    $("messages").append(div); $("messages").scrollTop=$("messages").scrollHeight;
  });
  socket.on("left_chat",()=>show("homePage"));
  socket.on("reported",toast);
  socket.on("auth_error",m=>{localStorage.removeItem("chatogram_token");token="";show("authPage");toast(m);});
  socket.on("error_msg",toast);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active")); b.classList.add("active");
  $("loginForm").classList.toggle("hidden",b.dataset.tab!=="login");
  $("registerForm").classList.toggle("hidden",b.dataset.tab!=="register");
});
$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("loginUsername").value,password:$("loginPassword").value})}); token=d.token; localStorage.setItem("chatogram_token",token); me=d.user; renderMe(); show("homePage"); connectSocket();}
  catch(err){toast(err.message);}
};
$("registerForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const d=await api("/api/register",{method:"POST",body:JSON.stringify({username:$("regUsername").value,password:$("regPassword").value,name:$("regName").value,gender:$("regGender").value,city:$("regCity").value,photo:""})});
    token=d.token; localStorage.setItem("chatogram_token",token); me=d.user; renderMe(); show("homePage"); connectSocket();
  }catch(err){toast(err.message);}
};
document.querySelectorAll(".findBtn").forEach(b=>b.onclick=()=>{
  if(!socket){toast("ابتدا وارد حساب شوید.");return}
  show("chatPage"); $("searching").classList.remove("hidden"); $("messageForm").classList.add("hidden"); $("messages").innerHTML="";
  socket.emit("find",{lookingFor:b.dataset.gender});
});
$("nextBtn").onclick=()=>{if(socket)socket.emit("next");};
$("messageForm").onsubmit=e=>{e.preventDefault();const t=$("messageInput").value.trim();if(t&&room){const div=document.createElement("div");div.className="msg me";div.innerHTML=escapeHtml(t);$("messages").append(div);$("messages").scrollTop=$("messages").scrollHeight;socket.emit("message",{room,text:t});$("messageInput").value="";}};
$("logoutBtn").onclick=async()=>{try{await api("/api/logout",{method:"POST"});}catch(_){} localStorage.removeItem("chatogram_token");token="";if(socket)socket.disconnect();show("authPage");};
$("profileBtn").onclick=()=>{ $("editName").value=me.name;$("editGender").value=me.gender;$("editCity").value=me.city;avatar($("editPhoto"),me.photo,"👤");$("profileModal").classList.remove("hidden");};
$("closeModal").onclick=()=> $("profileModal").classList.add("hidden");
$("photoInput").onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>2*1024*1024){toast("حجم عکس باید کمتر از ۲ مگابایت باشد.");return}const r=new FileReader();r.onload=()=>{$("editPhoto").src=r.result;$("editPhoto").dataset.photo=r.result};r.readAsDataURL(f);};
$("saveProfile").onclick=async()=>{
  try{const photo=$("editPhoto").dataset.photo ?? me.photo ?? "";const d=await api("/api/profile",{method:"PUT",body:JSON.stringify({name:$("editName").value,gender:$("editGender").value,city:$("editCity").value,photo})});me=d.user;renderMe();$("profileModal").classList.add("hidden");toast("پروفایل ذخیره شد.");}
  catch(err){toast(err.message);}
};
$("reportBtn").onclick=()=>{$("reportReason").value="";$("reportModal").classList.remove("hidden");};
$("closeReport").onclick=()=>$("reportModal").classList.add("hidden");
$("sendReport").onclick=async()=>{try{await api("/api/report",{method:"POST",body:JSON.stringify({reportedId:partner?.id,reason:$("reportReason").value})});$("reportModal").classList.add("hidden");toast("گزارش ثبت شد.");}catch(err){toast(err.message)}};

(async()=>{
  if(!token){show("authPage");return}
  try{const d=await api("/api/me");me=d.user;renderMe();show("homePage");connectSocket();}
  catch(_){localStorage.removeItem("chatogram_token");token="";show("authPage");}
})();
