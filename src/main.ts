import { GameCore } from "./core/gameCore";
import { pixelToAxial } from "./core/hexMath";
import { CanvasRenderer } from "./render/canvasRenderer";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, 38);
const game = new GameCore(4);

// Render once initially
renderer.render(game.getState());

// Click to select hex
canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;

  // Convert screen coords to origin-centered world coords
  const world = renderer.screenToWorld(sx, sy);

  // Convert pixel to axial hex
  const hex = pixelToAxial(world.x, world.y, renderer.getHexSize());

  game.selectHex(hex);
  renderer.render(game.getState());
});

// Press space to end turn
window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space") {
    game.endTurn();
    renderer.render(game.getState());
  }
});
