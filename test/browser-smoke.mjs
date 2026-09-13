import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync,readFileSync } from 'node:fs';
const live=process.argv.includes('--live');
const conversation=process.argv.includes('--conversation');
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1512,height:1080},permissions:['microphone']});
const testTools=process.argv.includes('--tools');
if(testTools||conversation){
  const paths=conversation?['/private/tmp/alo-turn-1.wav','/private/tmp/alo-turn-2.wav']:['/private/tmp/relay-test-utterance.wav'];
  await context.addInitScript(({audio64})=>{
    navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext({sampleRate:48000}),dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;osc.connect(gain).connect(dest);osc.start();await ctx.resume();window.__speakUser=async(index=0)=>{const bytes=Uint8Array.from(atob(audio64[index]),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);const source=ctx.createBufferSource();source.buffer=buffer;source.connect(dest);source.start();await new Promise(resolve=>source.addEventListener('ended',resolve,{once:true}));};return dest.stream;};
  },{audio64:paths.map(path=>readFileSync(path).toString('base64'))});
}
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
async function waitForTranscriptStable(quietMs=2200,timeoutMs=20000){
  const deadline=Date.now()+timeoutMs;let previous='',changedAt=Date.now();
  while(Date.now()<deadline){
    await page.waitForTimeout(250);const current=await page.locator('#transcript').innerText();
    if(current!==previous){previous=current;changedAt=Date.now();}
    if(previous&&Date.now()-changedAt>=quietMs)return previous;
  }
  throw new Error('Voice transcript did not settle.');
}
try {
  await page.goto('http://localhost:3210');await page.getByText('API configured').waitFor();
  assert.equal(await page.locator('#language').inputValue(),'es');assert.ok((await page.locator('#greeting').inputValue()).length>0);assert.ok(!(await page.locator('#greeting').inputValue()).includes('treinta'));
  const outboundLeadEnabled=await page.locator('#tool-save_lead').isChecked();
  await page.getByRole('tab',{name:'Inbound'}).click();await page.waitForFunction(()=>document.getElementById('tool-save_lead').checked);assert.equal(await page.locator('#tools input').count(),3);
  await page.getByRole('tab',{name:'Outbound'}).click();await page.waitForFunction(()=>document.querySelector('[data-mode="outbound"]').getAttribute('aria-selected')==='true');assert.equal(await page.locator('#tool-save_lead').isChecked(),outboundLeadEnabled);
  await page.locator('#start').click();await page.locator('#answer').waitFor();
  assert.equal(await page.locator('#call-status').innerText(),'Ringing');
  await page.locator('#end').click();assert.equal(await page.locator('#call-status').innerText(),'Canceled');
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.setViewportSize({width:1512,height:1080});
  if(live){const inbound=process.argv.includes('--inbound');if(inbound){await page.getByRole('tab',{name:'Inbound'}).click();await page.waitForFunction(()=>document.getElementById('tool-save_lead').checked);}await page.locator('#start').click();if(!inbound)await page.locator('#answer').click();
    await page.waitForFunction(()=>document.getElementById('call-status').textContent.includes('Connected')||!document.getElementById('error').hidden,{},{timeout:55000});
    console.log('Connect status:',await page.locator('#call-status').innerText());
    if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error').innerText());
    await page.locator('.caption.agent').first().waitFor({timeout:25000});
    await waitForTranscriptStable();
    console.log('Greeting:',await page.locator('#transcript').innerText());
    if(conversation){
      for(let turn=0;turn<2;turn++){
        const beforeCallers=await page.locator('.caption.caller').count();
        const beforeVoice=(await page.locator('.caption.agent').allTextContents()).join('');
        await page.evaluate(index=>window.__speakUser(index),turn);
        await page.waitForFunction(count=>document.querySelectorAll('.caption.caller').length>count,beforeCallers,{timeout:45000});
        await page.waitForFunction(count=>[...document.querySelectorAll('.activity-item h3')].filter(el=>el.textContent.includes('backend.finished')).length>count,turn,{timeout:45000});
        await page.waitForFunction(count=>[...document.querySelectorAll('.activity-item pre')].filter(el=>el.textContent.includes('session.commentary.appended')).length>count,turn+1,{timeout:45000});
        await page.waitForFunction(length=>[...document.querySelectorAll('.caption.agent')].map(el=>el.textContent).join('').length>length+30,beforeVoice.length,{timeout:45000});
        await waitForTranscriptStable(2500,30000);
        console.log(`Turn ${turn+1}:`,await page.locator('#transcript').innerText());
      }
      assert.ok((await page.locator('.caption.caller').count())>=2);
      assert.ok((await page.locator('.caption.agent').count())>=3);
      const spoken=(await page.locator('.caption.agent:not([data-suppressed="true"])').allTextContents()).join(' ');
      assert.doesNotMatch(spoken,/\bun momento\b|ya le comento|déj(?:e|ame) revisar|\ben esencia\b/i);
      assert.ok(spoken.length>150,'Expected both Pi-directed answers to be played, not merely generated.');
      assert.ok(Number(await page.locator('#remote-audio').getAttribute('data-gate-count'))>=2);
      assert.equal(await page.locator('#remote-audio').evaluate(element=>element.muted),false);
      assert.notEqual(await page.locator('#context-usage').innerText(),'—');
      await page.screenshot({path:'test-results/live-conversation.png',fullPage:true});
    }else if(testTools){await page.evaluate(()=>window.__speakUser());await page.waitForFunction(()=>Number(document.getElementById('action-count').textContent)>0,{},{timeout:45000});await page.waitForFunction(()=>document.getElementById('activity').textContent.includes('backend · finished'),{},{timeout:20000});await page.waitForFunction(()=>[...document.querySelectorAll('.caption.agent')].some(el=>/guardad|registrad|anotad|anoté/i.test(el.textContent)),{},{timeout:20000});console.log('Tool handoff:',await page.locator('#activity').textContent());console.log('Spoken confirmation:',await page.locator('#transcript').innerText());await page.screenshot({path:'test-results/live-tool.png',fullPage:true});}
    const media=await page.evaluate(()=>{const el=document.getElementById('remote-audio');return {hasStream:!!el.srcObject,paused:el.paused,tracks:el.srcObject?.getAudioTracks().map(t=>t.readyState)};});console.log('Audio:',media);assert.equal(media.hasStream,true);assert.equal(media.paused,false);
    await page.locator('#end').click();await page.waitForFunction(()=>document.getElementById('call-status').textContent==='Closed',{},{timeout:20000});console.log('Final usage:',await page.locator('#usage').innerText());
    assert.notEqual(await page.locator('#call-cost').innerText(),'$0.0000');console.log('Cost:',await page.locator('#call-cost').innerText());
  }
  assert.deepEqual(errors,[]);console.log('Browser smoke passed.');
}finally {if(await page.locator('#end').isVisible().catch(()=>false))await page.locator('#end').click().catch(()=>{});await context.close();await browser.close();}
