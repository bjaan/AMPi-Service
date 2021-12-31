const SerialPort = require('serialport');
const ByteLength = require('@serialport/parser-byte-length');
const ShairportReader = require('shairport-sync-reader');
const fs = require('fs');
const loadIniFile = require('read-ini-file');
const { exec } = require("child_process");
const Jimp = require('jimp');

let shairportChecked = false;
let shairportActive = false;
let shairportOpen = false;

let pianobarChecked = false;
let pianobarActive = true;
let pianobarNowPlayingListener = function (curr, prev) { readPianobarInfo(); };

// Serial Communication

const MAX_MESSAGE = 200;
const MAX_TEXT = 35;
const PPP_BEGIN_FLAG = 0x3C; const PPP_END_FLAG = 0x3E; const PPP_NDX_COMMAND = 0; const PPP_NDX_LENGTH = 1;
let receiving = false;
let receiveBuffer = Buffer.alloc(MAX_MESSAGE);
let receiveIndex = 0;
let receiveSizeLeft = 0;

// Configuration

const HOME = '/home/pi/AMPi-Node';
const SHAIRPORT_METADATA = '/tmp/shairport-sync-metadata';
const PIANOBAR_NOWPLAYING = '/home/pi/.config/pianobar/nowplaying';
const PIANOBAR_CTL = '/home/pi/.config/pianobar/ctl';

// Utility Functions

function serialSend(buf, success) {
	serial0.write(buf, (err) => {
		if (err) { console.log('Error on write: ', err.message); return; }
		success();
	});
}

function serialSendStatus(text, success) {
	if (!text) text = "";
	let textBuf = Buffer.from(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), 'ascii');
	if (text.length > 95 /* MAX_TEXT - 3 plus 2 to avoid edge case */) text = text.str.substring(0,95) + "...";
	let buf = Buffer.alloc(textBuf.length+4);
	textBuf.copy(buf, 3);
	buf[0] = 60; // < 3C
	buf[1] = 83; // S 53
	buf[2] = textBuf.length;
	buf[buf.length-1] = 62; // > 3E
	serialSend(buf, () => { console.log('Status "' + text + '" sent'); if (success) success();} );
}

function serialReceiveByte(buffer /*1 byte*/) {
	let character = buffer[0];
	if (!receiving) {
		if (character == PPP_BEGIN_FLAG) {
			receiving = true;
			receiveIndex = 0;
			receiveSizeLeft = 1; //the command is expected - so 1 byte
		}
	} else {
		if (character == PPP_END_FLAG && receiveSizeLeft == 0) {
			if (receiveIndex <= PPP_NDX_LENGTH) receiveBuffer[PPP_NDX_LENGTH] = 0; //no length received - 1 byte packet like <P>
			receiving = false;
			processReceiveBuffer();
		} else {
			if (receiveIndex < MAX_MESSAGE-1) {
				receiveBuffer[receiveIndex] = character;
				if (receiveIndex == PPP_NDX_LENGTH) receiveSizeLeft = character;  
				else if (receiveSizeLeft == 0) receiving = false; else receiveSizeLeft--;
				receiveIndex++;
			} else receiving = false;
		}
	}
}

function powerOnConfirm() {
	//three times to make sure it received
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<P><b><P><P>', 'ascii'), () => { console.log('Power On (P) sent'); resolve(); });
	});
}

function block() {
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<B>', 'ascii'), () => { console.log('Block command sent'); resolve(); });
	});
}

function unblock() {
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<b>', 'ascii'), () => { console.log('Unblock command sent'); resolve(); });
	});
}

function hidePlayer() {
	return new Promise((resolve, reject) => {
		clearCanvas(canvas2, 0, 0, 0); //clear canvas as it needs to be rerendered once the the player is shown again
		serialSend(Buffer.from('<d>', 'ascii'), () => { console.log('Hide Player command sent'); resolve(); });
	});
}

function powerOff() {
	exec("sudo poweroff", (error, stdout, stderr) => {
		console.log('Powering off...');
	});
}

// Service Monitor

function checkShairport() {
	return new Promise((resolve, reject) => {
		exec("service shairport-sync status | grep inactive", (error, stdout, stderr) => {
			if (stdout.includes("inactive")) {
				if (!shairportChecked || shairportActive /*only once*/) {
					console.log("shairport down");
					serialSend(Buffer.from('<R\x03\xFF\x8C\x1A>', 'ascii'), () => console.log('Airplay RED sent'));
					shairportOpen = false;
					PLAYER_DATA.songStartTime = null;
					if (shairPort) { shairPort.removeAllListeners(); shairPort = null; }
				}
				shairportActive = false;
			} else {
				if (!shairportChecked || !shairportOpen /*when not connected*/ && !shairportActive /*only once*/) {
					console.log("shairport up");
					serialSend(Buffer.from('<R\x03\xFF\xFF\xFF>', 'ascii'), () => console.log('Airplay WHITE sent'));
					HUDvisible = false;
					if (shairPort) { shairPort.removeAllListeners(); shairPort = null; }
					setTimeout(function(){ shairPort = createShairportReader(); }, 1000); //after one second activate event listener for meta data / connection
				}
				shairportActive = true;
			}
			shairportChecked = true;
			resolve();
		});
	});
}

function checkPianobar() {
	return new Promise((resolve, reject) => {
		exec("service pianobar status | grep inactive", (error, stdout, stderr) => {
			if (stdout.includes("inactive")) {
				if (!pianobarChecked || pianobarActive /*only once*/) {
					console.log("pianobar down");
					serialSend(Buffer.from('<N\x03\xFF\x8C\x1A>', 'ascii'), () => console.log('Pandora RED sent'));
					fs.unwatchFile(PIANOBAR_NOWPLAYING, pianobarNowPlayingListener);
					PLAYER_DATA.songStartTime = null; PLAYER_DATA.image = null;
				}
				pianobarActive = false;
			} else {
				if (!pianobarChecked || !pianobarActive /*only once*/) {
					console.log("pianobar up");
					serialSend(Buffer.from('<N\x03\xFF\xFF\xFF>', 'ascii'), () => console.log('Pandora WHITE sent'));
					readPianobarInfo();
					fs.watchFile(PIANOBAR_NOWPLAYING, pianobarNowPlayingListener);
					HUDvisible = false;
				}
				pianobarActive = true;
			}
			pianobarChecked = true;
			resolve();
		});
	});
}

function checkStatusses() {
	checkShairport()
		.then(checkPianobar());
}
setInterval(checkStatusses, 5000);

// Shairport Sync Management

let shairPort = null;

function createShairportReader() {
	let spr = new ShairportReader({ path: SHAIRPORT_METADATA });
	spr.on('error',readShairPortError);
	spr.on('pbeg',readShairPortBegin);
	spr.on('pend',readShairPortEnd);
	spr.on('meta',readShairPortMeta);
	spr.on('PICT',readShairPortPict);
	spr.on('prsm',readShairPortPauseResume);
	console.log("shairport listening");
	return spr;
}

function readShairPortError(data) {
	console.log("shairport error "  + JSON.stringify(data));
}

function readShairPortBegin(data) {
	console.log("shairport pbeg " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\x00\xBE\xFF>', 'ascii'), () => {
		shairportOpen = true;
		console.log('Airplay BLUE sent');
		clearCanvas(canvas2, 0, 0, 0); //clear canvas as it needs to be rerendered once the metadata comes in
		PLAYER_DATA.image = null; //clear image
	});
	serialSendStatus("> " + data["Client-IP"]);
}

function readShairPortEnd(data) {
	console.log("shairport pend " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\xFF\xFF\xFF>', 'ascii'), () => {
		shairportOpen = false;
		PLAYER_DATA.songStartTime = null;
		console.log('Airplay WHITE sent');
		serialSend(Buffer.from('<d>', 'ascii'), () => {
			console.log('Player hide sent');
		});
	});
	serialSendStatus("");
}

function readShairPortMeta(data) {
	if (!shairportOpen) { //open if not yet detected
		serialSend(Buffer.from('<R\x03\x00\xBE\xFF>', 'ascii'), () => {
			shairportOpen = true;
			console.log('Airplay BLUE sent');
		});
	}
	console.log("shairport meta " /* + JSON.stringify(data)*/);
	let shairPortNowPlaying = data;
	if (shairPortNowPlaying.hasOwnProperty("astm") || PLAYER_DATA.artist != shairPortNowPlaying.asar || PLAYER_DATA.title != shairPortNowPlaying.minm || PLAYER_DATA.album != shairPortNowPlaying.asal) { //when new song or playtime is sent
		console.log(`CURRENT SONG: ${shairPortNowPlaying.asar} - ${shairPortNowPlaying.minm} on ${shairPortNowPlaying.asal}`);
		let songDuration = (shairPortNowPlaying.hasOwnProperty("astm") ? parseInt(shairPortNowPlaying.astm) : null);
		PLAYER_DATA.artist = shairPortNowPlaying.asar; PLAYER_DATA.title = shairPortNowPlaying.minm; PLAYER_DATA.album = shairPortNowPlaying.asal;
		PLAYER_DATA.songStartTime = new Date();
		PLAYER_DATA.songEndTime = (songDuration && songDuration > 0 ? new Date(PLAYER_DATA.songStartTime.getTime()+songDuration) : null);
		PLAYER_DATA.year = (shairPortNowPlaying.hasOwnProperty('asyr') ? shairPortNowPlaying.asyr : null);
		PLAYER_DATA.bitrate = (shairPortNowPlaying.hasOwnProperty('asbr') ? parseInt(shairPortNowPlaying.asbr) : null);
		PLAYER_DATA.samplerate = (shairPortNowPlaying.hasOwnProperty('assr') ? parseInt(shairPortNowPlaying.assr) / 1000 : null);
		PLAYER_DATA.category = (shairPortNowPlaying.hasOwnProperty('asgn') ? shairPortNowPlaying.asgn : null);
		playerShowCounter = 0;
		updatePlayerUI(false, false);
	}
}

function readShairPortPict(data) {
	console.log("shairport pict " /*+ JSON.stringify(data)*/);
	Jimp.read(data)
        .then(function(image) {
			 image.scaleToFit(CANVAS_HEIGHT, Jimp.AUTO, Jimp.RESIZE_BEZIER)
			 PLAYER_DATA.image = image;
			 updatePlayerUI(false, false);
		})
		.catch(function (err) {
			console.error(err); //error reading cover art image
			PLAYER_DATA.image = null;
			updatePlayerUI(false, false);
		});
}

function readShairPortPauseResume(data) {
	console.log("shairport prsm "  + JSON.stringify(data));
}

function shutdownShairport() {
	return new Promise((resolve, reject) => {
		if (!shairportActive) 
			resolve();
		else {
			exec("sudo service shairport-sync stop", (error, stdout, stderr) => {
				console.log('Airplay stopped.');
				checkShairport().then(() => resolve());
			});
		}
	});
}

function startupShairport() {
	return new Promise((resolve, reject) => {
		if (shairportActive) 
			resolve();
		else {
			exec("sudo service shairport-sync start", (error, stdout, stderr) => {
				console.log('Airplay started.');
				shairportChecked = false;
				checkShairport().then(() => resolve());
			});
		}
	});
}


function restartShairport() {
	return new Promise((resolve, reject) => {
		exec("sudo service shairport-sync restart", (error, stdout, stderr) => {
			console.log('Airplay restarted.');
			shairportChecked = false;
			serialSendStatus("");
			checkShairport().then(() => resolve());
		});
	});
}

// Pianobar Management

function shutdownPianobar() {
	return new Promise((resolve, reject) => {
		if (!pianobarActive)
			resolve();
		else {
			exec("sudo service pianobar stop", (error, stdout, stderr) => {
				console.log('Pianobar stopped.');
				checkPianobar().then(() => resolve());
			});
		}
	});
}

function startupPianobar() {
	return new Promise((resolve, reject) => {
		if (pianobarActive) {
			resolve();
		} else {
			console.log('Starting pianobar.');
			exec("sudo service pianobar start", (error, stdout, stderr) => {
				console.log('Pianobar started.');
				pianobarChecked = false;
				checkPianobar().then(() => resolve());
			});
		}
	});
}

function readPianobarInfo() {
	if (!pianobarActive) return; //ignore updates when it not active, e.g. when shutting off
	if (!fs.existsSync(PIANOBAR_NOWPLAYING)) return;
	let pianobarNowPlaying = loadIniFile.sync(PIANOBAR_NOWPLAYING);
	console.log(`CURRENT SONG: ${pianobarNowPlaying.artist} - ${pianobarNowPlaying.title} on ${pianobarNowPlaying.album} on ${pianobarNowPlaying.stationName}`);
	let songDuration = parseInt(pianobarNowPlaying.songDuration)*1000; //convert to milliseconds
	PLAYER_DATA.artist = pianobarNowPlaying.artist;
	PLAYER_DATA.title = pianobarNowPlaying.title;
	PLAYER_DATA.album = pianobarNowPlaying.album;
	PLAYER_DATA.songStartTime = fs.statSync(PIANOBAR_NOWPLAYING).mtime;
	PLAYER_DATA.songEndTime = new Date(PLAYER_DATA.songStartTime.getTime()+songDuration);
	PLAYER_DATA.year = null;
	PLAYER_DATA.bitrate = null;
	PLAYER_DATA.samplerate = null;
	PLAYER_DATA.category = pianobarNowPlaying.stationName;
	playerShowCounter = 0;
	//console.log(pianobarNowPlaying);
	if (pianobarNowPlaying.coverArt) {
		Jimp.read(pianobarNowPlaying.coverArt, (err, image) => {
			if (err) { console.log(err); PLAYER_DATA.image = null; }
			else {
				image.scaleToFit(CANVAS_HEIGHT, Jimp.AUTO, Jimp.RESIZE_BEZIER)
				PLAYER_DATA.image = image;
			}
			updatePlayerUI(false, false);
		});
	} else updatePlayerUI(false, false);
}

// Player UI 

let ready = true;
let HUDvisible = false;

const PLAYER_DATA = {
	artist : null,
	title : null,
	songStartTime : null,
	songEndTime : null   
};

const CANVAS_WIDTH = 150;
const CANVAS_HEIGHT = 105;
const CANVAS_BLOCK_HEIGHT = 5;

const canvas1 = new Jimp(CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000FF);
const canvas2 = new Jimp(CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000FF);
const canvasHUD = new Jimp(CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000FF);

const blockdatasize = 2 + (CANVAS_BLOCK_HEIGHT * CANVAS_BLOCK_HEIGHT * 2);
let blockbuffer = Buffer.alloc(2 /* <> */ + 2 /* command + size */ + blockdatasize /* block data */);
blockbuffer[0 /*begin*/] = 60 /*<*/; blockbuffer[blockbuffer.length-1 /*end*/] = 62 /*>*/;
blockbuffer[1 /*command*/] = 68 /*D*/; blockbuffer[2 /*payloadsize*/] = blockdatasize;

blockbuffer[3 /*x*/] = 0;
blockbuffer[4 /*y*/] = 0;

let pixelToCheck = 0;

function loadWhiteFont() { 
	return Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
}

function loadBlackFont() { 
	return Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
}

function convertRGB888toRGB565(r, g, b) 
{
	r = (r * 249 + 1014) >> 11;
	g = (g * 253 + 505) >> 10;
	b = (b * 249 + 1014) >> 11;
	let RGB565 = 0;
	RGB565 = RGB565 | (r << 11);
	RGB565 = RGB565 | (g << 5);
	RGB565 = RGB565 | b;
	return RGB565;
}

function clearCanvas(image, red, green, blue) {
	image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
		this.bitmap.data[idx + 0] = red;
		this.bitmap.data[idx + 1] = green;
		this.bitmap.data[idx + 2] = blue;
	});
}

let prev_artist = null;
let prev_title = null;
let playerShowCounter = 0;
let menuSelected = 0;

function updateHUD() {
	return new Promise((resolve, reject) => {
		loadWhiteFont()
			.then((whiteFont) => {
				canvasHUD.scan(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, function(x, y, idx) { this.bitmap.data[idx] = 128; this.bitmap.data[idx+1] = 128;  this.bitmap.data[idx+2] = 128; this.bitmap.data[idx+3] = (x < 10 || x > 75 || y < 10 || y > 58 ? 0 : 255);});
				if (pianobarActive) {
					canvasHUD.print(whiteFont, 10, 10, "Skip" + (menuSelected == 0 ? " <" : ""));
					canvasHUD.print(whiteFont, 10, 23, "Close" + (menuSelected == 1 ? " <" : ""));
					canvasHUD.print(whiteFont, 10, 36, "Stop" + (menuSelected == 2 ? " <" : ""));
				}
				if (shairportActive) {
					canvasHUD.print(whiteFont, 10, 10, "Skip" + (menuSelected == 0 ? " <" : ""));
					canvasHUD.print(whiteFont, 10, 23, "Close" + (menuSelected == 1 ? " <" : ""));
					canvasHUD.print(whiteFont, 10, 36, "Restart" + (menuSelected == 2 ? " <" : ""));
				}
				console.log("HUD updated.");
				resolve();
			});
	});
}

async function UIprintRightAndBackground(text, font, textTop, bg, bgR, bgG, bgB) { //print text right when larger than screen then force left & optional background
	let textHeight = Jimp.measureTextHeight(font, text, CANVAS_WIDTH);
	let textWidth = Jimp.measureText(font, text);
	let textLeft = Math.max(CANVAS_WIDTH-textWidth, 0);
	if (bg) await canvas1.scan(textLeft-1, textTop-1, textWidth+2, textHeight+2, function(x, y, idx) { this.bitmap.data[idx] = bgR; this.bitmap.data[idx+1] = bgG; this.bitmap.data[idx+2] = bgB; });
	await canvas1.print(font, textLeft, textTop, text);
	return textHeight;
}

function UIprintImage(path, x, y) {
	return new Promise((resolve) => {
		Jimp.read(path, (err, lenna) => {
		  if (err) throw err;
		  canvas1.composite(lenna, x, y); 
		  resolve();
		});
	});
}

async function UIrenderInfo(playtime) { //render song time & year & bitrate & samplerate & category
	let whiteFont = await loadWhiteFont();
	let textHeightTop = 0;
	let totalTime;
	if (playtime > 0) {
		let seconds = Math.floor(playtime % 60.0).toString();
		if (seconds.length < 2) seconds = "0" + seconds;
		totalTime =  Math.floor(playtime / 60.0).toString() + ":"+ seconds;
	} else totalTime = "Live"
	textHeightTop += await UIprintRightAndBackground(totalTime, whiteFont, textHeightTop, false);
	textHeightTop += 2;
	if (PLAYER_DATA.year) {
		textHeightTop += await UIprintRightAndBackground(PLAYER_DATA.year.toString(), whiteFont, textHeightTop, false);
		textHeightTop += 2;
	}
	if (PLAYER_DATA.bitrate && PLAYER_DATA.bitrate > 0) {
		textHeightTop += await UIprintRightAndBackground(PLAYER_DATA.bitrate.toString(), whiteFont, textHeightTop, false);
		await UIprintImage(HOME+"/kbps.png", CANVAS_WIDTH-27/*icon width-3*/, textHeightTop-6/*icon height-8*/);
		textHeightTop += 4;
	}
	if (PLAYER_DATA.samplerate && PLAYER_DATA.samplerate > 0) {
		textHeightTop += await UIprintRightAndBackground(PLAYER_DATA.samplerate.toString(), whiteFont, textHeightTop, false);
		await UIprintImage(HOME+"/khz.png", CANVAS_WIDTH-22/*icon width-1*/, textHeightTop-5/*icon height-6*/);
	}
	if (PLAYER_DATA.category) await UIprintRightAndBackground(PLAYER_DATA.category, whiteFont, CANVAS_HEIGHT-19, true, 0, 0, 0);
}

async function UIrenderPositionbars(playtime) { //render red bars for position
	let current = Math.floor((new Date().getTime() - PLAYER_DATA.songStartTime.getTime()) / 1000);
	let length = Math.floor(current * (CANVAS_HEIGHT+CANVAS_WIDTH) / playtime);
	await canvas1.scan(0, 0, 2, Math.min(length, CANVAS_HEIGHT), function(x, y, idx) { this.bitmap.data[idx] = 255; this.bitmap.data[idx+1] = 0;  this.bitmap.data[idx+2] = 0; });
	length -= CANVAS_HEIGHT;
	await canvas1.scan(0, CANVAS_HEIGHT-2, Math.min(length, CANVAS_WIDTH), 2, function(x, y, idx) { this.bitmap.data[idx] = 255; this.bitmap.data[idx+1] = 0; this.bitmap.data[idx+2] = 0; });
}

async function updatePlayerUI(onlyPosition, onlyHUD) {
	if (!onlyPosition && !onlyHUD) await clearCanvas(canvas1, 0, 0, 0);
	if (PLAYER_DATA.songStartTime) {
		if (!onlyPosition && !onlyHUD) {
			if (PLAYER_DATA.image) await canvas1.composite(PLAYER_DATA.image, 0, 0);
			else if (shairportActive) await UIprintImage(HOME+"/airplay.png", (CANVAS_WIDTH/2)-25/*icon width/2*/, (CANVAS_HEIGHT/2)-25/*icon height/2*/);
		}
		let playtime = (PLAYER_DATA.songEndTime ? Math.floor((PLAYER_DATA.songEndTime.getTime() - PLAYER_DATA.songStartTime.getTime()) / 1000) : 0 /*inifinite / live*/);
		if (playtime > 0) await UIrenderPositionbars(playtime);
		if (!onlyPosition) await UIrenderInfo(playtime);
	}
	if ((!onlyPosition || onlyHUD) && HUDvisible) await canvas1.composite(canvasHUD, 0, 0);
	pixelToCheck = 0;
	sendUIUpdates();
}

let readyTimeout = null;

function forceReadyUI() {
	console.log('UI update forced (time-out).');
	ready = true; //force ready
	sendUIUpdates(); //try again
}

function sendUIUpdates() {
	if (!ready) return;
	ready = false;
	let different = false;
	//scan image and determine changes
	let s = pixelToCheck;
	pixelToCheck++;
	if (pixelToCheck > CANVAS_WIDTH*CANVAS_HEIGHT) pixelToCheck = 0;
	let i = s*4; //4 bytes per pixel in data
	let y = Math.floor(s / CANVAS_WIDTH); //line to scan based on pixel
	let x = s - (y * CANVAS_WIDTH); //pixel on line
	while (i < CANVAS_WIDTH*CANVAS_HEIGHT*4) { //from selected pixel to end
		if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
			i++;
			if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
				i++;
				if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
					i+=2;
				} else { different = true; break; }
			} else { different = true; break; }
		} else { different = true; break; };
		if (x < CANVAS_WIDTH-1) x++; else { x = 0; y++; };
	}
	if (!different) { //no differences found from selected pixel to end
		i = 0; y = 0; x = 0;
		while (i < s*4) { //from beginning to selected pixel
			if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
				i++;
				if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
					i++;
					if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
						i+=2;
					} else { different = true; break; }
				} else { different = true; break; }
			} else { different = true; break; };
			if (x < CANVAS_WIDTH-1) x++; else { x = 0; y++; };
		}
	}
	if (!different) {
		ready = true;
		/* console.log("UI updated.");*/
		return;
	}
	//send one block
	let blockx = Math.floor(x / CANVAS_BLOCK_HEIGHT);
	let blocky = Math.floor(y / CANVAS_BLOCK_HEIGHT);
	blockbuffer[3 /*x*/] = blockx;
	blockbuffer[4 /*y*/] = blocky;
	let j = ((blocky*CANVAS_WIDTH*CANVAS_BLOCK_HEIGHT)+(blockx*CANVAS_BLOCK_HEIGHT))*4;
	let g = 0;
	for (i = 5; i < blockbuffer.length-1; i+=2) {
		let RGB565 = convertRGB888toRGB565(canvas1.bitmap.data[j],canvas1.bitmap.data[j+1],canvas1.bitmap.data[j+2]); //get color and convert
		canvas2.bitmap.data[j] = canvas1.bitmap.data[j]; canvas2.bitmap.data[j+1] = canvas1.bitmap.data[j+1]; canvas2.bitmap.data[j+2] = canvas1.bitmap.data[j+2]; //copy to canvas2
		blockbuffer[i]= (RGB565 >> 8);
		blockbuffer[i+1]  = RGB565 & 0xFF;
		j+=4; g++;
		if (g == CANVAS_BLOCK_HEIGHT) {
			j += (CANVAS_WIDTH-CANVAS_BLOCK_HEIGHT)*4; //next rows index at the left hand side of the (square) block
			g = 0;
		}
	}
	serialSend(blockbuffer, () => { });
	readyTimeout = setTimeout(forceReadyUI, 10000); //in case confirmation via ready message does not come in 10 seconds
}

let last_current = -1;
let prev_info = null; let prev_artist_info = null; let prev_title_info = null; let prev_album_info = null;

function checkPlayerInfo() {
	if (PLAYER_DATA.songStartTime) {
		let length = (PLAYER_DATA.songEndTime ? Math.floor((PLAYER_DATA.songEndTime.getTime() - PLAYER_DATA.songStartTime.getTime()) / 1000) : 0);
		let current = Math.floor((new Date().getTime() - PLAYER_DATA.songStartTime.getTime()) / 1000);
		if (current != last_current && current > 5 && current % 5 == 0) { //after 5 secs every 5 sec
			updatePlayerUI(true, false);
			current = last_current;
		} else {
			if (playerShowCounter < 6) { /*do nothing*/ }
			else if (playerShowCounter > 33) 
				playerShowCounter = 0
			else if (playerShowCounter < 15) {
				if (prev_title_info !== PLAYER_DATA.title || prev_info !== PLAYER_DATA.title) {
					if (PLAYER_DATA.title && PLAYER_DATA.title.length > 0) { serialSendStatus(PLAYER_DATA.title); prev_info = PLAYER_DATA.title; }
					prev_title_info = PLAYER_DATA.title;
				}
			} else if (playerShowCounter < 24) {
				if (prev_artist_info !== PLAYER_DATA.artist || prev_info !== PLAYER_DATA.artist) {
					if (PLAYER_DATA.artist && PLAYER_DATA.artist.length > 0) { serialSendStatus(PLAYER_DATA.artist);  prev_info = PLAYER_DATA.artist; }
					prev_artist_info = PLAYER_DATA.artist;
				}
			} else if (playerShowCounter < 33) {
				if (prev_album_info !== PLAYER_DATA.album || prev_info !== PLAYER_DATA.album) {
					if (PLAYER_DATA.album && PLAYER_DATA.album.length > 0) { serialSendStatus(PLAYER_DATA.album); prev_info = PLAYER_DATA.album; }
					prev_album_info = PLAYER_DATA.album;
				}
			}
			playerShowCounter++;
		}
	}
}
setInterval(checkPlayerInfo, 1000);

// Serial Management

let serial0 = new SerialPort('/dev/serial0', { baudRate: 115200 });

serial0.on('open', serialPortOpen);
serial0.on('close', serialPortClose);
serial0.on('error', serialError);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function serialPortOpen() {
	console.log('port open. Data rate: ' + serial0.baudRate);
	sleep(1500).then(unblock())
		   .then(powerOnConfirm())
		   .then(hidePlayer())
		   .then(() => checkStatusses());
}

function serialPortClose() { console.log('serial port closed.'); }

function serialError(error) { console.log('Serial port error: ' + error); }

let serialParser = serial0.pipe(new ByteLength({length: 1}))
serialParser.on('data', serialReceiveByte) // will have 1 byte per data event

const PPP_T_POWER_OFF_REQUEST = 0x70; //p   <p>
const PPP_PANDORA_MUSIC       = 0x4E; //N   <N>
const PPP_T_READY             = 0x79; //y   <y>
const PPP_T_CLICKED           = 0x4B; //K   <K>
const PPP_T_TURNED_UP         = 0x54; //T   <T>
const PPP_T_TURNED_DOWN       = 0x74; //t   <t>

function processReceiveBuffer() {
	switch (receiveBuffer[PPP_NDX_COMMAND]) {  //first byte to be expected signal/command type - second (depending on the command) is the size in bytes of the payload
	case PPP_T_POWER_OFF_REQUEST: /*Power Off command sent by Raspberry Pi and we need to shut down! */ 
		serialSend(Buffer.from('<p>', 'ascii'), () => {
			setInterval(function() {
				powerOff();
			}, 2000);
		});
		break;
	case PPP_PANDORA_MUSIC:
	  console.log('Pandora Music command.');
	  block()
		.then(shutdownShairport())
		.then(startupPianobar())
		.then(unblock())
		.then(() => { serialSendStatus("Pandora starting..."); readPianobarInfo();});
	  break;
	case PPP_T_READY:
		ready = true;
		if (readyTimeout) { clearTimeout(readyTimeout); readyTimeout = null; /* arduino confirmed it was ready */ }
		sendUIUpdates();
		break;
	case PPP_T_CLICKED:
		console.log("Clicked.");
		if (!HUDvisible) {
			console.log("Show HUD");
			menuSelected = 0;
			HUDvisible = true;
			updateHUD()
				.then(() => updatePlayerUI(false, true));
		} else {
			let exiting = false;
			if (pianobarActive) {
				if (menuSelected == 0) {
					const fw = fs.openSync(PIANOBAR_CTL, 'w') // blocked until a reader attached
					fs.writeSync(fw, 'n')
					fs.closeSync(fw);
					serialSendStatus("* next");
					HUDvisible = false;
				} else if (menuSelected == 1) {
					console.log("Hide HUD.");
					HUDvisible = false;
				} else if (menuSelected == 2) {
					HUDvisible = false; PLAYER_DATA.songStartTime = null; exiting = true;
					shutdownPianobar()
						.then(hidePlayer())
						.then(startupShairport())
						.then(() => console.log("Pianobar stopped."));
				}
			}
			if (shairportActive) {
				if (menuSelected == 0) {
					//not implemented
					HUDvisible = false;
				} else if (menuSelected == 1) {
					console.log("Hide HUD.");
					HUDvisible = false;
				} else if (menuSelected == 2) {
					HUDvisible = false; PLAYER_DATA.songStartTime = null; exiting = true;
					restartShairport()
						.then(hidePlayer())
						.then(() => console.log("Shairport restarted.")); //hidden until we connect again
				}
			}
			if (!exiting) updatePlayerUI(false, false /*as hiding needs complete rerender*/);
		}
		break;
	case PPP_T_TURNED_UP:
		console.log("Turned Up.");
		if (HUDvisible) {
			let count=0;
			if (pianobarActive) count = 3;
			if (shairportActive) count = 3;
			menuSelected--; if (menuSelected == -1) menuSelected = count-1;
			updateHUD().then(() => updatePlayerUI(false, true /*as hiding needs rerender of HUD only*/));
		}
		break;
	case PPP_T_TURNED_DOWN:
		console.log("Turned Down.");
		if (HUDvisible) {
			let count=0;
			if (pianobarActive) count = 3;
			if (shairportActive) count = 3;
			menuSelected++; if (menuSelected == count) menuSelected = 0;
			updateHUD().then(() => updatePlayerUI(false, true /*as hiding needs rerender of HUD only*/));
		}
		break;
	default:
		console.log("Command " + receiveBuffer[PPP_NDX_COMMAND] + " NOT IMPLEMENTED\n");
		break;
	}
}
