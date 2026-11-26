'use strict';
async function postPlaces(body) {
  let endpoint='/breeze/places';
  if(location.hostname!=='127.0.0.1'){
    const config=await (await fetch('./config.json')).json();
    endpoint=new URL('/places',config.apiBase).href;
  }
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Live search is unavailable.');
  return result;
}
globalThis.AlongsidePlaces = (country, city, publicFirst) => postPlaces({country,city,publicFirst});
globalThis.AlongsidePlacesNear = (latitude, longitude, publicFirst) => postPlaces({near:{latitude,longitude},publicFirst});

// Probe capabilities without sending the visitor's search area.
let placesReady;
globalThis.alongsidePlacesReady = function() {
  if (location.protocol === 'file:') return Promise.resolve(false);
  if (!placesReady) placesReady = (async () => {
    const options={cache:'no-store',signal:AbortSignal.timeout(5000)};
    const config=await (await fetch('./config.json',options)).json();
    if (location.hostname === '127.0.0.1') return config.placesReady === true;
    const status=await fetch(new URL('/status',config.apiBase),options);
    return status.ok && (await status.json()).placesReady === true;
  })().catch(()=>false);
  return placesReady;
};

// Google Maps directions from the visitor's current position (Maps asks for it, not Alongside).
globalThis.alongsideDirectionsUrl = function(destination, placeId) {
  const url=new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');url.searchParams.set('destination',destination);
  if(placeId)url.searchParams.set('destination_place_id',placeId);
  return url.href;
};

// "Find care near me": reads the device location only after a tap and rounds it to about 1 km.
globalThis.AlongsideNearby = function(out, publicFirst, onFallback = () => {}) {
  const make=(tag,text,className)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=text;return node;};
  const link=(label,href)=>{const a=make('a',label,'action outline');a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const kind=publicFirst?'public psychiatric hospitals':'psychiatric hospitals';
  out.replaceChildren();
  const panel=make('article','','panel stack');
  const status=make('p','Finding your location…');status.setAttribute('role','status');
  const listings=make('div','','stack');
  panel.append(make('h2','Care near you'),status,listings);
  out.append(panel);
  if(!navigator.geolocation){status.textContent='This browser cannot share your location. Search by country and city instead.';onFallback();return;}
  navigator.geolocation.getCurrentPosition(async position=>{
    const latitude=Math.round(position.coords.latitude*100)/100, longitude=Math.round(position.coords.longitude*100)/100;
    const mapsSearch=new URL('https://www.google.com/maps/search/');
    mapsSearch.searchParams.set('api','1');mapsSearch.searchParams.set('query',kind+' near '+latitude+','+longitude);
    const fallback=make('div','','stack');
    fallback.append(link('Open nearby hospitals in Google Maps',mapsSearch.href),make('small','Opening Google Maps shares your approximate location with Google. Confirm services and age eligibility with the hospital.'));
    if(!await globalThis.alongsidePlacesReady()){
      status.textContent='Live nearby search is not available here. Google Maps can show hospitals around you.';
      listings.append(fallback);onFallback();return;
    }
    status.textContent='Searching for the nearest hospitals…';
    try{
      const {places}=await globalThis.AlongsidePlacesNear(latitude,longitude,publicFirst);
      if(!places.length){status.textContent='No hospitals were found within about 50 km. Try Google Maps or search by city.';listings.append(fallback);onFallback();return;}
      status.textContent='Nearest first. Distances are straight-line and approximate.';
      const credit=make('strong','Google Maps');credit.setAttribute('translate','no');listings.append(credit);
      for(const hospital of places){
        const item=make('div','','panel stack');
        item.append(make('h3',hospital.name),make('p',hospital.address));
        if(Number.isFinite(hospital.distanceKm))item.append(make('small',hospital.distanceKm+' km away'));
        item.append(link('Get directions',globalThis.alongsideDirectionsUrl(hospital.name+', '+hospital.address,hospital.placeId)));
        if(/^https:\/\//.test(hospital.url))item.append(link('View on Google Maps',hospital.url));
        for(const a of hospital.attributions||[])if(a.name)item.append(/^https:\/\//.test(a.uri)?link(a.name,a.uri):make('small',a.name));
        listings.append(item);
      }
      listings.append(make('small','Map listings can be incomplete. Confirm services and age eligibility directly with the provider.'));
    }catch(error){
      status.textContent=error instanceof SyntaxError?'Live search is unavailable on this version of Alongside.':error.message;
      listings.append(fallback);onFallback();
    }
  },error=>{
    status.textContent=error.code===1
      ?'Location access is turned off for this site. Allow it in your browser settings, or search by country and city.'
      :'Your location could not be found. Try again, or search by country and city.';
    onFallback();
  },{enableHighAccuracy:false,timeout:15000,maximumAge:300000});
};
