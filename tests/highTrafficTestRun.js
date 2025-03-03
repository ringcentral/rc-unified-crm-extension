const steadyRun = require('./steadyTrafficRun');
const burstRun = require('./burstTrafficRun');

try {
    steadyRun.run();
    burstRun.run();
}
catch (err) {
    console.error("Error");
}