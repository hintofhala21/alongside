// Round coordinates to about 1 km before they leave the server so searches stay coarse.
const coarse=value=>Math.round(value*100)/100;
function distanceKm(a,b){
  const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLng=(b.longitude-a.longitude)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLng/2)**2;
  return 6371*2*Math.asin(Math.sqrt(h));
}
function validNear(near){
  return near && typeof near==='object' && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)
    && Math.abs(near.latitude)<=90 && Math.abs(near.longitude)<=180;
}

export async function searchPlaces({country,city,publicFirst,near},key,requestFetch=fetch) {
  const nearby=near!==undefined;
  if(typeof publicFirst!=='boolean' || (nearby ? !validNear(near) :
    typeof country!=='string'||!country.trim()||country.length>100||typeof city!=='string'||city.length>100)){
    throw Object.assign(Error(nearby?'Your location could not be read. Try again or search by city.':'Enter a country and an optional city.'),{status:400});
  }
  const kind=publicFirst?'public psychiatric hospitals':'psychiatric hospitals';
  const center=nearby?{latitude:coarse(near.latitude),longitude:coarse(near.longitude)}:null;
  const request=nearby
    ?{textQuery:kind,pageSize:10,rankPreference:'DISTANCE',locationBias:{circle:{center,radius:50000}}}
    :{textQuery:[kind,city.trim(),country.trim()].filter(Boolean).join(', '),pageSize:10};
  const res=await requestFetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.attributions,places.location'},
    body:JSON.stringify(request)
  });
  if(!res.ok)throw Object.assign(Error(res.status===429?'Google Places has reached its search limit. Try again later.':'Google Places could not complete the search. Check the server key and Places API settings.'),{status:res.status===429?429:502});
  const {places=[]}=await res.json();
  const results=places.filter(p=>p.displayName?.text&&p.formattedAddress&&!p.businessStatus?.startsWith('CLOSED')).map(p=>{
    const place={
      name:p.displayName.text,address:p.formattedAddress,url:p.googleMapsUri,placeId:typeof p.id==='string'?p.id:undefined,
      attributions:(p.attributions||[]).map(a=>({name:a.provider,uri:a.providerUri}))
    };
    if(center&&Number.isFinite(p.location?.latitude)&&Number.isFinite(p.location?.longitude))place.distanceKm=Math.round(distanceKm(center,p.location)*10)/10;
    return place;
  });
  if(nearby)results.sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity));
  return results;
}
