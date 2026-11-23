// Nearby asks for the approximate location, which makes Google Play treat location hardware as required and hide the
// app from devices without it (some tablets and Chromebooks). Location is optional in PairMundo (people can type their
// city instead), so mark those features as not required. The app is locked to portrait, which Play also reads as
// requiring a portrait screen (some tablets, Chromebooks and XR headsets); it works on any screen, so that is optional too.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.location', 'android.hardware.location.network', 'android.hardware.location.gps', 'android.hardware.screen.portrait'];

module.exports = function withOptionalLocation(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    const list = (manifest['uses-feature'] = manifest['uses-feature'] || []);
    for (const name of FEATURES) {
      const found = list.find((f) => f.$?.['android:name'] === name);
      if (found) found.$['android:required'] = 'false';
      else list.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return c;
  });
};
