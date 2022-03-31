# Grafana Doom

2022 March Grafana Labs hackathon project. Runs wasm compiled Doom as a Grafana datasource, renders in a timeseries chart.


## Try it

1. Install dependencies

   ```bash
   yarn install
   ```
2. Build plugin in production mode

   ```bash
   yarn build
   ```
   
3. Add plugin to your grafana instance by sym-linking project root to grafana's `data/plugins`
4. Create a dashboard by copying one of the dashboards from `dashboards` folder
