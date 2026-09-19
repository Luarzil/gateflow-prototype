// Veri-Gate cloud client — CR-V17-AWS-CONNECT-001 step 2.
//
// Patrick calls it "the silo": every phone keeps its own records, so nobody can review gate
// activity from anywhere but the device it happened on. This file is the first half of the answer.
// It signs the console in and reads the shared database through the Veri-Gate API.
//
// It deliberately does nothing on its own. The app asks it for records; if there is no signal, no
// sign-in, or the database is still waking up, the app falls back to the copy on the device and
// says so on screen. Nothing here writes: recording a movement into the shared database is the
// next step.
//
// Plain script, no build step, same as the rest of the app.

(function () {
  "use strict";

  // Public identifiers, not secrets: an API address and a Cognito app client id. Neither grants
  // access without a sign-in, which is why they can sit in a file the browser downloads.
  var CONFIG = {
    api: "https://26yolfohvj.execute-api.us-east-1.amazonaws.com",
    region: "us-east-1",
    userPoolId: "us-east-1_AQE30dxWN",
    clientId: "43o49fdu5m4ucg8japio55cnbi",
    environment: "dev"
  };

  var IDP = "https://cognito-idp." + CONFIG.region + ".amazonaws.com/";
  var SESSION_KEY = "veri-gate.cloud.session.v1";
  // The console's session lives in the tab. Closing it signs out, which is what we want on a
  // shared supervisor computer. A handheld that must stay signed in across shifts is step 5.
  var listeners = [];
  var session = null;
  var lastError = "";

  // --- errors ---------------------------------------------------------------------------------

  function CloudError(message, kind, status) {
    this.name = "CloudError";
    this.message = message;
    // "auth" means sign in again; "waking" is the database resuming and worth retrying;
    // "offline" is no signal at all, which is not an error the operator caused.
    this.kind = kind || "request";
    // The HTTP status, when there was one. It is what separates "try again later" (5xx, 429)
    // from "this will never be accepted" (the other 4xx).
    this.status = status || 0;
  }
  CloudError.prototype = Object.create(Error.prototype);

  // --- session --------------------------------------------------------------------------------

  function store() {
    try { return window.sessionStorage; } catch (error) { return null; }
  }

  function readStoredSession() {
    var box = store();
    if (!box) return null;
    try {
      var raw = box.getItem(SESSION_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.idToken ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredSession(value) {
    var box = store();
    if (!box) return;
    try {
      if (value) box.setItem(SESSION_KEY, JSON.stringify(value));
      else box.removeItem(SESSION_KEY);
    } catch (error) { /* private browsing; the session simply does not survive a reload */ }
  }

  // Cognito answers with seconds of life left. An absolute time is easier to reason about, and
  // survives the tab being asleep.
  function sessionFromAuthResult(result, username, previous) {
    if (!result || !result.IdToken) return null;
    var lifetime = Number(result.ExpiresIn || 3600) * 1000;
    return {
      username: username || (previous && previous.username) || "",
      idToken: result.IdToken,
      accessToken: result.AccessToken || "",
      // A refresh only comes back on the first sign-in, so keep the one we already had.
      refreshToken: result.RefreshToken || (previous && previous.refreshToken) || "",
      expiresAt: new Date(Date.now() + lifetime).toISOString(),
      signedInAt: (previous && previous.signedInAt) || new Date().toISOString()
    };
  }

  // A token about to expire is treated as expired: better to refresh a minute early than to send
  // a request that arrives just after the deadline.
  function isSessionExpired(value, now) {
    if (!value || !value.expiresAt) return true;
    var moment = (now instanceof Date ? now : new Date()).getTime();
    return new Date(value.expiresAt).getTime() - moment <= 60000;
  }

  function currentStatus() {
    if (!session) return { signedIn: false, username: "", source: "device", message: lastError };
    return {
      signedIn: true,
      username: session.username,
      source: "shared",
      expiresAt: session.expiresAt,
      environment: CONFIG.environment,
      message: lastError
    };
  }

  function announce() {
    var status = currentStatus();
    listeners.forEach(function (listener) {
      try { listener(status); } catch (error) { /* a broken listener must not break sign-in */ }
    });
  }

  function setSession(value) {
    session = value;
    writeStoredSession(value);
    announce();
  }

  // --- Cognito --------------------------------------------------------------------------------

  function idp(target, body) {
    return fetch(IDP, {
      method: "POST",
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService." + target },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (error) { /* keep the raw text below */ }
        if (!response.ok) throw new CloudError(signInMessage(payload, text), "auth");
        return payload;
      });
    }, function () {
      throw new CloudError("No connection to Veri-Gate. Check the signal and try again.", "offline");
    });
  }

  // Cognito's own wording is written for developers. These are the cases an operator will actually
  // hit, in words that say what to do about them.
  function signInMessage(payload, fallback) {
    var type = String(payload.__type || "").split("#").pop();
    if (type === "NotAuthorizedException") return "That username or password was not accepted.";
    if (type === "UserNotFoundException") return "That username or password was not accepted.";
    if (type === "PasswordResetRequiredException") return "This login needs a new password. Ask the Admin to reset it.";
    if (type === "UserNotConfirmedException") return "This login is not active yet. Ask the Admin.";
    if (type === "InvalidPasswordException") return payload.message || "That password does not meet the rules: 12 characters or more, with upper and lower case and a number.";
    if (type === "TooManyRequestsException" || type === "LimitExceededException") return "Too many attempts. Wait a minute and try again.";
    return payload.message || fallback || "Sign-in failed.";
  }

  function finishAuth(payload, username, previous) {
    if (payload.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      return { challenge: "NEW_PASSWORD_REQUIRED", challengeSession: payload.Session, username: username };
    }
    if (payload.ChallengeName) {
      // MFA is available in the user pool but the console cannot prompt for a code yet.
      throw new CloudError("This login needs an authenticator code, which this screen cannot ask for yet.", "auth");
    }
    var next = sessionFromAuthResult(payload.AuthenticationResult, username, previous);
    if (!next) throw new CloudError("Sign-in did not return a token.", "auth");
    lastError = "";
    setSession(next);
    return { signedIn: true, username: next.username };
  }

  function signIn(username, password) {
    var name = String(username || "").trim();
    if (!name || !password) return Promise.reject(new CloudError("Enter the username and password."));
    return idp("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CONFIG.clientId,
      AuthParameters: { USERNAME: name, PASSWORD: password }
    }).then(function (payload) { return finishAuth(payload, name, null); });
  }

  // The Admin creates a login with a temporary password, so the first sign-in always lands here.
  function completeNewPassword(username, newPassword, challengeSession) {
    if (!newPassword) return Promise.reject(new CloudError("Enter the new password."));
    return idp("RespondToAuthChallenge", {
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: CONFIG.clientId,
      Session: challengeSession,
      ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword }
    }).then(function (payload) { return finishAuth(payload, username, null); });
  }

  // Several requests can find the token expired at once - a search and the queue, say. They share
  // one refresh rather than each asking Cognito for its own.
  var refreshing = null;

  function refresh() {
    if (!session || !session.refreshToken) return Promise.reject(new CloudError("Sign in again.", "auth"));
    if (refreshing) return refreshing;
    var username = session.username;
    var previous = session;
    refreshing = idp("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: CONFIG.clientId,
      AuthParameters: { REFRESH_TOKEN: session.refreshToken }
    }).then(function (payload) { return finishAuth(payload, username, previous); });
    var clear = function () { refreshing = null; };
    refreshing.then(clear, clear);
    return refreshing;
  }

  function signOut(message) {
    lastError = message || "";
    setSession(null);
  }

  // --- the API --------------------------------------------------------------------------------

  function ready() {
    if (!session) return Promise.reject(new CloudError("Sign in to read the shared records.", "auth"));
    if (!isSessionExpired(session)) return Promise.resolve();
    return refresh().catch(function () {
      signOut("The sign-in expired. Sign in again.");
      throw new CloudError("The sign-in expired. Sign in again.", "auth");
    });
  }

  function request(path, query, options) {
    return ready().then(function () {
      // Signed out in another part of the app between the check and here.
      if (!session) throw new CloudError("Sign in to read the shared records.", "auth");
      var url = CONFIG.api + path + (query ? "?" + query : "");
      var init = { headers: { authorization: session.idToken }, cache: "no-store" };
      if (options && options.body !== undefined) {
        init.method = options.method || "POST";
        init.headers["content-type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }
      return fetch(url, init).then(function (response) {
        return response.text().then(function (text) {
          var payload = {};
          try { payload = text ? JSON.parse(text) : {}; } catch (error) { /* reported below */ }
          if (response.status === 401 || response.status === 403) {
            signOut("The sign-in expired. Sign in again.");
            throw new CloudError("The sign-in expired. Sign in again.", "auth", response.status);
          }
          // The dev database pauses when nobody uses it, and takes about half a minute to wake.
          if (response.status === 503 && payload.error === "database_waking") {
            throw new CloudError("The shared database is waking up. Try again in about 20 seconds.", "waking", 503);
          }
          if (!response.ok) throw new CloudError(payload.message || ("The request failed (" + response.status + ")."), "request", response.status);
          return payload;
        });
      }, function () {
        throw new CloudError("No connection to Veri-Gate. The records on this device are still available.", "offline");
      });
    });
  }

  // GET /health needs no sign-in, so the console can tell "no signal" apart from "not signed in".
  function health() {
    return fetch(CONFIG.api + "/health", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new CloudError("The service answered " + response.status + ".");
      return response.json();
    }, function () {
      throw new CloudError("No connection to Veri-Gate.", "offline");
    });
  }

  // The search box and the API speak the same names, except that empty fields are left out
  // entirely rather than sent as blanks the server would have to ignore.
  function movementQuery(filters, cursor) {
    var source = filters || {};
    var pairs = [];
    var add = function (key, value) {
      var text = String(value == null ? "" : value).trim();
      if (text) pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(text));
    };
    add("vehicle", source.vehicle);
    add("driver", source.driver);
    add("location", source.location);
    add("date", source.date);
    add("direction", source.direction);
    add("limit", source.limit);
    add("before", cursor);
    return pairs.join("&");
  }

  // A shared-database row, in the shape the console's own renderers already use. The snapshot
  // columns are what make this possible: each movement carries the driver, vehicle and device as
  // they were at the gate, so a printed record does not change when a record is edited later.
  // The API sends an explicit UTC instant. This is the belt to that braces: a timestamp that
  // arrives without a zone is read as UTC rather than as the viewer's local time, which is what
  // put the first gate movements four hours out of place.
  function instant(value) {
    var text = String(value || "");
    if (!text) return "";
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) return text;
    return text.replace(" ", "T") + "Z";
  }

  function mapMovement(row) {
    var item = row || {};
    return {
      id: item.id,
      clientId: item.client_id || "",
      timestamp: instant(item.occurred_at),
      direction: item.direction,
      driverEmployee: item.driver_employee || "",
      driverName: item.driver_name || "",
      driverEntryMethod: item.driver_entry_method || "legacy_unknown",
      vehicleBarcode: item.vehicle_barcode || "",
      vehicleEntryMethod: item.vehicle_entry_method || "legacy_unknown",
      vin: item.vin || "",
      plate: item.plate || "",
      location: item.location || "",
      authorizationStatus: item.authorization_status || "",
      note: item.note || "",
      submittedBy: item.submitted_by || "",
      // Kept for the offline work in step 4: a movement that arrived late, and one that disagreed
      // with what the server already knew.
      receivedAt: instant(item.received_at || item.occurred_at),
      delayed: Boolean(item.delayed),
      conflict: item.conflict || ""
    };
  }

  function movements(filters, cursor) {
    return request("/v1/movements", movementQuery(filters, cursor)).then(function (payload) {
      return {
        movements: (payload.movements || []).map(mapMovement),
        next: payload.next || null,
        total: typeof payload.total === "number" ? payload.total : null
      };
    });
  }

  function reference() {
    return request("/v1/reference", "");
  }

  // Every movement carries an id made on the device. Sending the same one twice records it once,
  // which is what makes retrying a dropped upload safe rather than a way to double the gate log.
  function movementId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return "m-" + window.crypto.randomUUID();
    return "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // The scanner decided at the gate; this sends what it recorded. The server stores it as it
  // stands and says where its own records disagree, in "conflict" - it never quietly rewrites the
  // decision, because the vehicle moved either way.
  function recordMovement(movement) {
    return request("/v1/movements", "", { method: "POST", body: movement }).then(function (payload) {
      return {
        id: payload.id,
        clientId: payload.clientId,
        alreadyRecorded: Boolean(payload.duplicate),
        conflict: payload.conflict || "",
        delayed: Boolean(payload.delayed),
        vehicleAdded: Boolean(payload.vehicleAdded)
      };
    });
  }

  // --- the offline queue (step 4) ---------------------------------------------------------------
  //
  // Patrick, on how long a gate can be without signal: "could be minutes or days", and "Enterprise
  // will not tolerate a pause". So the gate never waits for the network. Every movement is saved on
  // the device first, and this sends the backlog when it can.

  // What to do after a failed send:
  //   "retry"  - no signal, the database waking, a server fault, or being rate-limited. The next
  //              movement would fail the same way, so stop and try the whole queue again later.
  //   "signin" - the sign-in is missing or expired. Stop until somebody signs in.
  //   "refuse" - the server looked at it and will never accept it (an employee number not on the
  //              roster, a malformed record). Retrying forever would hold up everything behind it,
  //              so it is set aside for a supervisor and the queue carries on.
  function failureAction(error) {
    var kind = error && error.kind;
    var status = (error && error.status) || 0;
    if (kind === "auth") return "signin";
    if (kind === "offline" || kind === "waking") return "retry";
    if (!status || status >= 500 || status === 429 || status === 408) return "retry";
    return "refuse";
  }

  // Sends the queued items one at a time, oldest first, so the shared log receives them in the
  // order they happened at the gate. One at a time also means a dropped signal part-way through
  // leaves a clean line between what was sent and what was not.
  function drainQueue(items, send, handlers) {
    var on = handlers || {};
    var list = (items || []).slice();
    var summary = { sent: 0, refused: 0, stopped: null };
    function next(index) {
      if (index >= list.length) return Promise.resolve(summary);
      var item = list[index];
      return Promise.resolve().then(function () { return send(item); }).then(function (result) {
        summary.sent += 1;
        if (on.sent) on.sent(item, result);
        return next(index + 1);
      }, function (error) {
        var action = failureAction(error);
        if (action === "refuse") {
          summary.refused += 1;
          if (on.refused) on.refused(item, error);
          return next(index + 1);
        }
        summary.stopped = { action: action, error: error, item: item };
        if (on.stopped) on.stopped(item, error, action);
        return summary;
      });
    }
    return next(0);
  }

  // What a flag on a movement means, in words a supervisor can act on.
  function conflictText(conflict) {
    if (conflict === "driver_inactive") return "the driver is marked inactive in the records";
    if (conflict === "license_expired") return "the driver's license has expired";
    if (conflict === "authorization_expired") return "the records show no authorization for that driver now";
    if (conflict === "override_needs_scan") return "the location override covers scanned badges only";
    if (conflict === "vehicle_removed") return "the vehicle has been removed from inventory";
    if (conflict === "authorization_not_shared") return "the authorization was granted on this device and is not in the shared records yet";
    if (conflict === "device_clock_ahead") return "this device's clock is ahead, so the time on the record may be wrong";
    if (conflict === "device_clock_behind") return "the time on the record is weeks old, so this device's clock may be wrong";
    return conflict ? "the records disagree with what the gate recorded" : "";
  }

  window.VeriGateCloud = {
    config: CONFIG,
    // Restores a session left by a reload in the same tab. Called by the app on start.
    start: function () {
      var stored = readStoredSession();
      if (stored && !isSessionExpired(stored)) session = stored;
      else if (stored && stored.refreshToken) { session = stored; refresh().catch(function () { signOut("The sign-in expired. Sign in again."); }); }
      announce();
      return currentStatus();
    },
    onChange: function (listener) { if (typeof listener === "function") listeners.push(listener); },
    status: currentStatus,
    signIn: signIn,
    completeNewPassword: completeNewPassword,
    signOut: function () { signOut(""); },
    health: health,
    reference: reference,
    movements: movements,
    recordMovement: recordMovement,
    movementId: movementId,
    conflictText: conflictText,
    drainQueue: drainQueue,
    failureAction: failureAction,
    // Exposed for the tests, which check these without a browser or a network.
    internals: { movementQuery: movementQuery, mapMovement: mapMovement, sessionFromAuthResult: sessionFromAuthResult, isSessionExpired: isSessionExpired, signInMessage: signInMessage, CloudError: CloudError }
  };

  // Node's test runner loads this file directly; the browser ignores this.
  if (typeof module !== "undefined" && module.exports) module.exports = window.VeriGateCloud;
}());
