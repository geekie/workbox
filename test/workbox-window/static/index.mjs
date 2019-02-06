import {Workbox} from 'workbox-window/Workbox.mjs';

// Expose on the global object so it can be referenced by webdriver.
self.Workbox = Workbox;

const wb = new Workbox('./sw-tests.js?v=' + Math.random());
wb.register();




