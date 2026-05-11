const fs = require('fs');
const path = require('path');
const http = require('http');
const { SeedLangVM } = require('../../src/runtime/vm.js');

const PIXEL_SCALE = 10;
const PORT = 8765;

const seedFile = path.join(__dirname, 'physics_demo.seed');
const code = fs.readFileSync(seedFile, 'utf-8');

console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║   Physics Demo: Gravity Bounce               ║');
console.log('  ║   SeedLang Pixel Graphics Runtime             ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

console.log('  Step 1: Running VM and recording frames...');

const vm = new SeedLangVM();
const frameDataList = [];
const vmStart = Date.now();

const host = {
    init() {},
    clear() {},
    drawPixel() {},
    drawRect() {},
    present(frame) {
        frameDataList.push({
            width: frame.width,
            height: frame.height,
            frameNum: frame.frame,
            pixels: Buffer.from(frame.pixels)
        });
        return true;
    }
};

vm.setGraphicsHost(host);
const result = vm.run(code, { maxExecutionMs: 300000, maxInstructions: 200000000 });

const vmElapsed = ((Date.now() - vmStart) / 1000).toFixed(1);
console.log(`  Recorded ${frameDataList.length} frames in ${vmElapsed}s`);

if (!result || result.success === false) {
    console.error('  VM Error:', result && result.error ? result.error : 'unknown');
    process.exit(1);
}

console.log('  Step 2: Saving frames as BMP images...');

const framesDir = path.join(__dirname, '.physics_frames');
if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);

function saveBMP(filepath, width, height, pixels) {
    const rowSize = width * 4;
    const pixelDataSize = rowSize * height;
    const fileSize = 54 + pixelDataSize;
    const buf = Buffer.alloc(fileSize);

    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(32, 28);
    buf.writeUInt32LE(pixelDataSize, 34);

    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const dstRow = 54 + y * rowSize;
        for (let x = 0; x < width; x++) {
            const si = srcRow + x * 4;
            const di = dstRow + x * 4;
            buf[di] = pixels[si + 2];
            buf[di + 1] = pixels[si + 1];
            buf[di + 2] = pixels[si];
            buf[di + 3] = pixels[si + 3];
        }
    }

    fs.writeFileSync(filepath, buf);
}

for (let i = 0; i < frameDataList.length; i++) {
    const f = frameDataList[i];
    const filepath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.bmp`);
    saveBMP(filepath, f.width, f.height, f.pixels);
}

console.log(`  Saved ${frameDataList.length} BMP files`);

console.log('  Step 3: Starting web server...\n');

const totalFrames = frameDataList.length;
const fw = frameDataList[0].width;
const fh = frameDataList[0].height;

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SeedLang Physics Demo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#060816;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Consolas,monospace;color:#8892b0;overflow:hidden}
h1{font-size:16px;color:#7aa2f7;margin-bottom:6px;letter-spacing:3px}
#info{font-size:12px;color:#495670;margin-bottom:8px}
#game{width:${fw * PIXEL_SCALE}px;height:${fh * PIXEL_SCALE}px;position:relative;border:1px solid #1a1b2e;border-radius:4px;overflow:hidden;background:#060816}
#game img{position:absolute;top:0;left:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;display:none}
#stats{font-size:11px;color:#3b4261;margin-top:8px}
#controls{margin-top:10px;display:flex;gap:10px}
button{background:#1a1b2e;color:#7aa2f7;border:1px solid #2a2b3e;padding:5px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px}
button:hover{background:#2a2b3e;border-color:#7aa2f7}
</style>
</head>
<body>
<h1>PHYSICS DEMO : GRAVITY BOUNCE</h1>
<div id="info">SeedLang Pixel Graphics Runtime - ${totalFrames} frames</div>
<div id="game"></div>
<div id="stats">Loading images...</div>
<div id="controls">
<button id="btnRestart">Restart</button>
<button id="btnPause">Pause</button>
<button id="btnSlow">0.5x</button>
<button id="btnNormal">1x</button>
<button id="btnFast">2x</button>
</div>
<script>
var TOTAL=${totalFrames};
var idx=0;
var paused=false;
var speed=1;
var startTime=0;
var loaded=0;
var game=document.getElementById('game');
var statsEl=document.getElementById('stats');

for(var i=0;i<TOTAL;i++){
  var img=document.createElement('img');
  img.src='/frame/'+i;
  img.dataset.idx=i;
  img.onload=function(){loaded++;statsEl.textContent='Loading... '+loaded+'/'+TOTAL;};
  img.onerror=function(){statsEl.textContent='Error loading frame '+this.dataset.idx;};
  game.appendChild(img);
}

function showFrame(i){
  var imgs=game.getElementsByTagName('img');
  for(var j=0;j<imgs.length;j++){
    imgs[j].style.display=parseInt(imgs[j].dataset.idx)===i?'block':'none';
  }
}

function startPlay(){
  idx=0;
  startTime=Date.now();
  showFrame(0);
  loop();
}

function loop(){
  if(!paused && idx<TOTAL){
    showFrame(idx);
    idx++;
    var elapsed=((Date.now()-startTime)/1000).toFixed(1);
    var fps=(idx/(elapsed>0?elapsed:1)).toFixed(1);
    statsEl.textContent='Frame: '+idx+'/'+TOTAL+' | FPS: '+fps+' | Speed: '+speed+'x';
  }
  if(idx>=TOTAL){
    statsEl.textContent='Done! '+TOTAL+' frames. Click Restart.';
    return;
  }
  setTimeout(loop,33/speed);
}

var checkLoaded=setInterval(function(){
  if(loaded>=TOTAL){
    clearInterval(checkLoaded);
    statsEl.textContent='All frames loaded. Starting...';
    setTimeout(startPlay,500);
  }
},200);

document.getElementById('btnRestart').onclick=function(){idx=0;startTime=Date.now();loop();};
document.getElementById('btnPause').onclick=function(){paused=!paused;this.textContent=paused?'Play':'Pause';if(!paused)loop();};
document.getElementById('btnSlow').onclick=function(){speed=0.5;};
document.getElementById('btnNormal').onclick=function(){speed=1;};
document.getElementById('btnFast').onclick=function(){speed=2;};
</script>
</body>
</html>`);
    } else if (url.pathname.startsWith('/frame/')) {
        const frameIdx = parseInt(url.pathname.split('/').pop());
        if (frameIdx >= 0 && frameIdx < totalFrames) {
            const filepath = path.join(framesDir, `frame_${String(frameIdx).padStart(4, '0')}.bmp`);
            res.writeHead(200, {
                'Content-Type': 'image/bmp',
                'Cache-Control': 'public, max-age=3600'
            });
            fs.createReadStream(filepath).pipe(res);
        } else {
            res.writeHead(404);
            res.end();
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`  >>> Open your browser and go to: http://localhost:${PORT} <<<`);
    console.log('  (Copy this URL into Chrome/Edge/Firefox address bar)\n');
});
