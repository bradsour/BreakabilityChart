/*
 * The following code is derived from work by mort13.
 * Copyright (c) 2026 mort13
 * Licensed under the MIT License. 
 * Note: This file has been modified from its original version.
 */

// Load mining data from UEX API
let miningData = {
  laserheads: [],
  modules: [],
  gadgets: []
};

async function loadMiningData() {
  const endpoints = ["laserheads", "modules", "gadgets"];
  for (const ep of endpoints) {
    const res = await fetch('https://uexcorp.space/api/v2/mining/laserheads', {
  headers: { 'Authorization': '' }
})
    const json = await res.json();
    miningData[ep] = json;
  }
  console.log("Data loaded:", miningData);
}
