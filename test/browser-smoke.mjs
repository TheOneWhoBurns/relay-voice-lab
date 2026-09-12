import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync,readFileSync } from 'node:fs';
const live=process.argv.includes('--live');
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1512,height:1080},permissions:['microphone']});
const testTools=process.argv.includes('--tools');
if(testTools)await context.addInitScript(({audio64})=>{
  navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext({sampleRate:48000}),dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;osc.connect(gain).connect(dest);osc.start();await ctx.resume();window.__speakUser=async()=>{const bytes=Uint8Array.from(atob(audio64),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);const source=ctx.createBufferSource();source.buffer=buffer;source.connect(dest);source.start();};return dest.stream;};
},{audio64:readFileSync('/private/tmp/relay-test-utterance.wav').toString('base64')});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto('http://localhost:3210');await page.getByText('OpenAI key configured').waitFor();
  assert.equal(await page.locator('#tool-take_message').isChecked(),false);
  await page.getByRole('tab',{name:'↙ Inbound'}).click();await page.waitForFunction(()=>document.getElementById('tool-take_message').checked);assert.equal(await page.locator('#tool-record_outcome').isChecked(),false);
  await page.getByRole('tab',{name:'↗ Outbound'}).click();await page.waitForFunction(()=>!document.getElementById('tool-take_message').checked);
  await page.locator('#start').click();await page.locator('#answer').waitFor();
  assert.ok((await page.locator('#call-status').innerText()).includes('calling'));
  await page.locator('#end').click();assert.equal(await page.locator('#call-status').innerText(),'Call canceled');
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.setViewportSize({width:1512,height:1080});
  if(live){const inbound=process.argv.includes('--inbound');if(inbound){await page.getByRole('tab',{name:'↙ Inbound'}).click();await page.waitForFunction(()=>document.getElementById('tool-take_message').checked);}await page.locator('#start').click();if(!inbound)await page.locator('#answer').click();
    await page.waitForFunction(()=>document.getElementById('call-status').textContent.includes('Connected')||!document.getElementById('error').hidden,{},{timeout:55000});
    console.log('Connect status:',await page.locator('#call-status').innerText());
    if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error').innerText());
    await page.locator('.caption.agent').first().waitFor({timeout:25000});
    console.log('Greeting:',await page.locator('#transcript').innerText());
    if(testTools){await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('seconds'),{},{timeout:20000});await page.evaluate(()=>window.__speakUser());await page.waitForFunction(()=>Number(document.getElementById('action-count').textContent)>0,{},{timeout:45000});await page.waitForFunction(()=>document.getElementById('activity').textContent.includes('backend · finished'),{},{timeout:20000});await page.waitForFunction(()=>[...document.querySelectorAll('.caption.agent')].some(el=>/saved|recorded|noted/i.test(el.textContent)),{},{timeout:20000});console.log('Tool handoff:',await page.locator('#activity').textContent());console.log('Spoken confirmation:',await page.locator('#transcript').innerText());await page.screenshot({path:'test-results/live-tool.png',fullPage:true});}
    const media=await page.evaluate(()=>{const el=document.getElementById('remote-audio');return {hasStream:!!el.srcObject,paused:el.paused,tracks:el.srcObject?.getAudioTracks().map(t=>t.readyState)};});console.log('Audio:',media);assert.equal(media.hasStream,true);assert.equal(media.paused,false);
    await page.locator('#end').click();await page.waitForFunction(()=>document.getElementById('call-status').textContent==='Call complete',{},{timeout:20000});console.log('Final usage:',await page.locator('#usage').innerText());
  }
  assert.deepEqual(errors,[]);console.log('Browser smoke passed.');
}finally {if(await page.locator('#end').isVisible().catch(()=>false))await page.locator('#end').click().catch(()=>{});await context.close();await browser.close();}
