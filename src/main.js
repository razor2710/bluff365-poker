import Phaser from "phaser";
import SplashScene from "./scenes/SplashScene.js";
import LobbyScene from "./scenes/LobbyScene.js";
import GameScene from "./scenes/GameScene.js";
import ConfigScene from "./scenes/ConfigScene.js";
import "./ui/theme.css";

let gameWidth = 1920;
let gameHeight = 1080;

if (window.NATIVE_HOME_DATA) {
  const data = typeof window.NATIVE_HOME_DATA === "string" 
    ? JSON.parse(window.NATIVE_HOME_DATA) 
    : window.NATIVE_HOME_DATA;
    
  if (data.hardware_w && data.hardware_h) {
    gameWidth = data.hardware_w;
    gameHeight = data.hardware_h;
  }
}

const config = {
  type: Phaser.WEBGL,
  parent: "game",
  width: gameWidth,
  height: gameHeight,
  backgroundColor: "#05050a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    transparent: false,
    premultipliedAlpha: false
  },
  scene: [
    SplashScene,
    LobbyScene,
    GameScene,
    ConfigScene
  ],

  dom: {
        createContainer: true
    },
  // 🛠️ THIS GLOBAL CALLBACK APPLIES THE FIX EVERYWHERE INSTANTLY
  callbacks: {
    postBoot: function (game) {
      game.events.on('READY', () => {
        game.scene.scenes.forEach(scene => {
          scene.events.on('create', () => {
            // Define a clean 50px inner safety padding for the left/right edges
            const paddingX = 50; 
            
            // Re-bind the main view viewport parameters smoothly
            scene.cameras.main.setViewport(
              paddingX, 
              0, 
              game.scale.width - (paddingX * 2), 
              game.scale.height
            );
          });
        });
      });
    }
  }
};

new Phaser.Game(config);