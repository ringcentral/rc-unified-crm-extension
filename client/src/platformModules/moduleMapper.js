import pipedriveModule from '../platformModules/pipedrive.js';
import insightlyModule from '../platformModules/insightly.js';
import clioModule from '../platformModules/clio.js';
import redtailModule from '../platformModules/redtail';
import bullhornModule from '../platformModules/bullhorn';

function getModule({ platformName }) {
    switch (platformName) {
        case 'pipedrive':
            return pipedriveModule;
        case 'insightly':
            return insightlyModule;
        case 'clio':
            return clioModule;
        case 'redtail':
            return redtailModule;
        case 'bullhorn':
            return bullhornModule;
    }
}

exports.getModule = getModule;