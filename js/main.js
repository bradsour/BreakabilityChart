/*
 * The following code is derived from work by mort13.
 * Copyright (c) 2026 mort13
 * Licensed under the MIT License. See the LICENSE-THIRD-PARTY.txt file in the project root for full license information.
 */

import { loadMiningData } from './data-manager.js';
import { setupChart } from './chart-manager.js';
import { setupLaserheadUI } from './laserhead-manager.js';
import { setupModuleUI } from './module-manager.js';
import { setupTabs, setupLaserheadButtons, setupDarkModeToggle, injectFooterToTabs } from './ui-manager.js';
import { setupGadgetUI } from './gadget-manager.js';
import { setupSettingsUI } from './settings-manager.js';
import { setupScanUI } from './scan-manager.js';

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
    await loadMiningData();
    setupDarkModeToggle();
    setupTabs();
    injectFooterToTabs();
    setupChart();
    setupLaserheadUI();
    setupModuleUI();
    setupLaserheadButtons();
    setupGadgetUI();
    setupSettingsUI();
    setupScanUI();
});
