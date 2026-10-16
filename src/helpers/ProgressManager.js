import Phaser from "phaser";

export default class ProgressManager {
    static current = null;
    static isHiding = false;

    static show(scene, message = "SYSTEM PROCESSING...") {
        // Instant cleanup if called back-to-back before hide animation finishes
        if (this.current) {
            this.forceCleanup();
        }

        this.isHiding = false;

        const w = scene.scale.width;
        const h = scene.scale.height;

        // 1. Dark Background Overlay
        const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 1)
            .setAlpha(0)
            .setInteractive()
            .setDepth(99998);

        // 2. Main Container (Starts off-screen for the entrance animation)
        const mainContainer = scene.add.container(w / 2, h + 600).setDepth(99999);
        const contents = [];

        const panelW = 540;
        const panelH = 140;

        // Cyber Shadow/Glow (Gold to match the processing theme)
        const shadow = scene.add.graphics();
        shadow.fillStyle(0xffcc00, 0.15); 
        shadow.fillRoundedRect(-panelW / 2 - 10, -panelH / 2 - 10, panelW + 20, panelH + 20, 20);
        mainContainer.add(shadow);

        // Obsidian Base with Neon Gold border
        const panel = scene.add.graphics();
        panel.fillStyle(0x050505, 1);
        panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
        panel.lineStyle(3, 0xffcc00, 1);
        panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
        mainContainer.add(panel);

        // Text
        const text = scene.add.text(0, 0, message, {
            fontFamily: "Impact, Arial Black",
            fontSize: "32px",
            color: "#ffcc00",
            letterSpacing: 4
        }).setOrigin(0.5);
        contents.push(text);

        mainContainer.add(contents);

        // Continuous Pulsing effect for the text to simulate "loading"
        const pulseTween = scene.tweens.add({
            targets: text,
            alpha: { start: 1, to: 0.3 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.current = {
            scene,
            dim,
            mainContainer,
            contents,
            pulseTween
        };

        // ==========================================
        // ENTRANCE SEQUENCE (Laser beam expand)
        // ==========================================
        mainContainer.scaleX = 0.02; // Start as a thin line
        contents.forEach(c => { if (c) c.setAlpha(0); });
        
        // Fade dim in
        scene.tweens.add({ targets: dim, alpha: 0.8, duration: 300, ease: 'Linear' });

        // Shoot up
        scene.tweens.add({
            targets: mainContainer,
            y: h / 2,
            duration: 350,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Swipe expand
                scene.tweens.add({
                    targets: mainContainer,
                    scaleX: 1,
                    duration: 350,
                    ease: 'Cubic.easeOut',
                    onComplete: () => {
                        // Fade text in
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

        return mainContainer;
    }

    static hide() {
        if (!this.current || this.isHiding) return;
        this.isHiding = true;

        const { scene, dim, mainContainer, contents, pulseTween } = this.current;
        
        // Failsafe in case scene was destroyed
        if (!scene || !scene.tweens) {
            this.forceCleanup();
            return;
        }

        if (pulseTween) pulseTween.stop();

        // ==========================================
        // EXIT SEQUENCE (Snap shut and plunge)
        // ==========================================
        
        // 1. Fade text out
        scene.tweens.add({
            targets: contents,
            alpha: 0,
            duration: 200,
            ease: 'Linear',
            onComplete: () => {
                // 2. Snap shut width
                scene.tweens.add({
                    targets: mainContainer,
                    scaleX: 0.02,
                    duration: 200,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        // 3. Plunge down
                        scene.tweens.add({
                            targets: mainContainer,
                            y: scene.scale.height + 600,
                            duration: 350,
                            ease: 'Cubic.easeIn'
                        });
                        
                        // 4. Fade background out and destroy
                        scene.tweens.add({
                            targets: dim,
                            alpha: 0,
                            duration: 350,
                            ease: 'Linear',
                            onComplete: () => {
                                this.forceCleanup();
                            }
                        });
                    }
                });
            }
        });
    }

    static forceCleanup() {
        try {
            if (this.current) {
                if (this.current.pulseTween) this.current.pulseTween.stop();
                if (this.current.dim) this.current.dim.destroy();
                if (this.current.mainContainer) this.current.mainContainer.destroy();
            }
        } catch (e) {
            console.warn("ProgressManager force cleanup caught:", e);
        }
        this.current = null;
        this.isHiding = false;
    }
}