import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";

async function wrapText(
  ctx: any,
  text: string,
  maxWidth: number
): Promise<string[]> {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

export async function createMeme(
  inputImageUrl: string,
  topText: string,
  bottomText: string
) {
  topText = topText.toUpperCase();
  bottomText = bottomText.toUpperCase();
  const canvas = createCanvas(0, 0);
  const ctx = canvas.getContext("2d");

  const imageFetchResponse = await fetch(inputImageUrl);
  const arrayBuffer = await imageFetchResponse.arrayBuffer();
  const image = await loadImage(Buffer.from(arrayBuffer));

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0, image.width, image.height);

  const fontPath = path.join(__dirname, "font/impact.ttf");
  registerFont(fontPath, { family: "Impact" });
  // Configure text styles
  const fontSize = 36;
  ctx.font = `${fontSize}px Impact`;
  ctx.textAlign = "center";

  const maxWidth = canvas.width - 40; // Adjust as needed
  const lineHeight = fontSize + 10; // Adjust as needed

  // Add top text with black outline and white fill
  const topTextX = canvas.width / 2;
  let topTextY = 20;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";

  const topLines = await wrapText(ctx, topText, maxWidth);
  for (const line of topLines) {
    ctx.strokeText(line, topTextX, topTextY);
    ctx.fillText(line, topTextX, topTextY);
    topTextY += lineHeight;
  }

  // Add bottom text with black outline and white fill
  const bottomTextX = canvas.width / 2;
  let bottomTextY = canvas.height - fontSize - 20;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";
  ctx.textBaseline = "bottom";

  const bottomLines = await wrapText(ctx, bottomText, maxWidth);
  for (let i = bottomLines.length - 1; i >= 0; i--) {
    const line = bottomLines[i];
    ctx.strokeText(line, bottomTextX, bottomTextY);
    ctx.fillText(line, bottomTextX, bottomTextY);
    bottomTextY -= lineHeight;
  }

  return canvas.toBuffer();
}
