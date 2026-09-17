import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {boundCamera,minimumScale,worldAt,screenAt,zoomAt,pinchCamera,fitPoints,wheelPixels}=require('../.test-dist/mapCamera.js');
const view={width:1280,height:650};
test('zoom preserves arbitrary screen anchors exactly, independent of camera origin',()=>{
 for(let i=0;i<1000;i++){const c={x:-150-i/8,y:-180,scale:.65},p={x:100+i%700,y:150+i%200};const next=zoomAt(c,1.2,p);const before=worldAt(c,p),after=worldAt(next,p);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-8);}
});
test('pinch translates its midpoint and never jumps back to a player location',()=>{
 const c={x:-600,y:-400,scale:.8},before=[{x:400,y:200},{x:600,y:300}],after=[{x:440,y:205},{x:640,y:305}];
 const n=pinchCamera(c,before,after,view);assert.equal(n.scale,c.scale);assert.equal(n.x,c.x+40);assert.equal(n.y,c.y+5);
});
test('bounds keep the atlas reachable and center axes smaller than the viewport',()=>{
 for(const v of [view,{width:320,height:470},{width:844,height:154}])for(const scale of [-1,.01,.65,2,999]){
 const n=boundCamera({x:1e8,y:-1e8,scale},v);assert.ok(n.scale>=minimumScale(v));assert.ok(n.scale<=2);assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
 if(2400*n.scale<=v.width)assert.equal(n.x,(v.width-2400*n.scale)/2);else assert.ok(n.x<=72);
 }
});
test('dynamic minimum enables an entire 2400 by 1600 atlas on a 320px display',()=>{
 const v={width:320,height:440},scale=minimumScale(v);assert.ok(2400*scale<=v.width);assert.ok(1600*scale<=v.height);
});
test('fit route accounts for side-panel width and leaves room for marker labels',()=>{
 const area={x:0,y:0,width:780,height:650},points=[{x:200,y:350},{x:900,y:900},{x:1800,y:750}],c=fitPoints(points,area);
 for(const p of points){const s=screenAt(c,p);assert.ok(s.x>=70&&s.x<=710);assert.ok(s.y>=70&&s.y<=590);}
});
test('wheel units are normalized and invalid transforms are bounded',()=>{
 assert.equal(wheelPixels(3,1,650),48);assert.equal(wheelPixels(1,2,650),650);assert.equal(wheelPixels(24,0,650),24);
 const c=boundCamera({x:NaN,y:Infinity,scale:NaN},view);assert.ok(Object.values(c).every(Number.isFinite));
});
