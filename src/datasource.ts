import defaults from 'lodash/defaults';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  dateTime,
  FieldType,
  LoadingState,
  toDataFrame
} from '@grafana/data';

import { palette } from './palette';

import { Observable, merge, Subscriber } from 'rxjs';

import { MyQuery, MyDataSourceOptions, defaultQuery } from './types';

//const FPS = 35;
const RGBA_VALUE_ERROR_MARGIN = 3;

const WIDTH_PX = 320;
const HEIGHT_PX = 200;


type RGB = [number, number, number];

function rgbaKey(rgba: RGB): number {
  return rgba[0] * 1000 * 2 + rgba[1] * 1000 + rgba[2]
}

interface RenderContext {
  subscriber: Subscriber<DataQueryResponse>
  query: MyQuery
  options: DataQueryRequest<MyQuery>
  twindow: number
  rangeStep: number
}

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {

  renderContext: RenderContext | null = null;

  colorCache: Record<number, number> = {}

  intervalId: any

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }
  
  getColorIndex(rgb: RGB) {
    const key = rgbaKey(rgb);
    if (this.colorCache[key]) {
      return this.colorCache[key];
    }

    for (let i =0; i < palette.length; i++) {
      if ((Math.abs(palette[i][0] - rgb[0]) <= RGBA_VALUE_ERROR_MARGIN) &&
          (Math.abs(palette[i][1] - rgb[1]) <= RGBA_VALUE_ERROR_MARGIN) &&
          (Math.abs(palette[i][2] - rgb[2]) <= RGBA_VALUE_ERROR_MARGIN)
          ){ 
            this.colorCache[key] = i;
            return i;
          }
    }
    return 0;
  }

  renderCanvas(ctx: CanvasRenderingContext2D, vflip = false) {
    if (this.renderContext) {
      const renderContext = this.renderContext;
      const now = dateTime().valueOf()
      const start = now - this.renderContext.twindow;

      const columns: Array<{
        tLen: number,
        color2H: number[][]
      }> = []

      const colorsUsed: Record<number, boolean> = {}

      const imgData = ctx.getImageData(0, 0, WIDTH_PX, HEIGHT_PX).data

      for (let x = 0; x < WIDTH_PX; x++) {
        let tLen = 1;
        const color2H: number[][] = Array(256);
        for (let y = 0; y < HEIGHT_PX; y++) {
          const offst = ((vflip ? y : (HEIGHT_PX - y -1)) * WIDTH_PX + x) * 4;
          const colorIdx = this.getColorIndex([imgData[offst], imgData[offst + 1], imgData[offst + 2]])
          colorsUsed[colorIdx] = true
          if (!color2H[colorIdx]) {
            color2H[colorIdx] = [y]
          } else {
            color2H[colorIdx].push(y)
            tLen = Math.max(tLen, color2H[colorIdx].length)
          }
        }
        columns.push({ tLen, color2H })
      }

      const timeValues = columns.flatMap(({ tLen }, i) => Array.from(Array(tLen)).map((_, ti) => start + i * renderContext.rangeStep + ti))

      const fields: any = [
        { name: 'Time', type: FieldType.time, values: timeValues },
      ]

      Object.keys(colorsUsed).forEach((colorIndex) => {
        const cIndex = Number(colorIndex)
        const values: number[] = []
        let i = 0;
        for (let {tLen, color2H} of columns) {
          if (color2H[cIndex]) {
            color2H[cIndex].forEach((c, ii) => {
              values[i + ii] = c
            })
          }
          i+= tLen;
        }

        fields.push({ name: 'Value', type: FieldType.number, values, labels: { color: String(colorIndex) }})
      })

      const frame = toDataFrame({
        name: 'screen',
        fields,
      });
      frame.refId = renderContext.query.refId

      renderContext.subscriber.next({
        data: [frame],
        key: renderContext.query.refId,
        state: LoadingState.Streaming,
      });
    }
  }


  getImg2DContext(src: string): Promise<CanvasRenderingContext2D | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH_PX;
      canvas.height = HEIGHT_PX;
      const ctx = canvas.getContext('2d');
      const img = new Image()
      if (ctx) {
        img.src = src;
        img.onload = () => {
          ctx.drawImage(img,0,0);
          resolve(ctx)
        }
        img.onabort = () => resolve(null)
        img.onerror = () => resolve(null)
      } else {
        resolve(null)
      }
    })
  }

  

  query(options: DataQueryRequest<MyQuery>): Observable<DataQueryResponse> {
    const streams = options.targets.map(target => {
      const query = defaults(target, defaultQuery);

      const from = options.range.from.valueOf();
      const to = options.range.to.valueOf();
      const diff = to- from;
      const rangeStep = (to - from) / WIDTH_PX;

      return new Observable<DataQueryResponse>(subscriber => {
        this.renderContext = {
          query: query,
          options: options,
          subscriber: subscriber,
          twindow: diff,
          rangeStep,
        }
        this.getImg2DContext('/public/plugins/grafana-doom-datasource/img/title.png').then(ctx => {
          if (ctx) {
            //this.renderCanvas(ctx)
            
            let flip = false;
            this.intervalId = setInterval(() => {
              flip = !flip;
              this.renderCanvas(ctx, flip)
            }, 1000 /25)
          }
        })
  
        return () => {
          this.renderContext = null;
          clearInterval(this.intervalId);
        };
      });
    });
  
    return merge(...streams);
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
