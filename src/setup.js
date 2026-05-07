// AtlasNote Setup Page Script
(function () {
  "use strict";

  // Global error handler - show errors visually
  window.onerror = function (msg, src, line, col, err) {
    showError("JS Error: " + msg + " (line " + line + ")");
    return false;
  };

  function showError(msg) {
    var el = document.getElementById("status-message");
    if (el) {
      el.textContent = "\u26a0\ufe0f " + msg;
      el.className = "status-message error";
    }
  }

  // Check if preload bridge is available
  if (!window.atlasNote) {
    showError("Bridge not loaded. App may not be packaged correctly.");
    return;
  }

  var atlasNote = window.atlasNote;
  var urlInput = document.getElementById("server-url");
  var connectBtn = document.getElementById("connect-btn");
  var btnText = document.getElementById("btn-text");
  var btnLoader = document.getElementById("btn-loader");
  var statusMessage = document.getElementById("status-message");
  var closeBtn = document.getElementById("close-btn");

  // Load saved URL
  atlasNote
    .getServerUrl()
    .then(function (url) {
      if (url) urlInput.value = url;
    })
    .catch(function (e) {
      showError("Failed to load config: " + e.message);
    });

  // Close button
  closeBtn.addEventListener("click", function () {
    atlasNote.closeWindow();
  });

  function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = "status-message " + type;
  }

  function setLoading(loading) {
    connectBtn.disabled = loading;
    btnText.classList.toggle("hidden", loading);
    btnLoader.classList.toggle("hidden", !loading);
  }

  connectBtn.addEventListener("click", function () {
    if (!atlasNote) {
      setStatus("\u26a0\ufe0f App bridge not available. Try restarting the app.", "error");
      return;
    }

    var url = urlInput.value.trim();
    if (!url) {
      setStatus("Please enter a server URL", "error");
      return;
    }

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url;
      urlInput.value = url;
    }

    // Remove trailing slash
    url = url.replace(/\/+$/, "");

    setLoading(true);
    setStatus("\u23f3 Connecting to " + url + " ...", "info");

    atlasNote
      .testConnection(url)
      .then(function (result) {
        if (result.ok) {
          setStatus("\u2713 Connected! Loading AtlasNote...", "success");
          setTimeout(function () {
            atlasNote.connectToServer(url).catch(function (e) {
              setLoading(false);
              setStatus("\u2717 Failed to open: " + e.message, "error");
            });
          }, 600);
        } else {
          setLoading(false);
          var reason = result.error || "Server returned status " + result.status;
          setStatus("\u2717 " + reason, "error");
        }
      })
      .catch(function (err) {
        setLoading(false);
        setStatus("\u2717 " + (err.message || "Unexpected error"), "error");
      });
  });

  // Enter key to submit
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") connectBtn.click();
  });
})();
