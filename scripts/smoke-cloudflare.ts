import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { getLegalMoves } from '../src/game/engine';
import { PROTOCOL_VERSION, type MatchSnapshot, type ServerMessage } from '../src/game/protocol';

// Runs against a real Wrangler or deployed Worker. Creates one short-lived room.
// Practice writes are local-only unless --write-practice is explicitly supplied.
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const local = ['127.0.0.1', 'localhost'].includes(new URL(base).hostname);
assert.equal((await fetch(base)).status, 200);
assert.equal((await fetch(`${base}/api/health`)).status, 200);
assert.equal((await fetch(`${base}/api/leaderboard?period=global`)).status, 200);
assert.equal((await fetch(`${base}/parties/main/invalid`)).status, 404);
if (local || process.argv.includes('--write-practice')) {
 const response = await fetch(`${base}/api/players`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Deployment check',styleId:'classic'}) });
 assert.equal(response.status, 201);
 const identity = await response.json() as {id:string;token:string};
 const body = JSON.stringify({playerId:identity.id,name:'Deployment check',styleId:'classic',match:{id:randomUUID(),moves:[],surrendered:true,difficulty:'normal'}});
 const submit = () => fetch(`${base}/api/matches`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${identity.token}`},body});
 assert.equal((await submit()).status, 200);
 assert.equal((await submit()).status, 200);
 console.log('Practice registration, saved result, and duplicate submission passed.');
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const room = Array.from(randomBytes(6), n=>alphabet[n%alphabet.length]).join('');
const sockets: WebSocket[] = [];
async function connect(token:string, create:boolean) {
 const ws = new WebSocket(`${base.replace(/^http/,'ws')}/parties/main/${room}`);
 sockets.push(ws);
 const messages: ServerMessage[] = [];
 ws.addEventListener('message', e => messages.push(JSON.parse(String(e.data))));
 await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve(),{once:true});ws.addEventListener('error',()=>reject(new Error('WebSocket failed')),{once:true});});
 const wait = async (predicate:(message:ServerMessage)=>boolean) => {
  const deadline = Date.now()+10_000;
  while(Date.now()<deadline) { const result=messages.find(predicate); if(result)return result; await new Promise(r=>setTimeout(r,20)); }
  throw new Error(`Timed out: ${JSON.stringify(messages)}`);
 };
 const snapshot = ():MatchSnapshot => {
  const last=messages.findLast(m=>m.type==='snapshot'||m.type==='welcome');
  assert(last && (last.type==='snapshot'||last.type==='welcome')); return last.snapshot;
 };
 ws.send(JSON.stringify({version:PROTOCOL_VERSION,type:'join',requestId:randomUUID(),token,name:create?'Check one':'Check two',styleId:'classic',create}));
 await wait(m=>m.type==='welcome');
 const send = async (type:string,extra:Record<string,unknown>={}) => {
  const requestId=randomUUID(); const state=snapshot();
  ws.send(JSON.stringify({version:PROTOCOL_VERSION,type,requestId,matchId:state.matchId,expectedRevision:state.revision,...extra}));
  return wait(m=>(m.type==='snapshot'&&m.acceptedRequestId===requestId)||(m.type==='rejected'&&m.requestId===requestId)||m.type==='left');
 };
 return {ws,wait,snapshot,send};
}
try {
 const token=randomBytes(32).toString('hex');
 const a=await connect(token,true); const b=await connect(randomBytes(32).toString('hex'),false);
 await a.wait(m=>m.type==='snapshot'&&m.snapshot.players.length===2);
 assert.equal((await a.send('ready')).type,'snapshot');
 await b.wait(m=>m.type==='snapshot'&&m.snapshot.players[0].ready);
 assert.equal((await b.send('ready')).type,'snapshot');
 await a.wait(m=>m.type==='snapshot'&&m.snapshot.phase==='playing');
 assert.equal((await a.send('move',{index:0})).type,'rejected');
 const move=getLegalMoves(a.snapshot().board,1)[0].index;
 assert.equal((await a.send('move',{index:move})).type,'snapshot');
 await b.wait(m=>m.type==='snapshot'&&m.snapshot.moveCount===1);
 a.ws.close();
 await b.wait(m=>m.type==='snapshot'&&!m.snapshot.players[0].connected);
 const reconnected=await connect(token,false);
 assert.equal(reconnected.snapshot().moveCount,1);
 assert.equal(reconnected.snapshot().phase,'playing');
 assert.equal((await reconnected.send('surrender')).type,'snapshot');
 assert.equal(reconnected.snapshot().phase,'finished');
 console.log(`HTTP, two-player room ${room}, ready checks, invalid move rejection, valid move, reconnect, and surrender passed.`);
} finally { for(const ws of sockets) ws.close(); }
