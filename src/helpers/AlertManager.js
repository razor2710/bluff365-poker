export default class AlertManager {
    static show(scene, message, title = 'SYSTEM OVERRIDE FAILED') {
        const centerX = scene.scale.width / 2;
        const centerY = scene.scale.height / 2;
        
        // 1. Dark Background Overlay
        const overlay = scene.add.rectangle(centerX, centerY, scene.scale.width, scene.scale.height, 0x000000, 0);
        overlay.setInteractive(); 
        overlay.setDepth(20000); // Forces the dark background above the ConfigScene UI

        // Fade in the dark background
        scene.tweens.add({
            targets: overlay,
            fillAlpha: 0.9,
            duration: 300,
            ease: 'Linear'
        });

        // 2. The Premium HTML Payload (Obsidian, Red & Gold)
        const html = `
            <div id="alertContainer" style="
                width: 440px; 
                height: 240px; 
                display: flex; 
                justify-content: center; 
                align-items: center;
                user-select: none;
            ">
                <div id="cyberAlertWrapper" style="
                    width: 2px;
                    height: 240px;
                    background: #050505; /* Deep Obsidian Black */
                    border-left: 2px solid #ff0033; /* Neon Blood Red */
                    border-right: 2px solid #ff0033;
                    box-shadow: 0 0 40px rgba(255, 0, 51, 0.4);
                    overflow: hidden;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transform: translateY(100vh);
                    /* Smooth CSS Transitions */
                    transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
                                width 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
                ">
                    <div id="cyberAlertContent" style="
                        min-width: 440px;
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
                            font-size: 30px;
                            color: #ff0033;
                            letter-spacing: 3px;
                            text-transform: uppercase;
                            text-shadow: 2px 2px 0px #330000;
                        ">${title}</h1>
                        
                        <p style="
                            margin: 0 0 35px 0;
                            font-family: 'Courier New', monospace;
                            font-size: 16px;
                            color: #ffcc00; /* Cyber Gold */
                            line-height: 1.5;
                            font-weight: bold;
                            text-align: center;
                            text-shadow: 0 0 5px rgba(255, 204, 0, 0.3);
                        ">${message}</p>
                        
                        <button id="closeAlertBtn" style="
                            background: rgba(255, 204, 0, 0.05); /* Very faint amber tint */
                            border: 1px solid #ffcc00;
                            padding: 10px 40px;
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
                        >ACKNOWLEDGE</button>
                    </div>
                </div>
            </div>
        `;

        const dialogDOM = scene.add.dom(centerX, centerY).createFromHTML(html);
        dialogDOM.setDepth(20001); // Forces the alert box above the dark background

        // 3. Grab the elements by ID
        const wrapper = dialogDOM.getChildByID('cyberAlertWrapper');
        const content = dialogDOM.getChildByID('cyberAlertContent');

        // ==========================================
        // 4. ENTRANCE SEQUENCE
        // ==========================================
        setTimeout(() => {
            if (wrapper && content) {
                // Shoot up (Red laser beam)
                wrapper.style.transform = 'translateY(0)';
                
                // Swipe expand
                setTimeout(() => {
                    wrapper.style.width = '100%';
                }, 350); 

                // Fade in text
                setTimeout(() => {
                    content.style.opacity = '1';
                }, 700); 
            }
        }, 50);

        // ==========================================
        // 5. EXIT SEQUENCE
        // ==========================================
        dialogDOM.addListener('click');
        dialogDOM.on('click', (event) => {
            if (event.target.id === 'closeAlertBtn') {
                event.target.disabled = true;

                // Fade text out
                content.style.opacity = '0';

                // Snap shut
                setTimeout(() => {
                    wrapper.style.width = '2px';
                }, 200);

                // Plunge down
                setTimeout(() => {
                    wrapper.style.transform = 'translateY(100vh)';
                    
                    scene.tweens.add({
                        targets: overlay,
                        fillAlpha: 0,
                        duration: 350,
                        ease: 'Linear',
                        onComplete: () => {
                            overlay.destroy();
                            dialogDOM.destroy();
                        }
                    });
                }, 550);
            }
        });
    }


    static showToastx(scene, message, duration = 2000) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    const centerX = w / 2;
    const defaultCenterY = h * 0.47; // Slightly below center so it doesn't block community cards

    if (!AlertManager.activeToasts) AlertManager.activeToasts = [];
    AlertManager.activeToasts = AlertManager.activeToasts.filter(t => t.scene && t.scene.sys.isActive());

    const text = scene.add.text(0, 0, message.toUpperCase(), {
      fontFamily: "'Courier New', monospace",
      fontSize: "18px",
      fontWeight: "bold",
      color: "#ffcc00", // Cyber Gold text
      align: "center",
      metrics: { ascent: 15, descent: 4, fontSize: 19 }
    }).setOrigin(0.5);

    const paddingX = 32;
    const paddingY = 14;
    const toastWidth = Math.max(280, Math.min(600, text.width + paddingX * 2));
    const toastHeight = text.height + paddingY * 2;
    text.setWordWrapWidth(toastWidth - 40);

    const container = scene.add.container(0, 0);
    container.setDepth(999999);
    container.toastHeight = toastHeight;

    const shadow = scene.add.graphics();
    shadow.fillStyle(0xff0033, 0.15); // Red glow shadow
    shadow.fillRoundedRect(-toastWidth / 2 - 4, -toastHeight / 2 - 4, toastWidth + 8, toastHeight + 8, 14);
    container.add(shadow);

    const bg = scene.add.graphics();
    bg.fillStyle(0x050505, 0.95); // Obsidian black
    bg.fillRoundedRect(-toastWidth / 2, -toastHeight / 2, toastWidth, toastHeight, 12);
    bg.lineStyle(2, 0xff0033, 1); // Neon Blood Red border
    bg.strokeRoundedRect(-toastWidth / 2, -toastHeight / 2, toastWidth, toastHeight, 12);
    container.add(bg);

    text.setPosition(0, 0);
    container.add(text);

    const gap = 12;
    let activeVisibleToasts = AlertManager.activeToasts.filter(t => !t.isHiding);

    if (activeVisibleToasts.length >= 2) {
      container.setAlpha(0).setVisible(false);
    } else if (activeVisibleToasts.length === 1) {
      const upperToast = activeVisibleToasts[0];
      const lowerY = upperToast.y + (upperToast.toastHeight / 2) + gap + (toastHeight / 2);
      container.setPosition(centerX, lowerY);
      
      if (upperToast.lifetimeTimer && upperToast.lifetimeTimer.delay > 500) {
        upperToast.lifetimeTimer.remove();
        upperToast.lifetimeTimer = scene.time.delayedCall(500, () => triggerToastExit(upperToast));
      }
    } else {
      container.setPosition(centerX, defaultCenterY);
    }

    AlertManager.activeToasts.push(container);

    if (activeVisibleToasts.length < 2) {
      container.setAlpha(0);
      container.setScale(0.96);
      scene.tweens.add({
        targets: container,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: "Cubic.easeOut"
      });

      container.lifetimeTimer = scene.time.delayedCall(duration, () => triggerToastExit(container));
    }

    function triggerToastExit(targetContainer) {
      if (targetContainer.isHiding || !scene || !scene.tweens) return;
      targetContainer.isHiding = true;

      scene.tweens.add({
        targets: targetContainer,
        alpha: 0,
        scale: 0.98,
        duration: 160,
        ease: "Cubic.easeIn",
        onComplete: () => {
          AlertManager.activeToasts = AlertManager.activeToasts.filter(item => item !== targetContainer);
          targetContainer.destroy();

          let currentVisibleCount = 0;
          let runningY = defaultCenterY;

          AlertManager.activeToasts.forEach((t) => {
            if (t.isHiding) return;

            if (currentVisibleCount === 0) {
              t.setVisible(true);
              scene.tweens.add({
                targets: t, x: centerX, y: defaultCenterY, alpha: 1, scale: 1, duration: 220, ease: "Cubic.easeInOut"
              });
              
              runningY = defaultCenterY + (t.toastHeight / 2) + gap;
              currentVisibleCount++;

              if (AlertManager.activeToasts.length > 1 && !t.lifetimeTimer) {
                t.lifetimeTimer = scene.time.delayedCall(500, () => triggerToastExit(t));
              } else if (!t.lifetimeTimer) {
                t.lifetimeTimer = scene.time.delayedCall(duration, () => triggerToastExit(t));
              }
            } else if (currentVisibleCount === 1) {
              const targetSecondaryY = runningY + (t.toastHeight / 2);
              t.setVisible(true);
              t.setPosition(centerX, targetSecondaryY + 15);
              t.setAlpha(0);

              scene.tweens.add({
                targets: t, y: targetSecondaryY, alpha: 1, scale: 1, duration: 200, ease: "Cubic.easeOut"
              });
              currentVisibleCount++;
            }
          });
        }
      });
    }
    return container;
  }
}