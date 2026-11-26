// src/scenes/LobbyScene.js
import Phaser from "phaser";
import session from "../net/session.js";
import AlertManager from "../helpers/AlertManager.js";
import ProgressManager from "../helpers/ProgressManager.js";
import PrivateRoomUI from "../config/PrivateRoomUI.js";

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
    this.currentRoomId = null;
    this.currentRoomState = null;
    this.settingsDialog = null;
    this.historyRequestBound = false;
    this.reconnectOverlay = null;
    this.historyRefreshTimer = null;
  }

  init(data) {
    if (!session.flowGuard.startedFromSplash) {
      this.scene.start("SplashScene");
      return;
    }
    this.userData = data || {};
    this.userHistory = data.history || [];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.sndBiPlayerWin = this.sound.add("player_win");
    this.sndBlind = this.sound.add("blind");
    this.sndBlind2x = this.sound.add("blind2x");
    this.sndCardDeal = this.sound.add("card_back_distribute");
    this.sndChaal = this.sound.add("chaal");
    this.sndChaal2x = this.sound.add("chaal2x");
    this.sndClick = this.sound.add("click");
    this.sndClickClose = this.sound.add("click_close");
    this.sndFlipCard = this.sound.add("flip_card");
    this.sndPack = this.sound.add("pack");
    this.sndSee = this.sound.add("see");
    this.sndYourTurn = this.sound.add("your_turn");

    const username = this.userData.username || this.userData.uname || (session.user && session.user.username) || "";
    const coins = this.userData.coins ?? this.userData.bluff_coins ?? (session.user && session.user.bluff_coins) ?? 0;
    const deviceId = this.userData.deviceId || this.userData.device_id || (session.user && session.user.device_id) || "";
    const deviceName = this.userData.deviceName || this.userData.device_name || (session.user && session.user.device_name) || "";

    this.userData = { ...this.userData, username, coins: Number(coins || 0), deviceId, deviceName };

    if (session.cleanupLobbyListeners) {
      session.cleanupLobbyListeners();
    }

    session.onConnectionChange = isConnected => {
      if (!this.scene.isActive()) return;
      if (!isConnected) {
        this.showReconnectingOverlay();
      } else {
        this.hideReconnectingOverlay();
      }
    };

    this.add.image(w / 2, h / 2, "lobby_bg").setDisplaySize(w, h);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.08);

    // ==========================================
    // TOP COINS PANEL
    // ==========================================
    const coinsHolder = this.add.image(270, 65, "top_coins");
    coinsHolder.setDisplaySize(546, 110);

    this.coinsText = this.add.text(175, 65, this.userData.coins.toLocaleString(), {
      fontFamily: "Arial Black", fontSize: "44px", color: "#ffffff", stroke: "#000000", strokeThickness: 3
    }).setOrigin(0, 0.5);

    const coinsPanelW = coinsHolder.displayWidth + 62;
    const coinsPanelH = 117;
    const coinsPanelX = coinsHolder.x - coinsPanelW / 2;
    const coinsPanelY = 20;

    const coinsPanel = this.add.graphics();
    coinsPanel.fillStyle(0x000000, 0.22);
    coinsPanel.fillRoundedRect(coinsPanelX, coinsPanelY, coinsPanelW, coinsPanelH, 24);
    coinsPanel.strokeRoundedRect(coinsPanelX, coinsPanelY, coinsPanelW, coinsPanelH, 24);

    coinsHolder.setDepth(1);
    this.coinsText.setDepth(1);

    // ==========================================
    // TOP PROFILE PANEL (LIME GREEN OUTLINE)
    // ==========================================
    const profileNameText = this.add.text(0, 0, username, {
      fontFamily: "Arial Black", fontSize: "36px", color: "#ffffff", stroke: "#000000", strokeThickness: 2
    }).setOrigin(0, 0.5).setDepth(1).setVisible(false);

    const nameWidth = profileNameText.width;
    const paddingX = 31;
    const avatarAreaW = 72;
    const elementGap = 20;

    const profilePanelW = paddingX + avatarAreaW + elementGap + nameWidth + paddingX;
    const profilePanelH = 104;
    const profilePanelX = w - profilePanelW - 75;
    const profilePanelY = 20;

    const profilePanel = this.add.graphics();
    profilePanel.fillStyle(0x000000, 0.22);
    profilePanel.fillRoundedRect(profilePanelX, profilePanelY, profilePanelW, profilePanelH, 24);
    profilePanel.lineStyle(3, 0x32cd32, 1);
    profilePanel.strokeRoundedRect(profilePanelX, profilePanelY, profilePanelW, profilePanelH, 24);

    const profileCenterY = profilePanelY + profilePanelH / 2;
    const profileCenterX = profilePanelX + paddingX + 28;

    this.add.circle(profileCenterX, profileCenterY, 36, 0xffd700).setDepth(1);
    const userAvatarKey = `avatar_${username.toLowerCase()}`;
    const profileImgKey = this.textures.exists(userAvatarKey) ? userAvatarKey : "avatar";

    this.add.image(profileCenterX, profileCenterY, profileImgKey)
      .setDisplaySize(57, 57)
      .setDepth(1);

    this.add.text(profileCenterX + 54, profileCenterY, username, {
      fontFamily: "Arial Black", fontSize: "36px", color: "#ffffff", stroke: "#000000", strokeThickness: 2
    }).setOrigin(0, 0.5).setDepth(1);

    profileNameText.setPosition(profileCenterX + 54, profileCenterY).setVisible(true);

    // ==========================================
    // CENTER TITLE & GLITCH ANIMATION
    // ==========================================
    this.gameTitle = this.add.text(w / 2, h * 0.26, "POKER HOLD'EM", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "120px", color: "#ff0033", stroke: "#330000", strokeThickness: 8, letterSpacing: 8
    }).setOrigin(0.5).setShadow(0, 0, "rgba(255,0,51,0.6)", 25, true, true);

    this.add.text(w / 2, h * 0.35, "PLAY • WIN • DOMINATE", {
      fontFamily: "Courier New", fontSize: "31px", color: "#ffcc00", fontWeight: "bold", letterSpacing: 8
    }).setOrigin(0.5);

    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        if (!this.gameTitle) return;
        this.tweens.add({
          targets: this.gameTitle,
          x: this.gameTitle.x + Phaser.Math.Between(-15, 15),
          alpha: 0.6,
          duration: 40,
          yoyo: true,
          repeat: 3,
          onComplete: () => {
            this.gameTitle.x = w / 2;
          }
        });
        this.gameTitle.setColor("#ffffff");
        this.time.delayedCall(120, () => this.gameTitle.setColor("#ff0033"));
      }
    });

    // ==========================================
    // MAIN MENU BUTTONS
    // ==========================================
    const buttonY = h * 0.68;
    const buttonWidth = 650;
    const buttonHeight = 325;
    const spacing = 670;

    const joinBtn = this.add.image(w / 2 - spacing, buttonY, "join_btn").setDisplaySize(buttonWidth, buttonHeight).setInteractive({ useHandCursor: true });
    const playBtn = this.add.image(w / 2, buttonY, "play_btn").setDisplaySize(buttonWidth, buttonHeight).setInteractive({ useHandCursor: true });
    const settingsBtn = this.add.image(w / 2 + spacing, buttonY, "settings_btn").setDisplaySize(buttonWidth, buttonHeight).setInteractive({ useHandCursor: true });

    this.joinBtn = joinBtn;
    this.playBtn = playBtn;
    this.settingsBtn = settingsBtn;

    playBtn.on("pointerdown", () => {
      this.sndClick.play();
      this.scene.start("ConfigScene", { username: this.userData.username, coins: this.userData.coins });
    });

    joinBtn.on("pointerdown", () => {
      this.sndClick.play();
      PrivateRoomUI.open(this, session, this.userData.username, this.userData.coins);
    });

    settingsBtn.on("pointerdown", () => {
      this.sndClick.play();
      this.showSettingsDialog();
    });

    if (session.socket) {
      session.socket.off("match_history_response");
      session.socket.on("match_history_response", payload => {
        if (payload && payload.success) {
          this.updateCoins(payload.coins);
          const nextHistory = payload.history || [];
          const hasChanged = JSON.stringify(this.userHistory || []) !== JSON.stringify(nextHistory);
          this.userHistory = nextHistory;

          // Update open history dialog in-place without closing/reopening or losing scroll position
          if (this.settingsDialog && !this.settingsDialog.isClosing && hasChanged) {
            const listBody = this.settingsDialog.listBody;
            if (listBody) {
              const prevScrollTop = listBody.scrollTop;
              listBody.innerHTML = this.buildHistoryRowsHTML(this.userHistory);
              listBody.scrollTop = prevScrollTop;
            }
          }
        }
      });

      session.socket.off("balance_synced");
      session.socket.on("balance_synced", payload => {
        if (payload && payload.coins !== undefined) {
          this.updateCoins(payload.coins);
        }
      });

      session.socket.emit("get_match_history", { username: this.userData.username });
    }

    this.historyRefreshTimer = this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        if (session.socket && session.socket.connected) {
          session.socket.emit("get_match_history", { username: this.userData.username });
        }
      }
    });

    session.onMatchFound = match => {
      if (!this.scene.isActive()) return;
      ProgressManager.hide();
      if (AlertManager.hide) AlertManager.hide();
      this.scene.start("GameScene", {
        sessionId: match.sessionId,
        username: this.userData.username,
        deviceId: this.userData.deviceId,
        deviceName: this.userData.deviceName,
        coins: this.userData.coins,
        tableName: match.tableName || match.table_name || "",
        table: match
      });
    };

    this.events.once("shutdown", () => {
      if (this.historyRefreshTimer) this.historyRefreshTimer.remove();
      if (session.socket) {
        session.socket.off("match_history_response");
        session.socket.off("balance_synced");
      }
      session.onMatchFound = null;
    });

    if (this.userData.activeMatch) {
      this.time.delayedCall(500, () => {
        this.showRejoinDialog(this.userData.activeMatch);
        this.userData.activeMatch = null;
      });
    }
  }

  // ==========================================
  // CYBER ANIMATION HELPERS
  // ==========================================
  animateEntrance(container, contents, dim) {
    const h = this.scale.height;
    container.y = h + 600;
    container.scaleX = 0.02;
    contents.forEach(c => { if (c) c.setAlpha(0); });
    if (dim) dim.setAlpha(0);

    if (dim) this.tweens.add({ targets: dim, alpha: 0.85, duration: 300, ease: "Linear" });
    this.tweens.add({
      targets: container,
      y: h / 2,
      duration: 350,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: container,
          scaleX: 1,
          duration: 350,
          ease: "Cubic.easeOut",
          onComplete: () => {
            this.tweens.add({ targets: contents, alpha: 1, duration: 200, ease: "Linear" });
          }
        });
      }
    });
  }

  triggerExitAnimation(uiObj, callback, skipAnim = false) {
    if (!uiObj || !uiObj.container) {
      if (callback) callback();
      return;
    }

    if (skipAnim) {
      callback();
      return;
    }

    this.tweens.add({
      targets: uiObj.contents,
      alpha: 0,
      duration: 150,
      ease: "Linear",
      onComplete: () => {
        this.tweens.add({
          targets: uiObj.container,
          scaleX: 0,
          duration: 200,
          ease: "Cubic.easeIn",
          onComplete: () => {
            uiObj.container.each(child => child.setVisible(false));

            const cardBack = this.add.image(0, 0, "card_back").setDisplaySize(180, 260);
            uiObj.container.add(cardBack);

            this.tweens.add({
              targets: uiObj.container,
              scaleX: 1,
              duration: 200,
              ease: "Cubic.easeOut",
              onComplete: () => {
                this.tweens.add({
                  targets: uiObj.container,
                  y: this.scale.height + 600,
                  angle: 15,
                  duration: 350,
                  ease: "Cubic.easeIn"
                });

                if (uiObj.dim) {
                  this.tweens.add({
                    targets: uiObj.dim,
                    alpha: 0,
                    duration: 350,
                    ease: "Linear",
                    onComplete: callback
                  });
                } else {
                  this.time.delayedCall(350, callback);
                }
              }
            });
          }
        });
      }
    });
  }

  // ==========================================
  // REJOIN DIALOG
  // ==========================================
  showRejoinDialog(matchData) {
    const w = this.scale.width;
    const h = this.scale.height;

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 1).setAlpha(0).setDepth(6000).setInteractive();
    const mainContainer = this.add.container(w / 2, h / 2).setDepth(6001);
    const contents = [];

    const panelW = 750;
    const panelH = 450;

    const shadow = this.add.graphics();
    shadow.fillStyle(0xff0033, 0.15);
    shadow.fillRoundedRect(-panelW / 2 - 10, -panelH / 2 - 10, panelW + 20, panelH + 20, 20);
    mainContainer.add(shadow);

    const panel = this.add.graphics();
    panel.fillStyle(0x050505, 1);
    panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
    panel.lineStyle(4, 0xff0033, 1);
    panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
    mainContainer.add(panel);

    const titleText = this.add.text(0, -140, "MATCH IN PROGRESS", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "40px", color: "#ff0033", letterSpacing: 2
    }).setOrigin(0.5);

    const infoText = this.add.text(
      0,
      -20,
      `You have an active match running!\n\nTable: ${matchData.tableName}\nCity: ${matchData.cityName}\nPot: ${matchData.pot} | Boot: ${matchData.bootAmount}`,
      { fontFamily: "Courier New", fontSize: "24px", color: "#ffffff", align: "center", fontWeight: "bold" }
    ).setOrigin(0.5);

    const rejoinBg = this.add.graphics();
    rejoinBg.fillStyle(0xffcc00, 1).fillRoundedRect(-280, 100, 240, 70, 12);
    const rejoinBtn = this.add.text(-160, 135, "REJOIN", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "31px", color: "#050505"
    }).setOrigin(0.5);
    const rejoinZone = this.add.zone(-280, 100, 240, 70).setOrigin(0).setInteractive({ useHandCursor: true });

    const dismissBg = this.add.graphics();
    dismissBg.fillStyle(0x050505, 1).fillRoundedRect(40, 100, 240, 70, 12);
    dismissBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(40, 100, 240, 70, 12);
    const dismissBtn = this.add.text(160, 135, "DISMISS", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "31px", color: "#ff0033"
    }).setOrigin(0.5);
    const dismissZone = this.add.zone(40, 100, 240, 70).setOrigin(0).setInteractive({ useHandCursor: true });

    contents.push(titleText, infoText, rejoinBg, rejoinBtn, rejoinZone, dismissBg, dismissBtn, dismissZone);
    mainContainer.add(contents);

    const uiObj = { container: mainContainer, contents, dim };

    const cleanup = () => {
      dim.destroy();
      mainContainer.destroy();
    };

    dismissZone.on("pointerdown", () => {
      if (this.sndClickClose) this.sndClickClose.play();
      this.triggerExitAnimation(uiObj, cleanup);
    });

    rejoinZone.on("pointerdown", () => {
      if (this.sndClick) this.sndClick.play();

      this.triggerExitAnimation(uiObj, () => {
        cleanup();
        ProgressManager.show(this);

        let isHandled = false;

        session.socket.once("rejoin_error", res => {
          if (isHandled) return;
          isHandled = true;
          ProgressManager.hide();
          AlertManager.show(this, res.message || "Failed to rejoin.", "REJOIN FAILED");
        });

        session.socket.once("match_found", match => {
          if (isHandled) return;
          isHandled = true;
          ProgressManager.hide();
          this.scene.start("GameScene", {
            sessionId: match.sessionId,
            username: this.userData.username,
            deviceId: this.userData.deviceId,
            deviceName: this.userData.deviceName,
            coins: this.userData.coins,
            tableName: match.tableName || match.table_name || matchData.tableName || "",
            table: match
          });
        });

        session.socket.emit("rejoin_match", { sessionId: matchData.sessionId, username: this.userData.username });

        this.time.delayedCall(3500, () => {
          if (!isHandled) {
            isHandled = true;
            ProgressManager.hide();
            AlertManager.show(this, "Connection timed out. Please try again.", "TIMEOUT");
          }
        });
      });
    });

    this.animateEntrance(mainContainer, contents, dim);
  }

  updateCoins(value) {
    this.userData.coins = Number(value || 0);
    if (this.coinsText) {
      this.coinsText.setText(this.userData.coins.toLocaleString());
    }
  }

  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  buildHistoryRowsHTML(history) {
    if (!history || history.length === 0) {
      return `
        <div style="
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Courier New', monospace;
          font-size: 30px;
          font-weight: bold;
          color: #ffffff;
          letter-spacing: 2px;
        ">NO RECENT MATCHES.</div>
      `;
    }

    return history
      .map(match => {
        const isWin = match.result === "win";
        const bgColor = isWin ? "#112211" : "#220505";
        const borderColor = isWin ? "#00ff88" : "#ff0033";
        const textColor = isWin ? "#00ff88" : "#ff0033";

        const sid = this.escapeHtml(match.sessionId || "Unknown");
        const table = this.escapeHtml(match.tableName || "Unknown");
        const city = this.escapeHtml(match.cityName || "Unknown");
        const dateStr = this.escapeHtml(
          match.startedAt ? new Date(match.startedAt).toLocaleString() : "Unknown Date"
        );
        const potVal = Number(match.pot || 0).toLocaleString();
        const invVal = Number(match.invested || 0).toLocaleString();
        const netVal = `${isWin ? "+" : "-"}${Math.abs(Number(match.netChange || 0)).toLocaleString()}`;

        return `
          <div style="
            background: ${bgColor};
            border: 2px solid ${borderColor};
            border-radius: 12px;
            padding: 18px 26px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 14px;
            flex-shrink: 0;
          ">
            <div style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              font-family: 'Courier New', monospace;
              font-size: 21px;
              font-weight: bold;
            ">
              <span style="color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ID: ${sid} | ${table} (${city})
              </span>
              <span style="color: #bbbbbb; font-weight: normal; white-space: nowrap;">
                ${dateStr}
              </span>
            </div>

            <div style="
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              align-items: center;
            ">
              <span style="
                font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                font-size: 32px;
                color: ${textColor};
                letter-spacing: 2px;
                text-align: left;
              ">${isWin ? "VICTORY" : "DEFEAT"}</span>

              <span style="
                font-family: 'Courier New', monospace;
                font-size: 23px;
                font-weight: bold;
                color: #ffcc00;
                text-align: center;
              ">Pot: ${potVal} | Inv: ${invVal}</span>

              <span style="
                font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                font-size: 32px;
                color: ${textColor};
                text-align: right;
              ">${netVal}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================
  // MATCH HISTORY DIALOG (STRICT CSS CLIPPING + NATIVE TOUCH SCROLL)
  // ==========================================
  showSettingsDialog() {
    if (this.settingsDialog) return;
    this.playBtn?.disableInteractive();
    this.joinBtn?.disableInteractive();
    this.settingsBtn?.disableInteractive();

    const w = this.scale.width;
    const h = this.scale.height;

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(4000).setInteractive();
    dim.on("pointerdown", pointer => pointer.event.stopPropagation());
    dim.on("pointerup", pointer => pointer.event.stopPropagation());

    this.tweens.add({
      targets: dim,
      fillAlpha: 0.85,
      duration: 280,
      ease: "Linear"
    });

    const rowsHtml = this.buildHistoryRowsHTML(this.userHistory);

    const html = `
      <style>
        #historyListBody::-webkit-scrollbar { width: 8px; }
        #historyListBody::-webkit-scrollbar-track { background: #111111; border-radius: 6px; }
        #historyListBody::-webkit-scrollbar-thumb { background: #ffcc00; border-radius: 6px; }
      </style>
      <div id="historyDialogOuter" style="
        width: 1150px;
        height: 820px;
        display: flex;
        justify-content: center;
        align-items: center;
        user-select: none;
        -webkit-user-select: none;
      ">
        <div id="historyDialogWrapper" style="
          width: 4px;
          height: 820px;
          background: #050505;
          border: 4px solid #ffcc00;
          border-radius: 24px;
          box-shadow: 0 0 36px rgba(255, 204, 0, 0.28);
          overflow: hidden;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          will-change: transform, width;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translate3d(0, 100vh, 0);
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.15),
                      width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        ">
          <div id="historyDialogContent" style="
            width: 1142px;
            height: 100%;
            opacity: 0;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            transition: opacity 0.18s linear;
          ">
            <!-- FIXED HEADER (ALWAYS ON TOP, NEVER COVERED BY LIST) -->
            <div style="
              position: relative;
              height: 114px;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              border-bottom: 2px solid rgba(255, 204, 0, 0.3);
              background: #050505;
              box-sizing: border-box;
            ">
              <div style="
                font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                font-size: 46px;
                color: #ffcc00;
                letter-spacing: 3px;
                line-height: 1;
              ">MATCH HISTORY</div>

              <button id="historyCloseBtn" type="button" style="
                position: absolute;
                right: 24px;
                top: 50%;
                transform: translateY(-50%);
                width: 64px;
                height: 64px;
                background: transparent;
                border: none;
                font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
                font-size: 42px;
                color: #ff0033;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                outline: none;
                padding: 0;
              ">X</button>
            </div>

            <!-- STRICTLY CLIPPED SCROLLABLE LIST VIEWPORT -->
            <div id="historyListBody" style="
              flex: 1;
              min-height: 0;
              overflow-y: auto;
              overflow-x: hidden;
              -webkit-overflow-scrolling: touch;
              touch-action: pan-y;
              padding: 20px 26px 24px 26px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 18px;
            ">${rowsHtml}</div>
          </div>
        </div>
      </div>
    `;

    const dialogDOM = this.add.dom(w / 2, h / 2).createFromHTML(html).setDepth(4001);
    const wrapper = dialogDOM.getChildByID("historyDialogWrapper");
    const contentEl = dialogDOM.getChildByID("historyDialogContent");
    const listBody = dialogDOM.getChildByID("historyListBody");

    // Prevent scroll/touch gestures inside the list from bubbling to Phaser canvas
    if (listBody) {
      const stopBubble = e => e.stopPropagation();
      listBody.addEventListener("wheel", stopBubble, { passive: true });
      listBody.addEventListener("touchstart", stopBubble, { passive: true });
      listBody.addEventListener("touchmove", stopBubble, { passive: true });
      listBody.addEventListener("pointerdown", stopBubble);
    }

    const timers = [];
    timers.push(
      setTimeout(() => {
        if (!wrapper || !contentEl) return;
        wrapper.style.transform = "translate3d(0, 0, 0)";
        timers.push(
          setTimeout(() => {
            wrapper.style.width = "1150px";
          }, 260)
        );
        timers.push(
          setTimeout(() => {
            contentEl.style.opacity = "1";
          }, 520)
        );
      }, 30)
    );

    const onShutdown = () => {
      if (this.closeSettingsDialog) this.closeSettingsDialog(true);
    };
    this.events.once("shutdown", onShutdown);

    this.settingsDialog = { dialogDOM, dim, listBody, isClosing: false };

    this.closeSettingsDialog = (skipAnim = false) => {
      if (!this.settingsDialog || (this.settingsDialog.isClosing && !skipAnim)) return;
      this.settingsDialog.isClosing = true;

      timers.forEach(t => clearTimeout(t));
      timers.length = 0;

      if (this.sndClickClose && !skipAnim) this.sndClickClose.play();
      this.events.off("shutdown", onShutdown);

      const doCleanup = () => {
        if (dialogDOM) dialogDOM.destroy();
        if (dim) dim.destroy();
        this.settingsDialog = null;
        this.closeSettingsDialog = null;
        if (this.scene && this.scene.isActive()) {
          this.playBtn?.setInteractive({ useHandCursor: true });
          this.joinBtn?.setInteractive({ useHandCursor: true });
          this.settingsBtn?.setInteractive({ useHandCursor: true });
        }
      };

      if (skipAnim) {
        doCleanup();
        return;
      }

      if (contentEl) contentEl.style.opacity = "0";
      setTimeout(() => {
        if (wrapper) wrapper.style.width = "4px";
      }, 150);
      setTimeout(() => {
        if (wrapper) wrapper.style.transform = "translate3d(0, 100vh, 0)";
        if (this.scene && this.scene.isActive()) {
          this.tweens.add({
            targets: dim,
            fillAlpha: 0,
            duration: 280,
            ease: "Linear",
            onComplete: doCleanup
          });
        } else {
          doCleanup();
        }
      }, 420);
    };

    dialogDOM.addListener("click");
    dialogDOM.on("click", event => {
      if (event.target && event.target.id === "historyCloseBtn") {
        event.target.disabled = true;
        this.closeSettingsDialog(false);
      }
    });
  }

  // ==========================================
  // RECONNECTING OVERLAY
  // ==========================================
  showReconnectingOverlay() {
    if (this.reconnectOverlay) return;

    const w = this.scale.width;
    const h = this.scale.height;

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85).setDepth(5001).setInteractive();
    dim.on("pointerup", () => {});

    const mainContainer = this.add.container(w / 2, h / 2).setDepth(5002);

    const panelW = 676;
    const panelH = 234;

    const shadow = this.add.graphics();
    shadow.fillStyle(0xff0033, 0.15);
    shadow.fillRoundedRect(-panelW / 2 - 10, -panelH / 2 - 10, panelW + 20, panelH + 20, 20);
    mainContainer.add(shadow);

    const panel = this.add.graphics();
    panel.fillStyle(0x050505, 1);
    panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
    panel.lineStyle(4, 0xff0033, 1);
    panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
    mainContainer.add(panel);

    const title = this.add.text(0, -35, "CONNECTION LOST", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "42px", color: "#ff0033", letterSpacing: 2
    }).setOrigin(0.5);

    const msg = this.add.text(0, 35, "REESTABLISHING SECURE LINK...", {
      fontFamily: "Courier New", fontSize: "24px", color: "#ffcc00", fontWeight: "bold"
    }).setOrigin(0.5);

    mainContainer.add([title, msg]);

    const pulseTween = this.tweens.add({
      targets: msg,
      alpha: { start: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });

    this.reconnectOverlay = { dim, container: mainContainer, pulseTween };
  }

  hideReconnectingOverlay() {
    if (!this.reconnectOverlay) return;
    if (this.reconnectOverlay.pulseTween) this.reconnectOverlay.pulseTween.stop();
    if (this.reconnectOverlay.container) this.reconnectOverlay.container.destroy();
    if (this.reconnectOverlay.dim) this.reconnectOverlay.dim.destroy();
    this.reconnectOverlay = null;
  }
}