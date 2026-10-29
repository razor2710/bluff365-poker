// src/scenes/GameScene.js
import Phaser from "phaser";
import session from "../net/session.js";
import AlertManager from "../helpers/AlertManager.js";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.reconnectOverlay = null;
    this.waitOverlay = null;
    this.wasRejoined = false;
    this.lastMoveId = null;
  }

  init(data) {
    if (!data || !data.username || !session || !session.flowGuard?.startedFromSplash) {
      this.scene.start("SplashScene");
      return;
    }

    this.waitOverlay = null;
    this.sessionId = data.sessionId || null;
    this.userData = data.userData || data || {};
    this.username = (data.username || this.userData.username || "").toLowerCase();

    this.isPrivate = data.isPrivate || false;
    this.roomId = data.roomId || null;
    this.hostUsername = (data.hostUsername || "").toLowerCase();
    this.configId = data.configId;
    this.cityIndex = data.cityIndex;
    this.cityName = data.cityName || "City";

    this.table = data.table || null;
    this.players = data.seatedPlayers || data.players || (this.table ? this.table.players : []);
    this.currentTurnIndex = data.firstTurnIndex ?? (this.table ? this.table.firstTurnIndex : 0);
    this.dealerIndex = data.dealerIndex ?? (this.table ? this.table.dealerIndex : null);
    this.sbIndex = data.sbIndex ?? (this.table ? this.table.sbIndex : null);
    this.bbIndex = data.bbIndex ?? (this.table ? this.table.bbIndex : null);

    // 25 seconds thinking time
    this.turnTime = data.turnTime ?? (this.table ? this.table.turnTime : 25) ?? 25;
    this.remainingTime = this.turnTime;

    this.playerViews = [];
    this.userCards = [];
    this.otherPlayerCards = [];
    this.communitySprites = [];
    this.visibleCommunityCards = 0;

    this.bigBlind = data.bootAmount ?? (this.table ? this.table.bootAmount : 100);
    this.smallBlind = Math.max(1, Math.floor(this.bigBlind / 2));
    this.highestBet = data.highestBet ?? (this.table ? this.table.highestBet : this.bigBlind);
    this.minRaiseIncrement =
      data.minRaiseIncrement ?? (this.table ? this.table.minRaiseIncrement : this.smallBlind);
    this.maxPot = data.maxPot ?? (this.table ? this.table.maxPot : 0);
    this.pot = data.pot ?? (this.table ? this.table.pot : this.smallBlind + this.bigBlind);
    this.currentPhase = data.phase || (this.table ? this.table.phase : "preflop");

    this.lastAction = null;
    this.lastMoveToastKey = null;
    this.lastMoveId = null;

    this.roundFinished = false;
    this.dealingDone = this.table?.isMatchRunning || data.isMatchRunning || false;
    this.wasRejoined = this.table?.isMatchRunning || data.isMatchRunning || false;
    this.privateHoleCards = data.cards || (this.table ? this.table.cards : []) || [];

    this.roomTableName =
      data.tableName ||
      data.table_name ||
      this.userData?.tableName ||
      this.userData?.table_name ||
      data.table?.tableName ||
      data.table?.table_name ||
      "";

    this.isRaising = false;
    this.minRaiseTarget = 0;
    this.maxRaiseTarget = 0;
    this.currentRaiseTarget = 0;
  }

  create() {
    session.cleanupGameListeners();

    this.requestFreshState = () => {
      if (this.isPrivate) {
        if (this.dealingDone && !this.roundFinished) {
          session.socket.emit("rejoin_match", { sessionId: this.sessionId, username: this.username });
        } else {
          session.socket.emit("join_private_room", { roomId: this.roomId, username: this.username });
        }
      } else {
        if (this.dealingDone && !this.roundFinished) {
          session.socket.emit("rejoin_match", { sessionId: this.sessionId, username: this.username });
        } else if (this.configId !== undefined && this.cityIndex !== undefined) {
          session.socket.emit("join_city", { configId: this.configId, cityIndex: this.cityIndex, username: this.username });
        }
      }
    };

    session.onConnectionChange = isConnected => {
      if (!this.scene.isActive()) return;
      if (!isConnected) {
        this.showReconnectingOverlay();
      } else {
        this.hideReconnectingOverlay();
        this.time.delayedCall(300, this.requestFreshState);
      }
    };

    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        if (session.socket && !session.socket.connected) session.socket.connect();
        else this.requestFreshState();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    if (!session.socket) session.init();

    this.sndPlayerWin = this.sound.get("player_win") || this.sound.add("player_win");
    this.sndBlind = this.sound.get("blind") || this.sound.add("blind");
    this.sndCardDeal = this.sound.get("card_back_distribute") || this.sound.add("card_back_distribute");
    this.sndChaal = this.sound.get("chaal") || this.sound.add("chaal");
    this.sndClick = this.sound.get("click") || this.sound.add("click");
    this.sndClickClose = this.sound.get("click_close") || this.sound.add("click_close");
    this.sndFlipCard = this.sound.get("flip_card") || this.sound.add("flip_card");
    this.sndPack = this.sound.get("pack") || this.sound.add("pack");
    this.sndYourTurn = this.sound.get("your_turn") || this.sound.add("your_turn");

    const w = this.scale.width;
    const h = this.scale.height;

    let lowerTableName = (this.roomTableName || "").toLowerCase();
    if (!lowerTableName) {
      const stakeAmount = this.bigBlind || 0;
      if (stakeAmount === 10) lowerTableName = "bronze";
      else if (stakeAmount === 50) lowerTableName = "silver";
      else if (stakeAmount === 200) lowerTableName = "gold";
      else if (stakeAmount === 1000) lowerTableName = "diamond";
    }

    let chosenBgKey = "game_bg";
    let themeStyles = {
      primaryColor: "#ffffff",
      secondaryColor: "#e0e0e0",
      strokeColor: "#000000",
      strokeThickness: 5,
      shadowColor: "#000000",
      shadowBlur: 8,
      nameColor: "#00ffff"
    };

    if (lowerTableName.includes("bronze")) {
      chosenBgKey = "table_bg_bronze";
      themeStyles = { primaryColor: "#ff9d63", secondaryColor: "#ffffff", strokeColor: "#2a1205", strokeThickness: 6, shadowColor: "#140701", shadowBlur: 10, nameColor: "#ffbe94" };
    } else if (lowerTableName.includes("silver")) {
      chosenBgKey = "table_bg_silver";
      themeStyles = { primaryColor: "#e2ebf5", secondaryColor: "#a3b2c2", strokeColor: "#1b222b", strokeThickness: 6, shadowColor: "#090d12", shadowBlur: 10, nameColor: "#e6f2ff" };
    } else if (lowerTableName.includes("gold")) {
      chosenBgKey = "table_bg_gold";
      themeStyles = { primaryColor: "#ffea75", secondaryColor: "#ffffff", strokeColor: "#4a3200", strokeThickness: 7, shadowColor: "#211600", shadowBlur: 14, nameColor: "#fff2a3" };
    } else if (lowerTableName.includes("platinum")) {
      chosenBgKey = "table_bg_platinum";
      themeStyles = { primaryColor: "#7be0ff", secondaryColor: "#ffffff", strokeColor: "#0f202e", strokeThickness: 6, shadowColor: "#03080c", shadowBlur: 12, nameColor: "#a3f0ff" };
    } else if (lowerTableName.includes("diamond")) {
      chosenBgKey = "table_bg_diamond";
      themeStyles = { primaryColor: "#df8eff", secondaryColor: "#a9ffff", strokeColor: "#1d0036", strokeThickness: 7, shadowColor: "#000000", shadowBlur: 16, nameColor: "#f3d1ff" };
    }

    this.roomBgImage = this.add.image(w / 2, h / 2, chosenBgKey).setDisplaySize(w, h);

    let displayCityName = "PRIVATE ROOM";
    if (!this.isPrivate && this.cityName && this.cityName.trim() && this.cityName.toLowerCase() !== "private room" && this.cityName.toLowerCase() !== "city") {
      displayCityName = this.cityName;
    }

    const nameParts = displayCityName.toUpperCase().split(" ");
    this.add
      .text(w * 0.38, 250, nameParts[0] || "PRIVATE", {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
        fontSize: "28px",
        color: themeStyles.primaryColor,
        stroke: themeStyles.strokeColor,
        strokeThickness: themeStyles.strokeThickness,
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setShadow(0, 4, themeStyles.shadowColor, themeStyles.shadowBlur, true, true);

    this.add
      .text(w * 0.62, 250, nameParts.slice(1).join(" ") || "ROOM", {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
        fontSize: "28px",
        color: themeStyles.secondaryColor,
        stroke: themeStyles.strokeColor,
        strokeThickness: themeStyles.strokeThickness,
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setShadow(0, 4, themeStyles.shadowColor, themeStyles.shadowBlur, true, true);

    // --- CYBER EXIT BUTTON ---
    const exitX = w - 110;
    const exitY = 60;
    const exitBg = this.add.graphics();
    exitBg.fillStyle(0x050505, 1).fillRoundedRect(exitX - 75, exitY - 25, 150, 50, 25);
    exitBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(exitX - 75, exitY - 25, 150, 50, 25);

    this.add
      .zone(exitX, exitY, 180, 100)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        if (this.sndClick) this.sndClick.play();
        this.showExitConfirmDialog();
      });

    this.add
      .text(exitX, exitY, "EXIT", {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
        fontSize: "24px",
        color: "#ff0033",
        letterSpacing: 2
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "rgba(255,0,51,0.6)", 12, false, true);

    this.sessionIdText = this.add
      .text(w / 2, h * 0.5, this.sessionId || "", {
        fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
        fontSize: "22px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setAlpha(0.2);

    this.betInfoText = this.add
      .text(w / 2.5 - 520, 60, "", {
        fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
        fontSize: "28px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5
      })
      .setOrigin(0.5);

    this.phaseInfoText = this.add
      .text(w / 2, h * 0.29, "", {
        fontFamily: "Courier New",
        fontSize: "22px",
        color: "#ffcc00",
        fontWeight: "bold",
        stroke: "#000000",
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.dealerX = w / 2;
    this.dealerY = h * 0.14;
    this.dealerHandY = this.dealerY + 200;

    this.add.image(this.dealerX, this.dealerY, "dealer_girl").setScale(0.35);
    this.potY = this.dealerY + 180;

    // --- COMMUNITY CARDS (5 CENTER SLOTS) ---
    this.communityFinalScale = 0.38;
    const communityY = h * 0.38;
    const communitySpacing = 90;
    const communityStartX = w / 2 - communitySpacing * 2;

    for (let i = 0; i < 5; i++) {
      const targetX = communityStartX + i * communitySpacing;
      const container = this.add.container(targetX, communityY).setAlpha(0).setDepth(50);

      const border = this.add.image(0, 0, "card_back").setTint(0xffd700).setScale(1.08).setAlpha(0);
      const card = this.add.image(0, 0, "card_back");

      container.add([border, card]);
      container.setScale(this.communityFinalScale);

      this.communitySprites.push({ container, card, border, targetX, targetY: communityY });
    }

    if (this.players.length > 0) this.buildPlayersAndSeats();
    this.buildStaticUI();

    if (this.dealingDone && this.privateHoleCards.length === 2) {
      this.userCards.forEach(c => c.setAlpha(1));
      this.otherPlayerCards.flat().forEach(c => c.setAlpha(1));
      this.revealPlayerCards(this.username, this.privateHoleCards, false);
    }

    this.updateTurnUI();
    this.updatePlayerStatusBadges();

    if (this.players.length > 0 && this.sessionId) {
      session.sendGameAction({
        sessionId: this.sessionId,
        playerId: this.username.toLowerCase(),
        action: "resume_session"
      });
    }

    // --- SOCKET EVENT WIRING ---
    session.socket.off("match_found");
    session.socket.on("match_found", payload => {
      this.hideWaitingOverlay();
      this.resetTable();

      this.sessionId = payload.sessionId;
      this.isPrivate = payload.isPrivate || this.isPrivate || false;
      this.roomId = payload.roomId || this.roomId || null;
      this.players = payload.players || [];
      this.currentTurnIndex = payload.firstTurnIndex ?? 0;
      this.dealerIndex = payload.dealerIndex ?? null;
      this.sbIndex = payload.sbIndex ?? null;
      this.bbIndex = payload.bbIndex ?? null;

      this.pot = payload.pot || 0;
      this.bigBlind = payload.bootAmount || 100;
      this.smallBlind = Math.max(1, Math.floor(this.bigBlind / 2));
      this.maxPot = payload.maxPot ?? this.maxPot;
      this.highestBet = payload.highestBet ?? this.bigBlind;
      this.minRaiseIncrement = payload.minRaiseIncrement || this.smallBlind;
      this.currentPhase = payload.phase || "preflop";
      this.turnTime = payload.turnTime ?? 25;
      this.remainingTime = this.turnTime;
      if (this.sessionIdText) this.sessionIdText.setText(this.sessionId);

      this.privateHoleCards = payload.cards || [];
      this.lastMoveId = null;

      this.buildPlayersAndSeats();

      if (payload.isMatchRunning || payload.isRejoining) {
        this.dealingDone = true;
        this.wasRejoined = true;
        this.userCards.forEach(c => c.setAlpha(1));
        this.otherPlayerCards.flat().forEach(c => c.setAlpha(1));

        const me = this.players.find(p => p.username.toLowerCase() === this.username);
        if (me && !me.hasFolded && this.privateHoleCards.length === 2) {
          this.revealPlayerCards(me.username, this.privateHoleCards, false);
        }
      } else {
        this.wasRejoined = false;
        this.time.delayedCall(400, () => {
          this.animateJoinMoney();
          this.time.delayedCall(900, () => this.animateCardDistribution());
        });
      }

      this.updateTurnUI();
      this.updatePlayerStatusBadges();
    });

    session.socket.off("game_state");
    session.socket.on("game_state", payload => {
      this.hideReconnectingOverlay();
      if (payload.sessionId !== this.sessionId) return;

      const prevTurnIndex = this.currentTurnIndex;
      this.pot = payload.pot ?? this.pot;
      this.highestBet = payload.highestBet ?? 0;
      this.minRaiseIncrement = payload.minRaiseIncrement || this.smallBlind;
      this.currentPhase = payload.phase || this.currentPhase;
      this.players = payload.players || this.players;
      this.currentTurnIndex = payload.currentTurnIndex ?? 0;
      if (payload.dealerIndex !== undefined) this.dealerIndex = payload.dealerIndex;
      if (payload.sbIndex !== undefined) this.sbIndex = payload.sbIndex;
      if (payload.bbIndex !== undefined) this.bbIndex = payload.bbIndex;
      this.remainingTime = payload.turnRemaining ?? this.turnTime;

      const current = this.players[this.currentTurnIndex];
      const becameMyTurn =
        prevTurnIndex !== this.currentTurnIndex &&
        current &&
        current.username.toLowerCase() === this.username;
      if (becameMyTurn && this.sndYourTurn && this.dealingDone && !this.roundFinished) {
        this.sndYourTurn.play();
      }

      // Community Cards Reveal & Animation
      const commCards = payload.communityCards || [];
      if (commCards.length > this.visibleCommunityCards) {
        for (let i = this.visibleCommunityCards; i < commCards.length; i++) {
          const slot = this.communitySprites[i];
          const texKey = "card_" + commCards[i];
          const delay = (i - this.visibleCommunityCards) * 220;

          slot.container.setPosition(this.dealerX, this.dealerY);
          slot.container.setScale(0.15);
          slot.container.setAlpha(1);
          slot.card.setTexture("card_back");
          slot.border.setTexture("card_back");

          this.tweens.add({
            targets: slot.container,
            x: slot.targetX,
            y: slot.targetY,
            scaleX: this.communityFinalScale,
            scaleY: this.communityFinalScale,
            duration: 320,
            delay,
            ease: "Cubic.easeOut",
            onStart: () => {
              if (this.sndCardDeal) this.sndCardDeal.play();
            },
            onComplete: () => {
              this.tweens.add({
                targets: slot.container,
                scaleX: 0,
                duration: 140,
                onStart: () => {
                  if (this.sndFlipCard) this.sndFlipCard.play();
                },
                onComplete: () => {
                  slot.card.setTexture(texKey);
                  slot.border.setTexture(texKey);
                  this.tweens.add({
                    targets: slot.container,
                    scaleX: this.communityFinalScale,
                    duration: 140
                  });
                }
              });
            }
          });
        }
        this.visibleCommunityCards = commCards.length;
      }

      this.lastAction = payload.lastAction || null;

      if (!this.wasRejoined && this.lastAction && this.lastAction.moveId !== this.lastMoveId) {
        this.lastMoveId = this.lastAction.moveId;

        const incomingAct = this.lastAction.action;
        if (incomingAct === "call" && this.sndBlind) this.sndBlind.play();
        else if (incomingAct === "raise" && this.sndChaal) this.sndChaal.play();
        else if (incomingAct === "fold" && this.sndPack) this.sndPack.play();
        else if (incomingAct === "check" && this.sndClick) this.sndClick.play();
        else if (incomingAct === "all_in" && this.sndChaal) this.sndChaal.play();

        this.showMoveToast();
        if (this.lastAction.amount > 0) {
          const pv = this.playerViews.find(
            v => v.username.toLowerCase() === this.lastAction.username.toLowerCase()
          );
          if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
        }
      }

      if (this.wasRejoined) {
        this.time.delayedCall(600, () => {
          this.wasRejoined = false;
        });
      }

      this.updateTurnUI();
      this.updatePlayerStatusBadges();
    });

    session.socket.off("round_finished");
    session.socket.on("round_finished", payload => {
      if (payload.sessionId !== this.sessionId) return;
      this.roundFinished = true;
      this.remainingTime = 0;
      this.isRaising = false;
      this.currentPhase = "showdown";
      if (payload.players) {
        this.players = payload.players;
      }
      this.updateTurnUI();
      this.updatePlayerStatusBadges();
      this.clearTimerCircles();

      const commCards = payload.communityCards || [];
      for (let i = 0; i < 5; i++) {
        if (i < commCards.length) {
          this.communitySprites[i].container.setAlpha(1).setScale(this.communityFinalScale);
          this.communitySprites[i].container.setPosition(
            this.communitySprites[i].targetX,
            this.communitySprites[i].targetY
          );
          this.communitySprites[i].card.setTexture("card_" + commCards[i]);
          this.communitySprites[i].border.setTexture("card_" + commCards[i]);
        }
      }
      this.visibleCommunityCards = commCards.length;

      const hands = payload.showdownCards || [];
      hands.forEach(h => {
        this.revealPlayerCards(h.username, h.cards, h.username.toLowerCase() !== this.username);
      });

      let htmlBodyText = "";
      if (payload.winners && payload.winners.length > 0) {
        payload.winners.forEach(w => {
          const handTag = w.handType ? ` <span style="color:#ffcc00;font-size:17px;">(${w.handType})</span>` : "";
          htmlBodyText += `<span style="color:#ffffff">${w.username}</span> <span style="color:#00ff88">+${Number(w.amount || 0).toLocaleString()}</span>${handTag}<br>`;
        });
      } else {
        htmlBodyText = `Pot Amount: <span style="color:#ffcc00">${Number(payload.pot || 0).toLocaleString()}</span>`;
      }

      const showWinnerDialog = () => {
        if (this.sndPlayerWin) this.sndPlayerWin.play();
        this.showCyberWinnerDialog("ROUND FINISHED", htmlBodyText, () => {});
      };

      const winnersList = payload.winners && payload.winners.length > 0 ? payload.winners : [];
      this.animatePotToWinners(winnersList, showWinnerDialog);
    });

    session.socket.off("balance_synced");
    session.socket.on("balance_synced", payload => {
      if (payload.sessionId && payload.sessionId !== this.sessionId) return;
      const mePlayer = this.players.find(p => p.username.toLowerCase() === this.username);
      if (mePlayer) {
        mePlayer.coins = payload.coins;
        if (payload.walletCoins !== undefined) {
          this.userData.coins = payload.walletCoins;
        }
        this.updatePlayerCoinsUI();
        this.updateTurnUI();
      }
    });

    session.socket.off("city_waiting_update");
    session.socket.on("city_waiting_update", payload => {
      if (!this.scene.isActive() || this.isPrivate) return;
      if (payload.configId !== this.configId || payload.cityIndex !== this.cityIndex) return;
      if (this.roundFinished && payload.phase === "countdown_10") {
        this.roundFinished = false;
        this.dealingDone = false;
        this.sessionId = null;
      }
      if ((this.dealingDone && !this.roundFinished) || payload.isMatchRunning || payload.phase === "running") {
        this.hideWaitingOverlay();
        return;
      }
      if (payload.maxPot) this.maxPot = payload.maxPot;
      this.players = payload.seatedPlayers || [];
      this.resetTable();
      this.buildPlayersAndSeats();
      this.showWaitingOverlay(payload);
    });

    session.socket.off("private_room_update");
    session.socket.on("private_room_update", payload => {
      if (!this.scene.isActive()) return;
      const activeRoomId = this.roomId || payload.roomId;
      if (payload.roomId !== activeRoomId) return;
      this.isPrivate = true;
      this.hostUsername = payload.hostUsername;
      if (this.roundFinished && (payload.phase === "waiting_240" || payload.phase === "countdown_10")) {
        this.roundFinished = false;
        this.dealingDone = false;
        this.sessionId = null;
      }
      if ((this.dealingDone && !this.roundFinished) || payload.isMatchRunning || payload.phase === "running") {
        this.hideWaitingOverlay();
        return;
      }
      if (payload.maxPot) this.maxPot = payload.maxPot;
      this.players = payload.seatedPlayers || [];
      this.resetTable();
      this.buildPlayersAndSeats();
      this.showWaitingOverlay(payload);
    });

    session.socket.off("room_dismissed");
    session.socket.on("room_dismissed", payload => {
      AlertManager.show(
        this,
        "Room Dismissed",
        payload.message || "Not enough players.",
        () => {
          this.scene.start("ConfigScene", { username: this.username, coins: this.userData.coins });
        },
        "OK"
      );
    });

    session.socket.off("force_exit_low_balance");
    session.socket.on("force_exit_low_balance", payload => {
      AlertManager.show(
        this,
        "LOW BALANCE",
        payload?.message || "Insufficient balance for next round.",
        () => {
          this.time.removeAllEvents();
          this.tweens.killAll();
          session.cleanupGameListeners();
          this.resetTable();
          this.scene.start("LobbyScene", { username: this.username, coins: this.userData.coins });
        },
        "OK"
      );
    });

    session.socket.off("rejoin_error");
    session.socket.on("rejoin_error", () => {
      AlertManager.show(
        this,
        "MATCH ENDED",
        "The match finished while you were away.",
        () => {
          this.time.removeAllEvents();
          this.tweens.killAll();
          session.cleanupGameListeners();
          this.resetTable();
          if (this.isPrivate) session.socket.emit("leave_private_room", { username: this.username, roomId: this.roomId });
          else session.socket.emit("leave_city", { username: this.username, configId: this.configId, cityIndex: this.cityIndex });
          this.scene.start("LobbyScene", { username: this.username, coins: this.userData.coins });
        },
        "OK"
      );
    });

    this.events.once("shutdown", () => {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      session.cleanupGameListeners();
    });
  }

  // ==========================================
  // SUPER-ANIMATIVE LUXURY CYBER ACTION BUTTON
  // ==========================================
  createActionButton(x, y, width, height, label, fillHex, strokeHex, textColor, onClick) {
    const container = this.add.container(x, y).setDepth(1500);
    container.baseX = x;
    container.baseY = y;

    // 1. Breathing Outer Neon Halo
    const aura = this.add.graphics();
    aura.fillStyle(strokeHex, 0.22);
    aura.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 22);
    aura.setAlpha(0);

    // 2. Multi-Layered Luxury Beveled Body
    const bg = this.add.graphics();
    const drawBg = (isHovered = false, isPressed = false) => {
      bg.clear();

      // Drop shadow
      bg.fillStyle(0x000000, 0.65);
      bg.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, 16);

      // Deep Obsidian Base
      bg.fillStyle(0x060609, 0.96);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 16);

      // Colored Inner Core Tint
      bg.fillStyle(fillHex, isHovered ? 0.95 : 0.78);
      bg.fillRoundedRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 14);

      // Top Glass Specular Highlight
      bg.fillStyle(0xffffff, isHovered ? 0.18 : 0.09);
      bg.fillRoundedRect(-width / 2 + 6, -height / 2 + 4, width - 12, height * 0.42, {
        tl: 11,
        tr: 11,
        bl: 3,
        br: 3
      });

      // Bottom Neon Status Accent Pill
      bg.fillStyle(strokeHex, isHovered ? 1 : 0.8);
      bg.fillRoundedRect(-width * 0.26, height / 2 - 7, width * 0.52, 4, 2);

      // Outer Neon Border
      bg.lineStyle(isHovered ? 3.5 : 2.5, isPressed ? 0xffffff : strokeHex, 1);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);

      // Inner Gold/Cyber Rim
      bg.lineStyle(1, 0xffffff, isHovered ? 0.45 : 0.16);
      bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 12);

      // Cyber Corner Brackets
      const cLen = 12;
      const r = width / 2 - 3;
      const b = height / 2 - 3;
      bg.lineStyle(2, 0xffffff, isHovered ? 0.85 : 0.35);
      // Top-left bracket
      bg.beginPath();
      bg.moveTo(-r, -b + cLen);
      bg.lineTo(-r, -b);
      bg.lineTo(-r + cLen, -b);
      bg.strokePath();
      // Bottom-right bracket
      bg.beginPath();
      bg.moveTo(r, b - cLen);
      bg.lineTo(r, b);
      bg.lineTo(r - cLen, b);
      bg.strokePath();
    };
    drawBg(false, false);

    // 3. Shimmer Light Sweep Bar
    const shimmer = this.add.graphics();
    shimmer.fillStyle(0xffffff, 0.28);
    shimmer.fillRect(-14, -height / 2 + 4, 28, height - 8);
    shimmer.setAngle(18);
    shimmer.x = -width / 2 - 30;
    shimmer.setAlpha(0);

    // 4. Crisp Label Text
    const textObj = this.add
      .text(0, -2, label, {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
        fontSize: "24px",
        color: textColor,
        letterSpacing: 1.8,
        stroke: "#000000",
        strokeThickness: 5,
        align: "center"
      })
      .setOrigin(0.5)
      .setShadow(0, 2, "#000000", 6, true, true);

    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5);

    const triggerShimmerSweep = () => {
      this.tweens.killTweensOf(shimmer);
      shimmer.x = -width / 2 - 25;
      shimmer.setAlpha(0.75);
      this.tweens.add({
        targets: shimmer,
        x: width / 2 + 25,
        alpha: 0,
        duration: 420,
        ease: "Cubic.easeOut"
      });
    };

    // Make buttons touch-friendly on Android
    hitZone.on("pointerdown", () => {
      if (!container.isEnabled) return;
      
      // 1. FIRE THE CLICK ACTION INSTANTLY! (This fixes the mobile touch bug)
      if (onClick) onClick();
      
      drawBg(true, true);
      triggerShimmerSweep();

      // Shockwave Ripple Effect
      const ripple = this.add.graphics();
      ripple.lineStyle(3, strokeHex, 1);
      ripple.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
      container.addAt(ripple, 0);
      this.tweens.add({
        targets: ripple,
        scaleX: 1.25,
        scaleY: 1.38,
        alpha: 0,
        duration: 320,
        ease: "Cubic.easeOut",
        onComplete: () => ripple.destroy()
      });

      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container,
        scaleX: 0.92,
        scaleY: 0.92,
        y: container.baseY + 3,
        duration: 75,
        ease: "Quad.easeIn",
        yoyo: true,
        onComplete: () => {
          container.setScale(1);
          container.y = container.baseY;
          drawBg(false, false);
        }
      });
    });

    hitZone.on("pointerover", () => {
      if (!container.isEnabled) return;
      drawBg(true, false);
      triggerShimmerSweep();
      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container,
        scaleX: 1.07,
        scaleY: 1.07,
        y: container.baseY - 7,
        duration: 180,
        ease: "Back.easeOut"
      });
      this.tweens.add({
        targets: textObj,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 160,
        ease: "Sine.easeOut"
      });
    });

    hitZone.on("pointerout", () => {
      drawBg(false, false);
      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        y: container.baseY,
        duration: 200,
        ease: "Cubic.easeOut"
      });
      this.tweens.add({
        targets: textObj,
        scaleX: 1,
        scaleY: 1,
        duration: 160,
        ease: "Sine.easeOut"
      });
    });

    container.add([aura, bg, shimmer, textObj, hitZone]);
    container.textObj = textObj;
    container.hitZone = hitZone;
    container.isEnabled = false;
    container.pulseTween = null;

    container.setButtonEnabled = enabled => {
      const nextState = Boolean(enabled);
      const changed = container.isEnabled !== nextState;
      container.isEnabled = nextState;

      if (nextState) {
        container.setAlpha(1);
        hitZone.setInteractive({ useHandCursor: true });
        if (changed) {
          drawBg(false, false);
          if (container.pulseTween) container.pulseTween.stop();
          aura.setAlpha(0.25);
          container.pulseTween = this.tweens.add({
            targets: aura,
            alpha: { from: 0.18, to: 0.65 },
            scaleX: { from: 0.98, to: 1.04 },
            scaleY: { from: 0.98, to: 1.06 },
            duration: 850,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        }
      } else {
        if (container.pulseTween) {
          container.pulseTween.stop();
          container.pulseTween = null;
        }
        aura.setAlpha(0);
        this.tweens.killTweensOf(container);
        container.setScale(1);
        container.y = container.baseY;
        drawBg(false, false);
        container.setAlpha(0.32);
        hitZone.disableInteractive();
      }
    };

    container.setLabel = str => {
      textObj.setText(str);
    };

    return container;
  }

  buildStaticUI() {
    const w = this.scale.width;
    const h = this.scale.height;
    const btnY = h * 0.92;
    const btnW = 212;
    const btnH = 66;
    const gap = 236;
    const startX = w / 2 - gap * 2;

    // 1. FOLD BUTTON (Crimson Obsidian)
    this.foldBtn = this.createActionButton(
      startX,
      btnY,
      btnW,
      btnH,
      "FOLD",
      0x2b060d,
      0xff0033,
      "#ff5c77",
      () => {
        if (this.sndPack) this.sndPack.play();
        this.sendAction("fold");
      }
    );

    // 2. CHECK BUTTON (Cyber Cyan Obsidian)
    this.checkBtn = this.createActionButton(
      startX + gap,
      btnY,
      btnW,
      btnH,
      "CHECK",
      0x062030,
      0x00e5ff,
      "#8cefff",
      () => {
        if (this.sndClick) this.sndClick.play();
        this.sendAction("check");
      }
    );

    // 3. CALL BUTTON (Emerald Neon Obsidian)
    this.callBtn = this.createActionButton(
      startX + gap * 2,
      btnY,
      btnW,
      btnH,
      "CALL",
      0x062914,
      0x00ff88,
      "#5bffb0",
      () => {
        if (this.sndBlind) this.sndBlind.play();
        const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
        if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
        this.sendAction("call");
      }
    );

    // 4. RAISE / BET BUTTON (Royal Gold Obsidian)
    this.raiseBtn = this.createActionButton(
      startX + gap * 3,
      btnY,
      btnW,
      btnH,
      "RAISE",
      0x2e2004,
      0xffcc00,
      "#ffe066",
      () => {
        if (this.sndClick) this.sndClick.play();

        const me = this.players.find(p => p.username.toLowerCase() === this.username);
        if (!me) return;

        const myInvested = me.investedThisPhase || 0;
        const step = Math.max(1, this.minRaiseIncrement || this.smallBlind);
        this.minRaiseTarget = this.highestBet + step;
        this.maxRaiseTarget = myInvested + me.coins;

        if (this.maxRaiseTarget <= this.minRaiseTarget) {
          if (this.sndChaal) this.sndChaal.play();
          const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
          if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
          this.sendAction("all_in");
        } else {
          this.isRaising = true;
          this.setSliderTargetBet(this.minRaiseTarget);
          this.updateTurnUI();
          this.animateRaiseTowerIn();
        }
      }
    );

    // 5. ALL-IN BUTTON (Royal Amethyst & Gold)
    this.allInBtn = this.createActionButton(
      startX + gap * 4,
      btnY,
      btnW,
      btnH,
      "ALL-IN",
      0x290633,
      0xe066ff,
      "#f7ccff",
      () => {
        if (this.sndChaal) this.sndChaal.play();
        const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
        if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
        this.sendAction("all_in");
      }
    );

    // =========================================================================
    // VERTICAL LUXURY BET SCROLL TOWER (Positioned Below EXIT Button Space)
    // =========================================================================
    const towerX = w - 115;
    const towerY = h * 0.53;
    this.raiseTowerBaseX = towerX;
    this.raiseTowerBaseY = towerY;

    this.raiseContainer = this.add.container(towerX, towerY).setDepth(2200).setVisible(false);

    const towerW = 196;
    const towerH = 640;
    const trackX = 44;
    const trackW = 18;
    const minY = -145; // Top of vertical track = MAX / ALL-IN
    const maxY = 135;  // Bottom of vertical track = MIN
    this.sliderTrackX = trackX;
    this.sliderTrackW = trackW;
    this.sliderMinY = minY;
    this.sliderMaxY = maxY;

    // 1. Outer Glow & Obsidian Glass Tower Frame
    const panelBg = this.add.graphics();
    // Outer Crimson/Gold Halo
    panelBg.fillStyle(0xff0033, 0.14);
    panelBg.fillRoundedRect(-towerW / 2 - 8, -towerH / 2 - 8, towerW + 16, towerH + 16, 26);
    // Main Obsidian Body
    panelBg.fillStyle(0x050508, 0.96);
    panelBg.fillRoundedRect(-towerW / 2, -towerH / 2, towerW, towerH, 22);
    // Inner Luxury Gold Frame
    panelBg.lineStyle(2.5, 0xffcc00, 0.95);
    panelBg.strokeRoundedRect(-towerW / 2, -towerH / 2, towerW, towerH, 22);
    // Subtle Inner Crimson Trim
    panelBg.lineStyle(1, 0xff0033, 0.45);
    panelBg.strokeRoundedRect(-towerW / 2 + 5, -towerH / 2 + 5, towerW - 10, towerH - 10, 18);

    // Top Amount Readout Box
    panelBg.fillStyle(0x14080c, 0.95);
    panelBg.fillRoundedRect(-towerW / 2 + 12, -towerH / 2 + 14, towerW - 24, 74, 14);
    panelBg.lineStyle(1.5, 0xffcc00, 0.85);
    panelBg.strokeRoundedRect(-towerW / 2 + 12, -towerH / 2 + 14, towerW - 24, 74, 14);
    this.raiseContainer.add(panelBg);

    // Header Title & Live Amount Text
    this.raiseHeaderLabel = this.add
      .text(0, -towerH / 2 + 32, "RAISE TO", {
        fontFamily: "Courier New",
        fontSize: "14px",
        color: "#ffcc00",
        fontWeight: "bold",
        letterSpacing: 2
      })
      .setOrigin(0.5);

    this.raiseAmountTextUI = this.add
      .text(0, -towerH / 2 + 62, "0", {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
        fontSize: "28px",
        color: "#ffffff",
        letterSpacing: 1.5,
        stroke: "#ff0033",
        strokeThickness: 4
      })
      .setOrigin(0.5);
    this.raiseContainer.add([this.raiseHeaderLabel, this.raiseAmountTextUI]);

    // 2. Vertical Slider Track & Tick Marks
    const trackBg = this.add.graphics();
    // Tick marks along the vertical track
    for (let t = 0; t <= 10; t++) {
      const ty = minY + (t / 10) * (maxY - minY);
      const isMajor = t === 0 || t === 5 || t === 10;
      trackBg.lineStyle(isMajor ? 2 : 1, isMajor ? 0xffcc00 : 0x555555, isMajor ? 0.8 : 0.45);
      trackBg.beginPath();
      trackBg.moveTo(trackX - trackW / 2 - (isMajor ? 10 : 6), ty);
      trackBg.lineTo(trackX - trackW / 2 - 2, ty);
      trackBg.strokePath();
    }
    // Track Well
    trackBg.fillStyle(0x14141c, 1);
    trackBg.fillRoundedRect(trackX - trackW / 2, minY, trackW, maxY - minY, 9);
    trackBg.lineStyle(2, 0x444455, 1);
    trackBg.strokeRoundedRect(trackX - trackW / 2, minY, trackW, maxY - minY, 9);
    this.raiseContainer.add(trackBg);

    // Dynamic Vertical Fill Bar (Fills from Bottom up to Thumb)
    this.raiseFill = this.add.graphics();
    this.raiseContainer.add(this.raiseFill);

    // Interactive Track Hit Zone (Click anywhere on track to jump to that bet)
    const trackHitZone = this.add
      .zone(trackX, (minY + maxY) / 2, 48, maxY - minY + 30)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    trackHitZone.on("pointerdown", pointer => {
      if (this.sndClick) this.sndClick.play();
      const localY = pointer.y - this.raiseContainer.y;
      const clampedY = Phaser.Math.Clamp(localY, minY, maxY);
      const percent = (maxY - clampedY) / (maxY - minY);
      const rawTarget = this.minRaiseTarget + percent * (this.maxRaiseTarget - this.minRaiseTarget);
      this.setSliderTargetBet(rawTarget);
    });
    this.raiseContainer.add(trackHitZone);

    // Draggable Luxury Gold & Crimson Thumb
    this.raiseThumbGlow = this.add.circle(trackX, maxY, 26, 0xff0033, 0.35);
    this.raiseThumb = this.add
      .circle(trackX, maxY, 18, 0xffcc00)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.raiseThumb.setStrokeStyle(3.5, 0xffffff);
    this.input.setDraggable(this.raiseThumb);
    this.raiseContainer.add([this.raiseThumbGlow, this.raiseThumb]);

    this.tweens.add({
      targets: this.raiseThumbGlow,
      scaleX: { from: 0.9, to: 1.25 },
      scaleY: { from: 0.9, to: 1.25 },
      alpha: { from: 0.45, to: 0.15 },
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    // + and - Fine-Tune Step Buttons at Top & Bottom of Track
    const makeStepBtn = (bx, by, symbol, deltaSign) => {
      const sContainer = this.add.container(bx, by);
      const sBg = this.add.graphics();
      sBg.fillStyle(0x161622, 1).fillCircle(0, 0, 18);
      sBg.lineStyle(2, 0xffcc00, 0.9).strokeCircle(0, 0, 18);
      const sTxt = this.add
        .text(0, -1, symbol, {
          fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
          fontSize: "20px",
          color: "#ffcc00"
        })
        .setOrigin(0.5);
      const sZone = this.add
        .zone(0, 0, 38, 38)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      sZone.on("pointerover", () => sContainer.setScale(1.12));
      sZone.on("pointerout", () => sContainer.setScale(1));
      sZone.on("pointerdown", () => {
        if (this.sndClick) this.sndClick.play();
        sContainer.setScale(0.9);
        this.time.delayedCall(80, () => sContainer.setScale(1));
        const step = 10;
        this.setSliderTargetBet(this.currentRaiseTarget + deltaSign * step);
      });
      sContainer.add([sBg, sTxt, sZone]);
      return sContainer;
    };

    const plusBtn = makeStepBtn(trackX, minY - 34, "+", 1);
    const minusBtn = makeStepBtn(trackX, maxY + 34, "−", -1);
    this.raiseContainer.add([plusBtn, minusBtn]);

    // 3. Vertical Quick-Preset Pills on the Left Column of the Tower
    const presets = [
      { label: "MAX", y: -135, color: 0xff0033, getTarget: () => this.maxRaiseTarget },
      {
        label: "POT",
        y: -45,
        color: 0xffcc00,
        getTarget: () => this.highestBet + Math.max(this.bigBlind, this.pot)
      },
      {
        label: "1/2 POT",
        y: 45,
        color: 0x00e5ff,
        getTarget: () => this.highestBet + Math.max(this.smallBlind, Math.floor(this.pot * 0.5))
      },
      { label: "MIN", y: 135, color: 0x00ff88, getTarget: () => this.minRaiseTarget }
    ];

    presets.forEach(pr => {
      const pContainer = this.add.container(-36, pr.y);
      const pW = 92;
      const pH = 42;
      const pBg = this.add.graphics();
      const drawPreset = hovered => {
        pBg.clear();
        pBg.fillStyle(hovered ? pr.color : 0x12121a, hovered ? 0.28 : 0.95);
        pBg.fillRoundedRect(-pW / 2, -pH / 2, pW, pH, 10);
        pBg.lineStyle(hovered ? 2.5 : 1.5, pr.color, 0.95);
        pBg.strokeRoundedRect(-pW / 2, -pH / 2, pW, pH, 10);
      };
      drawPreset(false);

      const pTxt = this.add
        .text(0, 0, pr.label, {
          fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
          fontSize: "16px",
          color: "#ffffff",
          letterSpacing: 1,
          stroke: "#000000",
          strokeThickness: 3
        })
        .setOrigin(0.5);

      const pZone = this.add
        .zone(0, 0, pW, pH)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      pZone.on("pointerover", () => {
        drawPreset(true);
        this.tweens.add({ targets: pContainer, scaleX: 1.07, scaleY: 1.07, duration: 120 });
      });
      pZone.on("pointerout", () => {
        drawPreset(false);
        this.tweens.add({ targets: pContainer, scaleX: 1, scaleY: 1, duration: 120 });
      });
      pZone.on("pointerdown", () => {
        if (this.sndClick) this.sndClick.play();
        this.tweens.add({
          targets: pContainer,
          scaleX: 0.92,
          scaleY: 0.92,
          duration: 70,
          yoyo: true
        });
        this.setSliderTargetBet(pr.getTarget());
      });

      pContainer.add([pBg, pTxt, pZone]);
      this.raiseContainer.add(pContainer);
    });

    // 4. Confirm & Cancel Buttons at the Bottom of the Vertical Tower
    const makeTowerActionBtn = (by, bHeight, labelText, fillHex, borderHex, textColor, onTrigger) => {
      const bCont = this.add.container(0, by);
      const bWidth = towerW - 26;
      const bGfx = this.add.graphics();
      const drawBtn = hovered => {
        bGfx.clear();
        bGfx.fillStyle(fillHex, hovered ? 1 : 0.9);
        bGfx.fillRoundedRect(-bWidth / 2, -bHeight / 2, bWidth, bHeight, 12);
        bGfx.fillStyle(0xffffff, hovered ? 0.16 : 0.07);
        bGfx.fillRoundedRect(-bWidth / 2 + 4, -bHeight / 2 + 3, bWidth - 8, bHeight * 0.42, 8);
        bGfx.lineStyle(hovered ? 3 : 2, borderHex, 1);
        bGfx.strokeRoundedRect(-bWidth / 2, -bHeight / 2, bWidth, bHeight, 12);
      };
      drawBtn(false);

      const bTxt = this.add
        .text(0, 0, labelText, {
          fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif',
          fontSize: "21px",
          color: textColor,
          letterSpacing: 1.5,
          stroke: "#000000",
          strokeThickness: 4
        })
        .setOrigin(0.5);

      const bZone = this.add
        .zone(0, 0, bWidth, bHeight)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      bZone.on("pointerover", () => {
        drawBtn(true);
        this.tweens.add({ targets: bCont, scaleX: 1.05, scaleY: 1.05, duration: 130 });
      });
      bZone.on("pointerout", () => {
        drawBtn(false);
        this.tweens.add({ targets: bCont, scaleX: 1, scaleY: 1, duration: 130 });
      });
      bZone.on("pointerdown", () => {
        if (onTrigger) onTrigger(); // <--- FIRE INSTANTLY FOR MOBILE
        
        this.tweens.add({
          targets: bCont,
          scaleX: 0.93,
          scaleY: 0.93,
          duration: 70,
          yoyo: true
        });
      });

      bCont.add([bGfx, bTxt, bZone]);
      return bCont;
    };

    const confirmTowerBtn = makeTowerActionBtn(
      224,
      50,
      "CONFIRM BET",
      0x072b14,
      0x00ff88,
      "#5bffb0",
      () => {
        if (this.sndChaal) this.sndChaal.play();
        const me = this.players.find(p => p.username.toLowerCase() === this.username);
        const myInvested = me ? me.investedThisPhase || 0 : 0;
        const chipsToInvestNow = Math.max(0, this.currentRaiseTarget - myInvested);

        const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
        if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);

        const act = this.currentRaiseTarget >= this.maxRaiseTarget ? "all_in" : "raise";
        this.sendAction(act, { amount: chipsToInvestNow, targetBet: this.currentRaiseTarget });

        this.isRaising = false;
        this.updateTurnUI();
      }
    );

    const cancelTowerBtn = makeTowerActionBtn(
      282,
      42,
      "CANCEL",
      0x29070d,
      0xff0033,
      "#ff5c77",
      () => {
        if (this.sndClickClose) this.sndClickClose.play();
        this.isRaising = false;
        this.updateTurnUI();
      }
    );

    this.raiseContainer.add([confirmTowerBtn, cancelTowerBtn]);

    // Vertical Drag Handler (Up = Higher Bet, Down = Lower Bet)
    this.raiseThumb.on("drag", (pointer, dragX, dragY) => {
      const clampedY = Phaser.Math.Clamp(dragY, minY, maxY);
      const percent = (maxY - clampedY) / (maxY - minY);
      const rawTarget = this.minRaiseTarget + percent * (this.maxRaiseTarget - this.minRaiseTarget);
      this.setSliderTargetBet(rawTarget);
    });

    // Mouse Wheel Support while Vertical Bet Tower is Open
    this.input.on("wheel", (pointer, gameObjects, dx, dy) => {
      if (!this.isRaising || !this.raiseContainer.visible) return;
      const step = 10;
      const direction = dy < 0 ? 1 : -1;
      this.setSliderTargetBet(this.currentRaiseTarget + direction * step);
    });
  }

  animateRaiseTowerIn() {
    if (!this.raiseContainer) return;
    this.tweens.killTweensOf(this.raiseContainer);
    this.raiseContainer.setVisible(true);
    this.raiseContainer.x = this.raiseTowerBaseX + 180;
    this.raiseContainer.setAlpha(0);
    this.raiseContainer.setScale(0.9);

    this.tweens.add({
      targets: this.raiseContainer,
      x: this.raiseTowerBaseX,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 260,
      ease: "Back.easeOut"
    });
  }

  setSliderTargetBet(targetBetAmount) {
    const minY = this.sliderMinY;
    const maxY = this.sliderMaxY;
    const trackX = this.sliderTrackX;
    const trackW = this.sliderTrackW;
    const snapUnit = 10;

    let snapped = Math.round(targetBetAmount / snapUnit) * snapUnit;
    if (targetBetAmount >= this.maxRaiseTarget) snapped = this.maxRaiseTarget;
    this.currentRaiseTarget = Phaser.Math.Clamp(snapped, this.minRaiseTarget, this.maxRaiseTarget);

    const snappedPercent =
      this.maxRaiseTarget <= this.minRaiseTarget
        ? 1
        : (this.currentRaiseTarget - this.minRaiseTarget) / (this.maxRaiseTarget - this.minRaiseTarget);

    // Vertical position: maxY is bottom (0%), minY is top (100%)
    const thumbY = maxY - snappedPercent * (maxY - minY);
    this.raiseThumb.x = trackX;
    this.raiseThumb.y = thumbY;
    if (this.raiseThumbGlow) {
      this.raiseThumbGlow.x = trackX;
      this.raiseThumbGlow.y = thumbY;
    }

    const headerTitle =
      this.currentRaiseTarget >= this.maxRaiseTarget
        ? "ALL-IN"
        : this.highestBet === 0
        ? "BET AMOUNT"
        : "RAISE TO";
    if (this.raiseHeaderLabel) this.raiseHeaderLabel.setText(headerTitle);
    this.raiseAmountTextUI.setText(this.currentRaiseTarget.toLocaleString());

    this.raiseFill.clear();
    const fillH = Math.max(10, maxY - thumbY);
    // Outer Crimson Neon Fill
    this.raiseFill.fillStyle(0xff0033, 1);
    this.raiseFill.fillRoundedRect(trackX - trackW / 2, thumbY, trackW, fillH, 8);
    // Inner Gold Core Strip
    this.raiseFill.fillStyle(0xffcc00, 0.85);
    this.raiseFill.fillRoundedRect(trackX - 3, thumbY + 2, 6, Math.max(6, fillH - 4), 3);
  }

  createBalanceBadge(x, y, width, height, angle, initialCoins) {
    const container = this.add.container(x, y).setAngle(angle || 0).setDepth(95);

    const pill = this.add.graphics();
    pill.fillStyle(0x050505, 0.9);
    pill.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    pill.lineStyle(2, 0xffcc00, 0.9);
    pill.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    const coinIcon = this.add.circle(-width / 2 + 14, 0, 6, 0xffcc00);
    const text = this.add
      .text(6, 0, Number(initialCoins || 0).toLocaleString(), {
        fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
        fontSize: "14px",
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 3
      })
      .setOrigin(0.5);

    container.add([pill, coinIcon, text]);
    container.textObj = text;
    return container;
  }

  buildPlayersAndSeats() {
    const w = this.scale.width;
    const h = this.scale.height;
    const seatPositions = [
      { x: w * 0.5, y: h * 0.70, inward: -90, textAngle: 0 },
      { x: w * 0.25, y: h * 0.6, inward: -35, textAngle: 48 },
      { x: w * 0.275, y: h * 0.36, inward: 35, textAngle: -42 },
      { x: w * 0.730, y: h * 0.37, inward: 145, textAngle: 42 },
      { x: w * 0.76, y: h * 0.6, inward: -145, textAngle: -52 }
    ];

    let selfPlayer = null;
    const otherPlayers = [];
    const youIndex = this.players.findIndex(p => p.username.toLowerCase() === this.username.toLowerCase());

    for (let i = 0; i < this.players.length; i++) {
      const offsetIdx = youIndex !== -1 ? (i - youIndex + this.players.length) % this.players.length : i;
      if (offsetIdx === 0 && youIndex !== -1) selfPlayer = this.players[i];
      else otherPlayers.push({ player: this.players[i], visualIdx: offsetIdx });
    }

    if (selfPlayer) {
      const avatarSize = 88;
      const myKey = `avatar_${selfPlayer.username.toLowerCase().trim()}`;
      const avatar = this.add
        .image(seatPositions[0].x, seatPositions[0].y, this.textures.exists(myKey) ? myKey : "avatar")
        .setDisplaySize(avatarSize, avatarSize);

      const rawSelfCoins =
        selfPlayer.coins !== undefined && selfPlayer.coins > 0
          ? selfPlayer.coins
          : this.maxPot > 0
          ? Math.min(Number(this.userData.coins || 0), this.maxPot)
          : Number(this.userData.coins || 0);

      // 1. Balance Pill placed below avatar, outside loading circle
      const coinsBadge = this.createBalanceBadge(
        seatPositions[0].x,
        seatPositions[0].y + 70,
        134,
        26,
        0,
        rawSelfCoins
      );
      this.selfCoinsText = coinsBadge.textObj;

      // 2. Name Text placed below Balance Pill
      const nameText = this.add
        .text(seatPositions[0].x, seatPositions[0].y + 104, selfPlayer.username, {
          fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
          fontSize: "21px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 5
        })
        .setOrigin(0.5)
        .setShadow(0, 3, "#000000", 6, true, true);

      const pv = {
        playerId: selfPlayer.id,
        username: selfPlayer.username,
        seatIndex: selfPlayer.seatIndex,
        label: nameText,
        coinsBadge,
        coinsText: coinsBadge.textObj,
        seat: seatPositions[0],
        avatar,
        timerGraphics: this.add.graphics(),
        statusBadge: null,
        roleBadge: null,
        cardSprites: []
      };
      this.playerViews.push(pv);

      for (let i = 0; i < 2; i++) {
        const card = this.add
          .image(seatPositions[0].x + (i === 0 ? -24 : 24), seatPositions[0].y - 122, "card_back")
          .setScale(0.7)
          .setAngle(i === 0 ? -8 : 8)
          .setAlpha(0);
        card.baseWidth = card.displayWidth;
        card.baseAngle = card.angle;
        card.baseScaleX = card.scaleX;
        card.baseScaleY = card.scaleY;
        this.userCards.push(card);
      }
      pv.cardSprites = this.userCards;
    }

    for (let i = 0; i < otherPlayers.length; i++) {
      const p = otherPlayers[i].player;
      const pos = seatPositions[otherPlayers[i].visualIdx];
      if (!pos) continue;

      const avatarSize = 74;
      const inwardRad = Phaser.Math.DegToRad(pos.inward);
      const outwardRad = inwardRad + Math.PI;
      const elementRotation = pos.inward + 90;

      const opponentKey = `avatar_${p.username.toLowerCase().trim()}`;
      const avatar = this.add
        .image(pos.x, pos.y, this.textures.exists(opponentKey) ? opponentKey : "avatar")
        .setDisplaySize(avatarSize, avatarSize)
        .setAngle(elementRotation);

      // 1. Balance Pill placed below avatar, outside loading circle
      const coinsDist = 64;
      const oppCoins =
        p.coins !== undefined && p.coins > 0
          ? p.coins
          : this.maxPot > 0
          ? this.maxPot
          : this.bigBlind * 50;
      const coinsBadge = this.createBalanceBadge(
        pos.x + coinsDist * Math.cos(outwardRad),
        pos.y + coinsDist * Math.sin(outwardRad),
        118,
        24,
        pos.textAngle,
        oppCoins
      );

      // 2. Name Text placed below Balance Pill
      const nameDist = 94;
      const nameText = this.add
        .text(
          pos.x + nameDist * Math.cos(outwardRad),
          pos.y + nameDist * Math.sin(outwardRad),
          p.username,
          {
            fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
            fontSize: "19px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 5
          }
        )
        .setOrigin(0.5)
        .setAngle(pos.textAngle)
        .setShadow(0, 3, "#000000", 5, true, true);

      const pv = {
        playerId: p.id,
        username: p.username,
        seatIndex: p.seatIndex,
        label: nameText,
        coinsBadge,
        coinsText: coinsBadge.textObj,
        seat: pos,
        avatar,
        timerGraphics: this.add.graphics(),
        statusBadge: null,
        roleBadge: null,
        cardSprites: []
      };
      this.playerViews.push(pv);

      const cardBaseX = pos.x + 90 * Math.cos(inwardRad);
      const cardBaseY = pos.y + 90 * Math.sin(inwardRad);
      const playerCards = [];

      for (let c = 0; c < 2; c++) {
        const dist = c === 0 ? -12 : 12;
        const card = this.add
          .image(
            cardBaseX + dist * Math.cos(inwardRad + Math.PI / 2),
            cardBaseY + dist * Math.sin(inwardRad + Math.PI / 2),
            "card_back"
          )
          .setScale(0.4)
          .setAlpha(0)
          .setAngle(elementRotation + (c === 0 ? -10 : 10));
        card.baseWidth = card.displayWidth;
        card.baseAngle = card.angle;
        card.baseScaleX = card.scaleX;
        card.baseScaleY = card.scaleY;
        playerCards.push(card);
      }
      this.otherPlayerCards.push(playerCards);
      pv.cardSprites = playerCards;
    }
  }

  updatePlayerCoinsUI() {
    if (!this.players || !this.playerViews) return;
    this.playerViews.forEach(pv => {
      const player = this.players.find(
        p => p.id === pv.playerId || p.username.toLowerCase() === pv.username.toLowerCase()
      );
      if (player && player.coins !== undefined && pv.coinsText) {
        pv.coinsText.setText(Number(player.coins).toLocaleString());
      }
    });
  }

  resetTable() {
    this.playerViews.forEach(pv => {
      if (pv.avatar) pv.avatar.destroy();
      if (pv.label) pv.label.destroy();
      if (pv.coinsBadge) pv.coinsBadge.destroy();
      if (pv.timerGraphics) pv.timerGraphics.destroy();
      if (pv.statusBadge) pv.statusBadge.destroy();
      if (pv.roleBadge) pv.roleBadge.destroy();
    });
    this.userCards.forEach(c => c.destroy());
    this.otherPlayerCards.flat().forEach(c => c.destroy());

    this.communitySprites.forEach(slot => {
      slot.container.setAlpha(0);
      slot.card.setTexture("card_back");
      slot.border.setTexture("card_back");
      slot.container.setPosition(slot.targetX, slot.targetY);
    });

    this.selfCoinsText = null;
    this.playerViews = [];
    this.userCards = [];
    this.otherPlayerCards = [];
    this.visibleCommunityCards = 0;
    this.roundFinished = false;
    this.dealingDone = false;
    this.isRaising = false;

    this.hideCyberWinnerDialog(true);
    this.hideWaitingOverlay();
  }

  showExitConfirmDialog() {
    const w = this.scale.width;
    const h = this.scale.height;

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
    overlay.setInteractive();
    overlay.setDepth(9999);

    this.tweens.add({
      targets: overlay,
      fillAlpha: 0.85,
      duration: 300,
      ease: "Linear"
    });

    const html = `
      <div id="alertContainer" style="
          width: 550px; 
          height: 280px; 
          display: flex; 
          justify-content: center; 
          align-items: center;
          user-select: none;
      ">
          <div id="cyberAlertWrapper" style="
              width: 2px;
              height: 280px;
              background: #050505;
              border-left: 2px solid #ff0033;
              border-right: 2px solid #ff0033;
              box-shadow: 0 0 40px rgba(255, 0, 51, 0.4);
              overflow: hidden;
              display: flex;
              justify-content: center;
              align-items: center;
              transform: translateY(100vh);
              transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
                          width 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
          ">
              <div id="cyberAlertContent" style="
                  min-width: 550px;
                  opacity: 0;
                  transition: opacity 0.2s linear;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  padding: 0 30px;
                  box-sizing: border-box;
              ">
                  <h1 style="
                      margin: 0 0 15px 0;
                      font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                      font-size: 34px;
                      color: #ff0033;
                      letter-spacing: 3px;
                      text-transform: uppercase;
                      text-shadow: 2px 2px 0px #330000;
                  ">WARNING</h1>

                  <p style="
                      margin: 0 0 35px 0;
                      font-family: 'Courier New', monospace;
                      font-size: 18px;
                      color: #ffcc00;
                      line-height: 1.5;
                      font-weight: bold;
                      text-align: center;
                      text-shadow: 0 0 5px rgba(255, 204, 0, 0.3);
                  ">Are you sure you want to exit?<br>If the match has started, you will<br>lose your invested amount.</p>

                  <div style="display: flex; gap: 20px;">
                      <button id="confirmBtn" style="
                          background: rgba(255, 0, 51, 0.05); 
                          border: 1px solid #ff0033;
                          padding: 10px 30px;
                          font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                          font-size: 18px;
                          color: #ff0033;
                          letter-spacing: 2px;
                          cursor: pointer;
                          transition: all 0.2s;
                          outline: none;
                      "
                      onmouseover="this.style.background='#ff0033'; this.style.color='#050505'; this.style.boxShadow='0 0 20px rgba(255, 0, 51, 0.8)';"
                      onmouseout="this.style.background='rgba(255, 0, 51, 0.05)'; this.style.color='#ff0033'; this.style.boxShadow='none';"
                      >CONFIRM</button>

                      <button id="cancelBtn" style="
                          background: rgba(255, 204, 0, 0.05); 
                          border: 1px solid #ffcc00;
                          padding: 10px 30px;
                          font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                          font-size: 18px;
                          color: #ffcc00;
                          letter-spacing: 2px;
                          cursor: pointer;
                          transition: all 0.2s;
                          outline: none;
                      "
                      onmouseover="this.style.background='#ffcc00'; this.style.color='#050505'; this.style.boxShadow='0 0 20px rgba(255, 204, 0, 0.8)';"
                      onmouseout="this.style.background='rgba(255, 204, 0, 0.05)'; this.style.color='#ffcc00'; this.style.boxShadow='none';"
                      >CANCEL</button>
                  </div>
              </div>
          </div>
      </div>
    `;

    const dialogDOM = this.add.dom(w / 2, h / 2).createFromHTML(html);
    dialogDOM.setDepth(10000);

    const wrapper = dialogDOM.getChildByID("cyberAlertWrapper");
    const content = dialogDOM.getChildByID("cyberAlertContent");

    setTimeout(() => {
      if (wrapper && content) {
        wrapper.style.transform = "translateY(0)";
        setTimeout(() => {
          wrapper.style.width = "100%";
        }, 350);
        setTimeout(() => {
          content.style.opacity = "1";
        }, 700);
      }
    }, 50);

    const executeExitAnimation = onCompleteCallback => {
      if (content) content.style.opacity = "0";
      setTimeout(() => {
        if (wrapper) wrapper.style.width = "2px";
      }, 200);
      setTimeout(() => {
        if (wrapper) wrapper.style.transform = "translateY(100vh)";
        this.tweens.add({
          targets: overlay,
          fillAlpha: 0,
          duration: 350,
          ease: "Linear",
          onComplete: () => {
            overlay.destroy();
            dialogDOM.destroy();
            if (onCompleteCallback) onCompleteCallback();
          }
        });
      }, 550);
    };

    dialogDOM.addListener("click");
    dialogDOM.on("click", event => {
      if (event.target.id === "cancelBtn") {
        if (this.sndClickClose) this.sndClickClose.play();
        event.target.disabled = true;
        const cBtn = dialogDOM.getChildByID("confirmBtn");
        if (cBtn) cBtn.disabled = true;
        executeExitAnimation();
      } else if (event.target.id === "confirmBtn") {
        if (this.sndClickClose) this.sndClickClose.play();
        event.target.disabled = true;
        const xBtn = dialogDOM.getChildByID("cancelBtn");
        if (xBtn) xBtn.disabled = true;

        executeExitAnimation(() => {
          this.time.removeAllEvents();
          this.tweens.killAll();
          session.cleanupGameListeners();
          this.resetTable();
          if (this.isPrivate) session.socket.emit("leave_private_room", { username: this.username, roomId: this.roomId });
          else session.socket.emit("leave_city", { username: this.username, configId: this.configId, cityIndex: this.cityIndex });
          this.scene.start("LobbyScene", { username: this.username, coins: this.userData.coins });
        });
      }
    });
  }

  showCyberWinnerDialog(titleText, bodyHtml, onCompleteCallback) {
    const w = this.scale.width;
    const h = this.scale.height;

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
    overlay.setInteractive();
    overlay.setDepth(9999);

    this.tweens.add({ targets: overlay, fillAlpha: 0.85, duration: 300, ease: "Linear" });

    const html = `
      <div id="winnerAlertContainer" style="
          width: 550px; 
          height: 320px; 
          display: flex; 
          justify-content: center; 
          align-items: center;
          user-select: none;
      ">
          <div id="cyberWinnerWrapper" style="
              width: 2px;
              height: 320px;
              background: #050505;
              border-left: 2px solid #ffcc00;
              border-right: 2px solid #ffcc00;
              box-shadow: 0 0 40px rgba(255, 204, 0, 0.4);
              overflow: hidden;
              display: flex;
              justify-content: center;
              align-items: center;
              transform: translateY(100vh);
              transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
                          width 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
          ">
              <div id="cyberWinnerContent" style="
                  min-width: 550px;
                  opacity: 0;
                  transition: opacity 0.2s linear;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  padding: 0 30px;
                  box-sizing: border-box;
              ">
                  <h1 style="
                      margin: 0 0 20px 0;
                      font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                      font-size: 38px;
                      color: #ffcc00;
                      letter-spacing: 3px;
                      text-transform: uppercase;
                      text-shadow: 2px 2px 0px #332200;
                  ">${titleText}</h1>

                  <p style="
                      margin: 0 0 35px 0;
                      font-family: 'Courier New', monospace;
                      font-size: 22px;
                      line-height: 1.6;
                      font-weight: bold;
                      text-align: center;
                  ">${bodyHtml}</p>

                  <button id="winnerOkBtn" style="
                      background: rgba(255, 204, 0, 0.05); 
                      border: 1px solid #ffcc00;
                      padding: 10px 40px;
                      font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                      font-size: 20px;
                      color: #ffcc00;
                      letter-spacing: 2px;
                      cursor: pointer;
                      transition: all 0.2s;
                      outline: none;
                  "
                  onmouseover="this.style.background='#ffcc00'; this.style.color='#050505'; this.style.boxShadow='0 0 20px rgba(255, 204, 0, 0.8)';"
                  onmouseout="this.style.background='rgba(255, 204, 0, 0.05)'; this.style.color='#ffcc00'; this.style.boxShadow='none';"
                  >CONTINUE</button>
              </div>
          </div>
      </div>
    `;

    const dialogDOM = this.add.dom(w / 2, h / 2).createFromHTML(html);
    dialogDOM.setDepth(10000);

    const wrapper = dialogDOM.getChildByID("cyberWinnerWrapper");
    const content = dialogDOM.getChildByID("cyberWinnerContent");

    setTimeout(() => {
      if (wrapper && content) {
        wrapper.style.transform = "translateY(0)";
        setTimeout(() => {
          wrapper.style.width = "100%";
        }, 350);
        setTimeout(() => {
          content.style.opacity = "1";
        }, 700);
      }
    }, 50);

    this.winnerDialogUI = { overlay, dialogDOM, wrapper, content, onCompleteCallback };

    dialogDOM.addListener("click");
    dialogDOM.on("click", event => {
      if (event.target.id === "winnerOkBtn") {
        if (this.sndClickClose) this.sndClickClose.play();
        event.target.disabled = true;
        this.hideCyberWinnerDialog(false);
      }
    });
  }

  hideCyberWinnerDialog(skipAnim = false) {
    if (!this.winnerDialogUI) return;

    const { overlay, dialogDOM, wrapper, content, onCompleteCallback } = this.winnerDialogUI;
    this.winnerDialogUI = null;

    if (skipAnim) {
      if (overlay) overlay.destroy();
      if (dialogDOM) dialogDOM.destroy();
      if (onCompleteCallback) onCompleteCallback();
      return;
    }

    if (content) content.style.opacity = "0";
    setTimeout(() => {
      if (wrapper) wrapper.style.width = "2px";
    }, 200);
    setTimeout(() => {
      if (wrapper) wrapper.style.transform = "translateY(100vh)";

      if (this.scene && this.scene.isActive()) {
        this.tweens.add({
          targets: overlay,
          fillAlpha: 0,
          duration: 350,
          ease: "Linear",
          onComplete: () => {
            if (overlay) overlay.destroy();
            if (dialogDOM) dialogDOM.destroy();
            if (onCompleteCallback) onCompleteCallback();
          }
        });
      } else {
        if (overlay) overlay.destroy();
        if (dialogDOM) dialogDOM.destroy();
        if (onCompleteCallback) onCompleteCallback();
      }
    }, 550);
  }

  showWaitingOverlay(payload) {
    const w = this.scale.width;
    const h = this.scale.height;

    if (this.sessionIdText) this.sessionIdText.setText(payload.sessionId || payload.roomId || "WAITING");

    if (this.waitOverlay && this.waitOverlay.cachedPhase !== payload.phase) this.hideWaitingOverlay();

    if (!this.waitOverlay) {
      const dim = this.add.rectangle(w / 2, h / 2 - 20, 500, 220, 0x000000, 0.8).setDepth(2000);
      const title = this.add
        .text(w / 2, h / 2 - 80, "", {
          fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
          fontSize: "28px",
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 5
        })
        .setOrigin(0.5)
        .setDepth(2001);
      const body = this.add
        .text(w / 2, h / 2 - 20, "", {
          fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
          fontSize: "32px",
          color: "#ffffff",
          align: "center",
          stroke: "#000000",
          strokeThickness: 3
        })
        .setOrigin(0.5)
        .setDepth(2001);
      const sub = this.add
        .text(w / 2, h / 2 + 30, "", {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#dbe7ff",
          align: "center"
        })
        .setOrigin(0.5)
        .setDepth(2001);

      const startBtn = this.add
        .text(w / 2, h / 2 + 80, "START GAME", {
          fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
          fontSize: "24px",
          color: "#44ff44",
          stroke: "#000000",
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(2001)
        .setVisible(false);
      startBtn.on("pointerdown", () =>
        session.socket.emit("start_private_room", { roomId: this.roomId, username: this.username })
      );

      this.waitOverlay = { dim, title, body, sub, startBtn, cachedPhase: payload.phase };
    }

    if (payload.phase === "waiting_240") {
      const mins = Math.floor(payload.waitingSeconds / 60);
      const secs = payload.waitingSeconds % 60;
      this.waitOverlay.title.setText(`ROOM ID: ${payload.roomId}`);
      this.waitOverlay.body.setText(`Waiting: ${mins}:${secs < 10 ? "0" : ""}${secs}`);
    } else if (payload.phase === "waiting_random") {
      this.waitOverlay.title.setText("FINDING MATCH");
      this.waitOverlay.body.setText("Waiting for other players...");
    } else {
      this.waitOverlay.title.setText("MATCH STARTING");
      this.waitOverlay.body.setText(`Starting in: ${payload.waitingSeconds}s`);
    }

    this.waitOverlay.sub.setText(`Players Ready: ${payload.activePlayers}/5`);
    const isHost = this.username.toLowerCase() === (this.hostUsername || "").toLowerCase();
    if (this.isPrivate && isHost && payload.phase === "waiting_240" && payload.activePlayers >= 2) {
      this.waitOverlay.startBtn.setVisible(true);
    } else {
      this.waitOverlay.startBtn.setVisible(false);
    }
  }

  hideWaitingOverlay() {
    if (this.waitOverlay) {
      this.waitOverlay.dim.destroy();
      this.waitOverlay.title.destroy();
      this.waitOverlay.body.destroy();
      this.waitOverlay.sub.destroy();
      this.waitOverlay.startBtn.destroy();
      this.waitOverlay = null;
    }
  }

  animateJoinMoney() {
    const blindViews = this.playerViews.filter(
      pv => pv.seatIndex === this.sbIndex || pv.seatIndex === this.bbIndex
    );
    blindViews.forEach((pv, index) => {
      this.time.delayedCall(index * 160, () => {
        this.animateBetToDealer(pv.seat.x, pv.seat.y);
      });
    });
  }

  animateBetToDealer(startX, startY) {
    if (this.roundFinished) return;
    const coin = this.add.image(startX, startY, "coin_game").setScale(0.2);
    this.tweens.add({
      targets: coin,
      x: this.dealerX,
      y: this.potY,
      duration: 650,
      ease: "Power2",
      onComplete: () => coin.destroy()
    });
  }

  animateCardDistribution() {
    if (this.roundFinished) return;
    const totalCards = this.userCards.length + this.otherPlayerCards.flat().length;
    if (totalCards === 0) {
      this.dealingDone = true;
      this.updateTurnUI();
      return;
    }

    let done = 0;
    const markDone = () => {
      done++;
      if (done === totalCards) {
        this.dealingDone = true;
        if (this.privateHoleCards && this.privateHoleCards.length === 2) {
          this.revealPlayerCards(this.username, this.privateHoleCards, true);
        }
        session.sendGameAction({
          sessionId: this.sessionId,
          playerId: this.username.toLowerCase(),
          action: "dealing_complete"
        });
        this.updateTurnUI();
        this.updatePlayerStatusBadges();
      }
    };

    let delay = 0;
    for (let cardIndex = 0; cardIndex < 2; cardIndex++) {
      if (this.userCards[cardIndex]) {
        const card = this.userCards[cardIndex];
        const finalX = card.x;
        const finalY = card.y;
        const finalAngle = card.baseAngle || card.angle;
        card.setPosition(this.dealerX, this.dealerHandY).setScale(0.35).setAngle(0).setAlpha(1);
        this.tweens.add({
          targets: card,
          x: finalX,
          y: finalY,
          angle: finalAngle,
          scale: 0.7,
          duration: 380,
          delay,
          onStart: () => {
            if (this.sndCardDeal) this.sndCardDeal.play();
          },
          onComplete: markDone
        });
        delay += 110;
      }
      this.otherPlayerCards.forEach(playerCards => {
        if (playerCards[cardIndex]) {
          const card = playerCards[cardIndex];
          const finalX = card.x;
          const finalY = card.y;
          const finalAngle = card.baseAngle || card.angle;
          card.setPosition(this.dealerX, this.dealerHandY).setScale(0.3).setAngle(0).setAlpha(1);
          this.tweens.add({
            targets: card,
            x: finalX,
            y: finalY,
            angle: finalAngle,
            scale: 0.4,
            duration: 380,
            delay,
            onStart: () => {
              if (this.sndCardDeal) this.sndCardDeal.play();
            },
            onComplete: markDone
          });
          delay += 110;
        }
      });
    }
  }

  showMoveToast() {
    if (!this.scene.isActive() || !this.lastAction || typeof AlertManager === "undefined") return;
    const { username, action, amount } = this.lastAction;
    const actLabel = action.replace("_", "-").toUpperCase();
    const txt = `${username} ${actLabel}${amount ? ` (${Number(amount).toLocaleString()})` : ""}`;
    if (AlertManager.showToastx) AlertManager.showToastx(this, txt);
  }

  updateTurnUI() {
    const buttons = [this.foldBtn, this.checkBtn, this.callBtn, this.raiseBtn, this.allInBtn].filter(Boolean);

    const current = this.players[this.currentTurnIndex];
    const isUserTurn = Boolean(current && current.username.toLowerCase() === this.username.toLowerCase());

    if (!isUserTurn || this.roundFinished || !this.dealingDone) {
      this.isRaising = false;
    }

    this.updatePlayerCoinsUI();

    if (this.pot !== undefined && this.betInfoText) {
      const betStr = this.highestBet > 0 ? `  |  BET: ${Number(this.highestBet).toLocaleString()}` : "";
      this.betInfoText.setText(`POT: ${Number(this.pot || 0).toLocaleString()}${betStr}`);
    }
    if (this.phaseInfoText) {
      const phaseLabel = this.sessionId && this.dealingDone ? (this.currentPhase || "PREFLOP").toUpperCase() : "";
      this.phaseInfoText.setText(phaseLabel);
    }

    if (
      !this.players ||
      this.players.length === 0 ||
      !this.sessionId ||
      this.waitOverlay ||
      this.roundFinished ||
      !this.dealingDone
    ) {
      buttons.forEach(btn => {
        btn.setVisible(false);
        btn.setButtonEnabled(false);
      });
      if (this.raiseContainer) this.raiseContainer.setVisible(false);
      this.clearTimerCircles();
      return;
    }

    const me = this.players.find(p => p.username.toLowerCase() === this.username);
    if (!me) return;

    this.players.forEach(p => {
      const pv = this.playerViews.find(v => v.username.toLowerCase() === p.username.toLowerCase());
      if (pv && pv.cardSprites) {
        pv.cardSprites.forEach(sprite => {
          sprite.setAlpha(p.hasFolded ? 0.25 : 1);
        });
      }
    });

    if (me.hasFolded || me.isAllIn) {
      buttons.forEach(btn => {
        btn.setVisible(false);
        btn.setButtonEnabled(false);
      });
      this.raiseContainer.setVisible(false);
      this.updateTimerCircles();
      return;
    }

    if (this.isRaising && isUserTurn) {
      buttons.forEach(btn => {
        btn.setVisible(true);
        btn.setButtonEnabled(false);
      });
      this.raiseContainer.setVisible(true);
      this.updateTimerCircles();
      return;
    }

    this.raiseContainer.setVisible(false);
    buttons.forEach(btn => btn.setVisible(true));

    const myInvested = me.investedThisPhase || 0;
    const callAmount = Math.max(0, this.highestBet - myInvested);
    const step = Math.max(1, this.minRaiseIncrement || this.smallBlind);
    const minRaiseTo = this.highestBet + step;
    const minRaiseAdditional = callAmount + step;

    // 1. FOLD
    this.foldBtn.setLabel("FOLD");
    this.foldBtn.setButtonEnabled(isUserTurn);

    // 2. CHECK vs CALL
    if (callAmount === 0) {
      this.checkBtn.setLabel("CHECK");
      this.checkBtn.setButtonEnabled(isUserTurn);

      this.callBtn.setLabel("CALL");
      this.callBtn.setButtonEnabled(false);
    } else {
      this.checkBtn.setLabel("CHECK");
      this.checkBtn.setButtonEnabled(false);

      const effectiveCall = Math.min(me.coins, callAmount);
      this.callBtn.setLabel(`CALL ${effectiveCall.toLocaleString()}`);
      this.callBtn.setButtonEnabled(isUserTurn && me.coins > 0);
    }

    // 3. RAISE / BET
    const raiseVerb = this.highestBet === 0 ? "BET" : "RAISE";
    if (me.coins >= minRaiseAdditional) {
      this.raiseBtn.setLabel(`${raiseVerb} ${minRaiseTo.toLocaleString()}`);
      this.raiseBtn.setButtonEnabled(isUserTurn);
    } else {
      this.raiseBtn.setLabel(raiseVerb);
      this.raiseBtn.setButtonEnabled(false);
    }

    // 4. ALL-IN
    this.allInBtn.setLabel("ALL-IN");
    this.allInBtn.setButtonEnabled(isUserTurn && me.coins > 0);

    this.updateTimerCircles();
  }

  updateTimerCircles() {
    if (this.roundFinished || !this.dealingDone) {
      this.clearTimerCircles();
      return;
    }
    const total = this.turnTime || 25;
    const remaining = this.remainingTime;

    this.playerViews.forEach(pv => {
      const g = pv.timerGraphics;
      if (!g) return;
      g.clear();
      const player = this.players.find(p => p.id === pv.playerId);
      if (!player) return;

      const isActiveTurn =
        this.players[this.currentTurnIndex] &&
        this.players[this.currentTurnIndex].id === pv.playerId &&
        !player.hasFolded &&
        !player.isAllIn;
      const progress = isActiveTurn ? remaining / total : 0;
      if (progress <= 0) return;

      const radius = pv.avatar.displayWidth / 2 + 6;
      g.lineStyle(4, 0xffd200, 1)
        .beginPath()
        .arc(pv.seat.x, pv.seat.y, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress, false)
        .strokePath();
    });
  }

  clearTimerCircles() {
    this.playerViews.forEach(pv => {
      if (pv.timerGraphics) pv.timerGraphics.clear();
    });
  }

  updatePlayerStatusBadges() {
    if (!this.players || this.players.length === 0) return;

    this.playerViews.forEach(pv => {
      const playerIndex = this.players.findIndex(p => p.id === pv.playerId);
      if (playerIndex === -1) return;
      const player = this.players[playerIndex];
      const seatIdx = player.seatIndex ?? playerIndex;

      let labelText = "";
      let badgeColor = "#ffe400";
      if (player.hasFolded) {
        labelText = "FOLD";
        badgeColor = "#ff4d6d";
      } else if (player.isAllIn) {
        labelText = "ALL-IN";
        badgeColor = "#df8eff";
      } else if (player.investedThisPhase > 0) {
        labelText = `BET: ${Number(player.investedThisPhase).toLocaleString()}`;
        badgeColor = "#00ff88";
      }

      // Restored inside the player's avatar (away from the cards, timer circle, and balance pill)
      const inwardRad = Phaser.Math.DegToRad(pv.seat.inward ?? -100);
      const distance = pv.avatar.displayHeight / 2 - 10;
      const badgeX = pv.seat.x + distance * Math.cos(inwardRad + Math.PI);
      const badgeY = pv.seat.y + distance * Math.sin(inwardRad + Math.PI);

      if (!labelText) {
        if (pv.statusBadge) {
          pv.statusBadge.destroy();
          pv.statusBadge = null;
        }
      } else if (!pv.statusBadge) {
        pv.statusBadge = this.add
          .text(badgeX, badgeY, labelText, {
            fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
            fontSize: "13px",
            color: badgeColor,
            stroke: "#000000",
            strokeThickness: 3
          })
          .setOrigin(0.5)
          .setAngle(pv.label.angle || 0)
          .setDepth(100);
      } else {
        pv.statusBadge
          .setText(labelText)
          .setColor(badgeColor)
          .setAngle(pv.label.angle || 0)
          .setPosition(badgeX, badgeY);
      }

      // Dynamic Dealer (D), Small Blind (SB), and Big Blind (BB) Badges
      let roleText = "";
      if (this.dealingDone && !this.roundFinished) {
        if (seatIdx === this.dealerIndex && seatIdx === this.bbIndex) {
          roleText = "D / BB";
        } else if (seatIdx === this.dealerIndex && seatIdx === this.sbIndex) {
          roleText = "D / SB";
        } else if (seatIdx === this.dealerIndex) {
          roleText = "D";
        } else if (seatIdx === this.sbIndex) {
          roleText = "SB";
        } else if (seatIdx === this.bbIndex) {
          roleText = "BB";
        }
      }
      const roleX = pv.seat.x + (pv.avatar.displayWidth / 2) * 0.88;
      const roleY = pv.seat.y - (pv.avatar.displayHeight / 2) * 0.88;

      if (!roleText) {
        if (pv.roleBadge) {
          pv.roleBadge.destroy();
          pv.roleBadge = null;
        }
      } else if (!pv.roleBadge) {
        pv.roleBadge = this.add
          .text(roleX, roleY, roleText, {
            fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
            fontSize: "13px",
            color: "#050505",
            backgroundColor: "#ffcc00",
            padding: { x: 6, y: 2 }
          })
          .setOrigin(0.5)
          .setDepth(101);
      } else {
        pv.roleBadge.setText(roleText).setPosition(roleX, roleY);
      }
    });
  }

  revealPlayerCards(username, cards, animate = false) {
    if (!cards || cards.length === 0) return;
    const pv = this.playerViews.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (!pv || !pv.cardSprites) return;

    for (let i = 0; i < Math.min(2, pv.cardSprites.length); i++) {
      const sprite = pv.cardSprites[i];
      const texKey = cards[i] ? "card_" + cards[i] : "card_back";
      sprite.setAlpha(1);

      if (!animate) {
        sprite.setTexture(texKey);
        continue;
      }

      this.tweens.add({
        targets: sprite,
        scaleX: 0,
        duration: 120,
        ease: "Linear",
        onStart: () => {
          if (this.sndFlipCard) this.sndFlipCard.play();
        },
        onComplete: () => {
          sprite.setTexture(texKey);
          this.tweens.add({
            targets: sprite,
            scaleX: sprite.baseScaleX || 0.7,
            duration: 120,
            ease: "Linear"
          });
        }
      });
    }
  }

  animatePotToWinners(winners, onComplete) {
    let finishedCoins = 0;
    let totalCoinsSpawned = 0;
    let isDone = false;

    const safeComplete = () => {
      if (isDone) return;
      isDone = true;
      if (onComplete) onComplete();
    };

    winners.forEach(w => {
      const pv = this.playerViews.find(p => p.username.toLowerCase() === w.username.toLowerCase());
      if (!pv) return;

      const coinCount = 10;
      totalCoinsSpawned += coinCount;

      for (let i = 0; i < coinCount; i++) {
        const c = this.add
          .image(this.dealerX + (Math.random() - 0.5) * 40, this.potY + (Math.random() - 0.5) * 20, "coin_game")
          .setScale(0.22);
        this.tweens.add({
          targets: c,
          x: pv.seat.x,
          y: pv.seat.y,
          duration: 600 + i * 50,
          ease: "Power2",
          onComplete: () => {
            c.destroy();
            finishedCoins++;
            if (finishedCoins >= totalCoinsSpawned) this.time.delayedCall(300, safeComplete);
          }
        });
      }
    });

    if (totalCoinsSpawned === 0) {
      safeComplete();
      return;
    }
    this.time.delayedCall(4000, safeComplete);
  }

  sendAction(action, extra) {
    if (this.roundFinished) return;
    session.sendGameAction({
      sessionId: this.sessionId,
      playerId: this.username.toLowerCase(),
      action,
      ...extra
    });

    this.remainingTime = 0;
    this.updateTimerCircles();
  }

  showReconnectingOverlay() {
    if (this.reconnectOverlay) return;
    const w = this.scale.width;
    const h = this.scale.height;

    const bg = this.add.image(w / 2, h / 2, "lobby_bg").setDisplaySize(w, h).setDepth(5000);
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85).setDepth(5001).setInteractive();

    const panel = this.add.graphics().setDepth(5002);
    panel
      .fillStyle(0x1a1230, 1)
      .fillRoundedRect((w - 520) / 2, (h - 180) / 2, 520, 180, 26)
      .lineStyle(4, 0xffd700, 0.7)
      .strokeRoundedRect((w - 520) / 2, (h - 180) / 2, 520, 180, 26);

    const title = this.add
      .text(w / 2, (h - 180) / 2 + 50, "CONNECTION LOST", {
        fontFamily: '"Arial Black", "sans-serif-black", sans-serif',
        fontSize: "30px",
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setDepth(5003);
    const msg = this.add
      .text(w / 2, (h - 180) / 2 + 110, "RECONNECTING TO SERVER...", {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#ffffff"
      })
      .setOrigin(0.5)
      .setDepth(5003);

    this.reconnectOverlay = { bg, dim, panel, title, msg };
  }

  hideReconnectingOverlay() {
    if (!this.reconnectOverlay) return;
    Object.values(this.reconnectOverlay).forEach(obj => {
      if (obj && obj.destroy) obj.destroy();
    });
    this.reconnectOverlay = null;
  }
}