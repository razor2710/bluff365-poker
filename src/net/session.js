import io from "socket.io-client";
import userConfig from "../config/user.js";

const session = {
  socket: null,
  connected: false,
  loggedIn: false,
  user: null,
  uid: null,

  flowGuard: {
    startedFromSplash: false
  },

  queueListener: null,
  matchListener: null,
  gameStateListener: null,
  cardsListener: null,
  roundFinishedListener: null,
  historyListener: null,

  roomStateListener: null,
  roomCountdownListener: null,
  roomRandomSearchListener: null,
  roomErrorListener: null,
  createRoomResponseListener: null,
  joinRoomResponseListener: null,

  gameTablesResponseListener: null,
  joinCityResponseListener: null,

  onConnectionChange: null,
  onMatchFound: null,

 // 👇 REPLACE ENTIRE init() FUNCTION IN session.js 👇
  init() {
   if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
    }

    this.uid = Date.now().toString();
    this.socket = io("https://poker.bluff365.com", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5
    });
    this.socket.on("connect", () => {
      this.connected = true;
      
      // Auto-re-auth if it's a reconnection
      if (this.user && this.user.username) {
        this.openApp(this.user.username);
      }

      if (typeof this.onConnectionChange === "function") {
        this.onConnectionChange(true);
      }
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
      // CRITICAL FIX: Do NOT set this.loggedIn = false or this.user = null here.
      // If their internet drops for 2 seconds, we want to remember who they are when they reconnect!
      if (typeof this.onConnectionChange === "function") {
        this.onConnectionChange(false);
      }
    });

    // --- REAL-TIME BROWSER INTERNET CHECKER ---
    window.addEventListener("offline", () => {
      this.connected = false;
      if (typeof this.onConnectionChange === "function") {
        this.onConnectionChange(false);
      }
    });

    window.addEventListener("online", () => {
      // Force socket to attempt reconnect instantly when WiFi/Data returns
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    });

    // --- CAPACITOR/ANDROID BACKGROUND RESUME FIX ---
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (this.socket && this.socket.disconnected) {
          this.socket.connect();
        }
      }
    });
    // ------------------------------------------

    return this.socket;
  },
  // 👆 END REPLACEMENT 👆
  // 👆 END REPLACEMENT 👆

  cleanupLobbyListeners() {
    if (!this.socket) return;

    if (this.queueListener) this.socket.off("queue_update", this.queueListener);
    if (this.matchListener) this.socket.off("match_found", this.matchListener);
    if (this.gameStateListener) this.socket.off("game_state", this.gameStateListener);
    if (this.cardsListener) this.socket.off("show_cards", this.cardsListener);
    if (this.roundFinishedListener) this.socket.off("round_finished", this.roundFinishedListener);
    if (this.historyListener) this.socket.off("match_history_response", this.historyListener);

    if (this.roomStateListener) this.socket.off("room_state", this.roomStateListener);
    if (this.roomCountdownListener) this.socket.off("room_countdown", this.roomCountdownListener);
    if (this.roomRandomSearchListener) this.socket.off("room_random_search", this.roomRandomSearchListener);
    if (this.roomErrorListener) this.socket.off("room_error", this.roomErrorListener);
    if (this.createRoomResponseListener) this.socket.off("create_room_response", this.createRoomResponseListener);
    if (this.joinRoomResponseListener) this.socket.off("join_room_response", this.joinRoomResponseListener);

    if (this.gameTablesResponseListener) this.socket.off("game_tables_response", this.gameTablesResponseListener);
    if (this.joinCityResponseListener) this.socket.off("join_city_response", this.joinCityResponseListener);

    this.queueListener = null;
    this.matchListener = null;
    this.gameStateListener = null;
    this.cardsListener = null;
    this.roundFinishedListener = null;
    this.historyListener = null;

    this.roomStateListener = null;
    this.roomCountdownListener = null;
    this.roomRandomSearchListener = null;
    this.roomErrorListener = null;
    this.createRoomResponseListener = null;
    this.joinRoomResponseListener = null;

    this.gameTablesResponseListener = null;
    this.joinCityResponseListener = null;
  },

  cleanupGameListeners() {
    if (!this.socket) return;

    if (this.gameStateListener) this.socket.off("game_state", this.gameStateListener);
    if (this.cardsListener) this.socket.off("show_cards", this.cardsListener);
    if (this.roundFinishedListener) this.socket.off("round_finished", this.roundFinishedListener);
    if (this.matchListener) this.socket.off("match_found", this.matchListener);

    this.gameStateListener = null;
    this.cardsListener = null;
    this.roundFinishedListener = null;
    this.matchListener = null;
  },

  openApp(userId) {
    if (!this.socket) return;
    this.socket.emit("open_app", { userId });
  },

  loginWithStored(onResult) {
    if (!this.socket) return;

    const payload = {
      uname: userConfig.uname.trim().toLowerCase(),
      password: userConfig.password,
      uid: this.uid || Date.now().toString(),
      device_id: userConfig.device_id || "WEB_" + Math.random().toString(16).slice(2),
      device_name: userConfig.device_name || "WebClient"
    };

    this.openApp(payload.uname);
    this.socket.emit("login", payload);

    this.socket.once("login_response", result => {
      if (result.success) {
        this.loggedIn = true;
        this.user = {
          username: payload.uname,
          bluff_coins: Number(result.bluff_coins || 0),
          device_id: result.device_id || payload.device_id,
          device_name: result.device_name || payload.device_name,
          ...result
        };
      }
      if (onResult) onResult(result, payload);
    });
  },

  joinQueue(onQueueUpdate, onMatchFound, onGameState, onCards) {
    if (!this.socket) return;

    this.cleanupLobbyListeners();

    this.queueListener = data => {
      if (onQueueUpdate) onQueueUpdate(data);
    };

    this.matchListener = data => {
      if (onMatchFound) onMatchFound(data);
    };

    this.gameStateListener = data => {
      if (onGameState) onGameState(data);
    };

    this.cardsListener = data => {
      if (onCards) onCards(data);
    };

    this.socket.on("queue_update", this.queueListener);
    this.socket.on("match_found", this.matchListener);
    this.socket.on("game_state", this.gameStateListener);
    this.socket.on("show_cards", this.cardsListener);

    this.socket.emit("join_queue", {
      uname: userConfig.uname.trim().toLowerCase()
    });
  },

  cancelQueue() {
    if (!this.socket) return;
    this.socket.emit("cancel_queue");
  },

  createRoom(onCreateResponse, onRoomState, onCountdown, onRandomSearch, onMatchFound, onRoomError) {
    if (!this.socket) return;

    this.cleanupLobbyListeners();

    this.createRoomResponseListener = data => {
      if (onCreateResponse) onCreateResponse(data);
    };

    this.roomStateListener = data => {
      if (onRoomState) onRoomState(data);
    };

    this.roomCountdownListener = data => {
      if (onCountdown) onCountdown(data);
    };

    this.roomRandomSearchListener = data => {
      if (onRandomSearch) onRandomSearch(data);
    };

    this.matchListener = data => {
      if (onMatchFound) onMatchFound(data);
    };

    this.roomErrorListener = data => {
      if (onRoomError) onRoomError(data);
    };

    this.socket.on("create_room_response", this.createRoomResponseListener);
    this.socket.on("room_state", this.roomStateListener);
    this.socket.on("room_countdown", this.roomCountdownListener);
    this.socket.on("room_random_search", this.roomRandomSearchListener);
    this.socket.on("match_found", this.matchListener);
    this.socket.on("room_error", this.roomErrorListener);

    this.socket.emit("create_room", {
      uname: userConfig.uname.trim().toLowerCase()
    });
  },

  joinRoom(roomId, onJoinResponse, onRoomState, onCountdown, onRandomSearch, onMatchFound, onRoomError) {
    if (!this.socket) return;

    this.cleanupLobbyListeners();

    this.joinRoomResponseListener = data => {
      if (onJoinResponse) onJoinResponse(data);
    };

    this.roomStateListener = data => {
      if (onRoomState) onRoomState(data);
    };

    this.roomCountdownListener = data => {
      if (onCountdown) onCountdown(data);
    };

    this.roomRandomSearchListener = data => {
      if (onRandomSearch) onRandomSearch(data);
    };

    this.matchListener = data => {
      if (onMatchFound) onMatchFound(data);
    };

    this.roomErrorListener = data => {
      if (onRoomError) onRoomError(data);
    };

    this.socket.on("join_room_response", this.joinRoomResponseListener);
    this.socket.on("room_state", this.roomStateListener);
    this.socket.on("room_countdown", this.roomCountdownListener);
    this.socket.on("room_random_search", this.roomRandomSearchListener);
    this.socket.on("match_found", this.matchListener);
    this.socket.on("room_error", this.roomErrorListener);

    this.socket.emit("join_room", {
      roomId,
      uname: userConfig.uname.trim().toLowerCase()
    });
  },

  startRoomRandom(roomId) {
    if (!this.socket) return;
    this.socket.emit("room_start_random", {
      roomId,
      uname: userConfig.uname.trim().toLowerCase()
    });
  },

  leaveRoom(roomId) {
    if (!this.socket) return;
    this.socket.emit("leave_room", {
      roomId,
      uname: userConfig.uname.trim().toLowerCase()
    });
  },

  sendGameAction(payload) {
    if (!this.socket) return;
    this.socket.emit("game_action", payload);
  },

  onGameState(cb) {
    if (!this.socket) return;
    if (this.gameStateListener) this.socket.off("game_state", this.gameStateListener);

    this.gameStateListener = data => {
      if (cb) cb(data);
    };

    this.socket.on("game_state", this.gameStateListener);
  },

  onShowCards(cb) {
    if (!this.socket) return;
    if (this.cardsListener) this.socket.off("show_cards", this.cardsListener);

    this.cardsListener = data => {
      if (cb) cb(data);
    };

    this.socket.on("show_cards", this.cardsListener);
  },

  onRoundFinished(cb) {
    if (!this.socket) return;
    if (this.roundFinishedListener) this.socket.off("round_finished", this.roundFinishedListener);

    this.roundFinishedListener = data => {
      if (cb) cb(data);
    };

    this.socket.on("round_finished", this.roundFinishedListener);
  },

  refreshProfileAndHistory(username, onDone) {
    if (!this.socket) {
      if (onDone) onDone(null);
      return;
    }

    const uname = (username || userConfig.uname || "").trim().toLowerCase();

    if (this.historyListener) {
      this.socket.off("match_history_response", this.historyListener);
      this.historyListener = null;
    }

    this.historyListener = payload => {
      this.socket.off("match_history_response", this.historyListener);
      this.historyListener = null;

      if (!payload || !payload.success) {
        if (onDone) onDone(null);
        return;
      }

      this.user = {
        ...(this.user || {}),
        username: payload.username || uname,
        bluff_coins: Number(payload.coins || 0)
      };

      if (onDone) onDone(payload);
    };

    this.socket.on("match_history_response", this.historyListener);
    this.socket.emit("get_match_history", { username: uname, uname });
  },

  fetchGameTables(onDone) {
    if (!this.socket) {
      if (onDone) {
        onDone({
          success: false,
          message: "Socket not initialized",
          tables: []
        });
      }
      return;
    }

    if (this.gameTablesResponseListener) {
      this.socket.off("game_tables_response", this.gameTablesResponseListener);
      this.gameTablesResponseListener = null;
    }

    this.gameTablesResponseListener = payload => {
      this.socket.off("game_tables_response", this.gameTablesResponseListener);
      this.gameTablesResponseListener = null;

      if (onDone) onDone(payload);
    };

    this.socket.on("game_tables_response", this.gameTablesResponseListener);
    this.socket.emit("get_game_tables");
  },

  joinCity(configId, cityIndex, username, onDone) {
    if (!this.socket) {
      if (onDone) {
        onDone({
          success: false,
          message: "Socket not initialized"
        });
      }
      return;
    }

    const uname = (username || userConfig.uname || "").trim().toLowerCase();

    if (!configId || typeof cityIndex !== "number" || cityIndex < 0 || !uname) {
      if (onDone) {
        onDone({
          success: false,
          message: "Invalid join request"
        });
      }
      return;
    }

    if (this.joinCityResponseListener) {
      this.socket.off("join_city_response", this.joinCityResponseListener);
      this.joinCityResponseListener = null;
    }

    this.joinCityResponseListener = payload => {
      this.socket.off("join_city_response", this.joinCityResponseListener);
      this.joinCityResponseListener = null;

      if (onDone) onDone(payload);
    };

    this.socket.on("join_city_response", this.joinCityResponseListener);
    this.socket.emit("join_city", {
      configId,
      cityIndex,
      username: uname,
      uname
    });
  }
};

export default session;