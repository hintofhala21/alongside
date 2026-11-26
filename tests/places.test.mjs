import test from 'node:test';
import assert from 'node:assert/strict';
import {localChat} from '../scripts/local-chat.mjs';
import {Readable} from 'node:stream';

async function lookup(env, values={country:'Japan',city:'Tokyo',publicFirst:false}){
  const origin='http://127.0.0.1:4176';
  const req=Readable.from([Buffer.from(JSON.stringify(values))]);
  req.method='POST';req.headers={host:'127.0.0.1:4176',origin,'content-type':'application/json'};
  let status,data;
  const res={setHeader(){},writeHead(code){status=code;return this;},end(body){data=JSON.parse(body);}};
  await localChat(origin,env)(req,res,'/breeze/places');
  return {status,data};
}
test('live care search needs only a Places key and sends only the requested area',async()=>{
  const result=await lookup({GOOGLE_PLACES_API_KEY:'test',TEST_FETCH:async(url,opts)=>{
    assert.equal(url,'https://places.googleapis.com/v1/places:searchText');
    assert.deepEqual(JSON.parse(opts.body),{textQuery:'psychiatric hospitals, Tokyo, Japan',pageSize:10});
    return Response.json({places:[{displayName:{text:'Example hospital'},formattedAddress:'Example address'},{businessStatus:'CLOSED_PERMANENTLY',displayName:{text:'Closed'},formattedAddress:'Old address'}]});
  }});
  assert.equal(result.status,200);assert.equal(result.data.places.length,1);
  assert.equal(result.data.places[0].address,'Example address');
});
test('care search handles missing keys, invalid input, zero matches and quota errors',async()=>{
  assert.equal((await lookup({})).status,503);
  const env={GOOGLE_PLACES_API_KEY:'test',TEST_FETCH:()=>Response.json({})};
  assert.equal((await lookup(env,{city:'Tokyo'})).status,400);
  assert.deepEqual((await lookup(env)).data,{places:[]});
  assert.equal((await lookup({...env,TEST_FETCH:()=>new Response(null,{status:429})})).status,429);
});
test('nearby search sends only a coarse position, ranks by distance and returns directions data',async()=>{
  const result=await lookup({GOOGLE_PLACES_API_KEY:'test',TEST_FETCH:async(url,opts)=>{
    const sent=JSON.parse(opts.body);
    assert.deepEqual(sent,{textQuery:'psychiatric hospitals',pageSize:10,rankPreference:'DISTANCE',locationBias:{circle:{center:{latitude:35.68,longitude:139.77},radius:50000}}});
    return Response.json({places:[
      {id:'far',displayName:{text:'Far hospital'},formattedAddress:'Far address',location:{latitude:35.9,longitude:139.77}},
      {id:'near',displayName:{text:'Near hospital'},formattedAddress:'Near address',location:{latitude:35.69,longitude:139.77}}
    ]});
  }},{near:{latitude:35.68123,longitude:139.76712},publicFirst:false});
  assert.equal(result.status,200);
  assert.deepEqual(result.data.places.map(p=>p.placeId),['near','far']);
  assert.equal(result.data.places[0].distanceKm,1.1);
});
test('nearby search rejects invalid coordinates',async()=>{
  const env={GOOGLE_PLACES_API_KEY:'test',TEST_FETCH:()=>assert.fail('Google should not be called')};
  for(const near of [{latitude:91,longitude:0},{latitude:'35',longitude:139},null,{}])
    assert.equal((await lookup(env,{near,publicFirst:false})).status,400);
});
