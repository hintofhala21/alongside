// Firebase verifies the ID token. No sign-in details are sent to the language model.
export async function accountAllowed(request,config,requestFetch=fetch) {
  if(!config)return true;
  const token=request.headers.get('Authorization')?.match(/^Bearer ([\w.-]{20,6000})$/)?.[1];
  if(!token)return false;
  let payload;
  try {payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{return false;}
  if(payload.aud!==config.projectId || payload.iss!=='https://securetoken.google.com/'+config.projectId || !payload.sub)return false;
  const response=await requestFetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+config.apiKey,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})
  });
  if(!response.ok)return false;
  const user=(await response.json()).users?.[0];
  return user?.localId===payload.sub && user.emailVerified===true && !user.disabled;
}
