/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2019 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

const genericPool = require("generic-pool");

const puppeteer = require('puppeteer');

const config = require('../config/config.js')

let puppeteerProcesses = {};

if (typeof config.puppeteerProcesses !== "undefined") {
    puppeteerProcesses.min = typeof config.puppeteerProcesses.min !== "undefined" ? config.puppeteerProcesses.min : 0;
    puppeteerProcesses.max = typeof config.puppeteerProcesses.max !== "undefined" ? config.puppeteerProcesses.max : 2;
} else {
    puppeteerProcesses = {min: 0, max: 2};
}

const startupParameters = {
    headless: true,
    timeout: 10000,
    ignoreHTTPSErrors: true,
    args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--enable-features=NetworkService",
      //   '--use-gl=angle',
      //   '--enable-webgl',
      //   '--ignore-gpu-blocklist',
      //   '--use-gl=egl',
      //   '--enable-accelerated-2d-canvas',
      //   '--disable-software-rasterizer',
      //   '--disable-gpu-sandbox',
      //   '--enable-webgl-draft-extensions',
      //   '--enable-es3-apis',
    ],
    //userDataDir: '/tmp/chromeSession'
};

const pool = genericPool.createPool({
    create() {
        return puppeteer.launch(startupParameters);
    },
    destroy(browser) {
        return browser.close();
    },
    validate(browser) {
        return Promise.race([
            new Promise(res => setTimeout(() => res(false), 1500)),
            browser.version().then(_ => true).catch(_ => false)
        ])
    },
}, {
    min: puppeteerProcesses.min,
    max: puppeteerProcesses.max,
    testOnBorrow: true,
    acquireTimeoutMillis: 500, // Should be bigger that it takes to start a headless browser
    evictionRunIntervalMillis: 5000,
    numTestsPerEvictionRun: 3, // Default
    maxWaitingClients: 5,
    idleTimeoutMillis: 30000

})

setInterval(() => {
    if (pool.size === pool.max) {
        let poolInfo = {
            "pool.max": pool.max,
            "pool.size": pool.size,
            "pool.available": pool.available,
            "pool.borrowed": pool.borrowed,
            "pool.pending": pool.pending,
            "pool.spareResourceCapacity": pool.spareResourceCapacity
        }
        console.log(poolInfo)
    }
}, 5000)

module.exports = {pool};
