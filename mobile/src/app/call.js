import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../components/Text';
import { useInsets } from '../components/ui';
import { C } from '../theme';
import { tr } from '../i18n';

/** A video call inside the app. Only private Daily rooms come here; the room asks for the camera and microphone itself. */
export default function Call() {
  const { url, name } = useLocalSearchParams();
  const insets = useInsets();
  const [loading, setLoading] = useState(true);
  // Stay on the call; links to anything else (help pages, Daily's site) open in the browser.
  const host = new URL(url).host;
  return (
    <View style={{ flex: 1, backgroundColor: '#111', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>📹 {name || tr('Video call')}</Text>
        <Pressable onPress={() => router.back()} accessibilityLabel={tr('Leave call')} hitSlop={10}
          style={{ backgroundColor: C.err, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{tr('Leave call')}</Text>
        </Pressable>
      </View>
      <WebView source={{ uri: url }} style={{ flex: 1, backgroundColor: '#111' }}
        originWhitelist={['https://*']}
        allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
        // The phone already asked for the camera and microphone for this app, so the call doesn't ask a second time.
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled domStorageEnabled
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || new URL(req.url).host === host}
        onLoadEnd={() => setLoading(false)} />
      {loading ? <ActivityIndicator color="#fff" style={{ position: 'absolute', top: '50%', alignSelf: 'center' }} /> : null}
    </View>
  );
}
