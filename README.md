# Grafana Doom

2022 March Grafana Labs hackathon project. Runs wasm compiled Doom as a Grafana datasource, renders in a timeseries chart.

You can read more about the project here: https://grafana.com/blog/2022/03/31/can-grafana-run-doom/

## Try it

### Doom WASM

1. Install dependencies

   ```bash
   brew install emscripten automake sdl2 sdl2_mixer sdl2_net pkg-config
   ```

   The command above is using Homebrew. Use other package managers if needed.

1. Copy [doom1.wad](https://doomwiki.org/wiki/DOOM1.WAD) to `./doom-wasm/src`. Ensure it is called `doom1.wad`

1. Run the following commands for building Doom:

   ```bash
   ./doom-wasm/scripts/clean.sh
   ./doom-wasm/scripts/build.sh
   ```

1. Copy the following files to `./src/img`:

   - `./doom-wasm/src/doom1.wad`
   - `./doom-wasm/src/websockets-doom.wasm`
   - `./doom-wasm/src/websockets-doom.wasm.map`

### Datasource

1. Install dependencies

   ```bash
   yarn install
   ```

1. Build plugin in production mode

   ```bash
   yarn build
   ```

1. Add plugin to your grafana instance by sym-linking project root to Grafana's `data/plugins` folder

1. Create a `Doom` datasource in Grafana and note down the ID. It will be needed later.

### Dashboards

1. Navigate to `./dashboards/` and pick one of the JSON files

1. Replace `datasource-id` with the datasource ID that you obtained from last step in the Datasource instructions

1. Import the dashboard in Grafana

1. Enjoy!
