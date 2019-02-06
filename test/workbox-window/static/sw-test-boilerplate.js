importScripts(
    '/node_modules/mocha/mocha.js',
    // '/node_modules/sinon/pkg/sinon.js',
    'https://cdnjs.cloudflare.com/ajax/libs/sinon.js/7.2.3/sinon-no-sourcemaps.min.js',
    '/node_modules/chai/chai.js');

let testsComplete;

Promise.resolve().then(() => {
  testsComplete = new Promise((resolve, reject) => {
    const failedTests = [];
    const runner = mocha.run();

    runner.on('fail', (test, err) => {
      const flattenTitles = (test) => {
        const titles = [test.title];
        while (test.parent.title){
          titles.push(test.parent.title);
          test = test.parent;
        }
        return titles.reverse().join(' ');
      };

      failedTests.push({
        name: flattenTitles(test),
        result: false,
        message: err.message,
        stack: err.stack,
      });
    });

    runner.on('end', (...args) => {
      console.log(`${runner.failures} out of ${runner.total} failures.`);

      if (runner.failures) {
        reject(failedTests);
      } else {
        resolve();
      }
    });
  });
});

addEventListener('install', (event) => {
  skipWaiting();
  event.waitUntil(testsComplete);
});

addEventListener('activate', () => {
  clients.claim();
});

self.expect = chai.expect;

mocha.setup({
  ui: 'bdd',
  reporter: null,
});
