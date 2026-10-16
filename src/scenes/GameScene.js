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

    this.turnTime = data.turnTime ?? 15;
    this.remainingTime = this.turnTime;

    this.playerViews = [];
    this.userCards = [];
    this.otherPlayerCards = [];
    this.communitySprites = [];
    this.visibleCommunityCards = 0;

    this.bigBlind = data.bootAmount ?? (this.table ? this.table.bootAmount : 100);
    this.highestBet = data.highestBet ?? (this.table ? this.table.highestBet : this.bigBlind);
    this.minRaiseIncrement = data.minRaiseIncrement ?? (this.table ? this.table.minRaiseIncrement : this.bigBlind);
    this.maxPot = data.maxPot ?? 50000;
    this.pot = data.pot ?? (this.table ? this.table.pot : Math.floor(this.bigBlind * 1.5));
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
    this.minRaise = 0;
    this.maxRaise = 0;
    this.currentRaiseAmount = 0;
    this.selfCoinsBg = null;
    this.selfCoinsText = null;
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
      .text(w * 0.32, 235, nameParts[0] || "PRIVATE", {
        fontFamily: "Arial Black, Impact",
        fontSize: "28px",
        color: themeStyles.primaryColor,
        stroke: themeStyles.strokeColor,
        strokeThickness: themeStyles.strokeThickness,
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setShadow(0, 4, themeStyles.shadowColor, themeStyles.shadowBlur, true, true);

    this.add
      .text(w * 0.68, 235, nameParts.slice(1).join(" ") || "ROOM", {
        fontFamily: "Arial Black, Impact",
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
        fontFamily: "Impact, Arial Black",
        fontSize: "24px",
        color: "#ff0033",
        letterSpacing: 2
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "rgba(255,0,51,0.6)", 12, false, true);

    this.sessionIdText = this.add
      .text(w / 2, h * 0.5, this.sessionId || "", {
        fontFamily: "Arial Black",
        fontSize: "22px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setAlpha(0.2);

    this.betInfoText = this.add
      .text(w / 2 - 540, 60, "", {
        fontFamily: "Arial Black",
        fontSize: "30px",
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
    this.dealerY = h * 0.17;
    this.dealerHandY = this.dealerY + 75;

    this.add.image(this.dealerX, this.dealerY, "dealer_girl").setScale(0.4);
    this.potY = this.dealerY + 90;

    // --- COMMUNITY CARDS (5 CENTER SLOTS) ---
    this.communityFinalScale = 0.32;
    const communityY = h * 0.38;
    const communitySpacing = 85;
    const communityStartX = w / 2 - communitySpacing * 2;

    for (let i = 0; i < 5; i++) {
      const targetX = communityStartX + i * communitySpacing;
      const container = this.add.container(targetX, communityY).setAlpha(0).setDepth(50);

      const border = this.add.image(0, 0, "card_back").setTint(0xffd700).setScale(1.08).setAlpha(0.85);
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
      this.highestBet = payload.highestBet ?? this.bigBlind;
      this.minRaiseIncrement = payload.minRaiseIncrement || this.bigBlind;
      this.currentPhase = payload.phase || "preflop";
      this.remainingTime = payload.turnTime ?? 15;
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
      this.minRaiseIncrement = payload.minRaiseIncrement || this.bigBlind;
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
      this.updateTurnUI();
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
        this.userData.coins = payload.coins;
        if (this.selfCoinsText) this.selfCoinsText.setText(Number(payload.coins || 0).toLocaleString());
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
  // PROCEDURAL NORMAL ACTION BUTTON BUILDER
  // ==========================================
  createActionButton(x, y, width, height, label, fillHex, strokeHex, textColor, onClick) {
    const container = this.add.container(x, y).setDepth(1500);

    const bg = this.add.graphics();
    const drawBg = (fill, stroke, fillAlpha = 0.95) => {
      bg.clear();
      bg.fillStyle(fill, fillAlpha);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 14);
      bg.lineStyle(3, stroke, 1);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 14);
    };
    drawBg(fillHex, strokeHex);

    const textObj = this.add
      .text(0, 0, label, {
        fontFamily: "Impact, Arial Black",
        fontSize: "24px",
        color: textColor,
        letterSpacing: 1.5,
        stroke: "#000000",
        strokeThickness: 4,
        align: "center"
      })
      .setOrigin(0.5);

    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5);

    hitZone.on("pointerover", () => {
      if (!container.isEnabled) return;
      container.setScale(1.05);
      drawBg(strokeHex, 0xffffff, 0.28);
    });

    hitZone.on("pointerout", () => {
      container.setScale(1);
      drawBg(fillHex, strokeHex);
    });

    hitZone.on("pointerdown", () => {
      if (!container.isEnabled) return;
      container.setScale(0.96);
      this.time.delayedCall(90, () => container.setScale(1));
      if (onClick) onClick();
    });

    container.add([bg, textObj, hitZone]);
    container.textObj = textObj;
    container.hitZone = hitZone;
    container.isEnabled = false;

    container.setButtonEnabled = enabled => {
      container.isEnabled = Boolean(enabled);
      container.setScale(1);
      drawBg(fillHex, strokeHex);
      if (enabled) {
        container.setAlpha(1);
        hitZone.setInteractive({ useHandCursor: true });
      } else {
        container.setAlpha(0.35);
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
    const btnY = this.scale.height * 0.92;
    const btnW = 210;
    const btnH = 64;
    const gap = 235;
    const startX = w / 2 - gap * 2;

    // 1. FOLD BUTTON
    this.foldBtn = this.createActionButton(
      startX,
      btnY,
      btnW,
      btnH,
      "FOLD",
      0x24070c,
      0xff0033,
      "#ff4d6d",
      () => {
        if (this.sndPack) this.sndPack.play();
        this.sendAction("fold");
      }
    );

    // 2. CHECK BUTTON
    this.checkBtn = this.createActionButton(
      startX + gap,
      btnY,
      btnW,
      btnH,
      "CHECK",
      0x071a26,
      0x00d4ff,
      "#7be0ff",
      () => {
        if (this.sndClick) this.sndClick.play();
        this.sendAction("check");
      }
    );

    // 3. CALL BUTTON
    this.callBtn = this.createActionButton(
      startX + gap * 2,
      btnY,
      btnW,
      btnH,
      "CALL",
      0x072412,
      0x00ff88,
      "#00ff88",
      () => {
        if (this.sndBlind) this.sndBlind.play();
        const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
        if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
        this.sendAction("call");
      }
    );

    // 4. RAISE / BET BUTTON
    this.raiseBtn = this.createActionButton(
      startX + gap * 3,
      btnY,
      btnW,
      btnH,
      "RAISE",
      0x261c05,
      0xffcc00,
      "#ffcc00",
      () => {
        if (this.sndClick) this.sndClick.play();

        const me = this.players.find(p => p.username.toLowerCase() === this.username);
        if (!me) return;

        const callAmount = Math.max(0, this.highestBet - (me.investedThisPhase || 0));
        const increment = this.minRaiseIncrement || this.bigBlind;
        this.minRaise = callAmount + increment;
        this.maxRaise = me.coins;

        if (this.maxRaise <= this.minRaise) {
          if (this.sndChaal) this.sndChaal.play();
          const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
          if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
          this.sendAction("all_in");
        } else {
          this.isRaising = true;
          this.setSliderAmount(this.minRaise);
          this.updateTurnUI();
        }
      }
    );

    // 5. ALL-IN BUTTON
    this.allInBtn = this.createActionButton(
      startX + gap * 4,
      btnY,
      btnW,
      btnH,
      "ALL-IN",
      0x220726,
      0xdf8eff,
      "#f3d1ff",
      () => {
        if (this.sndChaal) this.sndChaal.play();
        const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
        if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);
        this.sendAction("all_in");
      }
    );

    // --- HOLD'EM RAISE SEEKBAR UI ---
    this.raiseContainer = this.add.container(w / 2, btnY).setDepth(2000).setVisible(false);

    const trackW = 500;
    const trackH = 14;
    this.sliderTrackW = trackW;
    this.sliderTrackH = trackH;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x050505, 0.92);
    panelBg.fillRoundedRect(-440, -105, 880, 150, 18);
    panelBg.lineStyle(2, 0xffcc00, 0.8);
    panelBg.strokeRoundedRect(-440, -105, 880, 150, 18);
    this.raiseContainer.add(panelBg);

    const trackBg = this.add.graphics();
    trackBg.fillStyle(0x1a1a1a, 1);
    trackBg.fillRoundedRect(-trackW / 2, -trackH / 2, trackW, trackH, 7);
    trackBg.lineStyle(2, 0x555555, 1);
    trackBg.strokeRoundedRect(-trackW / 2, -trackH / 2, trackW, trackH, 7);
    this.raiseContainer.add(trackBg);

    this.raiseFill = this.add.graphics();
    this.raiseContainer.add(this.raiseFill);

    this.raiseThumb = this.add
      .circle(-trackW / 2, 0, 22, 0xffcc00)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.raiseThumb.setStrokeStyle(4, 0xffffff);
    this.input.setDraggable(this.raiseThumb);
    this.raiseContainer.add(this.raiseThumb);

    this.raiseAmountTextUI = this.add
      .text(0, -68, "RAISE: 0", {
        fontFamily: "Impact, Arial Black",
        fontSize: "30px",
        color: "#ffffff",
        letterSpacing: 2,
        stroke: "#ff0033",
        strokeThickness: 4
      })
      .setOrigin(0.5);
    this.raiseContainer.add(this.raiseAmountTextUI);

    const presets = [
      { label: "MIN", x: -220, getAmt: () => this.minRaise },
      {
        label: "1/2 POT",
        x: -75,
        getAmt: () => {
          const me = this.players.find(p => p.username.toLowerCase() === this.username);
          const callAmt = me ? Math.max(0, this.highestBet - (me.investedThisPhase || 0)) : 0;
          return callAmt + Math.floor(this.pot * 0.5);
        }
      },
      {
        label: "POT",
        x: 75,
        getAmt: () => {
          const me = this.players.find(p => p.username.toLowerCase() === this.username);
          const callAmt = me ? Math.max(0, this.highestBet - (me.investedThisPhase || 0)) : 0;
          return callAmt + this.pot;
        }
      },
      { label: "MAX", x: 220, getAmt: () => this.maxRaise }
    ];

    presets.forEach(pr => {
      const pBg = this.add.graphics();
      pBg.fillStyle(0x1f1f1f, 1).fillRoundedRect(pr.x - 55, -42, 110, 26, 6);
      pBg.lineStyle(1, 0xffcc00, 0.8).strokeRoundedRect(pr.x - 55, -42, 110, 26, 6);
      const pTxt = this.add
        .text(pr.x, -29, pr.label, {
          fontFamily: "Arial Black",
          fontSize: "13px",
          color: "#ffcc00"
        })
        .setOrigin(0.5);
      const pZone = this.add
        .zone(pr.x, -29, 110, 26)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          if (this.sndClick) this.sndClick.play();
          this.setSliderAmount(pr.getAmt());
        });
      this.raiseContainer.add([pBg, pTxt, pZone]);
    });

    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x2a080c, 1).fillRoundedRect(-trackW / 2 - 165, -24, 130, 48, 10);
    cancelBg.lineStyle(2, 0xff4444, 1).strokeRoundedRect(-trackW / 2 - 165, -24, 130, 48, 10);
    const cancelRaiseBtn = this.add
      .text(-trackW / 2 - 100, 0, "CANCEL", {
        fontFamily: "Impact, Arial Black",
        fontSize: "22px",
        color: "#ff4444"
      })
      .setOrigin(0.5);
    const cancelZone = this.add
      .zone(-trackW / 2 - 100, 0, 130, 48)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0x082a12, 1).fillRoundedRect(trackW / 2 + 35, -24, 130, 48, 10);
    confirmBg.lineStyle(2, 0x00ff88, 1).strokeRoundedRect(trackW / 2 + 35, -24, 130, 48, 10);
    const confirmRaiseBtn = this.add
      .text(trackW / 2 + 100, 0, "CONFIRM", {
        fontFamily: "Impact, Arial Black",
        fontSize: "22px",
        color: "#00ff88"
      })
      .setOrigin(0.5);
    const confirmZone = this.add
      .zone(trackW / 2 + 100, 0, 130, 48)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.raiseContainer.add([cancelBg, cancelRaiseBtn, cancelZone, confirmBg, confirmRaiseBtn, confirmZone]);

    this.raiseThumb.on("drag", (pointer, dragX) => {
      const minX = -trackW / 2;
      const maxX = trackW / 2;
      const clampedX = Phaser.Math.Clamp(dragX, minX, maxX);
      const percent = (clampedX - minX) / (maxX - minX);
      const rawAmt = this.minRaise + percent * (this.maxRaise - this.minRaise);
      this.setSliderAmount(rawAmt);
    });

    cancelZone.on("pointerdown", () => {
      if (this.sndClickClose) this.sndClickClose.play();
      this.isRaising = false;
      this.updateTurnUI();
    });

    confirmZone.on("pointerdown", () => {
      if (this.sndChaal) this.sndChaal.play();
      const pv = this.playerViews.find(p => p.username.toLowerCase() === this.username);
      if (pv) this.animateBetToDealer(pv.seat.x, pv.seat.y);

      const act = this.currentRaiseAmount >= this.maxRaise ? "all_in" : "raise";
      this.sendAction(act, { amount: this.currentRaiseAmount });

      this.isRaising = false;
      this.updateTurnUI();
    });
  }

  setSliderAmount(targetAmount) {
    const minX = -this.sliderTrackW / 2;
    const maxX = this.sliderTrackW / 2;

    let snapped = Math.round(targetAmount / this.bigBlind) * this.bigBlind;
    if (targetAmount >= this.maxRaise) snapped = this.maxRaise;
    this.currentRaiseAmount = Phaser.Math.Clamp(snapped, this.minRaise, this.maxRaise);

    const snappedPercent =
      this.maxRaise <= this.minRaise
        ? 1
        : (this.currentRaiseAmount - this.minRaise) / (this.maxRaise - this.minRaise);

    this.raiseThumb.x = minX + snappedPercent * (maxX - minX);
    const labelPrefix = this.currentRaiseAmount >= this.maxRaise ? "ALL-IN: " : "RAISE TO: ";
    this.raiseAmountTextUI.setText(labelPrefix + this.currentRaiseAmount.toLocaleString());

    this.raiseFill.clear();
    this.raiseFill.fillStyle(0xff0033, 1);
    const fillW = Math.max(10, this.raiseThumb.x - minX);
    this.raiseFill.fillRoundedRect(minX, -this.sliderTrackH / 2, fillW, this.sliderTrackH, 7);
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
                      font-family: 'Impact', 'Arial Black', sans-serif;
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
                          font-family: 'Impact', sans-serif;
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
                          font-family: 'Impact', sans-serif;
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

  buildPlayersAndSeats() {
    const w = this.scale.width;
    const h = this.scale.height;
    const seatPositions = [
      { x: w * 0.5, y: h * 0.735, inward: -90, textAngle: 0 },
      { x: w * 0.25, y: h * 0.6, inward: -35, textAngle: 55 },
      { x: w * 0.255, y: h * 0.36, inward: 35, textAngle: -55 },
      { x: w * 0.755, y: h * 0.36, inward: 145, textAngle: 55 },
      { x: w * 0.76, y: h * 0.6, inward: -145, textAngle: -55 }
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
      const avatarSize = 90;
      const myKey = `avatar_${selfPlayer.username.toLowerCase().trim()}`;
      const avatar = this.add
        .image(seatPositions[0].x, seatPositions[0].y, this.textures.exists(myKey) ? myKey : "avatar")
        .setDisplaySize(avatarSize, avatarSize);

      const nameText = this.add
        .text(seatPositions[0].x, seatPositions[0].y + avatarSize * 0.7, selfPlayer.username, {
          fontFamily: "Arial Black",
          fontSize: "24px",
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
        seat: seatPositions[0],
        avatar,
        timerGraphics: this.add.graphics(),
        statusBadge: null,
        betBadge: null,
        roleBadge: null,
        cardSprites: []
      };
      this.playerViews.push(pv);

      for (let i = 0; i < 2; i++) {
        const card = this.add
          .image(seatPositions[0].x + (i === 0 ? -24 : 24), seatPositions[0].y - 120, "card_back")
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

      const coinsAmt = selfPlayer.coins !== undefined ? selfPlayer.coins : this.userData.coins;
      this.selfCoinsBg = this.add
        .image(seatPositions[0].x, seatPositions[0].y + avatarSize * 1.2, "top_coins")
        .setDisplaySize(280, 50);
      this.selfCoinsText = this.add
        .text(seatPositions[0].x - 65, seatPositions[0].y + avatarSize * 1.2, Number(coinsAmt || 0).toLocaleString(), {
          fontFamily: "Arial Black",
          fontSize: "18px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3
        })
        .setOrigin(0, 0.5);
    }

    for (let i = 0; i < otherPlayers.length; i++) {
      const p = otherPlayers[i].player;
      const pos = seatPositions[otherPlayers[i].visualIdx];
      if (!pos) continue;

      const avatarSize = 75;
      const inwardRad = Phaser.Math.DegToRad(pos.inward);
      const elementRotation = pos.inward + 90;

      const opponentKey = `avatar_${p.username.toLowerCase().trim()}`;
      const avatar = this.add
        .image(pos.x, pos.y, this.textures.exists(opponentKey) ? opponentKey : "avatar")
        .setDisplaySize(avatarSize, avatarSize)
        .setAngle(elementRotation);

      const nameDist = avatarSize * 0.75;
      const nameText = this.add
        .text(
          pos.x + nameDist * Math.cos(inwardRad + Math.PI),
          pos.y + nameDist * Math.sin(inwardRad + Math.PI),
          p.username,
          {
            fontFamily: "Arial Black",
            fontSize: "20px",
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
        seat: pos,
        avatar,
        timerGraphics: this.add.graphics(),
        statusBadge: null,
        betBadge: null,
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

  resetTable() {
    this.playerViews.forEach(pv => {
      if (pv.avatar) pv.avatar.destroy();
      if (pv.label) pv.label.destroy();
      if (pv.timerGraphics) pv.timerGraphics.destroy();
      if (pv.statusBadge) pv.statusBadge.destroy();
      if (pv.betBadge) pv.betBadge.destroy();
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

    if (this.selfCoinsBg) {
      this.selfCoinsBg.destroy();
      this.selfCoinsBg = null;
    }
    if (this.selfCoinsText) {
      this.selfCoinsText.destroy();
      this.selfCoinsText = null;
    }

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
                      font-family: 'Impact', 'Arial Black', sans-serif;
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
                      font-family: 'Impact', sans-serif;
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
          fontFamily: "Arial Black",
          fontSize: "28px",
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 5
        })
        .setOrigin(0.5)
        .setDepth(2001);
      const body = this.add
        .text(w / 2, h / 2 - 20, "", {
          fontFamily: "Arial Black",
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
          fontFamily: "Arial Black",
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
    const targets = blindViews.length > 0 ? blindViews : this.playerViews;
    targets.forEach((pv, index) => {
      this.time.delayedCall(index * 150, () => {
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

    if (this.pot !== undefined && this.betInfoText) {
      this.betInfoText.setText(`POT: ${Number(this.pot || 0).toLocaleString()}`);
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

    if (this.selfCoinsText && me.coins !== undefined) {
      this.selfCoinsText.setText(Number(me.coins).toLocaleString());
    }

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
        btn.setVisible(false);
        btn.setButtonEnabled(false);
      });
      this.raiseContainer.setVisible(true);
      this.updateTimerCircles();
      return;
    }

    this.raiseContainer.setVisible(false);
    buttons.forEach(btn => btn.setVisible(true));

    const callAmount = Math.max(0, this.highestBet - (me.investedThisPhase || 0));
    const increment = this.minRaiseIncrement || this.bigBlind;
    const minRaiseCost = callAmount + increment;

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
    if (me.coins >= minRaiseCost) {
      this.raiseBtn.setLabel(`${raiseVerb} ${minRaiseCost.toLocaleString()}`);
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
    const total = this.turnTime || 15;
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

      const inwardRad = Phaser.Math.DegToRad(pv.seat.inward ?? -90);
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
            fontFamily: "Arial Black",
            fontSize: "14px",
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
        if (seatIdx === this.sbIndex && seatIdx === this.dealerIndex) {
          roleText = "D / SB";
        } else if (seatIdx === this.sbIndex) {
          roleText = "SB";
        } else if (seatIdx === this.bbIndex) {
          roleText = "BB";
        } else if (seatIdx === this.dealerIndex) {
          roleText = "D";
        }
      }
      const roleX = pv.seat.x + (pv.avatar.displayWidth / 2) * 0.85;
      const roleY = pv.seat.y - (pv.avatar.displayHeight / 2) * 0.85;

      if (!roleText) {
        if (pv.roleBadge) {
          pv.roleBadge.destroy();
          pv.roleBadge = null;
        }
      } else if (!pv.roleBadge) {
        pv.roleBadge = this.add
          .text(roleX, roleY, roleText, {
            fontFamily: "Arial Black",
            fontSize: "13px",
            color: "#050505",
            backgroundColor: "#ffcc00",
            padding: { x: 5, y: 2 }
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
        fontFamily: "Arial Black",
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