import defaults from 'lodash/defaults';

import {
  CircularDataFrame,
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

import { MyQuery, MyDataSourceOptions, defaultQuery, QueryType, Metric, queryTypeToMetric } from './types';
import { createModule } from 'doom-module';

//const FPS = 35;
const RGBA_VALUE_ERROR_MARGIN = 3;

const WIDTH_PX = 320;
const HEIGHT_PX = 200;

function rgbaKey(r: number, g: number, b: number): number {
  return r * 1000 * 2 + g * 1000 + b
}

interface RenderContext {
  subscriber: Subscriber<DataQueryResponse>
  query: MyQuery
  options: DataQueryRequest<MyQuery>
  twindow: number
  rangeStep: number
}

type Metrics = Record<Metric, number>
type MetricsSubscriberFn = (metrics: Metrics) => void
export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {

  renderContext: RenderContext | null = null;

  colorCache: Record<number, number> = {}

  intervalId: any

  pixelsCurrent: Uint8Array | null = null;
  
  metricsSubscribers: Array<MetricsSubscriberFn>


  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.metricsSubscribers = [];

    (window as any).doStuff = (health: number, armor: number, armorType: number, ammo: number, ammoMax: number, weapon: number) => {
      const metrics: Metrics = {
        [Metric.health]: health,
        [Metric.ammo]: ammo,
        [Metric.ammoMax]: ammoMax,
        [Metric.armor]: armor,
        [Metric.armorType]: armorType,
        [Metric.weapon]: weapon
      }
      this.metricsSubscribers.forEach(fn => fn(metrics))
    };
  }

  subscribeToMetrics(fn: MetricsSubscriberFn) {
    this.metricsSubscribers.push(fn)
  }

  unsubscribeToMetrics(fn: MetricsSubscriberFn) {
    this.metricsSubscribers = this.metricsSubscribers.filter(f => f !== fn)
  }
  
  getColorIndex(r: number, g: number, b: number) {
    const key = rgbaKey(r, g, b);
    if (this.colorCache[key] !== undefined) {
      return this.colorCache[key];
    }

    for (let i = 0; i < palette.length; i++) {
      if ((Math.abs(palette[i][0] - r) <= RGBA_VALUE_ERROR_MARGIN) &&
          (Math.abs(palette[i][1] - g) <= RGBA_VALUE_ERROR_MARGIN) &&
          (Math.abs(palette[i][2] - b) <= RGBA_VALUE_ERROR_MARGIN)
          ){ 
            this.colorCache[key] = i;
            return i;
          }
    }
    this.colorCache[key] = 0
    return 0;
  }

  renderImgData(imgData: Uint8Array | Uint8ClampedArray, vflip = false, scale = 1) {
    if (this.renderContext) {
      const renderContext = this.renderContext;
      const now = dateTime().valueOf()
      const start = now - this.renderContext.twindow;

      const colorsUsed: Record<number, boolean> = {}

      let valuesLen = 0;

      const heightPx = renderContext.query.halfResolution ? HEIGHT_PX / 2 : HEIGHT_PX;
      const widthPx = renderContext.query.halfResolution ? WIDTH_PX / 2: WIDTH_PX;
      const offsetMultiplier = renderContext.query.halfResolution ? 2 * scale : scale;

      const columns: Array<{
        tLen: number,
        color2H: number[][]
      }> = Array(widthPx)
      for (let x = 0; x < widthPx; x++) {
        let tLen = 1;
        const color2H: number[][] = Array(256);
        for (let y = 0; y < heightPx; y++) {
          const offst = ((vflip ? y * offsetMultiplier : ((HEIGHT_PX - 1) * scale - y * offsetMultiplier - 1 )) * (WIDTH_PX * scale) + x * offsetMultiplier) * 4 ;
          const colorIdx = this.getColorIndex(imgData[offst], imgData[offst + 1], imgData[offst + 2])
          colorsUsed[colorIdx] = true
          if (!color2H[colorIdx]) {
            color2H[colorIdx] = [y]
          } else {
            color2H[colorIdx].push(y)
            tLen = Math.max(tLen, color2H[colorIdx].length)
          }
        }
        columns[x] = { tLen, color2H }
        valuesLen += tLen;
      }

      const timeValues = columns.flatMap(({ tLen }, i) => Array.from(Array(tLen)).map((_) => start + i * renderContext.rangeStep * (renderContext.query.halfResolution ? 2 : 1)))
      const fields: any = [
        { name: 'Time', type: FieldType.time, values: timeValues },
      ]
      fields.length = 257;
      for (let colorIndex = 0; colorIndex < 256; colorIndex++) {
        const values: number[] = Array(valuesLen)
        let i = 0;
        for (let {tLen, color2H} of columns) {
          if (color2H[colorIndex]) {
            color2H[colorIndex].forEach((c, ii) => {
              values[i + ii] = c
            })
          }
          i+= tLen;
        }

        fields[colorIndex + 1] = ({ name: 'Value', type: FieldType.number, values, labels: { color: String(colorIndex) }})
      }

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

  renderWebGLContext(ctx: WebGLRenderingContext, scale=1) {
    if (!this.pixelsCurrent ) {
      this.pixelsCurrent = new Uint8Array(WIDTH_PX* scale * HEIGHT_PX * scale * 4 )
    }
    ctx.readPixels(0, 0, WIDTH_PX * scale, HEIGHT_PX * scale, ctx.RGBA, ctx.UNSIGNED_BYTE, this.pixelsCurrent);
    this.renderImgData(this.pixelsCurrent, true, scale)
  }

  renderCanvas2DContext(ctx: CanvasRenderingContext2D, vflip = false) {
    this.renderImgData(ctx.getImageData(0, 0, WIDTH_PX, HEIGHT_PX).data, vflip)
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
      if (target.queryType === QueryType.Screen) {
        return this.screenQuery(target, options)
      }
      const metric: Metric = (queryTypeToMetric as any)[target.queryType]
      if (metric) {
        return this.metricQuery(metric, target, options)
      }
      return new Observable<DataQueryResponse>(() => {})
    });
  
    return merge(...streams);
  }

  metricQuery(metric: Metric, target: MyQuery, options: DataQueryRequest<MyQuery>) {
    return new Observable<DataQueryResponse>(subscriber => {
      const frame = new CircularDataFrame({
        append: 'tail',
        capacity: 1000,
      });
      
      frame.refId = target.refId;
      frame.addField({ name: 'time', type: FieldType.time });
      frame.addField({ name: 'value', type: FieldType.number });

      const subfn: MetricsSubscriberFn = metrics => {
        frame.add({ time: Date.now(), value: metrics[metric] });

        subscriber.next({
          data: [frame],
          key: target.refId,
          state: LoadingState.Streaming,
        });
      }
      this.subscribeToMetrics(subfn)
      return () => {
        this.unsubscribeToMetrics(subfn)
      }
    })
  }

  screenQuery(target: MyQuery, options: DataQueryRequest<MyQuery>) {
    const query = defaults(target, defaultQuery);

    const from = options.range.from.valueOf();
    const to = options.range.to.valueOf();
    const diff = to - from;
    const rangeStep = (to - from) / WIDTH_PX;

    return new Observable<DataQueryResponse>(subscriber => {
      this.renderContext = {
        query: query,
        options: options,
        subscriber: subscriber,
        twindow: diff,
        rangeStep,
      }
      const module = createModule()
      module.startDoom();
      const gl = (module.canvas as HTMLCanvasElement).getContext('webgl', { preserveDrawingBuffer: true });
      if (gl) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        module.onUpdate = () => {
          this.renderWebGLContext(gl)
        }
      }

      return () => {
        this.renderContext = null;
        try {
          module.exit(0)
        } catch (e) {}
        module.canvas.remove()
      };
    });
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
