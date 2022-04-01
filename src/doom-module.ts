// @ts-ignore
import { init } from './websockets-doom';

var commonArgs = [
  '-iwad',
  'doom1.wad',
  '-window',
  '-nogui',
  '-nosound',
  '-config',
  'default.cfg',
  '-servername',
  'doomflare',
];

export function createModule() {
  const Module: any = {
    onRuntimeInitialized: () => {
      Module.callMain(commonArgs);
    },
    noInitialRun: true,
    preRun: () => {
      Module.FS.createPreloadedFile(
        '',
        'doom1.wad',
        '/public/plugins/grafana-doom-datasource/img/doom1.wad',
        true,
        true
      );
      Module.FS.createPreloadedFile(
        '',
        'default.cfg',
        '/public/plugins/grafana-doom-datasource/img/default.cfg',
        true,
        true
      );
    },
    printErr: function (text: string) {
      if (arguments.length > 1) {
        text = Array.prototype.slice.call(arguments).join(' ');
      }

      console.error(text);
    },
    canvas: (function () {
      var canvas = document.createElement('canvas');
      canvas.id = 'canvas';
      document.body.append(canvas);
      canvas.style.display = 'none';
      canvas.width = 320;
      canvas.height = 200;
      canvas.style.width = '320px';
      canvas.style.height = '200px';
      canvas.addEventListener(
        'webglcontextlost',
        function (e) {
          alert('WebGL context lost. You will need to reload the page.');
          e.preventDefault();
        },
        false
      );
      return canvas;
    })(),
    print: function (text: string) {
      console.log(text);
    },
    setStatus: function (text: string) {
      console.log(text);
    },
    totalDependencies: 0,
    monitorRunDependencies: function (left: number) {
      this.totalDependencies = Math.max(this.totalDependencies, left);
      Module.setStatus(
        left
          ? 'Preparing... (' + (this.totalDependencies - left) + '/' + this.totalDependencies + ')'
          : 'All downloads complete.'
      );
    },
    startDoom: function () {
      init(Module);
      Module.run();
    },
  };

  return Module;
}
