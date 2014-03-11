// Scribe: A Web Speech API wrapper
// Reference: https://dvcs.w3.org/hg/speech-api/raw-file/tip/speechapi.html
//            https://github.com/TalAter/annyang
(function (undefined) {
    "use strict";

    // Save a reference to the global object (window in the browser)
    var root = this;

    var speechRecognition = root.SpeechRecognition ||
        root.webkitSpeechRecognition ||
        root.mozSpeechRecognition ||
        root.msSpeechRecognition ||
        root.oSpeechRecognition;

    // Check feature support 
    if (!speechRecognition) {
        root.scribe = null;
        return undefined;
    }

    // Set the defaults
    var isSSL = (location.protocol=='https') ? true : false;
    var lastTranscriptIndex = 0;
    var lastTranscript = '';
    var interimTranscript = '';
    var interimTranscriptConfidence = 0;
    var lastTranscriptConfidence = 0;
    var lastStartedAt = 0;
    var callbacks = {
        permissonPrompt: [],
        abort: [],
        start: [],
        onStart: [],
        onError: [],
        onEnd: [],
        onResult: [],
        onInterimResult: [],
        resultMatch: [],
        resultNoMatch: [],
        errorNoSpeech: [],
        errorAborted: [],
        errorAudioCapture: [],
        errorNetwork: [],
        errorPermissionBlocked: [],
        errorPermissionDenied: [],
        errorBadGrammer: []
    };
    var ignoreOnend = false;
    var startTimestamp;
    var recognition;

    var debugEnabled = true;
    var autoRestart = true;
    var recognitionContinuous = true;
    var recognitionInterimResults = true;
    var returnInterimResults = false;
    var recognitionMaxAlternatives = 2;
    var recognitionLang = 'en-GB';

    var isInitialized = function () {
        return recognition !== undefined;
    };

    // invoke the array of callbacks
    var invokeCallbacks = function (callbacks, params) {
        callbacks.forEach(function (callback) {
            callback.callback.apply(callback.context, [params]);
        });
    };

    var initIfNeeded = function () {
        if (!isInitialized()) {
            root.scribe.init({}, false);
        }
    };

    var outputDebug = function (message) {
        console.log("Debug: " + message);
    }

    root.scribe = {

        // Initialize scribe
        init: function () {

            invokeCallbacks(callbacks.permissonPrompt);
            if (debugEnabled) {
                outputDebug("permissonPrompt");
            }
            
            if (debugEnabled) {
                outputDebug("Init: Please allow microphone access.");
            }

            // Kill existing instance of recognition
            if (recognition && recognition.abort) {
                recognition.abort();
            }

            // initiate SpeechRecognition and set values
            recognition = new speechRecognition();
            recognition.maxAlternatives = recognitionMaxAlternatives;
            recognition.interimResults = recognitionInterimResults;
            recognition.continuous = recognitionContinuous;
            recognition.lang = recognitionLang;

            recognition.onstart = function (event) {
                invokeCallbacks(callbacks.onStart);
                if (debugEnabled) {
                    outputDebug("onstart");
                }
            };

            recognition.onerror = function (event) {
                invokeCallbacks(callbacks.onError);

                // https://dvcs.w3.org/hg/speech-api/raw-file/tip/speechapi.html#speechreco-error

                switch (event.error) {
                case 'no-speech':
                    invokeCallbacks(callbacks.errorNoSpeech);
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: no-speech");
                    }
                    break;
                case 'aborted':
                    invokeCallbacks(callbacks.errorAborted);
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: aborted");
                    }
                    break;
                case 'audio-capture':
                    invokeCallbacks(callbacks.errorAudioCapture);
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: audio-capture");
                    }
                    break;
                case 'network':
                    invokeCallbacks(callbacks.errorNetwork);
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: network");
                    }
                    break;
                case 'not-allowed':
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: not-allowed");
                    }
                case 'service-not-allowed':
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: service-not-allowed");
                    }
                    // if permission to use the mic is denied, turn off auto-restart
                    autoRestart = false;
                    // determine if permission was denied by user or automatically.
                    if (new Date().getTime() - lastStartedAt < 200) {
                        invokeCallbacks(callbacks.errorPermissionBlocked);
                    } else {
                        invokeCallbacks(callbacks.errorPermissionDenied);
                    }
                    break;
                case 'bad-grammar':
                    invokeCallbacks(callbacks.errorBadGrammer);
                    // debug message
                    if (debugEnabled) {
                        outputDebug("error: bad-grammar");
                    }
                    break;
                }
            };

            recognition.onend = function () {
                invokeCallbacks(callbacks.onEnd);
                // debug message
                if (debugEnabled) {
                    outputDebug("onend");
                }
                // auto restart if it is closed automatically and not by user action.
                if (autoRestart) {
                    // non SSL requires user to allow permissions again
                    if(!isSSL){
                        invokeCallbacks(callbacks.permissonPrompt);
                        if (debugEnabled) {
                            outputDebug("permissonPrompt");
                        }
                    }
                    // debug message
                    if (debugEnabled) {
                        outputDebug("Trying to automagically restart");
                    }
                    // restart automagically no faster than once a second
                    var timeSinceLastStart = new Date().getTime() - lastStartedAt;
                    if (timeSinceLastStart < 1000) {
                        setTimeout(root.scribe.start, 1000 - timeSinceLastStart);
                    } else {
                        root.scribe.start();
                    }
                }
            };


            recognition.onresult = function (event) {
                invokeCallbacks(callbacks.onResult);
                // debug message
                if (debugEnabled) {
                    outputDebug("onresult");
                }

                // check we have a final result
                if (event.results[event.results.length - 1].isFinal == false) {
                    interimTranscript = event.results[event.results.length - 1][0].transcript.trim();
                    interimTranscriptConfidence = event.results[event.results.length - 1][0].confidence;
                    
                    invokeCallbacks(callbacks.onInterimResult);
                    
                    // debug message
                    if (debugEnabled) {
                        outputDebug("Processing speech.");

                        outputDebug("Interim: " + interimTranscript + " (" +
                            Math.round(interimTranscriptConfidence * 100) +
                            "% confidence)."
                        );
                    }
                    if (returnInterimResults) {
                        invokeCallbacks(callbacks.resultMatch, interimTranscript);
                        recognition.abort();
                    }
                } else {
                    lastTranscript = event.results[event.results.length - 1][0].transcript.trim();
                    lastTranscriptConfidence = event.results[event.results.length - 1][0].confidence;
                    // debug message
                    if (debugEnabled) {
                        outputDebug(lastTranscript + " (" +
                            Math.round(lastTranscriptConfidence * 100) +
                            "% confidence)."
                        );
                    }
                    invokeCallbacks(callbacks.resultMatch, lastTranscript);
                    //lastTranscriptIndex +=1;
                }
            };
        },

        // Start listening (asking for permission first, if needed).
        start: function () {
            invokeCallbacks(callbacks.start);
            initIfNeeded();
            lastStartedAt = new Date().getTime();
            recognition.start();
        },

        // abort the listening session
        abort: function () {
            invokeCallbacks(callbacks.abort);
            autoRestart = false;
            if (isInitialized) {
                recognition.abort();
            }
        },

        // Set the language the user will speak in, default 'en-GB'.
        setLanguage: function (language) {
            recognitionLang = language;
        },

        // Set the debug mode
        enableDebug: function (val) {
            debugEnabled = val;
        },

        // Set enable the interim results
        enableInterimResult: function (val) {
            recognitionInterimResults = val;
        },

        // Set enable the return of interim results
        enableInterimResultReturn: function (val) {
            returnInterimResults = val;
        },

        // Lets the user add a callback (see callbacks at the top for a full list)
        // Context for the callback function as the third argument
        addCallback: function (type, callback, context) {
            if (callbacks[type] === undefined) {
                return;
            }
            var cb = root[callback] || callback;
            if (typeof cb !== 'function') {
                return;
            }
            callbacks[type].push({
                callback: cb,
                context: context || this
            });
        }

    };

}).call(this);