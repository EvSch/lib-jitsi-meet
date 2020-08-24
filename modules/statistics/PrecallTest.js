import EventEmitter from 'events';

import browser from '../browser';
import Settings from '../settings/Settings';
import ScriptUtil from '../util/ScriptUtil';

import { CALLSTATS_SCRIPT_URL } from './constants';

const PRECALL_TEST_RESULTS = 'preCallTestResults';
const emitter = new EventEmitter();
let _initialized = false;
let api = null;
let finalResults = null;

/**
 * Loads the callstats io script.
 *
 * @returns {Promise<void>}
 */
function _loadScript() {
    if (browser.isReactNative()) {
        return;
    }

    return new Promise(resolve => {
        ScriptUtil.loadScript(
            CALLSTATS_SCRIPT_URL,
            /* async */ true,
            /* prepend */ true,
            /* relativeURL */ undefined,
            /* loadCallback */ resolve);
    });
}

/**
 * Initializes the callstats lib and registers a callback to be invoked
 * when there are 'preCallTestResults'.
 *
 * @typedef PrecallTestOptions
 * @type {Object}
 * @property {string} callStatsID - Callstats credentials - the id.
 * @property {string} callStatsSecret - Callstats credentials - the secret.
 * @property {string} statisticsId - The user name to use when initializing callstats.
 * @property {string} statisticsDisplayName - The user display name.
 *
 * @param { PrecallTestOptions} options - The init options.
 * @returns {Promise<void>}
 */
function _initialize(options) {
    console.log("We are initializing!");
    return new Promise((resolve, reject) => {
        if (!options.disableThirdPartyRequests) {
            const appId = options.callStatsID;
            const appSecret = options.callStatsSecret;
            const userId = options.statisticsId || options.statisticsDisplayName || Settings.callStatsUserName;
            console.log("Did we get here?");
            reject({status: 'error', message: 'ERROR!'});
            /*api.initialize(appId, appSecret, userId, (status, message) => {
                if (status === 'success') {
                    api.on(PRECALL_TEST_RESULTS, (...args) => {
                        emitter.emit(PRECALL_TEST_RESULTS, ...args);
                    });
                    _initialized = true;
                    resolve();
                } else {
                    reject({
                        status,
                        message
                    });
                }
            }, null, { disablePrecalltest: true });*/
        }
    });
}

const UDP = "udp";
const TCP = "tcp";
const TLS = "tls";
const THROUGHPUT_TEST_DURATION_MS = 1000;
const AVERAGE_BITRATE_THRESHOLD = 1000; //In kbps
const RTT_THRESHOLD = 300; // In milliseconds
const VIDEO_TEST_DURATION_MS = 1000;
const PACKET_LOSS_THRESHOLD = 4; //In %

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' },
{ urls: 'stun:stun1.l.google.com:19302' },
{ urls: 'stun:stun2.l.google.com:19302' },
{urls: ['turn:numb.viagenie.ca'], username: 'alex@belouga.org', credential: 'Zaralex7'}];
/**
 * Loads the callstats script and initializes the library.
 *
 * @param {Function} onResult - The callback to be invoked when results are received.
 * @returns {Promise<void>}
 */
export async function init(options) {
    console.log("Initializing...");
    if (_initialized) {
        throw new Error('Precall Test already initialized');
    }
    _initialized = true;

    const test = checkInternet();
    const test2 = NetworkTest(UDP);
    if (!test2) {
      const test3 = NetworkTest(TCP);
    }
    const test4 = await ThroughputTest();
    const test5 = await VideoBandwidthTest();
    finalResults = {mediaConnectivity: true, rtt: test5.rtt, fractionalLoss: test5.loss, throughput: test4};
    // eslint-disable-next-line new-cap
    //api = new window.callstats();

    return;
}


function checkInternet() {
  if (iceServers.length < 1) {
		console.error("Please add TURN/STUN urls in config to continue tests.");
		return false; //Abort Tests
	}
	var config = { iceServers: iceServers };
	var pc;
	pc = new RTCPeerConnection(config);

	// In our candidate callback, stop if we get a candidate that passes
	// |isNotHostCandidate|.
	pc.onicegatheringstatechange = function(e) {
		var connection = e.target;
		switch (connection.iceGatheringState) {
			case "gathering":
				console.log("Gathering ICE Candidates Started");
				break;
			case "complete":
				console.log("Finished Gathering ICE Candidates");
				endCall(pc);
				console.error("No Internet Connectivity. Aborting Tests.");
				return false;
				break;
		}
	};
	pc.addEventListener("icecandidate", function(e) {
		if (e.candidate) {
			var parsed = parseCandidate(e.candidate.candidate);
			if (isNotHostCandidate(parsed)) {
				endCall(pc);
				console.info("Internet Available.");
				return true;
			}
		}
	});
	createAudioOnlyReceiveOffer(pc);
}

function createAudioOnlyReceiveOffer(pc) {
	var createOfferParams = { offerToReceiveAudio: 1 };
	pc.createOffer(createOfferParams).then(function(offer) {
		pc.setLocalDescription(offer).then(emptyFunction, emptyFunction);
	}, emptyFunction);

	// Empty function for callbacks requiring a function.
	function emptyFunction() {}
}

function parseCandidate(text) {
	var candidateStr = "candidate:";
	var pos = text.indexOf(candidateStr) + candidateStr.length;
	var fields = text.substr(pos).split(" ");
	return {
		type: fields[7],
		protocol: fields[2],
		address: fields[4]
	};
}

function isRelay(candidate) {
	return candidate.type === "relay";
}

function isNotHostCandidate(candidate) {
	return candidate.type !== "host";
}

function establishConnection(pc1, pc2) {
	var createOfferParams = { offerToReceiveAudio: 1 };
	pc1.createOffer(createOfferParams).then(function(offer) {
		pc1.setLocalDescription(offer);
		pc2.setRemoteDescription(offer);
		pc2.createAnswer().then(function(answer) {
			pc2.setLocalDescription(answer);
			pc1.setRemoteDescription(answer);
		}, emptyFunction);
	}, emptyFunction);

	// Empty function for callbacks requiring a function.
	function emptyFunction() {}
}

function onIceCandidate_(pc, e) {
	if (e.candidate) {
		var parsed = parseCandidate(e.candidate.candidate);
		if (isRelay(parsed)) {
			turnIpAddr = parsed.address;
			pc.addIceCandidate(e.candidate);
		}
	}
}

function endCall(pc1, pc2, localStream) {
	if (pc1) {
		pc1.close();
		pc1 = null;
	}
	if (pc2) {
		pc2.close();
		pc2 = null;
	}
	if (localStream) {
		localStream.getTracks().forEach(track => track.stop());
		localStream = null;
	}
}

let turnIpAddr;
function NetworkTest(protocol) {
	switch (protocol) {
		case UDP:
		case TCP:
			var newIceServers = filterConfig(iceServers, protocol);
			break;
		case TLS:
			var newIceServers = filterTLSConfig(iceServers, protocol);
			break;
	}

	if (newIceServers.length > 0) {
		var config = { iceServers: newIceServers };
		var startTime = Date.now();
		var pc1 = new RTCPeerConnection(config);
		var pc2 = new RTCPeerConnection(config);
		pc1.addEventListener("icecandidate", onIceCandidate_.bind(this, pc2));
		pc2.addEventListener("icecandidate", onIceCandidate_.bind(this, pc1));

		var dataChannel = pc1.createDataChannel(null);
		var timeout = void 0;

		function success() {
			var elapsed = Date.now() - startTime;
			clearTimeout(timeout);
			console.info(
				"Successfully established a " +
					protocol +
					" connection to " +
					turnIpAddr +
					" in " +
					elapsed +
					"ms"
			);
			endCall(pc1, pc2);
			return true;
		}

		timeout = setTimeout(function() {
			dataChannel.removeEventListener("open", success);
			console.error(
				"Could not establish a " +
					protocol +
					" connection to " +
					turnIpAddr +
					" within 5 seconds"
			);
			endCall(pc1, pc2);
			return false;
		}, 5000);

		dataChannel.addEventListener("open", success);
		establishConnection(pc1, pc2);
    return true;
	} else {
		return false;
	}
}

function filterConfig(iceServers, protocol) {
	var transport = "transport=" + protocol;
	var newIceServers = [];
	for (var i = 0; i < iceServers.length; ++i) {
		var iceServer = Object.assign({}, iceServers[i]);
		var newUrls = [];
		for (var j = 0; j < iceServer.urls.length; ++j) {
			var uri = iceServer.urls[j];
			if (uri.indexOf(transport) !== -1) {
				newUrls.push(uri);
			} else if (
				uri.indexOf("?transport=") === -1 &&
				uri.startsWith("turn")
			) {
				newUrls.push(uri + "?" + transport);
			}
		}
		if (newUrls.length !== 0) {
			iceServer.urls = newUrls;
			newIceServers.push(iceServer);
		}
	}
	return newIceServers;
}

function filterTLSConfig(iceServers) {
	var newIceServers = [];
	for (var i = 0; i < iceServers.length; ++i) {
		var iceServer = Object.assign({}, iceServers[i]);
		iceServer.urls = iceServer.urls.filter(function(url) {
			return /443/.test(url);
		});
		iceServer.urls = iceServer.urls.map(function(url) {
			return url.replace("turn:", "turns:");
		});
		if (iceServer.urls.length > 0) {
			newIceServers.push(iceServer);
		}
	}
	if (newIceServers.length === 0) {
		console.error("No TLS TURN urls specified. TLS Not Supported");
	}
	return newIceServers;
}

/* TURN UDP-TCP-TLS Connectivity Test Code End */

function ThroughputTest() {
  return new Promise((resolve, reject) => {
    var config = { iceServers: iceServers };
  	var startTime = null;
  	var sentPayloadBytes = 0;
  	var receivedPayloadBytes = 0;
  	var stopSending = false;
  	var samplePacket = "";
  	for (var i = 0; i !== 1024; ++i) {
  		samplePacket += "h";
  	}

  	var maxNumberOfPacketsToSend = 100;
  	var bytesToKeepBuffered = 1024 * maxNumberOfPacketsToSend;
  	var lastBitrateMeasureTime;
  	var lastReceivedPayloadBytes = 0;

  	var pc1 = new RTCPeerConnection(config);
  	var pc2 = new RTCPeerConnection(config);
  	pc1.addEventListener("icecandidate", onIceCandidate_.bind(this, pc2));
  	pc2.addEventListener("icecandidate", onIceCandidate_.bind(this, pc1));
  	var senderChannel = pc1.createDataChannel(null);
  	var receiveChannel = null;

  	var connStartTime = Date.now();
  	var timeout = setTimeout(function() {
  		senderChannel.removeEventListener("open", sendingStep);
  		console.error(
  			"Could not establish a connection to " +
  				turnIpAddr +
  				" within 5 seconds"
  		);
  		endCall(pc1, pc2);
  		return false;
  	}, 5000);

  	senderChannel.addEventListener("open", sendingStep);
  	pc2.addEventListener("datachannel", onReceiverChannel);
  	establishConnection(pc1, pc2);

  	function onReceiverChannel(event) {
  		receiveChannel = event.channel;
  		receiveChannel.addEventListener("message", onMessageReceived);
  	}

  	function sendingStep() {
  		var now = new Date();
  		if (!startTime) {
  			var elapsed = Date.now() - connStartTime;
  			clearTimeout(timeout);
  			console.log(
  				"Successfully established a connection to " +
  					turnIpAddr +
  					" in " +
  					elapsed +
  					"ms"
  			);

  			startTime = now;
  			lastBitrateMeasureTime = now;
  		}
  		for (var j = 0; j !== maxNumberOfPacketsToSend; ++j) {
  			if (senderChannel.bufferedAmount >= bytesToKeepBuffered) {
  				break;
  			}
  			sentPayloadBytes += samplePacket.length;
  			senderChannel.send(samplePacket);
  		}
  		if (now - startTime >= THROUGHPUT_TEST_DURATION_MS) {
  			stopSending = true;
  		} else {
  			setTimeout(sendingStep, 1);
  		}
  	}

  	function onMessageReceived(event) {
  		receivedPayloadBytes += event.data.length;
  		var now = new Date();
  		if (now - lastBitrateMeasureTime >= 1000) {
  			var bitrate =
  				(receivedPayloadBytes - lastReceivedPayloadBytes) /
  				(now - lastBitrateMeasureTime);
  			bitrate = Math.round(bitrate * 1000 * 8) / 1000;
  			console.log("Transmitting at " + bitrate + " kbps.");
  			lastReceivedPayloadBytes = receivedPayloadBytes;
  			lastBitrateMeasureTime = now;
  		}
  		if (stopSending && sentPayloadBytes === receivedPayloadBytes) {
  			endCall(pc1, pc2);
  			var elapsedTime = Math.round((now - startTime) * 10) / 10000.0;
  			var receivedKBits = (receivedPayloadBytes * 8) / 1000;
  			console.log(
  				"Total transmitted: " +
  					receivedKBits +
  					" kBits in " +
  					elapsedTime +
  					" seconds."
  			);
  			var bandwidth = receivedKBits / elapsedTime;
  			console.info(
  				"Average bandwidth: " + bandwidth.toFixed(2) + " kBits/sec."
  			);
        resolve(bandwidth);
  			return true;
  		}
  	}
  });
}
/* THROUGHPUT Test Code End */
function VideoBandwidthTest() {
  return new Promise((resolve, reject) => {
    var statStepMs = 100;
  	var startTime = null;
  	var pc2Stats = []; //Capture only pc2 stats which will provide required info
  	// Open the camera in 720p to get a correct measurement of ramp-up time.
  	var constraints = {
  		audio: false,
  		video: {
  			optional: [{ minWidth: 1280 }, { minHeight: 720 }]
  		}
  	};
  	var config = { iceServers: iceServers };
  	var pc1 = new RTCPeerConnection(config);
  	var pc2 = new RTCPeerConnection(config);
  	pc1.addEventListener("icecandidate", onIceCandidate_.bind(this, pc2));
  	pc2.addEventListener("icecandidate", onIceCandidate_.bind(this, pc1));
  	var localStream;
  	navigator.mediaDevices
  		.getUserMedia(constraints)
  		.then(function(stream) {
  			pc1.addStream(stream);
  			establishConnection(pc1, pc2);
  			startTime = new Date();
  			localStream = stream;
  			setTimeout(gatherStats, statStepMs);
  		})
  		.catch(function(error) {
  			console.error(
  				"Failed to get access to local media due to " +
  					"error: " +
  					error.name
  			);
  			console.error(
  				"Video Bitrate test failed. Please allow access to camera and try again!"
  			);
  			return false;
  		});

  	var progress = 0;
  	function gatherStats() {
  		var now = new Date();
  		if (now - startTime > VIDEO_TEST_DURATION_MS) {
  			endCall(pc1, pc2, localStream);
  			generateStatsReport(pc2Stats);
  			return true;
  			return;
  		} else if (pc1.connectionState === "connected") {
  			collectStats(pc2, pc2Stats);
  		}
  		var currentProgress =
  			((now - startTime) * 100) / VIDEO_TEST_DURATION_MS;
  		//Keep logging progress so that user does not get impatient
  		if (currentProgress - progress > 10) {
  			console.log("Progress: ", currentProgress);
  			progress = currentProgress;
  		}
  		setTimeout(gatherStats, statStepMs);
  	}

  	function generateStatsReport(pc2Stats) {
  		var avgBitrate = 0;
  		var packetLossPercent = 0;
  		if (pc2Stats.length > 2) {
  			//Skip RTT if its firefox WIP to make it spec compliant
        var avgRtt = getAverageRTT(pc2Stats[pc2Stats.length - 1]);
        if (avgRtt < RTT_THRESHOLD) {
          console.info("Average RTT: " + avgRtt + " ms");
        } else {
          console.warn("Average RTT: " + avgRtt +
              " ms." + " Things don't look pretty ahead!");
        }

  			avgBitrate = calculateAvgBitrate(pc2Stats);
  			var avgBitrateKbps = Math.round(avgBitrate / 1000);
  			if (avgBitrateKbps < AVERAGE_BITRATE_THRESHOLD) {
  				console.warn("Average Bitrate: ", avgBitrateKbps,
  					" kbps. ", "Bumpy ride ahead!");
  			} else {
  				console.info("Average Bitrate: ", avgBitrateKbps, " kbps");
  			}

  			var lastStat = getInboundStat(pc2Stats[pc2Stats.length - 1]);
  			var packetLossRatio =
  				lastStat.packetsLost /
  				(lastStat.packetsLost + lastStat.packetsReceived);
  			packetLossPercent = packetLossRatio * 100;
  			if (packetLossPercent > PACKET_LOSS_THRESHOLD) {
  				console.warn("Packet Loss Percent: ", packetLossPercent.toFixed(2),
  					"%. ", "Bumpy ride ahead!");
  			} else {
  				console.info("Packet Loss Percent: ",
  					packetLossPercent.toFixed(2), "%");
  			}
        resolve({rtt: avgRtt, loss: packetLossRatio});
  		} else {
  			console.warn("Not enough data to calculate video quality!");
  		}

  		function getAverageRTT(report) {
  			var averageRTT;
  			report.forEach(result => {
  				if (
  					result.type === "candidate-pair" &&
  					result.hasOwnProperty("availableOutgoingBitrate")
  				) {
  					averageRTT = Math.round(
  						(result.totalRoundTripTime * 1000) /
  							result.responsesReceived
  					);
  				}
  			});
  			return averageRTT;
  		}
  		function getInboundStat(report) {
  			var inboundStat;
  			report.forEach(element => {
  				if (element.type === "inbound-rtp") {
  					inboundStat = element;
  				}
  			});
  			return inboundStat;
  		}

  		function calculateAvgBitrate(rtcStatsArr) {
  			var statCount = 0;
  			var sumBps = 0;
  			for (var i = 1; i < rtcStatsArr.length; i += 1) {
  				var currStat = getInboundStat(rtcStatsArr[i]);
  				var prevStat = getInboundStat(rtcStatsArr[i - 1]);

  				if (currStat && prevStat) {
  					var bytesIncreased = currStat.bytesReceived
  						? currStat.bytesReceived - prevStat.bytesReceived
  						: 0;
  					var bitsIncreased = bytesIncreased * 8;
  					var msIncreased = currStat.timestamp - prevStat.timestamp;
  					var secondsElapsed = msIncreased / 1000;
  					sumBps += bitsIncreased / secondsElapsed;
  					statCount++;
  				}
  			}
  			var avgBitrate = Math.round(sumBps / statCount);
  			return avgBitrate;
  		}
  	}

  	function collectStats(pc, statsArr) {
  		pc.getStats(null)
  			.then(function(stat) {
  				statsArr.push(stat);
  			})
  			.catch(function(error) {
  				console.error("Could not gather stats: " + error);
  			});
  	}
  });
}

/**
 * Executes a pre call test.
 *
 * @typedef PrecallTestResults
 * @type {Object}
 * @property {boolean} mediaConnectivity - If there is media connectivity or not.
 * @property {number} throughput  - The average throughput.
 * @property {number} fractionalLoss - The packet loss.
 * @property {number} rtt - The round trip time.
 * @property {string} provider - It is usually 'callstats'.
 *
 * @returns {Promise<{PrecallTestResults}>}
 */
export function execute() {
    if (!_initialized) {
        return Promise.reject('uninitialized');
    }
    return finalResults;
}

export default {
    init,
    execute
};
