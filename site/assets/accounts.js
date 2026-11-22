"use strict";
(async () => {
  const screen=document.getElementById('account-screen');
  const card=screen.querySelector('.account-card');
  const isHistory=location.pathname.endsWith('/history.html');
  const params=new URLSearchParams(location.search);
  const resumeKey='alongside-account-tab';
  const locale=globalThis.AlongsideLocale;
  const preference='alongside-interface-language';
  let lang=locale.baseLanguage(localStorage.getItem(preference)||navigator.language);
  const tr=s=>locale.translate(s,lang);
  let sdk,auth,config,started=false;
  function item(tag,text='',cls=''){
    const el=document.createElement(tag);if(text)el.textContent=tr(text);if(cls)el.className=cls;return el;
  }
  function button(label,fn,secondary=false){
    const b=item('button',label,secondary?'action outline':'action');b.type='button';
    b.onclick=()=>{Promise.resolve().then(fn).catch(showError);};return b;
  }
  function heading(text){
    document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    card.replaceChildren(item('span','Alongside','brand-text'),item('h1',text));
  }
  function notice(text){
    let p=card.querySelector('[role=status]');if(!p){p=item('p','','status');p.setAttribute('role','status');card.append(p);}
    p.textContent=tr(text);
  }
  function showError(e){
    const messages={'auth/popup-closed-by-user':'Sign-in cancelled.','auth/weak-password':'Use a longer password.','auth/popup-blocked':'Allow the Google sign-in window and try again.'};
    notice(messages[e?.code] || 'Sign-in could not finish. Check your details or try again.');
  }
  function script(name){
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./assets/'+name+'.js';s.onload=resolve;s.onerror=reject;document.body.append(s);});
  }
  async function loadApp(account){
    if(started)return;started=true;
    globalThis.AlongsideAccount=account;
    if(isHistory && !account.publicOnly && !account.storage.getItem(account.key('stillday-profile-v2'))){location.replace('./#profile');return;}
    await script('chat');await script(isHistory?'history':'app');
    screen.hidden=true;document.documentElement.classList.remove('accounts-locked');
  }
  async function enter(user,kidId){
    const kids=!user;
    const uid=kids?kidId:user.uid;
    if(!uid || (user && !user.emailVerified))throw Error('Account verification required');
    sessionStorage.setItem(resumeKey,kids?'kids:'+uid:'adult');
    const key=name=>'alongside-account:'+encodeURIComponent(uid)+':'+name;
    const signOut=async()=>{
      if(auth?.currentUser)await sdk.signOut(auth);
      sessionStorage.removeItem(resumeKey);
      for(const name of ['alongside-demo-session-v1','alongside-use-library'])sessionStorage.removeItem(key(name));
      if(kids){sessionStorage.removeItem(key('stillday-profile-v2'));sessionStorage.removeItem(key('alongside-chat-history-v1'));}
      location.replace('./');
    };
    await loadApp({kids,key,storage:kids?sessionStorage:localStorage,signOut,token:user?()=>user.getIdToken():null});
  }
  function home(){
    heading('Sign in to Alongside');
    const label=item('label','Language','field'),select=item('select');
    for(const [code,name] of Object.entries(locale.names))select.add(new Option(name,code));select.value=lang;
    select.onchange=()=>{lang=select.value;localStorage.setItem(preference,lang);home();};label.append(select);
    card.append(label,button('Continue as an adult',async()=>{
      heading('Sign in to Alongside');notice('Loading…');try{await connect();providers();}catch(e){home();showError(e);}
    }),button('Under 18 · continue on this device',()=>enter(null,crypto.randomUUID()),true));
    const privacy=item('a','Privacy and pilot limits');privacy.href='./privacy.html';card.append(privacy);
  }
  async function connect(){
    if(auth)return;
    config ||= await fetch('./config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();});
    const base='https://www.gstatic.com/firebasejs/13.4.0/';
    const [apps,authModule]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js')]);
    sdk=authModule;const app=apps.getApps().length?apps.getApp():apps.initializeApp(config.firebase);
    const instance=sdk.initializeAuth(app,{persistence:sdk.browserSessionPersistence,popupRedirectResolver:sdk.browserPopupRedirectResolver});
    await instance.authStateReady();instance.languageCode=lang;auth=instance;
  }
  function verify(user){
    heading('Check your email');card.append(item('p','Open the verification link, then return here.'));
    card.append(button('I verified my email',async()=>{await user.reload();if(!user.emailVerified)return notice('Open the verification link, then return here.');await user.getIdToken(true);await enter(user);}),
      button('Resend verification email',async()=>{await sdk.sendEmailVerification(user);notice('Check your email');},true),
      button('Back',async()=>{await sdk.signOut(auth);sessionStorage.removeItem(resumeKey);providers();},true));
  }
  function providers(){
    heading('Sign in to Alongside');
    card.append(button('Continue with Google',async()=>{
      const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
      const {user}=await sdk.signInWithPopup(auth,provider);if(user.emailVerified)await enter(user);else verify(user);
    }),button('Sign in with email',()=>emailForm('login'),true),button('Create an email account',()=>emailForm('create'),true),button('Back',home,true));
  }
  function emailForm(mode){
    const create=mode==='create',reset=mode==='reset';
    const title=reset?'Reset password':create?'Create an email account':'Sign in with email';
    heading(title);
    const form=item('form','','stack');const field=(name,type,complete)=>{
      const label=item('label',name,'field'),input=item('input');input.type=type;input.autocomplete=complete;input.required=true;label.append(input);form.append(label);return input;
    };
    const email=field('Email','email','email');
    const password=reset?null:field('Password','password',create?'new-password':'current-password');
    if(create)password.minLength=8;
    const submit=item('button',title,'action');submit.type='submit';form.append(submit);
    form.onsubmit=async e=>{
      e.preventDefault();if(submit.disabled)return;submit.disabled=true;
      try {
        if(reset){await sdk.sendPasswordResetEmail(auth,email.value.trim());notice('Check your email');return;}
        const perform=create?sdk.createUserWithEmailAndPassword:sdk.signInWithEmailAndPassword;
        const {user}=await perform(auth,email.value.trim(),password.value);password.value='';
        sessionStorage.setItem(resumeKey,'adult');
        if(user.emailVerified){await enter(user);return;}
        verify(user);if(create)await sdk.sendEmailVerification(user);
      } catch(error){showError(error);}finally{submit.disabled=false;}
    };
    card.append(form);if(!reset&&!create)card.append(button('Reset password',()=>emailForm('reset'),true));card.append(button('Back',providers,true));email.focus();
  }
  if(isHistory && (params.get('view')==='showcase'||params.has('demo'))){
    await loadApp({publicOnly:true,key:name=>'alongside-public:'+name});return;
  }
  try{
    const previous=sessionStorage.getItem(resumeKey);
    if(previous?.startsWith('kids:'))await enter(null,previous.slice(5));
    else if(previous==='adult'){
      await connect();const user=auth.currentUser;
      if(user?.emailVerified)await enter(user);else if(user)verify(user);else home();
    }else home();
  }catch(error){home();showError(error);}
})();
