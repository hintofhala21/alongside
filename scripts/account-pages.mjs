// Account mode is activated by adding the public Firebase web-app settings to config.json.
export function validateAccounts(config) {
  if(config === undefined) return;
  const allowed=['apiKey','appId','projectId','authDomain'];
  if(!config || typeof config!=='object' || Object.keys(config).some(k=>!allowed.includes(k)) ||
     !/^AIza[\w-]{35}$/.test(config.apiKey) || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) ||
     config.authDomain!==config.projectId+'.firebaseapp.com' || !/^1:\d+:web:[\da-f]+$/i.test(config.appId))
    throw Error('Use the four public Firebase web app settings from the owner’s Spark project.');
}

export function accountPage(html, firebase) {
  validateAccounts(firebase);
  if(!firebase)return html;
  return html.replace('<html lang="en">','<html lang="en" class="accounts-locked">')
    .replace("script-src 'self'", "script-src 'self' https://www.gstatic.com/firebasejs/13.4.0/ https://apis.google.com")
    .replace("connect-src 'self'", "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://"+firebase.authDomain)
    .replace("frame-src 'none'", "frame-src https://"+firebase.authDomain)
    .replace(/<script src="\.\/assets\/(kids-chat|chat|app|history)\.js" defer><\/script>/g,'')
    .replace('</body>','<script src="./assets/accounts.js" defer></script>\n</body>')
    .replace('<body>', '<body><main id="account-screen" class="account-screen"><div class="panel stack account-card"><span class="brand-text">Alongside</span><h1>Sign in to Alongside</h1><p role="status">Loading…</p><noscript>Enable JavaScript to sign in.</noscript></div></main>')
    .replace('This version stores your profile in this browser. It has no account sign-in service.','Your sign-in stays active when you restart your profile.');
}
