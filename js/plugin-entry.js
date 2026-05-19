const { Plugin } = require("obsidian");

const lifecycleMethods = require("./js/plugin-lifecycle");
const settingsMethods = require("./js/plugin-settings");
const minimapManagerMethods = require("./js/plugin-minimap-manager");
const helperLeafMethods = require("./js/plugin-helper-leaves");
const diskCacheMethods = require("./js/plugin-disk-cache");

class NoteMinimap extends Plugin {
    activeNoteView = null;
    updateNeeded = false;
    minimapInstances = new Map();
    stylesHTMLCache = null;
    cssVarsCache = null;
    helperLeafIds = new Map();
}

Object.assign(
    NoteMinimap.prototype,
    lifecycleMethods,
    settingsMethods,
    minimapManagerMethods,
    helperLeafMethods,
    diskCacheMethods
);

module.exports = NoteMinimap;
