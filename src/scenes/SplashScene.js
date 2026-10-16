import Phaser from 'phaser';
import session from '../net/session.js';
import userConfig from '../config/user.js';
import AlertManager from '../helpers/AlertManager.js';

export default class SplashScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SplashScene' });
    }

    preload() {
        this.cameras.main.setBackgroundColor('#000000');

        let homeDataString = null;
        if (window.AndroidInterface && typeof window.AndroidInterface.getHomeData === "function") {
            homeDataString = window.AndroidInterface.getHomeData();
        } else if (window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            homeDataString = urlParams.get('home_data');
        }

        if (homeDataString && homeDataString.trim().length > 0) {
            try {
                const data = JSON.parse(homeDataString);
                userConfig.uname = data.uname || userConfig.uname || "";
                userConfig.password = data.password || userConfig.password || "";
                userConfig.device_name = data.device_name || userConfig.device_name || "";
                userConfig.device_id = data.device_id || userConfig.device_id || "";
            } catch (e) {}
        }

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const centerX = width / 2;
        const centerY = height / 2;

        this.loadingText = this.add.text(centerX, centerY - 30, 'LOADING ASSETS...', {
            fontFamily: '"Courier New", monospace',
            fontSize: '16px',
            color: '#00e5ff',
            letterSpacing: 2
        }).setOrigin(0.5).setShadow(0, 0, '#00e5ff', 10, true, true);

        this.progressBox = this.add.graphics();
        this.progressBox.lineStyle(2, 0x00e5ff, 0.5);
        this.progressBox.strokeRect(centerX - 160, centerY, 320, 20);

        this.progressBar = this.add.graphics();

        this.load.on('progress', (value) => {
            this.progressBar.clear();
            this.progressBar.fillStyle(0x00e5ff, 0.8);
            this.progressBar.fillRect(centerX - 156, centerY + 4, 312 * value, 12);
        });

        this.load.on('complete', () => {
            this.progressBar.clear();
            this.progressBar.fillStyle(0x00e5ff, 0.8);
            this.progressBar.fillRect(centerX - 156, centerY + 4, 312, 12);
            this.loadingText.setText('ASSETS LOADING COMPLETE');
        });

        this.load.image("lobby_bg", "assets/ui/lobby_bg.png");
        this.load.image("play_btn", "assets/ui/play_btn.png");
        this.load.image("join_btn", "assets/ui/join_btn.png");
        this.load.image("settings_btn", "assets/ui/settings_btn.png");
        this.load.image("top_coins", "assets/ui/top_coins.png");
        this.load.image("game_bg", "assets/ui/game_bg.png");
        
        this.load.image("avatar_placeholder", "assets/ui/avatar_placeholder.png");
        this.load.image("loading_panel", "assets/ui/loading_panel.png");
        
        this.load.image("btn_blind", "assets/ui/blind_btn.png");
        this.load.image("btn_blind2x", "assets/ui/blind_2x_btn.png");
        this.load.image("btn_show", "assets/ui/show_btn.png");
        this.load.image("btn_pack", "assets/ui/pack_btn.png");

        this.load.image("table_bg_bronze", "assets/ui/bronze_table.png");
        this.load.image("table_bg_silver", "assets/ui/silver_table.png");
        this.load.image("table_bg_gold", "assets/ui/gold_table.png");
        this.load.image("table_bg_platinum", "assets/ui/platinum_table.png");
        this.load.image("table_bg_diamond", "assets/ui/diamond_table.png");

        this.load.image("game_bg", "assets/ui/game_bg.jpg");
        this.load.image("dealer_girl", "assets/ui/card_distributor.png");
        this.load.image("coin_game", "assets/ui/coin_game.png");
        this.load.image("avatar", "assets/ui/avatar_placeholder.png");

        this.load.image("see_btn", "assets/ui/see_btn.png");
        this.load.image("pack_btn", "assets/ui/pack_btn.png");
        this.load.image("blind_btn", "assets/ui/blind_btn.png");
        this.load.image("blind_2x_btn", "assets/ui/blind_2x_btn.png");
        this.load.image("show_btn", "assets/ui/show_btn.png");
        this.load.image("chaal_btn", "assets/ui/chaal_btn.png");
        this.load.image("chaal_2x_btn", "assets/ui/chaal_2x_btn.png");
        this.load.image("slideshow_btn", "assets/ui/slideshow_btn.png");
        this.load.image("allin_btn", "assets/ui/allin_btn.png");

        this.load.audio("player_win", "assets/sound/bj_player_win.mp3");
        this.load.audio("blind", "assets/sound/blind.mp3");
        this.load.audio("blind2x", "assets/sound/blind2x.mp3");
        this.load.audio("card_back_distribute", "assets/sound/card_back_distribute.mp3");
        this.load.audio("chaal", "assets/sound/chaal.mp3");
        this.load.audio("chaal2x", "assets/sound/chaal2x.mp3");
        this.load.audio("click", "assets/sound/click.mp3");
        this.load.audio("click_close", "assets/sound/click_close.mp3");
        this.load.audio("flip_card", "assets/sound/flip_card.mp3");
        this.load.audio("pack", "assets/sound/pack.mp3");
        this.load.audio("see", "assets/sound/see.mp3");
        this.load.audio("your_turn", "assets/sound/your_turn.mp3");

        const rankCodes = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
        const rankNames = { A: "ace", K: "king", Q: "queen", J: "jack", "10": "10", "9": "9", "8": "8", "7": "7", "6": "6", "5": "5", "4": "4", "3": "3", "2": "2" };
        const suitCodes = ["S", "H", "D", "C"];
        const suitNames = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

        for (let i = 0; i < rankCodes.length; i++) {
            for (let j = 0; j < suitCodes.length; j++) {
                const rc = rankCodes[i];
                const sc = suitCodes[j];
                const fileName = rankNames[rc] + "_of_" + suitNames[sc];
                this.load.image("card_" + rc + sc, "assets/cards/" + fileName + ".png");
            }
        }
        this.load.image("card_back", "assets/cards/card_back.png");
    }

    create() {
        session.init();

        this.input.once("pointerdown", () => {
            if (this.sound.context && this.sound.context.state === "suspended") {
                this.sound.context.resume();
            }
        });

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        this.centerX = width / 2;
        this.centerY = height / 2;

        this.time.delayedCall(800, () => {
            if (this.loadingText) this.loadingText.destroy();
            if (this.progressBox) this.progressBox.destroy();
            if (this.progressBar) this.progressBar.destroy();

            this.startSceneIntro();
        });
    }

    startSceneIntro() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const scanlines = this.add.graphics();
        scanlines.fillStyle(0x000000, 0.3);
        for (let i = 0; i < height; i += 3) {
            scanlines.fillRect(0, i, width, 1);
        }
        scanlines.setDepth(100); 

        const fontStyle = { 
            fontFamily: '"Impact", "Arial Black", sans-serif', 
            fontSize: '90px', 
            fontStyle: '900', 
            letterSpacing: 12 
        };
        
        this.textCyan = this.add.text(this.centerX - 5, this.centerY - 150, '', { ...fontStyle, color: '#00ffff' })
            .setOrigin(0.5).setBlendMode('SCREEN').setAlpha(0.8);
            
        this.textRed = this.add.text(this.centerX + 5, this.centerY - 150, '', { ...fontStyle, color: '#ff0033' })
            .setOrigin(0.5).setBlendMode('SCREEN').setAlpha(0.8);
            
        this.textMain = this.add.text(this.centerX, this.centerY - 150, '', { ...fontStyle, color: '#ffcc00' })
            .setOrigin(0.5);

        this.presentsText = this.add.text(this.centerX, this.centerY - 60, 'GAMES PRESENTS', {
            fontFamily: '"Courier New", monospace', 
            fontSize: '14px', 
            color: '#00e5ff', 
            letterSpacing: 30
        }).setOrigin(0.5).setAlpha(0);

        this.gameTitle = this.add.text(this.centerX, this.centerY + 20, 'POKER HOLD\'EM', {
            fontFamily: '"Impact", sans-serif', 
            fontSize: '80px', 
            color: '#0a0000' 
        }).setOrigin(0.5).setScale(1.3).setAlpha(0);

        const targetWord = "BLUFF365";
        const glitchChars = "01<>X?#%&*@V";
        let iterations = 0;
        const maxIterations = 25; 

        this.time.addEvent({
            delay: 40, 
            repeat: maxIterations,
            callback: () => {
                let scrambled = "";
                for (let i = 0; i < targetWord.length; i++) {
                    if (i < iterations / (maxIterations / targetWord.length)) {
                        scrambled += targetWord[i];
                    } else {
                        scrambled += glitchChars[Math.floor(Math.random() * glitchChars.length)];
                    }
                }
                
                this.textCyan.setText(scrambled);
                this.textRed.setText(scrambled);
                this.textMain.setText(scrambled);
                iterations++;

                if (Math.random() > 0.4) {
                    this.textCyan.x = this.centerX + Phaser.Math.Between(-15, 15);
                    this.textRed.x = this.centerX + Phaser.Math.Between(-15, 15);
                    this.textMain.y = (this.centerY - 150) + Phaser.Math.Between(-2, 2);
                } else {
                    this.textCyan.x = this.centerX - 5;
                    this.textRed.x = this.centerX + 5;
                    this.textMain.y = this.centerY - 150;
                }

                if (iterations > maxIterations) {
                    this.textCyan.x = this.centerX; 
                    this.textRed.x = this.centerX; 
                    this.textMain.y = this.centerY - 150;
                    
                    this.textMain.setShadow(0, 0, '#ffcc00', 20, true, true);
                    this.triggerImpactSequence();
                }
            }
        });
    }

    triggerImpactSequence() {
        this.cameras.main.flash(150, 255, 204, 0, 40);
        this.cameras.main.shake(200, 0.015);

        this.tweens.add({
            targets: this.presentsText,
            alpha: { start: 0, to: 1 },
            duration: 80,
            yoyo: true,
            repeat: 4,
            onComplete: () => { 
                this.presentsText.setAlpha(1); 
                this.presentsText.setShadow(0, 0, '#00e5ff', 10, true, true); 
            }
        });

        this.time.delayedCall(500, () => {
            this.gameTitle.setAlpha(1);
            
            this.tweens.add({
                targets: this.gameTitle,
                scale: 1,
                duration: 120, 
                ease: 'Quad.easeIn',
                onComplete: () => {
                    this.cameras.main.shake(350, 0.03);
                    this.gameTitle.setColor('#ff0033'); 
                    this.gameTitle.setShadow(0, 0, '#ff0033', 40, true, true);
                    
                    this.startGlitchLoop(this.gameTitle);
                    this.startAutoLogin(); 
                }
            });
        });
    }

    startGlitchLoop(targetText) {
        this.time.addEvent({
            delay: 3000,
            loop: true,
            callback: () => {
                if (Math.random() > 0.5) {
                    this.tweens.add({
                        targets: targetText,
                        x: targetText.x + Phaser.Math.Between(-10, 10),
                        alpha: 0.5,
                        duration: 40,
                        yoyo: true,
                        repeat: 2
                    });
                }
            }
        });
    }

    startAutoLogin() {
        const uname = userConfig.uname || 'UNKNOWN';

        this.authLoadingText = this.add.text(this.centerX, this.centerY + 160, `AUTHENTICATING: ${uname.toUpperCase()}`, {
            fontFamily: '"Courier New", monospace',
            fontSize: '20px',
            color: '#ffcc00', 
            fontStyle: 'bold',
            letterSpacing: 4
        }).setOrigin(0.5).setAlpha(0);

        this.authLoadingText.setShadow(0, 0, '#ffcc00', 10, true, true);

        this.loadingTween = this.tweens.add({
            targets: this.authLoadingText,
            alpha: { start: 1, to: 0.3 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        let dotCount = 0;
        this.loadingDotsTimer = this.time.addEvent({
            delay: 400,
            loop: true,
            callback: () => {
                dotCount = (dotCount + 1) % 4;
                const dots = '.'.repeat(dotCount);
                this.authLoadingText.setText(`AUTHENTICATING: ${uname.toUpperCase()}${dots}`);
            }
        });

        this.time.delayedCall(2000, () => {
            session.loginWithStored((result, payload) => {
                if (!result.success) {
                    this.hideLoading();
                    AlertManager.show(this, result.message || "AUTHENTICATION FAILED");
                    return;
                }

                if (this.loadingTween) this.loadingTween.stop();
                if (this.loadingDotsTimer) this.loadingDotsTimer.remove();
                this.authLoadingText.setAlpha(1);
                this.authLoadingText.setText("Welcome " + (payload.uname || uname).toUpperCase());

                const resolvedUname = (payload && payload.uname) ? payload.uname : (userConfig.uname || uname);
                const userKey = `avatar_${resolvedUname.toLowerCase()}`;
                this.load.image({
                    key: userKey,
                    url: `https://teenpatti.bluff365.com/avatar/${resolvedUname.toLowerCase()}`,
                    XHRSettings: { responseType: "blob" },
                    crossOrigin: "anonymous"
                });

                this.load.once("complete", () => {
                    this.cameras.main.fade(1000, 0, 0, 0);
                    this.time.delayedCall(1000, () => {
                        if (!session.flowGuard) session.flowGuard = {};
                        session.flowGuard.startedFromSplash = true;
                        this.scene.start('LobbyScene', {
                            username: resolvedUname,
                            deviceId: (payload && payload.device_id) || userConfig.device_id || "",
                            deviceName: (payload && payload.device_name) || userConfig.device_name || "",
                            coins: result.bluff_coins || 0,
                            pwdhash: result.pwdhash || "",
                            activeMatch: result.activeMatch
                        });
                    });
                });

                this.load.start();
            });
        });
    }

    hideLoading() {
        if (this.loadingTween) this.loadingTween.stop();
        if (this.loadingDotsTimer) this.loadingDotsTimer.remove(); 
        if (this.authLoadingText) this.authLoadingText.setAlpha(0);
    }
}