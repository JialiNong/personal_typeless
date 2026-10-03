/* Native click path for Talk + language. Lives in /public so Try Live
   can still use it when Next.js blocks cross-origin /_next hydration. */
(function () {
  function languageCode() {
    var current = document.querySelector("[data-lang-link][aria-current='true']");
    var id = current && current.getAttribute("data-lang-link");
    if (id === "zh") return "zh-CN";
    if (id === "en") return "en-US";
    return "";
  }

  function markLanguage(id) {
    document.querySelectorAll("[data-lang-link]").forEach(function (el) {
      var active = el.getAttribute("data-lang-link") === id;
      if (active) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
  }

  function setTalkState(button, recording) {
    button.setAttribute("aria-pressed", recording ? "true" : "false");
    button.setAttribute(
      "aria-label",
      recording ? "Stop talking" : "Start talking",
    );
    button.classList.toggle("bg-destructive", recording);
    var status = document.getElementById("talk-status");
    if (status) {
      status.textContent = recording
        ? "Listening… click the button to stop"
        : "Click to talk · click again to stop";
    }
  }

  function writeRaw(text) {
    var area = document.getElementById("raw-speech");
    if (area) area.value = text;
  }

  function showError(message) {
    var box = document.getElementById("talk-error");
    if (box) {
      box.hidden = false;
      box.textContent = message;
      return;
    }
    window.alert(message);
  }

  var recognition = null;
  var recording = false;
  var recordingStream = null;

  function stopTalk() {
    recording = false;
    if (recordingStream) {
      recordingStream.getTracks().forEach(function (track) {
        track.stop();
      });
      recordingStream = null;
    }
    if (recognition) {
      try {
        recognition.stop();
      } catch (_err) {
        /* ignore */
      }
      recognition = null;
    }
    var button = document.getElementById("talk-button");
    if (button) setTalkState(button, false);
  }

  function startTalk(button) {
    var SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = languageCode();
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = function (event) {
        var parts = [];
        for (var i = 0; i < event.results.length; i += 1) {
          parts.push(event.results[i][0].transcript);
        }
        writeRaw(parts.join(" ").trim());
      };
      recognition.onerror = function (event) {
        if (event.error === "not-allowed") {
          showError(
            "Typeless needs the microphone. Allow it in the browser, then click Talk again.",
          );
        } else {
          showError("Could not listen: " + event.error);
        }
        stopTalk();
      };
      recognition.onend = function () {
        if (recording) stopTalk();
      };
      recording = true;
      setTalkState(button, true);
      recognition.start();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("This browser cannot open the microphone.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        recordingStream = stream;
        recording = true;
        setTalkState(button, true);
      })
      .catch(function (error) {
        var denied =
          error &&
          (error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError");
        showError(
          denied
            ? "Typeless needs the microphone. Allow it in the browser, then click Talk again."
            : "Could not open the microphone. Check the input device, or paste text below.",
        );
      });
  }

  function fallbackToggleTalk(button) {
    if (recording) {
      stopTalk();
      return;
    }
    startTalk(button);
  }

  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      var lang = target.closest("[data-lang-link]");
      if (lang) {
        var id = lang.getAttribute("data-lang-link");
        if (typeof window.__TYPELESS_SET_LANG === "function") {
          event.preventDefault();
          event.stopPropagation();
          markLanguage(id);
          window.__TYPELESS_SET_LANG(id);
        }
        return;
      }

      var button = target.closest("#talk-button");
      if (!button || button.hasAttribute("disabled")) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.__TYPELESS_TALK === "function") {
        window.__TYPELESS_TALK();
        return;
      }
      fallbackToggleTalk(button);
    },
    true,
  );
})();
