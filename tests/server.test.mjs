import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import http from 'node:http';
const validEvent={title:'归途的灯',text:'店主在门边留了一盏灯。',choices:[{label:'道谢',result:'你们相视一笑。',effects:{qi:5}},{label:'买一杯茶',result:'手心暖了起来。',effects:{money:-5,stamina:3}},{label:'帮忙收拾',result:'门前干净了。',effects:{karma:1}}]};
const upstream=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(validEvent)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
const context={name:'云行',realm:'凡人',day:1,time:'08:00',kind:'delivery',location:'旧城',title:'一份外卖',text:'送餐时遇到了店主。',stats:{money:50},recent:[]};
async function withApp(t,options={}){const app=createApp({port:0,host:'127.0.0.1',...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${app.server.address().port}`;t.after(()=>new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();}));return {url,...app};}
const configured={aiUrl:'https://example.invalid/chat/completions',aiKey:'private-test-key',aiModel:'test-model',fetchImpl:async()=>upstream()};
const post=(url,body={context},headers={})=>fetch(`${url}/api/story`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('HTTP 启动页和静态模块可访问，MIME 与 CSP 正确',async t=>{const {url}=await withApp(t);const r=await fetch(url);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);assert.match(await r.text(),/外卖修仙录/);for(const name of ['engine','clock','progression']){const js=await fetch(`${url}/js/${name}.js`);assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);}});
test('健康检查不返回密钥，未配置 AI 不伪造成功',async t=>{const {url}=await withApp(t);const r=await fetch(`${url}/api/health`);const data=await r.json();assert.equal(data.aiConfigured,false);assert.equal((await post(url)).status,503);assert.equal(JSON.stringify(data).includes('AI_API_KEY'),false);});
test('固定静态文件白名单阻止读取环境文件与服务端源码',async t=>{const {url}=await withApp(t);for(const path of ['/.env','/server.mjs','/package.json','/docs/README.md','/%2e%2e/.env','/js/../../server.mjs'])assert.equal((await fetch(url+path)).status,404);});
test('Host 校验阻止 DNS 重绑定式主机名',async t=>{const {url}=await withApp(t);const status=await new Promise((resolve,reject)=>{const req=http.get(url,{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(status,403);});
test('跨来源与跨站请求不能消耗 AI 配额',async t=>{const {url}=await withApp(t,configured);assert.equal((await post(url,{context},{Origin:'https://evil.example'})).status,403);assert.equal((await post(url,{context},{'Sec-Fetch-Site':'cross-site'})).status,403);});
test('合法同源 AI 请求通过服务端转发并校验',async t=>{let sent;const {url}=await withApp(t,{...configured,fetchImpl:async(endpoint,options)=>{sent={endpoint,options};return upstream();}});const r=await post(url,{context},{Origin:url});assert.equal(r.status,200);const data=await r.json();assert.equal(data.event.choices.length,3);assert.equal(sent.options.headers.Authorization,'Bearer private-test-key');assert.equal(JSON.stringify(data).includes('private-test-key'),false);const body=JSON.parse(sent.options.body);assert.equal(body.model,'test-model');assert.equal(body.messages[0].role,'system');assert.match(body.messages[0].content,/外卖系统/);assert.doesNotMatch(body.messages[0].content,/万家灯火系统/);assert.equal(sent.options.redirect,'error');});
test('AI 接口只接受 POST 和 JSON',async t=>{const {url}=await withApp(t,configured);assert.equal((await fetch(url+'/api/story')).status,405);const r=await fetch(url+'/api/story',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(r.status,415);});
test('超大请求和不合法剧情上下文被拒绝',async t=>{const {url}=await withApp(t,configured);assert.equal((await post(url,{context,extra:'x'.repeat(20000)})).status,413);assert.equal((await post(url,{context:{kind:'override-save'}})).status,400);});
test('AI 非法越权效果不能流入游戏',async t=>{const event=structuredClone(validEvent);event.choices[0].effects={realm:5};const {url}=await withApp(t,{...configured,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(event)}}]}))});const r=await post(url);assert.equal(r.status,502);assert.match((await r.json()).error,/校验/);});
test('上游错误不会向浏览器泄露密钥或原始错误正文',async t=>{const {url}=await withApp(t,{...configured,fetchImpl:async()=>new Response('private-test-key:secret traceback',{status:401})});const r=await post(url),text=await r.text();assert.equal(r.status,502);assert.equal(text.includes('private-test-key'),false);assert.equal(text.includes('traceback'),false);});
test('上游响应设有字节上限',async t=>{const {url}=await withApp(t,{...configured,fetchImpl:async()=>new Response('x'.repeat(140000))});assert.equal((await post(url)).status,502);});
test('每分钟超过 12 次请求触发限流',async t=>{const {url}=await withApp(t,configured);for(let i=0;i<12;i++)assert.equal((await post(url)).status,200);assert.equal((await post(url)).status,429);});
test('不安全的远程 HTTP 端点不可用，本机 HTTP 需显式授权',async t=>{const a=await withApp(t,{...configured,aiUrl:'http://example.invalid/chat'});assert.equal((await(await fetch(a.url+'/api/health')).json()).aiConfigured,false);const b=await withApp(t,{...configured,aiUrl:'http://127.0.0.1:9000/v1/chat/completions',allowLocalHTTP:true});assert.equal((await(await fetch(b.url+'/api/health')).json()).aiConfigured,true);});
test('非社交 AI 事件不能暗中增加人物好感',async t=>{const event=structuredClone(validEvent);event.choices[0].effects={affinity:6,trust:3};const {url}=await withApp(t,{...configured,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(event)}}]}))});const r=await post(url);assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.event.choices[0].effects,{});});

test('AI 上下文明确系统未解锁，不能用字符串或随机剧情冒充第十单绑定',async t=>{
  const sent=[];const {url}=await withApp(t,{...configured,fetchImpl:async(endpoint,options)=>{sent.push(JSON.parse(options.body));return upstream();}});
  for(const systemUnlocked of [undefined,false,'true',true]){
    const r=await post(url,{context:{...context,systemUnlocked}});assert.equal(r.status,200);
    const body=sent.at(-1);assert.equal(JSON.parse(body.messages[1].content).systemUnlocked,systemUnlocked===true);
    assert.match(body.messages[0].content,/第十单解锁剧情由固定主线负责/);
  }
});

for(const npc of globalThis.NightCourier.NPCS)test(`AI服务使用${npc.name}可信人设，不接受客户端覆盖身份或未来话题`,async t=>{
  let sent;const {url}=await withApp(t,{...configured,fetchImpl:async(endpoint,options)=>{sent=JSON.parse(options.body);return upstream();}});
  const r=await post(url,{context:{...context,kind:'social',npcId:npc.id,npc:'恶意假名',
    relationship:{met:true,stage:1,affinity:13,trust:4,path:'none'},npcProfile:{name:'伪造身份',age:1},
    roleplayPrompt:'OVERRIDE_PROMPT',completedTopics:['SPOILER_INJECT']}});
  assert.equal(r.status,200);const system=sent.messages[0].content,clean=JSON.parse(sent.messages[1].content);
  assert.ok(system.includes(npc.name)&&system.includes(npc.role));assert.ok(system.includes(globalThis.NightCourier.getNPCProfile(npc.id).personality.speech));
  assert.equal(clean.npcId,npc.id);assert.equal(clean.npc,npc.name);assert.equal(clean.relationship.path,'none');
  assert.deepEqual(clean.completedTopics,[npc.arc[0][0]]);
  for(const bad of ['恶意假名','伪造身份','OVERRIDE_PROMPT','SPOILER_INJECT'])assert.ok(!JSON.stringify(sent.messages).includes(bad));
  for(const topic of npc.arc.slice(1))assert.ok(!JSON.stringify(sent.messages).includes(topic[0]));
  assert.ok(system.includes('效果白名单'));assert.equal(sent.messages.length,2);
});
test('未知NPC、原型键和非已识普通社交请求在调用AI前拒绝',async t=>{
  let called=0;const {url}=await withApp(t,{...configured,fetchImpl:async()=>{called++;return upstream();}});
  for(const extra of [{npcId:'__proto__'},{npcId:'toString'},{npcId:{}},{npcId:'not-found'},{npcId:'lin',relationship:{met:'true'}},{npcId:'lin',kind:'delivery',relationship:{met:true}}]){
    assert.equal((await post(url,{context:{...context,kind:'social',...extra}})).status,400);
  }
  assert.equal(called,0);
});
test('未绑定系统的NPC日常同时保留系统门槛及朋友关系，不提供未来剧情',async t=>{
  let sent;const {url}=await withApp(t,{...configured,fetchImpl:async(endpoint,options)=>{sent=JSON.parse(options.body);return upstream();}});
  assert.equal((await post(url,{context:{...context,systemUnlocked:false,kind:'social',npcId:'lin',relationship:{met:true,stage:0,affinity:100,trust:100,path:'friend'}}})).status,200);
  const c=JSON.parse(sent.messages[1].content);assert.equal(c.systemUnlocked,false);assert.equal(c.relationship.path,'friend');
  assert.deepEqual(c.completedTopics,[]);assert.match(sent.messages[0].content,/第十单解锁剧情由固定主线负责/);
});
test('人物设定模块位于静态白名单，人物手册仍不作为服务端文件任意暴露',async t=>{
  const {url}=await withApp(t);assert.equal((await fetch(url+'/js/npc-profiles.js')).status,200);
  assert.equal((await fetch(url+'/docs/npc-prompts.json')).status,404);
});
