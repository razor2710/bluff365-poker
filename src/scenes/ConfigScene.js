// src/scenes/ConfigScene.js
import Phaser from "phaser";
import session from "../net/session.js";
import AlertManager from "../helpers/AlertManager.js";

export default class ConfigScene extends Phaser.Scene {
  constructor() {
    super("ConfigScene");

    this.tables = [];
    this.username = "";
    this.coins = 0;
    this.selectedTableIndex = 0;
    this.cityPanelVisible = false;

    this.tableLayer = null;
    this.cityLayer = null;

    this.waitOverlay = null;
    this.buyInModal = null;
    this.cityRowTexts = [];
    this.pollTimer = null;
  }

  init(data) {
    if (!data || !data.username || !session || !session.flowGuard?.startedFromSplash) {
      console.warn("Unauthorized access. Kicking to Splash.");
      this.scene.start("SplashScene");
      return;
    }
    this.username = data.username || "";
    this.coins = Number(data.coins || 0);
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    if (!session.socket) {
      session.init();
    }

    this.sndClick = this.sound.get("click") || this.sound.add("click");
    this.sndClickClose = this.sound.get("click_close") || this.sound.add("click_close");

    session.socket.off("join_city_response");
    session.socket.off("game_tables_response");

    session.socket.on("join_city_response", payload => {
      if (!payload || !payload.success) {
        AlertManager.show(this, payload?.message || "Join failed", "JOIN FAILED");
        return;
      }

      if (payload.queued) {
        this.showManualWaitingMessage(payload);
      } else {
        this.hideBuyInModal();
        this.hideWaitingOverlay();
        this.scene.start("GameScene", {
          username: this.username,
          userData: { coins: payload.walletCoins ?? this.coins },
          configId: payload.configId,
          cityIndex: payload.cityIndex,
          tableName: payload.tableName,
          cityName: payload.cityName,
          bootAmount: payload.bootAmount,
          bootWallet: payload.bootWallet,
          bootWalletMax: payload.bootWalletMax,
          sessionId: payload.sessionId,
          seatedPlayers: payload.seatedPlayers
        });
      }
    });

    session.socket.on("game_tables_response", payload => {
      if (!payload || !payload.success) return;
      
      // FIX: Ensure rawTables is defined before sorting
      const rawTables = Array.isArray(payload.tables) ? payload.tables : [];

      // Sort tables by their database sort_order to exactly match your MongoDB configuration
      this.tables = rawTables.sort((a, b) => Number(a.sort_order || 99) - Number(b.sort_order || 99));
      
      if (this.cityPanelVisible && this.tables[this.selectedTableIndex]) {
        const table = this.tables[this.selectedTableIndex];
        (table.cities || []).forEach((city, idx) => {
          if (this.cityRowTexts[idx]) {
            this.cityRowTexts[idx].activeText.setText(`Players ${Number(city.active_players || 0)}/5`);
            this.cityRowTexts[idx].sessionText.setText(`ID: ${city.session_id || "Waiting"}`);
            
            const isRunning = city.is_match_running;
            this.cityRowTexts[idx].runningText.setText(isRunning ? "MATCH RUNNING" : "WAITING");
            this.cityRowTexts[idx].runningText.setColor(isRunning ? "#00ff88" : "#ffcc00");
          }
        });
      }
    });

    this.events.once("shutdown", this.onSceneShutdown, this);
    this.events.once("destroy", this.onSceneShutdown, this);

    this.add.image(w / 2, h / 2, "lobby_bg").setDisplaySize(w, h);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.4);

    // 👇 CHANGED TEEN PATTI TO POKER HOLD'EM 👇
    this.add.text(w / 2, 90, "POKER HOLD'EM", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "64px", color: "#ff0033", letterSpacing: 4
    }).setOrigin(0.5).setShadow(0, 0, "rgba(255,0,51,0.6)", 15, true, true);
    // 👆

    this.add.text(w / 2, 160, "SELECT TABLE", {
      fontFamily: "Courier New", fontSize: "32px", color: "#ffcc00", fontWeight: 'bold'
    }).setOrigin(0.5);

    this.backBtn = this.add.text(w - 130, 70, "X", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', 
      fontSize: "48px",
      color: "#ffcc00"
    }).setOrigin(0.5);

    this.backBtn.setInteractive(
      new Phaser.Geom.Rectangle(-50, -50, 150, 150),
      Phaser.Geom.Rectangle.Contains
    );

    this.backBtn.on("pointerover", () => this.backBtn.setColor("#ff0033").setScale(1.2));
    this.backBtn.on("pointerout", () => this.backBtn.setColor("#ffcc00").setScale(1));

    this.backBtn.on("pointerdown", () => {
      if (this.buyInModal) {
        if (this.sndClickClose) this.sndClickClose.play();
        this.hideBuyInModal();
        return;
      }
      if (this.waitOverlay || this.cityPanelVisible) {
        if (this.sndClickClose) this.sndClickClose.play();
      } else {
        if (this.sndClick) this.sndClick.play();
      }

      if (this.waitOverlay) {
        this.triggerExitAnimation(this.waitOverlay, () => this.hideWaitingOverlay());
        return;
      }
      if (this.cityPanelVisible) {
        this.triggerExitAnimation(this.cityPanelVisible, () => this.hideCitiesPanel());
      } else {
        this.scene.start("LobbyScene", { username: this.username, coins: this.coins });
      }
    });

    this.tableLayer = this.add.container(0, 0);
    this.cityLayer = this.add.container(0, 0).setDepth(5000);

    session.socket.emit("get_game_tables");
    
    this.pollTimer = this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        if (session.socket) session.socket.emit("get_game_tables");
      }
    });

    this.time.delayedCall(300, () => {
      if(this.tables.length > 0) this.renderTablePicker();
    });
  }

  onSceneShutdown() {
    this.hideBuyInModal();
    if (this.pollTimer) this.pollTimer.remove();
    if (session && session.socket) {
      session.socket.off("join_city_response");
      session.socket.off("game_tables_response");
    }
  }

  animateEntrance(container, contents, dim) {
    const h = this.scale.height;
    container.y = h + 600;
    container.scaleX = 0.02;
    contents.forEach(c => { if(c) c.setAlpha(0) });
    dim.setAlpha(0);

    this.tweens.add({ targets: dim, alpha: 0.8, duration: 300, ease: 'Linear' });
    this.tweens.add({
      targets: container,
      y: h / 2,
      duration: 350,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: container,
          scaleX: 1,
          duration: 350,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.tweens.add({ targets: contents, alpha: 1, duration: 200, ease: 'Linear' });
          }
        });
      }
    });
  }

  triggerExitAnimation(uiObj, callback) {
    if (!uiObj || !uiObj.container) {
      if (callback) callback();
      return;
    }
    
    // 1. Fade the internal contents out fast
    this.tweens.add({
      targets: uiObj.contents,
      alpha: 0,
      duration: 150,
      ease: 'Linear',
      onComplete: () => {
        // 2. Squeeze the panel width to 0 (Initiates the 3D Flip)
        this.tweens.add({
          targets: uiObj.container,
          scaleX: 0,
          duration: 200,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            
            // Hide all the previous black panels/shadows inside the container
            uiObj.container.each(child => child.setVisible(false));
            
            // Spawn the card_back image right in the center of the invisible container
            const cardBack = this.add.image(0, 0, "card_back").setDisplaySize(180, 260);
            uiObj.container.add(cardBack);

            // 3. Expand the width back to 1 (Completes the flip, revealing the card)
            this.tweens.add({
              targets: uiObj.container,
              scaleX: 1,
              duration: 200,
              ease: 'Cubic.easeOut',
              onComplete: () => {
                
                // 4. Plunge the card down with a premium spinning toss
                this.tweens.add({
                  targets: uiObj.container,
                  y: this.scale.height + 600,
                  angle: 15,
                  duration: 350,
                  ease: 'Cubic.easeIn'
                });
                
                // Fade out the background sync'd with the card drop
                this.tweens.add({
                  targets: uiObj.dim,
                  alpha: 0,
                  duration: 350,
                  ease: 'Linear',
                  onComplete: callback
                });
              }
            });
          }
        });
      }
    });
  }

  getTableTheme(tableName) {
    const n = (tableName || "").toLowerCase();
    let border = 0xff0033;
    let accent = 0xff6600;
    let text = "#ffffff";
    
    if (n.includes("bronze")) { border = 0xd35400; accent = 0xe67e22; }
    else if (n.includes("silver")) { border = 0xbdc3c7; accent = 0xffffff; }
    else if (n.includes("gold")) { border = 0xffcc00; accent = 0xffaa00; }
    else if (n.includes("platinum")) { border = 0x00e5ff; accent = 0xffffff; }
    else if (n.includes("diamond")) { border = 0xb100ff; accent = 0xff00ff; }

    return { border, accent, text };
  }

  renderTablePicker() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.tableLayer.removeAll(true);

    const table = this.tables[this.selectedTableIndex];
    if (!table) return;

    const theme = this.getTableTheme(table.table_name);
    const cardW = 680; const cardH = 440;
    const cx = w / 2; const cy = h / 2 + 10;

    const glow = this.add.graphics();
    glow.fillStyle(theme.border, 0.15);
    glow.fillRoundedRect(cx - cardW / 2 - 16, cy - cardH / 2 - 16, cardW + 32, cardH + 32, 24);

    const card = this.add.graphics();
    card.fillGradientStyle(0x1a0505, 0x1a0505, 0x050000, 0x050000, 1);
    card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 20);
    card.lineStyle(4, theme.border, 1);
    card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 20);

    const topAccent = this.add.graphics();
    topAccent.fillStyle(theme.accent, 0.9);
    topAccent.fillRoundedRect(cx - 120, cy - cardH / 2 - 4, 240, 8, 4);

    const tableName = this.add.text(cx, cy - 140, table.table_name || "Table", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "52px", color: "#ffffff", letterSpacing: 4
    }).setOrigin(0.5);
    tableName.setShadow(0, 0, "#" + theme.border.toString(16).padStart(6, '0'), 15, true, true);

    const label = this.add.text(cx, cy - 60, "POT LIMIT", {
      fontFamily: "Courier New", fontSize: "28px", color: "#ffcc00", fontWeight: 'bold', letterSpacing: 2
    }).setOrigin(0.5);

    const potValue = this.add.text(cx, cy + 20, this.formatAmount(table.pot_limit), {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "96px", color: "#ffffff"
    }).setOrigin(0.5);
    potValue.setShadow(4, 4, "#000000", 0, true, true);

    const subInfo = this.add.text(cx, cy + 110, `${(table.cities || []).length} CITIES ONLINE`, {
      fontFamily: "Courier New", fontSize: "24px", color: "#ff6600", fontWeight: 'bold'
    }).setOrigin(0.5);

    const bootBar = this.add.graphics();
    bootBar.fillStyle(0x050505, 1);
    bootBar.fillRoundedRect(cx - 250, cy + 160, 500, 70, 12);
    bootBar.lineStyle(2, theme.border, 1);
    bootBar.strokeRoundedRect(cx - 250, cy + 160, 500, 70, 12);

    const bootText = this.add.text(cx, cy + 195, `BOOT: ${this.formatAmount(table.boot_amount)}`, {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "32px", color: "#ffffff", letterSpacing: 2
    }).setOrigin(0.5);

    const clickZone = this.add.zone(cx - cardW / 2, cy - cardH / 2, cardW, cardH).setOrigin(0).setInteractive({ useHandCursor: true });
    clickZone.on("pointerdown", () => {
      if (this.sndClick) this.sndClick.play();
      this.showCitiesPanel(table);
    });

    const leftBtn = this.createNavButton(cx - 460, cy, "<");
    leftBtn.zone.on("pointerdown", () => {
      if (this.sndClick) this.sndClick.play();
      this.selectedTableIndex--;
      if (this.selectedTableIndex < 0) this.selectedTableIndex = this.tables.length - 1;
      this.renderTablePicker();
    });

    const rightBtn = this.createNavButton(cx + 460, cy, ">");
    rightBtn.zone.on("pointerdown", () => {
      if (this.sndClick) this.sndClick.play();
      this.selectedTableIndex++;
      if (this.selectedTableIndex >= this.tables.length) this.selectedTableIndex = 0;
      this.renderTablePicker();
    });

    const dots = [];
    const dotGap = 36;
    const totalDotsW = (this.tables.length - 1) * dotGap;
    const dotsStartX = cx - totalDotsW / 2;

    for (let i = 0; i < this.tables.length; i++) {
      const active = i === this.selectedTableIndex;
      const dot = this.add.circle(
        dotsStartX + i * dotGap, cy + 300, active ? 12 : 9, active ? theme.border : 0xffffff, active ? 1 : 0.30
      );
      dots.push(dot);
    }

    this.tableLayer.add([
      glow, card, topAccent, tableName, label, potValue, subInfo,
      bootBar, bootText, clickZone, leftBtn.bg, leftBtn.label, leftBtn.zone,
      rightBtn.bg, rightBtn.label, rightBtn.zone, ...dots
    ]);
  }

  createNavButton(x, y, text) {
    const bg = this.add.graphics();
    bg.fillStyle(0x050505, 1);
    bg.fillCircle(x, y, 46);
    bg.lineStyle(3, 0xff0033, 1);
    bg.strokeCircle(x, y, 46);

    const label = this.add.text(x, y, text, {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "46px", color: "#ffcc00"
    }).setOrigin(0.5);

    const zone = this.add.zone(x - 46, y - 46, 92, 92).setOrigin(0).setInteractive({ useHandCursor: true });
    
    zone.on('pointerover', () => {
      bg.clear(); bg.fillStyle(0xff0033, 1); bg.fillCircle(x, y, 46);
      label.setColor("#050505");
    });
    zone.on('pointerout', () => {
      bg.clear(); bg.fillStyle(0x050505, 1); bg.fillCircle(x, y, 46);
      bg.lineStyle(3, 0xff0033, 1); bg.strokeCircle(x, y, 46);
      label.setColor("#ffcc00");
    });

    return { bg, label, zone };
  }

  showCitiesPanel(table) {
    const w = this.scale.width;
    const h = this.scale.height;

    this.cityLayer.removeAll(true);
    this.cityRowTexts = [];

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setInteractive();
    dim.on("pointerdown", pointer => pointer.event.stopPropagation());
    dim.on("pointerup", pointer => pointer.event.stopPropagation());

    const mainContainer = this.add.container(w / 2, h / 2);
    this.cityLayer.add([dim, mainContainer]);

    const contents = [];
    const panelW = 1250;
    const panelH = 550;

    const shadow = this.add.graphics();
    shadow.fillStyle(0xff0033, 0.15);
    shadow.fillRoundedRect(-panelW/2 - 10, -panelH/2 - 10, panelW + 20, panelH + 20, 20);
    mainContainer.add(shadow);

    const panel = this.add.graphics();
    panel.fillStyle(0x050505, 1);
    panel.fillRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
    panel.lineStyle(4, 0xff0033, 1);
    panel.strokeRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
    mainContainer.add(panel);

    const title = this.add.text(0, -panelH/2 + 45, table.table_name || "Table", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "40px", color: "#ff0033", letterSpacing: 2
    }).setOrigin(0.5);
    contents.push(title);

    const subtitle = this.add.text(0, -panelH/2 + 95, "SELECT CITY", {
      fontFamily: "Courier New", fontSize: "26px", color: "#ffcc00", fontWeight: 'bold'
    }).setOrigin(0.5);
    contents.push(subtitle);

    const close = this.add.text(panelW/2 - 45, -panelH/2 + 40, "X", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "40px", color: "#ffcc00"
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    
    close.on('pointerover', () => close.setColor("#ff0033"));
    close.on('pointerout', () => close.setColor("#ffcc00"));
    
    close.on("pointerdown", () => {
      if (this.sndClickClose) this.sndClickClose.play();
      this.triggerExitAnimation(this.cityPanelVisible, () => this.hideCitiesPanel());
    });
    contents.push(close);

    const rowStartY = -panelH/2 + 160;
    const rowH = 76;

    (table.cities || []).forEach((city, idx) => {
      const y = rowStartY + idx * rowH;
      const rowBg = this.add.graphics();
      rowBg.fillStyle(idx % 2 === 0 ? 0x111111 : 0x0a0a0a, 1);
      rowBg.fillRoundedRect(-panelW/2 + 30, y - 28, panelW - 60, 56, 12);
      rowBg.lineStyle(1, 0xff0033, 0.4);
      rowBg.strokeRoundedRect(-panelW/2 + 30, y - 28, panelW - 60, 56, 12);

      const cityName = this.add.text(-panelW/2 + 50, y, city.city_name || `City ${idx + 1}`, {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "28px", color: "#ffffff", letterSpacing: 1
      }).setOrigin(0, 0.5);

      const activeText = this.add.text(-panelW/2 + 420, y, `Players ${Number(city.active_players || 0)}/5`, {
        fontFamily: "Courier New", fontSize: "24px", color: "#ffcc00", fontWeight: 'bold'
      }).setOrigin(0.5);

      const sessionText = this.add.text(-panelW/2 + 670, y, `ID: ${city.session_id || "Waiting"}`, {
        fontFamily: "Courier New", fontSize: "20px", color: "#ffffff"
      }).setOrigin(0.5);

      const stateText = city.is_match_running ? "MATCH RUNNING" : "WAITING";
      const stateColor = city.is_match_running ? "#00ff88" : "#ffcc00";

      const runningText = this.add.text(-panelW/2 + 940, y, stateText, {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "22px", color: stateColor
      }).setOrigin(0.5);

      const btnW = 150, btnH = 48, btnX = panelW/2 - 190;
      const joinBg = this.add.graphics();
      joinBg.fillStyle(0x050505, 1);
      joinBg.fillRoundedRect(btnX, y - btnH/2, btnW, btnH, 8);
      joinBg.lineStyle(2, 0xff0033, 1);
      joinBg.strokeRoundedRect(btnX, y - btnH/2, btnW, btnH, 8);

      const joinText = this.add.text(btnX + btnW/2, y, "JOIN", {
        fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "24px", color: "#ffcc00", letterSpacing: 1
      }).setOrigin(0.5);

      const joinZone = this.add.zone(btnX, y - btnH/2, btnW, btnH).setOrigin(0).setInteractive({ useHandCursor: true });
      
      joinZone.on("pointerover", () => {
        joinBg.clear(); joinBg.fillStyle(0xff0033, 1).fillRoundedRect(btnX, y - btnH/2, btnW, btnH, 8);
        joinText.setColor("#050505");
      });
      joinZone.on("pointerout", () => {
        joinBg.clear(); joinBg.fillStyle(0x050505, 1).fillRoundedRect(btnX, y - btnH/2, btnW, btnH, 8);
        joinBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(btnX, y - btnH/2, btnW, btnH, 8);
        joinText.setColor("#ffcc00");
      });

      joinZone.on("pointerdown", () => {
        // PREVENT DOUBLE CLICK SPAM
        if (joinZone.isJoining) return;
        joinZone.isJoining = true;

        if (this.sndClick) this.sndClick.play();
        this.handleJoinCity(table, idx);
        
        // Re-enable the button after 2 seconds (in case of a network error)
        this.time.delayedCall(2000, () => {
            joinZone.isJoining = false;
        });
      });

      this.cityRowTexts[idx] = { activeText, sessionText, runningText };
      contents.push(rowBg, cityName, activeText, sessionText, runningText, joinBg, joinText, joinZone);
    });

    mainContainer.add(contents);
    this.cityPanelVisible = { container: mainContainer, contents, dim };
    
    this.animateEntrance(mainContainer, contents, dim);
  }

  hideCitiesPanel() {
    this.cityPanelVisible = false;
    this.cityLayer.removeAll(true);
    this.cityRowTexts = [];
  }

handleJoinCity(table, cityIndex) {
    if (!this.username) {
      AlertManager.show(this, "Login required", "AUTH ERROR");
      return;
    }
    const minRequired = Number(table.boot_wallet || 0);
    if (this.coins < minRequired) {
      AlertManager.show(this, `Minimum balance of ${minRequired.toLocaleString()} is needed`, "INSUFFICIENT FUNDS");
      return;
    }
    this.showBuyInModal(table, cityIndex);
  }

  showBuyInModal(table, cityIndex) {
    this.hideBuyInModal();

    const w = this.scale.width;
    const h = this.scale.height;
    const minBuy = Math.max(0, Number(table.boot_wallet || 0));
    const maxCfg = Math.max(minBuy, Number(table.boot_wallet_max || table.pot_limit || minBuy));
    const maxBuy = Math.min(this.coins, maxCfg);
    const step = maxBuy - minBuy >= 2000 ? 100 : maxBuy - minBuy >= 200 ? 50 : 10;
    const initialBuy = maxBuy;
    const cityName = table.cities?.[cityIndex]?.city_name || "Table";

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(15000).setInteractive();
    dim.on("pointerdown", p => p.event.stopPropagation());
    dim.on("pointerup", p => p.event.stopPropagation());
    this.tweens.add({ targets: dim, fillAlpha: 0.85, duration: 220 });

    const html = `
      <style>
        #buyInSlider {
          -webkit-appearance: none; appearance: none; width: 100%; height: 14px;
          border-radius: 10px; outline: none; cursor: pointer;
          border: 2px solid #444455;
        }
        #buyInSlider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 34px; height: 34px;
          border-radius: 50%; background: #ffcc00; border: 4px solid #ffffff;
          box-shadow: 0 0 18px rgba(255, 0, 51, 0.9); cursor: pointer;
        }
        #buyInSlider::-moz-range-thumb {
          width: 34px; height: 34px; border-radius: 50%; background: #ffcc00;
          border: 4px solid #ffffff; box-shadow: 0 0 18px rgba(255, 0, 51, 0.9); cursor: pointer;
        }
        .buyin-preset {
          flex: 1; padding: 10px 0; background: #12121a; border: 2px solid #ffcc00;
          border-radius: 10px; color: #ffffff; cursor: pointer;
          font-family: 'Anton', Impact, 'sans-serif-black', sans-serif;
          font-size: 18px; letter-spacing: 1px;
        }
        .buyin-preset:active { transform: scale(0.95); }
      </style>
      <div style="
        width: 720px; background: #050508; border: 3px solid #ffcc00; border-radius: 22px;
        box-shadow: 0 0 42px rgba(255, 0, 51, 0.35), inset 0 0 0 1px rgba(255, 0, 51, 0.5);
        padding: 32px 38px; box-sizing: border-box; user-select: none; color: #ffffff;
      ">
        <div style="text-align:center; margin-bottom: 6px; font-family:'Anton', Impact, 'sans-serif-black', sans-serif; font-size: 40px; color: #ff0033; letter-spacing: 3px;">
          SELECT BUY-IN
        </div>
        <div style="text-align:center; margin-bottom: 24px; font-family:'Courier New', monospace; font-size: 19px; color: #ffcc00; font-weight: bold;">
          ${table.table_name} • ${cityName} | WALLET: ${this.coins.toLocaleString()}
        </div>

        <div style="
          background: #14080c; border: 2px solid #ffcc00; border-radius: 14px;
          padding: 16px; text-align: center; margin-bottom: 24px;
        ">
          <div style="font-family:'Courier New', monospace; font-size: 15px; color: #ffcc00; letter-spacing: 2px; font-weight: bold;">
            TABLE CHIPS TO BRING
          </div>
          <div id="buyInValueText" style="
            font-family:'Anton', Impact, 'sans-serif-black', sans-serif; font-size: 54px;
            color: #ffffff; text-shadow: 0 0 16px rgba(255, 0, 51, 0.8); line-height: 1.1; margin-top: 4px;
          ">${initialBuy.toLocaleString()}</div>
        </div>

        <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 12px;">
          <button id="buyInMinus" type="button" style="
            width: 46px; height: 46px; border-radius: 50%; background: #161622;
            border: 2px solid #ffcc00; color: #ffcc00; font-size: 26px; font-weight: bold; cursor: pointer;
          ">−</button>
          <input id="buyInSlider" type="range" min="${minBuy}" max="${maxBuy}" step="${step}" value="${initialBuy}" ${minBuy >= maxBuy ? "disabled" : ""} />
          <button id="buyInPlus" type="button" style="
            width: 46px; height: 46px; border-radius: 50%; background: #161622;
            border: 2px solid #ffcc00; color: #ffcc00; font-size: 26px; font-weight: bold; cursor: pointer;
          ">+</button>
        </div>

        <div style="display:flex; justify-content:space-between; font-family:'Courier New', monospace; font-size: 16px; color: #bbbbbb; font-weight: bold; margin-bottom: 22px;">
          <span>MIN: ${minBuy.toLocaleString()}</span>
          <span>MAX: ${maxBuy.toLocaleString()}</span>
        </div>

        <div style="display:flex; gap: 14px; margin-bottom: 28px;">
          <button class="buyin-preset" data-pct="0" style="border-color:#00ff88;">MIN</button>
          <button class="buyin-preset" data-pct="0.5" style="border-color:#00e5ff;">50%</button>
          <button class="buyin-preset" data-pct="1" style="border-color:#ff0033;">MAX</button>
        </div>

        <div style="display:flex; gap: 18px;">
          <button id="buyInCancel" type="button" style="
            flex: 1; height: 58px; border-radius: 12px; background: #29070d; border: 2px solid #ff0033;
            color: #ff5c77; font-family:'Anton', Impact, 'sans-serif-black', sans-serif;
            font-size: 24px; letter-spacing: 2px; cursor: pointer;
          ">CANCEL</button>
          <button id="buyInConfirm" type="button" style="
            flex: 1.5; height: 58px; border-radius: 12px; background: #072b14; border: 2px solid #00ff88;
            color: #5bffb0; font-family:'Anton', Impact, 'sans-serif-black', sans-serif;
            font-size: 24px; letter-spacing: 2px; cursor: pointer;
          ">JOIN TABLE</button>
        </div>
      </div>
    `;

    const dom = this.add.dom(w / 2, h / 2).createFromHTML(html).setDepth(15001);
    const slider = dom.getChildByID("buyInSlider");
    const valText = dom.getChildByID("buyInValueText");
    let chosenAmount = initialBuy;

    const syncSlider = nextVal => {
      chosenAmount = Phaser.Math.Clamp(Math.round(nextVal), minBuy, maxBuy);
      if (slider) {
        slider.value = chosenAmount;
        const pct = maxBuy <= minBuy ? 100 : ((chosenAmount - minBuy) / (maxBuy - minBuy)) * 100;
        slider.style.background = `linear-gradient(90deg, #ff0033 0%, #ffcc00 ${pct}%, #14141c ${pct}%)`;
      }
      if (valText) valText.textContent = chosenAmount.toLocaleString();
    };
    syncSlider(initialBuy);

    if (slider) {
      slider.addEventListener("input", e => syncSlider(Number(e.target.value)));
    }

    dom.addListener("click");
    dom.on("click", event => {
      const el = event.target;
      if (!el) return;

      if (el.id === "buyInMinus") {
        if (this.sndClick) this.sndClick.play();
        syncSlider(chosenAmount - step);
      } else if (el.id === "buyInPlus") {
        if (this.sndClick) this.sndClick.play();
        syncSlider(chosenAmount + step);
      } else if (el.classList && el.classList.contains("buyin-preset")) {
        if (this.sndClick) this.sndClick.play();
        const pct = Number(el.getAttribute("data-pct") || 0);
        syncSlider(minBuy + (maxBuy - minBuy) * pct);
      } else if (el.id === "buyInCancel") {
        if (this.sndClickClose) this.sndClickClose.play();
        this.hideBuyInModal();
      } else if (el.id === "buyInConfirm") {
        if (this.sndClick) this.sndClick.play();
        el.disabled = true;
        this.queuedConfigId = table.id;
        this.queuedCityIndex = cityIndex;
        this.hideBuyInModal();
        session.socket.emit("join_city", {
          username: this.username,
          configId: table.id,
          cityIndex,
          buyInAmount: chosenAmount
        });
      }
    });

    this.buyInModal = { dim, dom };
  }

  hideBuyInModal() {
    if (!this.buyInModal) return;
    if (this.buyInModal.dom) this.buyInModal.dom.destroy();
    if (this.buyInModal.dim) this.buyInModal.dim.destroy();
    this.buyInModal = null;
  }

  showManualWaitingMessage(payload) {
    const w = this.scale.width;
    const h = this.scale.height;

    if (this.waitOverlay) this.hideWaitingOverlay();

// FIX: Push depth to 20000 so it sits above the cityLayer (5000)
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setInteractive().setDepth(20000);
    dim.on("pointerdown", pointer => pointer.event.stopPropagation());
    dim.on("pointerup", pointer => pointer.event.stopPropagation());
    
    const mainContainer = this.add.container(w / 2, h / 2).setDepth(20001);
    const contents = [];

    const panelW = 850;
    const panelH = 420; 

    const shadow = this.add.graphics();
    shadow.fillStyle(0xff0033, 0.15);
    shadow.fillRoundedRect(-panelW/2 - 10, -panelH/2 - 10, panelW + 20, panelH + 20, 20);
    mainContainer.add(shadow);

    const panel = this.add.graphics();
    panel.fillStyle(0x050505, 1);
    panel.fillRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
    panel.lineStyle(3, 0xffcc00, 1);
    panel.strokeRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
    mainContainer.add(panel);

    const title = this.add.text(0, -130, "MATCH IN PROGRESS", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "42px", color: "#ffcc00", letterSpacing: 2
    }).setOrigin(0.5);
    contents.push(title);

    const body = this.add.text(0, -30, "You are queued for the next hand.", {
      fontFamily: "Courier New", fontSize: "28px", color: "#ffffff", fontWeight: 'bold'
    }).setOrigin(0.5);
    contents.push(body);

    const sub = this.add.text(0, 30, `City: ${payload.cityName || "City"}`, {
      fontFamily: "Courier New", fontSize: "24px", color: "#ff0033"
    }).setOrigin(0.5);
    contents.push(sub);

    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x050505, 1);
    cancelBg.fillRoundedRect(-130, 100, 260, 65, 8);
    cancelBg.lineStyle(2, 0xff0033, 1);
    cancelBg.strokeRoundedRect(-130, 100, 260, 65, 8);

    const cancelText = this.add.text(0, 132, "CANCEL", {
      fontFamily: '"Anton", Impact, "sans-serif-black", sans-serif', fontSize: "28px", color: "#ff0033", letterSpacing: 2
    }).setOrigin(0.5);

    const cancelZone = this.add.zone(-130, 100, 260, 65).setOrigin(0).setInteractive({ useHandCursor: true });
    
    cancelZone.on("pointerover", () => {
      cancelBg.clear(); cancelBg.fillStyle(0xff0033, 1).fillRoundedRect(-130, 100, 260, 65, 8);
      cancelText.setColor("#050505");
    });
    cancelZone.on("pointerout", () => {
      cancelBg.clear(); cancelBg.fillStyle(0x050505, 1).fillRoundedRect(-130, 100, 260, 65, 8);
      cancelBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(-130, 100, 260, 65, 8);
      cancelText.setColor("#ff0033");
    });
    
    cancelZone.on("pointerdown", () => {
      if (this.sndClickClose) this.sndClickClose.play();
      if (session.socket && this.queuedConfigId) {
        session.socket.emit("leave_city", { 
          username: this.username, 
          configId: this.queuedConfigId, 
          cityIndex: this.queuedCityIndex 
        });
      }
      this.triggerExitAnimation(this.waitOverlay, () => this.hideWaitingOverlay());
    });
    
    contents.push(cancelBg, cancelText, cancelZone);
    mainContainer.add(contents);
    
    this.waitOverlay = { container: mainContainer, contents, dim };
    this.animateEntrance(mainContainer, contents, dim);
  }

  hideWaitingOverlay() {
    if (this.waitOverlay) {
      if (this.waitOverlay.container) this.waitOverlay.container.destroy();
      if (this.waitOverlay.dim) this.waitOverlay.dim.destroy();
      this.waitOverlay = null;
    }
  }

  formatAmount(value) {
    const n = Number(value || 0);
    if (n >= 10000000) return (n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 2) + "Cr";
    if (n >= 100000) return (n / 100000).toFixed(n % 100000 === 0 ? 0 : 2) + "L";
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K";
    return n.toString();
  }
}