const ImageJS = require('image-js');
const fs = require('fs');

async function gen() {
  const img = await ImageJS.Image.load('src/img/palette.png');
  const colors = [];
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      colors.push(await img.getPixelXY(x * 16, y * 16));
    }
  }

  fs.writeFileSync('src/palette.ts', `export const palette = ${JSON.stringify(colors, null, 2)}`);

  const overrides = colors.map((rgb, idx) => ({
    matcher: {
      id: 'byName',
      options: String(idx),
    },
    properties: [
      {
        id: 'color',
        value: {
          fixedColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`,
          mode: 'fixed',
        },
      },
    ],
  }));

  fs.writeFileSync('overrides.json', JSON.stringify({ overrides }, null, 2));
}

gen();
