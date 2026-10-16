import Phaser from "phaser";
import session from "../net/session.js";
import AlertManager from "../helpers/AlertManager.js";

export default class PrivateRoomUI {

    // ==========================================
    // CYBER ANIMATION HELPERS (MATCHES ALERTMANAGER)
    // ==========================================
    static animateEntrance(scene, container, contents, dim) {
        const startY = scene.scale.height + 600;
        const targetY = scene.scale.height / 2;

        container.y = startY;
        container.scaleX = 0.02; // Thin laser line representation
        contents.forEach(c => { if (c) c.setAlpha(0); });
        dim.setAlpha(0);

        // Dim background fade
        scene.tweens.add({ targets: dim, alpha: 0.8, duration: 300, ease: 'Linear' });

        // 1. Shoot up (translateY)
        scene.tweens.add({
            targets: container,
            y: targetY,
            duration: 350,
            ease: 'Cubic.easeOut', // Smooth deceleration
            onComplete: () => {
                // 2. Expand width (scaleX)
                scene.tweens.add({
                    targets: container,
                    scaleX: 1,
                    duration: 350,
                    ease: 'Cubic.easeOut',
                    onComplete: () => {
                        // 3. Fade content in
                        scene.tweens.add({
                            targets: contents,
                            alpha: 1,
                            duration: 200,
                            ease: 'Linear'
                        });
                    }
                });
            }
        });
    }

    static animateExit(scene, container, contents, dim, cleanupCallback) {
        // Create the card back image, center it in the container, and hide it initially
        const cardBack = scene.add.image(0, 0, "card_back").setAlpha(0);
        
        // Give it a nice prominent playing card size (maintaining aspect ratio)
        cardBack.setDisplaySize(240, 336); 
        
        container.add(cardBack);

        // Get everything currently in the container EXCEPT our new card back (this includes the panels and shadow)
        const elementsToFadeOut = container.list.filter(child => child !== cardBack);

        // 1. Crossfade: Fade out the entire cyber UI, and fade in the card back
        scene.tweens.add({
            targets: elementsToFadeOut,
            alpha: 0,
            duration: 200,
            ease: 'Linear'
        });

        scene.tweens.add({
            targets: cardBack,
            alpha: 1,
            duration: 200,
            ease: 'Linear',
            onComplete: () => {
                // 2. Snap shut width (Now it looks like the card is flipping sideways!)
                scene.tweens.add({
                    targets: container,
                    scaleX: 0.02,
                    duration: 200,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        // 3. Plunge the card down off-screen
                        scene.tweens.add({
                            targets: container,
                            y: scene.scale.height + 600,
                            duration: 350,
                            ease: 'Cubic.easeIn'
                        });
                        
                        // Fade out the background dim
                        scene.tweens.add({
                            targets: dim,
                            alpha: 0,
                            duration: 350,
                            ease: 'Linear',
                            onComplete: cleanupCallback
                        });
                    }
                });
            }
        });
    }

    // ==========================================
    // MAIN PRIVATE ROOM SELECTION PANEL
    // ==========================================
    static open(scene, session, username, coins) {
        const w = scene.scale.width;
        const h = scene.scale.height;

        const dim = scene.add.rectangle(w/2, h/2, w, h, 0x000000, 0.8).setInteractive().setDepth(5000);
        dim.on("pointerdown", pointer => pointer.event.stopPropagation());
        dim.on("pointerup", pointer => pointer.event.stopPropagation());
        
        const mainContainer = scene.add.container(w/2, h/2).setDepth(5001);
        const contents = [];

        const panelW = 800; const panelH = 460;

        // Cyber Shadow/Glow
        const shadow = scene.add.graphics();
        shadow.fillStyle(0xff0033, 0.15); 
        shadow.fillRoundedRect(-panelW/2 - 10, -panelH/2 - 10, panelW + 20, panelH + 20, 20);
        mainContainer.add(shadow);

        // Obsidian Base with Neon Blood Red border
        const panel = scene.add.graphics();
        panel.fillStyle(0x050505, 1);
        panel.fillRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        panel.lineStyle(4, 0xff0033, 1);
        panel.strokeRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        mainContainer.add(panel);

        const title = scene.add.text(0, -160, "PRIVATE ROOMS", {
            fontFamily: "Impact, Arial Black", fontSize: "42px", color: "#ff0033", stroke: "#330000", strokeThickness: 3, letterSpacing: 3
        }).setOrigin(0.5);
        contents.push(title);

        const closeBtn = scene.add.text(panelW/2 - 50, -panelH/2 + 40, "X", {
            fontFamily: "Impact, Arial Black", fontSize: "40px", color: "#ffcc00"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contents.push(closeBtn);

        // --- JOIN ROOM BUTTON ---
        const joinBg = scene.add.graphics();
        joinBg.fillStyle(0x050505, 1).fillRoundedRect(-260, -40, 520, 80, 12);
        joinBg.lineStyle(2, 0xffcc00, 1).strokeRoundedRect(-260, -40, 520, 80, 12); // Gold border
        const joinTxt = scene.add.text(0, 0, "JOIN BY ID", { fontFamily: "Impact, Arial Black", fontSize: "32px", color: "#ffcc00", letterSpacing: 2 }).setOrigin(0.5);
        const joinZone = scene.add.zone(-260, -40, 520, 80).setOrigin(0).setInteractive({ useHandCursor: true });
        contents.push(joinBg, joinTxt, joinZone);

        // Hover Effect helper
        joinZone.on('pointerover', () => { joinBg.clear(); joinBg.fillStyle(0xffcc00, 1).fillRoundedRect(-260, -40, 520, 80, 12); joinTxt.setColor("#050505"); });
        joinZone.on('pointerout', () => { joinBg.clear(); joinBg.fillStyle(0x050505, 1).fillRoundedRect(-260, -40, 520, 80, 12); joinBg.lineStyle(2, 0xffcc00, 1).strokeRoundedRect(-260, -40, 520, 80, 12); joinTxt.setColor("#ffcc00"); });

        // --- CREATE ROOM BUTTON ---
        const createBg = scene.add.graphics();
        createBg.fillStyle(0x050505, 1).fillRoundedRect(-260, 80, 520, 80, 12);
        createBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(-260, 80, 520, 80, 12); // Red border
        const createTxt = scene.add.text(0, 120, "CREATE ROOM", { fontFamily: "Impact, Arial Black", fontSize: "32px", color: "#ff0033", letterSpacing: 2 }).setOrigin(0.5);
        const createZone = scene.add.zone(-260, 80, 520, 80).setOrigin(0).setInteractive({ useHandCursor: true });
        contents.push(createBg, createTxt, createZone);

        createZone.on('pointerover', () => { createBg.clear(); createBg.fillStyle(0xff0033, 1).fillRoundedRect(-260, 80, 520, 80, 12); createTxt.setColor("#050505"); });
        createZone.on('pointerout', () => { createBg.clear(); createBg.fillStyle(0x050505, 1).fillRoundedRect(-260, 80, 520, 80, 12); createBg.lineStyle(2, 0xff0033, 1).strokeRoundedRect(-260, 80, 520, 80, 12); createTxt.setColor("#ff0033"); });

        mainContainer.add(contents);

        // Core Cleanup
        const cleanup = () => { 
            scene.events.off("shutdown", shutdownCleanup);
            dim.destroy();
            mainContainer.destroy();
        };
        const shutdownCleanup = () => cleanup();
        scene.events.once("shutdown", shutdownCleanup);

        const triggerExit = (nextCallback) => {
            if (scene.sndClickClose) scene.sndClickClose.play();
            PrivateRoomUI.animateExit(scene, mainContainer, contents, dim, () => {
                cleanup();
                if (nextCallback) nextCallback();
            });
        };

        closeBtn.on('pointerdown', () => triggerExit());

        joinZone.on('pointerdown', () => {
            if (scene.sndClick) scene.sndClick.play();
            triggerExit(() => PrivateRoomUI.showNumpad(scene, session, username, coins));
        });

        createZone.on('pointerdown', () => {
            if (scene.sndClick) scene.sndClick.play();
            session.fetchGameTables(payload => {
                triggerExit(() => {
                    if(payload.success) PrivateRoomUI.showTablePicker(scene, session, username, coins, payload.tables);
                });
            });
        });

        // Fire Entrance Animation
        PrivateRoomUI.animateEntrance(scene, mainContainer, contents, dim);
    }

    // ==========================================
    // NUMPAD ENTRY PANEL
    // ==========================================
    static showNumpad(scene, session, username, coins) {
        const w = scene.scale.width;
        const h = scene.scale.height;
        const dim = scene.add.rectangle(w/2, h/2, w, h, 0x000000, 0.8).setInteractive().setDepth(5000);
        dim.on("pointerup", () => {});

        const mainContainer = scene.add.container(w/2, h/2).setDepth(5001);
        const contents = [];

        const panelW = 550; const panelH = 720;
        
        const shadow = scene.add.graphics();
        shadow.fillStyle(0xff0033, 0.15);
        shadow.fillRoundedRect(-panelW/2 - 10, -panelH/2 - 10, panelW + 20, panelH + 20, 20);
        mainContainer.add(shadow);

        const panel = scene.add.graphics();
        panel.fillStyle(0x050505, 1).fillRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        panel.lineStyle(4, 0xff0033, 1).strokeRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        mainContainer.add(panel);

        const closeBtn = scene.add.text(panelW/2 - 50, -panelH/2 + 40, "X", { fontFamily: "Impact, Arial Black", fontSize: "40px", color: "#ffcc00" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contents.push(closeBtn);
        
        let idString = "";
        const idDisplay = scene.add.text(0, -240, "ENTER 6-DIGIT ID", { fontFamily: "Courier New", fontSize: "30px", color: "#ffcc00", fontWeight: 'bold' }).setOrigin(0.5);
        contents.push(idDisplay);

        const keys = ["1","2","3","4","5","6","7","8","9","DEL","0","JOIN"];
        let startX = -140;
        let startY = -100;

        keys.forEach((key, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const kx = startX + col * 140;
            const ky = startY + row * 110;

            const isJoin = key === "JOIN";
            const isDel = key === "DEL";
            
            const btnBg = scene.add.rectangle(kx, ky, 110, 80, isJoin ? 0xffcc00 : (isDel ? 0x050505 : 0x111111)).setInteractive({ useHandCursor: true });
            btnBg.setStrokeStyle(2, isJoin ? 0xffcc00 : 0xff0033);
            
            const btnTxt = scene.add.text(kx, ky, key, { fontFamily: "Impact, Arial Black", fontSize: "28px", color: isJoin ? "#050505" : "#ff0033" }).setOrigin(0.5);
            
            contents.push(btnBg, btnTxt);

            btnBg.on('pointerdown', () => {
                if (scene.sndClick) scene.sndClick.play();
                if (isDel) idString = idString.slice(0, -1);
                else if (isJoin) {
                    if (idString.length === 6) {
                        session.socket.emit("join_private_room", { roomId: idString, username });
                        session.socket.once("private_join_response", res => {
                            if (res.success) {
                                triggerExit(() => {
                                    scene.scene.start("GameScene", { username, userData: { coins }, isPrivate: true, roomId: res.roomId });
                                });
                            } else {
                                AlertManager.show(scene, res.message || "Failed to join room", "JOIN FAILED");
                            }
                        });
                    } else {
                        AlertManager.show(scene, "ID must be exactly 6 digits.", "INVALID ENTRY");
                    }
                }
                else if (idString.length < 6) idString += key;
                idDisplay.setText(idString || "ENTER 6-DIGIT ID");
            });
        });

        mainContainer.add(contents);

        const cleanup = () => { 
            scene.events.off("shutdown", shutdownCleanup);
            dim.destroy();
            mainContainer.destroy();
        };
        const shutdownCleanup = () => cleanup();
        scene.events.once("shutdown", shutdownCleanup);

        const triggerExit = (nextCallback) => {
            if (scene.sndClickClose) scene.sndClickClose.play();
            PrivateRoomUI.animateExit(scene, mainContainer, contents, dim, () => {
                cleanup();
                if (nextCallback) nextCallback();
            });
        };

        closeBtn.on('pointerdown', () => triggerExit());

        PrivateRoomUI.animateEntrance(scene, mainContainer, contents, dim);
    }

    // ==========================================
    // TABLE PICKER PANEL (CREATE ROOM)
    // ==========================================
    static showTablePicker(scene, session, username, coins, tables) {
        const w = scene.scale.width;
        const h = scene.scale.height;

        const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8).setInteractive().setDepth(5000);
        dim.on("pointerdown", pointer => pointer.event.stopPropagation());
        dim.on("pointerup", pointer => pointer.event.stopPropagation());

        const mainContainer = scene.add.container(w/2, h/2).setDepth(5001);
        const contents = [];

        const panelW = 1200;
        const panelH = 880;

        const shadow = scene.add.graphics();
        shadow.fillStyle(0xff0033, 0.15);
        shadow.fillRoundedRect(-panelW/2 - 10, -panelH/2 - 10, panelW + 20, panelH + 20, 20);
        mainContainer.add(shadow);

        const panel = scene.add.graphics();
        panel.fillStyle(0x050505, 1);
        panel.fillRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        panel.lineStyle(4, 0xff0033, 1);
        panel.strokeRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 12);
        mainContainer.add(panel);

        const title = scene.add.text(0, -panelH/2 + 65, "SELECT PRIVATE TABLE", {
            fontFamily: "Impact, Arial Black", fontSize: "48px", color: "#ff0033", stroke: "#330000", strokeThickness: 4, letterSpacing: 3
        }).setOrigin(0.5);
        contents.push(title);

        const subtitle = scene.add.text(0, -panelH/2 + 125, "CHOOSE A TABLE TO HOST", {
            fontFamily: "Courier New", fontSize: "24px", color: "#ffcc00", fontWeight: 'bold'
        }).setOrigin(0.5);
        contents.push(subtitle);

        const closeBtn = scene.add.text(panelW/2 - 55, -panelH/2 + 60, "X", {
            fontFamily: "Impact, Arial Black", fontSize: "40px", color: "#ffcc00"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contents.push(closeBtn);

        // Viewport inside mainContainer relative coords
        const viewportX = -panelW/2 + 40;
        const viewportY = -panelH/2 + 175;
        const viewportW = panelW - 80;
        const viewportH = panelH - 240;

        const scrollContent = scene.add.container(viewportX, viewportY);
        contents.push(scrollContent);
        
        let currentY = 0;
        const cardH = 96;
        const gap = 20;

        tables.forEach((t) => {
            const y = currentY;
            const card = scene.add.graphics();

            card.fillStyle(0x111111, 1); // Dark cyber tier
            card.fillRoundedRect(0, y, viewportW, cardH, 12);
            card.lineStyle(2, 0xff0033, 0.75); // Cyber red line
            card.strokeRoundedRect(0, y, viewportW, cardH, 12);

            const tableName = scene.add.text(40, y + cardH / 2, t.table_name, {
                fontFamily: "Impact, Arial Black", fontSize: "32px", color: "#ffcc00", letterSpacing: 2
            }).setOrigin(0, 0.5);

            const bootChip = scene.add.text(viewportW - 500, y + cardH / 2, `BOOT ${t.boot_amount}`, {
                fontFamily: "Courier New", fontSize: "24px", color: "#050505", backgroundColor: "#ffcc00", fontWeight: 'bold',
                padding: { left: 16, right: 16, top: 8, bottom: 8 }
            }).setOrigin(0.5);

            const potChip = scene.add.text(viewportW - 250, y + cardH / 2, `POT ${t.pot_limit}`, {
                fontFamily: "Courier New", fontSize: "24px", color: "#ffffff", backgroundColor: "#ff0033", fontWeight: 'bold',
                padding: { left: 16, right: 16, top: 8, bottom: 8 }
            }).setOrigin(0.5);

            const hostText = scene.add.text(viewportW - 100, y + cardH / 2, "HOST", {
                fontFamily: "Impact, Arial Black", fontSize: "30px", color: "#ff0033"
            }).setOrigin(0.5);

            const zone = scene.add.zone(viewportW / 2, y + cardH / 2, viewportW, cardH).setInteractive({ useHandCursor: true });

            zone.on("pointerover", () => {
                card.clear();
                card.fillStyle(0x2a0000, 1); // Blood glow
                card.fillRoundedRect(0, y, viewportW, cardH, 12);
                card.lineStyle(2, 0xffcc00, 1); // Gold highlight
                card.strokeRoundedRect(0, y, viewportW, cardH, 12);
                hostText.setColor("#ffcc00").setScale(1.1);
            });

            zone.on("pointerout", () => {
                card.clear();
                card.fillStyle(0x111111, 1);
                card.fillRoundedRect(0, y, viewportW, cardH, 12);
                card.lineStyle(2, 0xff0033, 0.75);
                card.strokeRoundedRect(0, y, viewportW, cardH, 12);
                hostText.setColor("#ff0033").setScale(1);
            });

            zone.on("pointerdown", () => {
                if (scene.sndClick) scene.sndClick.play();
                const minRequired = Number(t.boot_wallet || 0);
                if (coins < minRequired) {
                    AlertManager.show(scene, `Minimum balance of ${minRequired.toLocaleString()} is needed to host`, "INSUFFICIENT FUNDS");
                    return;
                }
                
                session.socket.emit("create_private_room", { configId: t.id, username });
                session.socket.once("private_join_response", res => {
                    if (res.success) {
                        triggerExit(() => {
                            scene.scene.start("GameScene", { username, userData: { coins }, isPrivate: true, roomId: res.roomId });
                        });
                    } else {
                        AlertManager.show(scene, res.message || "Failed to host room", "HOSTING FAILED");
                    }
                });
            });

            scrollContent.add([card, tableName, bootChip, potChip, hostText, zone]);
            currentY += cardH + gap;
        });

        mainContainer.add(contents);

        const contentHeight = currentY;
        const minScroll = Math.min(0, viewportH - contentHeight - 50);

        const updateVisibility = () => {
            scrollContent.iterate(child => {
                const localY = scrollContent.y + child.y; 
                child.visible = localY > viewportY - 40 && localY < viewportY + viewportH + 40;
            });
        };

        scrollContent.y = viewportY;
        updateVisibility();

        const scrollArea = scene.add.rectangle(w/2, h/2, viewportW, viewportH, 0xffffff, 0).setInteractive().setDepth(5002);

        let dragging = false;
        let dragStartY = 0;
        let startY = 0;

        const onPointerMove = pointer => {
            if (!dragging) return;
            const delta = pointer.y - dragStartY;
            scrollContent.y = Phaser.Math.Clamp(startY + delta, viewportY + minScroll, viewportY);
            updateVisibility();
        };

        const onPointerUp = () => { dragging = false; };

        scrollArea.on("pointerdown", pointer => {
            dragging = true;
            dragStartY = pointer.y;
            startY = scrollContent.y;
        });

        scrollArea.on("wheel", (pointer, dx, dy) => {
            scrollContent.y = Phaser.Math.Clamp(scrollContent.y - dy, viewportY + minScroll, viewportY);
            updateVisibility();
        });

        scene.input.on("pointermove", onPointerMove);
        scene.input.on("pointerup", onPointerUp);

        const cleanup = () => {
            scene.input.off("pointermove", onPointerMove);
            scene.input.off("pointerup", onPointerUp);
            scene.events.off("shutdown", shutdownCleanup);
            scrollArea.destroy();
            dim.destroy();
            mainContainer.destroy();
        };
        const shutdownCleanup = () => cleanup();
        scene.events.once("shutdown", shutdownCleanup);

        const triggerExit = (nextCallback) => {
            if (scene.sndClickClose) scene.sndClickClose.play();
            PrivateRoomUI.animateExit(scene, mainContainer, contents, dim, () => {
                cleanup();
                if (nextCallback) nextCallback();
            });
        };

        closeBtn.on("pointerdown", () => triggerExit());

        PrivateRoomUI.animateEntrance(scene, mainContainer, contents, dim);
    }
}